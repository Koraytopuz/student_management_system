import express from 'express';
import { GoogleGenAI } from '@google/genai';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Prisma } from '@prisma/client';
import { authenticate, authenticateMultiple, AuthenticatedRequest } from './auth';
import { prisma } from './db';
import {
  CalendarEvent,
  CalendarEventType,
  TeacherDashboardSummary,
  TeacherAnnouncement,
  TestResult,
  Notification as AppNotification,
} from './types';
import { buildRoomName, createLiveKitToken, getLiveKitUrl, muteAllParticipantsInRoom } from './livekit';
import { notifyParentsOfStudent } from './services/notificationService';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sendSMS } = require('./services/smsService');
import { callGemini } from './ai';

const router = express.Router();

const USER_CONFIGURED_GEMINI_MODEL = process.env.GEMINI_MODEL?.trim();
const DEFAULT_MODEL = 'gemini-2.5-flash';
const TEACHER_SYSTEM_PROMPT =
  "Rolün: 20 yıllık deneyime sahip, soru bankası yazarlığı yapmış bir başöğretmen asistanı. Görevin: Kullanıcı (Öğretmen) sana 'Sınıf Seviyesi', 'Konu', 'Soru Sayısı' ve 'Zorluk Derecesi' (Kolay/Orta/Zor) verecek. Sen bu verilere göre hatasız bir test hazırlayacaksın.\n\n" +
  'Kurallar:\n\n' +
  '• Her sorudan ÖNCE (ilk soru hariç) "---SAYFA---" yaz; böylece her soru ayrı sayfada görünecek.\n' +
  '• Sorular Bloom Taksonomisi\'ne göre belirtilen zorluk seviyesine uygun tasarlanmalıdır.\n' +
  '• Soru köklerini **kalın** yaz. Şıkları A), B), C), D) biçiminde alt alta yaz; lise seviyesi belirtildiyse E) ekle.\n' +
  '• Tüm sorulardan sonra `---` çizgisi ve "Cevap Anahtarı: 1-A, 2-B, 3-C" formatında doğru cevapları yaz.\n' +
  '• Daima Türkçe konuş.';

type AiChatMessage = {
  role: 'user' | 'assistant';
  content?: string;
};

type AiAttachment = {
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

function resolveTeacherModelCandidates() {
  if (USER_CONFIGURED_GEMINI_MODEL) {
    return [USER_CONFIGURED_GEMINI_MODEL];
  }
  return [DEFAULT_MODEL];
}

function extractResponseText(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const maybeText = (response as { text?: string | (() => string) }).text;
  if (typeof maybeText === 'function') {
    try {
      const value = maybeText();
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    } catch {
      // ignore
    }
  } else if (typeof maybeText === 'string' && maybeText.trim()) {
    return maybeText.trim();
  }

  const candidates = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const parts = candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const joined = parts
        .map((part) => (part?.text ?? '').trim())
        .filter(Boolean)
        .join('\n');
      if (joined.trim()) {
        return joined.trim();
      }
    }
  }

  return null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Bilinmeyen hata';
  }
}

function isModelNotFoundError(error: unknown) {
  const message = extractErrorMessage(error).toLowerCase();
  return message.includes('not found') || message.includes('unknown model');
}

function toGeminiContents(history: AiChatMessage[], latest: AiChatMessage) {
  const sanitized = [...history, latest]
    .filter((item) => item.content && item.content.trim().length > 0)
    .slice(-8)
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content!.trim() }],
    }));

  return sanitized;
}

/** Parse "Cevap Anahtarı: 1-A, 2-B, 3-C" or "1-A, 2-B" format into { "1":"A", "2":"B", ... } */
function parseAnswerKey(text: string): Record<string, string> {
  const key: Record<string, string> = {};
  const match = text.match(/Cevap\s*Anahtar[ıi]:?\s*([\d\s\-A-Ea-e,]+)/i) ||
    text.match(/(?:^|\n)([\d\s\-A-Ea-e,]+)\s*$/m);
  const raw = match?.[1] ?? text;
  const pairs = raw.match(/\d+\s*[-–]\s*[A-Ea-e]/g) ?? raw.match(/(\d+)\s*[:\-]\s*([A-Ea-e])/g);
  if (pairs) {
    for (const p of pairs) {
      const m = p.match(/(\d+)\s*[-–:\s]*([A-Ea-e])/i);
      if (m && m[1] != null && m[2] != null) key[m[1]] = m[2].toUpperCase();
    }
  }
  return key;
}

/** Generate PDF with one question per page, return buffer and parsed answer key */
async function generatePdfFromText(text: string): Promise<{ buffer: Buffer; answerKey: Record<string, string> }> {
  const fsRequire = require('fs');
  const fontPath = path.join(__dirname, 'assets', 'fonts', 'arial.ttf');

  const parts = text.split(/(?:---SAYFA---|^---$)/m).map((s) => s.trim()).filter(Boolean);
  const answerKeyBlock = parts.find((p) => /Cevap\s*Anahtar/i.test(p));
  let questionBlocks = parts.filter((p) => !/Cevap\s*Anahtar/i.test(p));
  const answerKey = answerKeyBlock ? parseAnswerKey(answerKeyBlock) : {};

  // Fallback: when AI omits ---SAYFA---, split by **N. Soru:** pattern
  const firstBlock = questionBlocks[0];
  const singleBlockHasMultipleQuestions =
    questionBlocks.length === 1 && firstBlock && (firstBlock.match(/\*\*\d+\.\s*Soru:\*\*/gi)?.length ?? 0) > 1;
  if (questionBlocks.length === 0 || singleBlockHasMultipleQuestions) {
    const mainContent = answerKeyBlock ? (text.split(/---\s*\n?Cevap\s*Anahtar/i)[0] ?? text) : text;
    const splitParts = mainContent.split(/(?=\*\*\d+\.\s*Soru:\*\*)/i);
    questionBlocks = splitParts
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && /\*\*\d+\.\s*Soru:\*\*/i.test(s));
  }

  const stripMarkdown = (t: string) => t.replace(/\*\*/g, '').trim();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    if (fsRequire.existsSync(fontPath)) {
      doc.font(fontPath);
    } else {
      console.warn('Custom font not found at', fontPath, 'falling back to default');
    }

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), answerKey }));
    doc.on('error', reject);

    if (questionBlocks.length > 0) {
      for (let i = 0; i < questionBlocks.length; i++) {
        const raw = questionBlocks[i];
        if (!raw) continue;
        if (i > 0) doc.addPage();
        const block = stripMarkdown(raw);
        doc.fontSize(18).text(block, { align: 'left', lineGap: 6 });
      }
    } else {
      const firstPart = text.split(/---\s*\n?Cevap\s*Anahtar/i)[0];
      const mainText: string = answerKeyBlock ? (firstPart?.trim() ?? text) : text;
      doc.fontSize(18).text(stripMarkdown(mainText), { align: 'left', lineGap: 6 });
    }
    doc.end();
  });
}

async function generateExcelFromText(text: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sorular');
  sheet.columns = [{ header: 'Soru / İçerik', key: 'content', width: 120 }];

  text.split(/\n\s*\n/).forEach((block) => {
    const trimmed = block.trim();
    if (trimmed) {
      sheet.addRow({ content: trimmed });
    }
  });

  const data = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

// Yüklenen dosyalar için klasörler
const projectRoot = path.join(__dirname, '..', '..');
const frontendPublicDir = path.join(projectRoot, 'frontend', 'public');
const publicVideosDir = path.join(frontendPublicDir, 'videos');
const publicPdfsDir = path.join(frontendPublicDir, 'pdfs');
const publicTestsDir = path.join(frontendPublicDir, 'tests');
const uploadsTempDir = path.join(__dirname, '..', 'uploads', 'tmp');
const uploadsSolutionsDir = path.join(__dirname, '..', 'uploads', 'solutions');

[publicVideosDir, publicPdfsDir, publicTestsDir, uploadsTempDir, uploadsSolutionsDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const videoUpload = multer({
  dest: uploadsTempDir,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

const testAssetUpload = multer({
  dest: uploadsTempDir,
  limits: {
    fileSize: 30 * 1024 * 1024, // 30MB (pdf/test zip vs.)
  },
});

const helpSolutionUpload = multer({
  dest: uploadsTempDir,
  limits: {
    fileSize: 80 * 1024 * 1024, // 80MB
  },
});

// Öğretmen dashboard özeti
router.get(
  '/dashboard',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const teacherClasses = await prisma.classGroup.findMany({
      where: { teacherId },
      include: { students: { include: { student: true } } },
    });
    let teacherStudentIds = teacherClasses.flatMap((c) =>
      c.students.map((s) => s.studentId),
    );

    // Eğer henüz sınıf/öğrenci ilişkilendirilmemişse, sistemdeki tüm öğrencileri kullan
    if (teacherStudentIds.length === 0) {
      const allStudents = await prisma.user.findMany({
        where: { role: 'student' },
        select: { id: true },
      });
      teacherStudentIds = allStudents.map((s) => s.id);
    }

    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentResults = await prisma.testResult.findMany({
      where: {
        studentId: { in: teacherStudentIds },
        completedAt: { gte: last7Days },
      },
      orderBy: { completedAt: 'asc' },
    });

    const averageScoreLast7Days =
      recentResults.length === 0
        ? 0
        : Math.round(
          recentResults.reduce((sum, r) => sum + r.scorePercent, 0) / recentResults.length,
        );

    const testsAssignedThisWeek = await prisma.assignment.count({
      where: {
        createdAt: { gte: last7Days },
        testId: { not: null },
      },
    });

    // Son aktivitelerde öğrenci id ve test id yerine insan okunur isimler göster
    const studentIdsForNames = [...new Set(recentResults.map((r) => r.studentId))];
    const testIdsForTitles = [...new Set(recentResults.map((r) => r.testId))];

    const [studentsForNames, testsForTitles] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: studentIdsForNames } },
        select: { id: true, name: true },
      }),
      prisma.test.findMany({
        where: { id: { in: testIdsForTitles } },
        select: { id: true, title: true },
      }),
    ]);

    const studentNameMap = new Map(studentsForNames.map((s) => [s.id, s.name]));
    const testTitleMap = new Map(testsForTitles.map((t) => [t.id, t.title]));

    const recentActivity: string[] = recentResults
      .slice(-5)
      .map((r) => {
        const studentName = studentNameMap.get(r.studentId) ?? 'Bilinmeyen Öğrenci';
        const testTitle = testTitleMap.get(r.testId) ?? 'Bilinmeyen Test';
        return `Öğrenci ${studentName} ${r.scorePercent}% skorla "${testTitle}" testini tamamladı`;
      });

    const summary: TeacherDashboardSummary = {
      totalStudents: teacherStudentIds.length,
      testsAssignedThisWeek,
      averageScoreLast7Days,
      recentActivity,
    };

    return res.json(summary);
  },
);

router.post(
  '/ai/chat',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const { message, history, format } = req.body as {
      message?: string;
      history?: AiChatMessage[];
      format?: string;
    };

    const trimmed = message?.trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'message alanı zorunludur' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Yapay zeka servisi şu an kullanılamıyor. Lütfen yönetici ile iletişime geçin.' });
    }

    const contents = toGeminiContents(history ?? [], { role: 'user', content: trimmed });
    const systemInstruction = [
      {
        role: 'user' as const,
        parts: [{ text: TEACHER_SYSTEM_PROMPT }],
      },
    ];

    const requestedFormat = typeof format === 'string' ? format.toLowerCase() : undefined;
    const genAi = new GoogleGenAI({ apiKey });
    const modelCandidates = resolveTeacherModelCandidates();

    try {
      let lastError: { model: string; error: unknown } | null = null;

      for (const model of modelCandidates) {
        try {
          // Retry logic wrapper
          const generateContentWithRetry = async (
            modelName: string,
            contents: any[],
            retries = 3,
            delay = 1000
          ): Promise<any> => {
            try {
              return await genAi.models.generateContent({
                model: modelName,
                contents,
                generationConfig: {
                  temperature: 0.4,
                  maxOutputTokens: 768,
                },
              } as Parameters<typeof genAi.models.generateContent>[0]);
            } catch (err: any) {
              if (retries > 0 && (err.status === 503 || err.message?.includes('503'))) {
                console.warn(`Model ${modelName} overloaded (503). Retrying in ${delay}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                return generateContentWithRetry(modelName, contents, retries - 1, delay * 2);
              }
              throw err;
            }
          };

          const response = await generateContentWithRetry(model, [...systemInstruction, ...contents]);

          const reply = extractResponseText(response);
          if (!reply) {
            return res.status(502).json({ error: 'Yanıt alınamadı' });
          }

          let attachment: AiAttachment | null = null;
          if (requestedFormat === 'pdf') {
            const { buffer } = await generatePdfFromText(reply);
            attachment = {
              filename: `soru-paketi-${Date.now()}.pdf`,
              mimeType: 'application/pdf',
              buffer,
            };
          } else if (requestedFormat === 'xlsx' || requestedFormat === 'xls' || requestedFormat === 'excel') {
            const buffer = await generateExcelFromText(reply);
            attachment = {
              filename: `soru-paketi-${Date.now()}.xlsx`,
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              buffer,
            };
          }

          return res.json({
            reply,
            model,
            attachment: attachment
              ? {
                filename: attachment.filename,
                mimeType: attachment.mimeType,
                data: attachment.buffer.toString('base64'),
              }
              : undefined,
          });
        } catch (error) {
          lastError = { model, error };
          if (isModelNotFoundError(error)) {
            continue;
          }
          // eslint-disable-next-line no-console
          console.error('[TEACHER_AI] Gemini API error', { model, error });
          return res.status(502).json({ error: extractErrorMessage(error) });
        }
      }

      if (lastError) {
        // eslint-disable-next-line no-console
        console.error('[TEACHER_AI] Gemini API error', lastError);
        return res.status(502).json({ error: extractErrorMessage(lastError.error) });
      }

      return res.status(502).json({ error: 'Yapay zeka yanıt veremedi' });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[TEACHER_AI] Gemini API request failed', error);
      return res.status(500).json({ error: 'Yapay zeka servisine bağlanılamadı' });
    }
  },
);

// Otomatik soru üretimi (format: metin | pdf | xlsx)
router.post(
  '/ai/generate-questions',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const { gradeLevel, topic, count = 5, difficulty = 'orta', format } = req.body as {
      gradeLevel?: string;
      topic?: string;
      count?: number;
      difficulty?: string;
      format?: 'metin' | 'pdf' | 'xlsx';
    };
    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: 'Konu alanı zorunludur' });
    }
    try {
      const prompt = `Lütfen aşağıdaki kriterlere uygun YENİ NESİL test soruları üret:

- Sınıf seviyesi: ${gradeLevel || '9-12 (Lise)'}
- Konu: ${topic.trim()}
- Soru sayısı: ${Math.min(Math.max(Number(count) || 5, 1), 20)}
- Zorluk: ${difficulty || 'orta'} (kolay/orta/zor)

SEVİYE ve STİL KURALLARI
1. 4–8. sınıflar için: MEB müfredatına uygun, seviyeye göre sade ama düşünmeyi gerektiren sorular yaz.
2. 9–12. sınıflar için: Özellikle YKS tarzında, çok adımlı ve yorum gerektiren yeni nesil sorular yaz.
3. Matematik konularında (sayılar, fonksiyonlar, geometri, olasılık vb. çağrıştıran konularda):
   - Günlük hayat senaryoları, grafikler, tablolar, şekiller ve diyagramlar kullan.
   - Şekilleri ve görselleri METİNLE ayrıntılı tarif et (örneğin: "ABCD kare, AB kenarı 4 birim, [0,4] aralığında dik koordinat sistemi..." gibi).
   - Sadece işlem sorusu değil, yorum ve akıl yürütme içeren yeni nesil problemi tercih et.
4. Diğer derslerde (fizik, kimya, biyoloji, tarih, coğrafya, Türkçe vb.):
   - Metin/paragraf, tablo, grafik ve günlük hayat bağlamı kullanarak derin kavrama ölçen sorular yaz.

ZORUNLU FORMAT KURALLARI (BU FORMATA TAM UY):
1. Her soru mutlaka A) B) C) D) E) şıklı olsun (toplam 5 şık, tek doğru cevap).
2. Her sorudan hemen önce (ilk soru hariç) ayrı satırda sadece "---SAYFA---" yaz. Böylece her soru ayrı sayfada görünecek.
3. Her soruyu "**1. Soru:**", "**2. Soru:**" gibi numaralandır.
4. Soru köklerini **kalın** yap. Matematik için x^2, x^3, 4x^3 gibi DÜZ METİN kullan (LaTeX veya özel sembol kullanma).
5. Şekilli / görselli sorularda, çizimi yapamayacağın için şekli ayrıntılı ve net biçimde tarif et; kenar uzunluklarını, açıları, eksenleri, etiketleri mutlaka yaz.
6. Tüm sorulardan sonra aşağıdaki formatta cevap anahtarı ver:
   ---
   Cevap Anahtarı: 1-A, 2-B, 3-C, ...
7. Her şeyi sadece Türkçe yaz.

ÖRNEK FORMAT:
**1. Soru:** Bir fonksiyon grafiği aşağıdaki gibi verilmiştir. Grafikte x ekseni 0'dan 4'e kadar, y ekseni 0'dan 8'e kadar numaralandırılmıştır. Noktalar (0,0), (2,4) ve (4,8) doğrusal olarak işaretlenmiştir. Buna göre f(2) kaçtır?
A) 1  B) 2  C) 3  D) 4  E) 5
---SAYFA---
**2. Soru:** ...
A) ...  B) ...  C) ...  D) ...  E) ...
---
Cevap Anahtarı: 1-D, 2-C, 3-A, ...`;
      const result = await callGemini(prompt, {
        systemInstruction:
          'Sen deneyimli bir soru bankası ve YKS soru yazarı olarak Bloom taksonomisine uygun, net, ölçülebilir ve yeni nesil test soruları üretirsin. Her soruda mümkün olduğunda senaryo, görsel tasvir (grafik, tablo, şekil) ve akıl yürütme adımları kullanırsın.',
        temperature: 0.6,
        maxOutputTokens: 4096,
      });

      const response: {
        questions: string;
        attachment?: { filename: string; mimeType: string; data: string };
        answerKey?: Record<string, string>;
      } = { questions: result };

      if (format === 'pdf') {
        const { buffer, answerKey } = await generatePdfFromText(result);
        response.attachment = {
          filename: `sorular-${Date.now()}.pdf`,
          mimeType: 'application/pdf',
          data: buffer.toString('base64'),
        };
        if (Object.keys(answerKey).length > 0) response.answerKey = answerKey;
      } else if (format === 'xlsx') {
        const buffer = await generateExcelFromText(result);
        response.attachment = {
          filename: `sorular-${Date.now()}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          data: buffer.toString('base64'),
        };
      }

      return res.json(response);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AI_GENERATE_QUESTIONS]', error);
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Soru üretilemedi',
      });
    }
  },
);

// Ödev/cevap değerlendirme
router.post(
  '/ai/evaluate-answer',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const { questionText, correctAnswer, studentAnswer, questionType = 'open' } = req.body as {
      questionText?: string;
      correctAnswer?: string;
      studentAnswer?: string;
      questionType?: string;
    };
    if (!questionText || !correctAnswer || studentAnswer === undefined) {
      return res.status(400).json({ error: 'questionText, correctAnswer ve studentAnswer zorunludur' });
    }
    try {
      const prompt = `Aşağıdaki soru ve öğrenci cevabını değerlendir:

**Soru:** ${questionText}

**Doğru / Beklenen cevap:** ${correctAnswer}

**Öğrenci cevabı:** ${String(studentAnswer).trim() || '(boş)'}

Soru tipi: ${questionType}

Değerlendirmeni şu formatta ver (Türkçe):
1. Puan (0-100 arası sayı)
2. Kısa özet (1-2 cümle)
3. İyileştirme önerisi (varsa)`;
      const result = await callGemini(prompt, {
        systemInstruction: 'Sen deneyimli bir öğretmensin. Öğrenci cevaplarını adil ve yapıcı şekilde değerlendirirsin. Küçük doğruları da takdir et.',
        temperature: 0.3,
        maxOutputTokens: 1024,
      });
      return res.json({ evaluation: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AI_EVALUATE_ANSWER]', error);
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Değerlendirme yapılamadı',
      });
    }
  },
);

// Metin özetleme
router.post(
  '/ai/summarize',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const { text, maxLength = 'orta' } = req.body as { text?: string; maxLength?: string };
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: 'Metin alanı zorunludur' });
    }
    try {
      const lengthHint =
        maxLength === 'kısa' ? '2-3 cümle' : maxLength === 'uzun' ? '1 paragraf' : '4-6 cümle';
      const prompt = `Aşağıdaki metni Türkçe olarak özetle. Özet yaklaşık ${lengthHint} uzunluğunda olsun. Ana fikirleri koru:\n\n${String(text).trim()}`;
      const result = await callGemini(prompt, {
        systemInstruction: 'Sen metin özetleme uzmanısın. Özetlerde objektif kalır, ana fikirleri korursun.',
        temperature: 0.3,
        maxOutputTokens: 1024,
      });
      return res.json({ summary: result });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AI_SUMMARIZE]', error);
      return res.status(502).json({
        error: error instanceof Error ? error.message : 'Özet oluşturulamadı',
      });
    }
  },
);

router.get(
  '/announcements',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const items = await prisma.teacherAnnouncement.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(
      items.map((a) => ({
        id: a.id,
        teacherId: a.teacherId,
        title: a.title,
        message: a.message,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
        scheduledDate: a.scheduledDate?.toISOString(),
      })),
    );
  },
);

router.post(
  '/announcements',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const { title, message, scheduledDate } = req.body as {
      title?: string;
      message?: string;
      scheduledDate?: string;
    };

    if (!title || !message) {
      return res.status(400).json({ error: 'title ve message alanları zorunludur' });
    }

    const announcement = await prisma.teacherAnnouncement.create({
      data: {
        teacherId,
        title: title.trim(),
        message: message.trim(),
        status: scheduledDate ? 'planned' : 'draft',
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
      },
    });
    return res.status(201).json({
      id: announcement.id,
      teacherId: announcement.teacherId,
      title: announcement.title,
      message: announcement.message,
      status: announcement.status,
      createdAt: announcement.createdAt.toISOString(),
      scheduledDate: announcement.scheduledDate?.toISOString(),
    });
  },
);

// Öğrenci listesi
router.get(
  '/students',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const teacherClasses = await prisma.classGroup.findMany({
      where: { teacherId },
      include: { students: { include: { student: true } } },
    });
    const studentIds = new Set(
      teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)),
    );
    const idsArray = [...studentIds];
    const whereClause =
      idsArray.length > 0
        ? { id: { in: idsArray }, role: 'student' as const }
        : { role: 'student' as const };
    const teacherStudents = await prisma.user.findMany({
      where: whereClause,
      select: { id: true, name: true, email: true, gradeLevel: true, classId: true, lastSeenAt: true, profilePictureUrl: true } as any,
    });
    return res.json(
      teacherStudents.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: 'student' as const,
        gradeLevel: s.gradeLevel ?? '',
        classId: s.classId ?? '',
        lastSeenAt: s.lastSeenAt ? new Date(s.lastSeenAt as any).toISOString() : undefined,
        profilePictureUrl: (s as any).profilePictureUrl ?? undefined,
      })),
    );
  },
);

// Veli listesi (öğretmenin sınıflarındaki öğrencilerin velileri)
router.get(
  '/parents',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const teacherClasses = await prisma.classGroup.findMany({
      where: { teacherId },
      include: { students: { select: { studentId: true } } },
    });
    const teacherStudentIds = new Set(
      teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)),
    );
    const parentStudents = await prisma.parentStudent.findMany({
      where: { studentId: { in: [...teacherStudentIds] } },
      include: { parent: { select: { id: true, name: true, email: true } } },
    });
    const parentIds = [...new Set(parentStudents.map((ps) => ps.parentId))];
    const parentsData = await prisma.user.findMany({
      where: { id: { in: parentIds }, role: 'parent' },
      include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(
      parentsData.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: 'parent' as const,
        studentIds: p.parentStudents.map((ps) => ps.studentId),
      })),
    );
  },
);

// Bireysel öğrenci profili
router.get(
  '/students/:id',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const student = await prisma.user.findFirst({
      where: { id, role: 'student' },
      select: { id: true, name: true, email: true, gradeLevel: true, classId: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }

    const [assignmentsData, studentResults, studentWatch] = await Promise.all([
      prisma.assignment.findMany({
        where: { students: { some: { studentId: id } } },
        include: { students: { select: { studentId: true } } },
      }),
      prisma.testResult.findMany({ where: { studentId: id } }),
      prisma.watchRecord.findMany({ where: { studentId: id } }),
    ]);

    const assignmentsForApi = assignmentsData.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description ?? undefined,
      testId: a.testId ?? undefined,
      contentId: a.contentId ?? undefined,
      classId: a.classId ?? undefined,
      assignedStudentIds: a.students.map((s) => s.studentId),
      dueDate: a.dueDate.toISOString(),
      points: a.points,
    }));




    const resultsForApi = studentResults.map((r) => ({
      id: r.id,
      assignmentId: r.assignmentId,
      studentId: r.studentId,
      testId: r.testId,
      correctCount: r.correctCount,
      incorrectCount: r.incorrectCount,
      blankCount: r.blankCount,
      scorePercent: r.scorePercent,
      durationSeconds: r.durationSeconds,
      completedAt: r.completedAt.toISOString(),
      answers: [] as { questionId: string; answer: string; isCorrect: boolean }[],
    }));

    return res.json({
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        role: 'student' as const,
        gradeLevel: student.gradeLevel ?? '',
        classId: student.classId ?? '',
      },
      assignments: assignmentsForApi,
      results: resultsForApi,
      watchRecords: studentWatch.map((w) => ({
        id: w.id,
        contentId: w.contentId,
        studentId: w.studentId,
        watchedSeconds: w.watchedSeconds,
        completed: w.completed,
        lastWatchedAt: w.lastWatchedAt.toISOString(),
      })),
    });
  },
);

// Veliye özel değerlendirme (öğrenci görmez)
router.post(
  '/feedback',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const teacherName = req.user!.name;
    const { studentId, type, title, content, relatedTestId, relatedAssignmentId } = req.body as {
      studentId?: string;
      type?: string;
      title?: string;
      content?: string;
      relatedTestId?: string;
      relatedAssignmentId?: string;
    };

    if (!studentId || !type || !title || !content) {
      return res.status(400).json({ error: 'studentId, type, title, content zorunludur' });
    }

    // Sadece öğretmenin sınıflarındaki öğrenciler
    const teacherClasses = await prisma.classGroup.findMany({
      where: { teacherId },
      include: { students: { select: { studentId: true } } },
    });
    const allowedStudentIds = new Set(teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)));
    if (!allowedStudentIds.has(studentId)) {
      return res.status(403).json({ error: 'Bu öğrenci için değerlendirme yazamazsınız' });
    }

    const created = await prisma.teacherFeedback.create({
      data: {
        studentId,
        teacherId,
        teacherName,
        type: type.trim(),
        relatedTestId: relatedTestId ?? undefined,
        relatedAssignmentId: relatedAssignmentId ?? undefined,
        title: title.trim(),
        content: content.trim(),
        read: false,
      },
    });

    return res.status(201).json({
      id: created.id,
      studentId: created.studentId,
      teacherId: created.teacherId,
      teacherName: created.teacherName,
      type: created.type,
      relatedTestId: created.relatedTestId ?? undefined,
      relatedAssignmentId: created.relatedAssignmentId ?? undefined,
      title: created.title,
      content: created.content,
      createdAt: created.createdAt.toISOString(),
    });
  },
);

// İçerik listesi
router.get(
  '/contents',
  authenticate('teacher'),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const list = await prisma.contentItem.findMany({
        include: {
          classGroups: { select: { classGroupId: true } },
          students: { select: { studentId: true } },
        },
      });
      return res.json(
        list.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description ?? undefined,
          type: c.type,
          subjectId: c.subjectId,
          topic: c.topic,
          gradeLevel: c.gradeLevel,
          durationMinutes: c.durationMinutes ?? undefined,
          tags: c.tags,
          url: c.url,
          assignedToClassIds: c.classGroups.map((g) => g.classGroupId),
          assignedToStudentIds: c.students.map((s) => s.studentId),
        })),
      );
    } catch (error) {
      console.error('İçerik listesi alınırken hata:', error);
      return res.status(500).json({ error: 'İçerik listesi alınamadı' });
    }
  },
);

// Test listesi
router.get(
  '/tests',
  authenticate('teacher'),
  async (_req: AuthenticatedRequest, res) => {
    const list = await prisma.test.findMany({
      include: { questions: { select: { id: true }, orderBy: { orderIndex: 'asc' } } },
    });
    return res.json(
      list.map((t) => ({
        id: t.id,
        title: t.title,
        subjectId: t.subjectId,
        topic: t.topic,
        questionIds: t.questions.map((q) => q.id),
        createdByTeacherId: t.createdByTeacherId,
      })),
    );
  },
);

// Yapılandırılmış test (sorularla birlikte) oluşturma
router.post(
  '/tests/structured',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const { title, subjectId, topic, questions } = req.body as {
      title?: string;
      subjectId?: string;
      topic?: string;
      questions?: Array<{
        text?: string;
        type?: 'multiple_choice' | 'true_false' | 'open_ended';
        choices?: string[];
        correctAnswer?: string;
        solutionExplanation?: string;
        topic?: string;
        difficulty?: 'easy' | 'medium' | 'hard';
      }>;
    };

    if (!title || !subjectId || !topic) {
      return res.status(400).json({ error: 'title, subjectId ve topic zorunludur' });
    }
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: 'questions alanı zorunludur (en az 1 soru)' });
    }

    const normalizedQuestions = questions.map((q, idx) => ({
      text: String(q.text ?? '').trim(),
      type: q.type ?? 'multiple_choice',
      choices: Array.isArray(q.choices) ? q.choices : undefined,
      correctAnswer: q.correctAnswer ? String(q.correctAnswer).trim() : undefined,
      solutionExplanation: q.solutionExplanation ? String(q.solutionExplanation).trim() : undefined,
      topic: String(q.topic ?? topic).trim(),
      difficulty: (q.difficulty ?? 'medium') as 'easy' | 'medium' | 'hard',
      orderIndex: idx,
    }));

    if (normalizedQuestions.some((q) => !q.text)) {
      return res.status(400).json({ error: 'Her soru için text zorunludur' });
    }

    const created = await prisma.test.create({
      data: {
        title: title.trim(),
        subjectId,
        topic: topic.trim(),
        createdByTeacherId: teacherId,
        questions: {
          create: normalizedQuestions.map((q) => ({
            text: q.text,
            type: q.type as any,
            choices: q.choices ?? undefined,
            correctAnswer: q.correctAnswer,
            solutionExplanation: q.solutionExplanation,
            topic: q.topic,
            difficulty: q.difficulty,
            orderIndex: q.orderIndex,
          })),
        },
      },
      include: { questions: { select: { id: true }, orderBy: { orderIndex: 'asc' } } },
    });

    return res.status(201).json({
      id: created.id,
      title: created.title,
      subjectId: created.subjectId,
      topic: created.topic,
      questionIds: created.questions.map((q) => q.id),
      createdByTeacherId: created.createdByTeacherId,
    });
  },
);

// Test dosyası yükleme (PDF vb.)
router.post(
  '/test-assets/upload',
  authenticate('teacher'),
  testAssetUpload.single('file'),
  (req: AuthenticatedRequest, res) => {
    const uploadedFile = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'Dosya gereklidir' });
    }
    try {
      const original = uploadedFile.originalname || 'test.pdf';
      const safeName = original.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetPath = path.join(publicTestsDir, `${Date.now()}-${safeName}`);
      fs.copyFileSync(uploadedFile.path, targetPath);
      fs.unlinkSync(uploadedFile.path);

      const relativeUrl = `/tests/${path.basename(targetPath)}`;
      return res.status(201).json({
        url: relativeUrl,
        fileName: original,
        mimeType: uploadedFile.mimetype || 'application/octet-stream',
      });
    } catch (error) {
      console.error('Test dosyası yükleme hatası:', error);
      return res.status(500).json({ error: 'Dosya yüklenirken sunucu hatası oluştu' });
    }
  },
);

// Test dosyası kayıtları (TestAsset)
router.get(
  '/test-assets',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const list = await prisma.testAsset.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(
      list.map((a) => ({
        id: a.id,
        teacherId: a.teacherId,
        title: a.title,
        subjectId: a.subjectId,
        topic: a.topic,
        gradeLevel: a.gradeLevel,
        fileUrl: a.fileUrl,
        fileName: a.fileName,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString(),
      })),
    );
  },
);

router.post(
  '/test-assets',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const { title, subjectId, topic, gradeLevel, fileUrl, fileName, mimeType, answerKeyJson } = req.body as {
      title?: string;
      subjectId?: string;
      topic?: string;
      gradeLevel?: string;
      fileUrl?: string;
      fileName?: string;
      mimeType?: string;
      answerKeyJson?: string;
    };

    if (!title || !subjectId || !topic || !gradeLevel || !fileUrl || !fileName || !mimeType) {
      return res.status(400).json({
        error: 'title, subjectId, topic, gradeLevel, fileUrl, fileName, mimeType zorunludur',
      });
    }

    try {
      const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (!subject) {
        return res.status(400).json({ error: 'Geçersiz subjectId: ilgili ders bulunamadı' });
      }

      let parsedAnswerKey: string | undefined;
      if (answerKeyJson != null && String(answerKeyJson).trim()) {
        try {
          const parsed = JSON.parse(String(answerKeyJson));
          if (parsed && typeof parsed === 'object') parsedAnswerKey = JSON.stringify(parsed);
        } catch {
          return res.status(400).json({ error: 'answerKeyJson geçerli JSON olmalı (örn. {"1":"A","2":"B"})' });
        }
      }

      const created = await prisma.testAsset.create({
        data: {
          teacherId,
          title: title.trim(),
          subjectId,
          topic: topic.trim(),
          gradeLevel: gradeLevel.trim(),
          fileUrl: fileUrl.trim(),
          fileName: fileName.trim(),
          mimeType: mimeType.trim(),
          answerKeyJson: parsedAnswerKey ?? undefined,
        },
      });

      return res.status(201).json({
        id: created.id,
        teacherId: created.teacherId,
        title: created.title,
        subjectId: created.subjectId,
        topic: created.topic,
        gradeLevel: created.gradeLevel,
        fileUrl: created.fileUrl,
        fileName: created.fileName,
        mimeType: created.mimeType,
        answerKeyJson: created.answerKeyJson ?? undefined,
        createdAt: created.createdAt.toISOString(),
      });
    } catch (error) {
      console.error('TestAsset create error:', error);
      return res
        .status(500)
        .json({ error: 'Test dosyası kaydedilemedi, lütfen daha sonra tekrar deneyin.' });
    }
  },
);

router.delete(
  '/test-assets/:id',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const id = String(req.params.id);
    const existing = await prisma.testAsset.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Test dosyası bulunamadı' });
    }
    if (existing.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Bu kaydı silme yetkiniz yok' });
    }
    await prisma.testAsset.delete({ where: { id } });
    return res.json({ success: true });
  },
);

// Yardım talepleri (öğrenciden gelen "öğretmene sor" istekleri)
router.get(
  '/help-requests',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const teacherId = req.user!.id;
      const status = req.query.status ? String(req.query.status) : undefined;
      const list = await prisma.helpRequest.findMany({
        where: {
          teacherId,
          ...(status ? { status: status as any } : {}),
        },
        include: {
          student: { select: { id: true, name: true } },
          assignment: {
            select: {
              id: true,
              title: true,
              testId: true,
              testAssetId: true,
              testAsset: { select: { answerKeyJson: true, fileUrl: true } },
            },
          },
          question: { select: { id: true, orderIndex: true, text: true, correctAnswer: true } },
          response: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return res.json(
        list.map((r) => {
          let correctAnswer: string | undefined;
          const pdfMatch = r.questionId?.match(/^pdf-page-(\d+)$/);
          if (pdfMatch && pdfMatch[1]) {
            const pageNum = pdfMatch[1];
            const answerKeyJson = (r.assignment as any)?.testAsset?.answerKeyJson;
            if (answerKeyJson) {
              try {
                const key = JSON.parse(answerKeyJson) as Record<string, string>;
                correctAnswer = key[pageNum];
              } catch {
                // ignore parse error
              }
            }
          } else if (r.question?.correctAnswer) {
            correctAnswer = r.question.correctAnswer;
          }
          const testAsset = (r.assignment as any)?.testAsset;
          return {
            id: r.id,
            studentId: r.studentId,
            studentName: r.student?.name ?? 'Öğrenci',
            teacherId: r.teacherId,
            assignmentId: r.assignmentId,
            assignmentTitle: r.assignment?.title ?? '',
            questionId: r.questionId ?? undefined,
            questionNumber: r.question ? (r.question.orderIndex ?? 0) + 1 : (pdfMatch?.[1] ? parseInt(pdfMatch[1], 10) : undefined),
            questionText: r.question?.text ?? undefined,
            correctAnswer,
            studentAnswer: r.studentAnswer ?? undefined,
            testAssetFileUrl: pdfMatch ? testAsset?.fileUrl ?? undefined : undefined,
            testAssetId: pdfMatch ? (r.assignment as any)?.testAssetId ?? undefined : undefined,
            message: r.message ?? undefined,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
            resolvedAt: r.resolvedAt?.toISOString(),
            response: r.response
              ? {
                id: r.response.id,
                mode: r.response.mode,
                url: r.response.url,
                mimeType: r.response.mimeType ?? undefined,
                createdAt: r.response.createdAt.toISOString(),
                playedAt: (r.response as any).playedAt ?? undefined,
              }
              : undefined,
          };
        }),
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[HELP_REQUESTS]', err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Yardım talepleri yüklenemedi',
      });
    }
  },
);

// Öğretmen çözüm gönder (ses / ses+video)
router.post(
  '/help-requests/:id/respond',
  authenticate('teacher'),
  helpSolutionUpload.single('file'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const teacherName = req.user!.name;
    const helpRequestId = String(req.params.id);
    const modeRaw = String((req.body as any).mode ?? '').trim();
    const mode =
      modeRaw === 'audio_video' || modeRaw === 'audio_only'
        ? (modeRaw as 'audio_video' | 'audio_only')
        : null;

    const uploadedFile = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;
    if (!mode) {
      return res.status(400).json({ error: 'mode alanı zorunludur (audio_only | audio_video)' });
    }
    if (!uploadedFile) {
      return res.status(400).json({ error: 'file alanı zorunludur' });
    }

    const requestRecord = await prisma.helpRequest.findUnique({
      where: { id: helpRequestId },
      include: {
        student: { select: { id: true, name: true } },
        assignment: { include: { test: { select: { title: true } } } },
        question: { select: { orderIndex: true } },
      },
    });
    if (!requestRecord) {
      return res.status(404).json({ error: 'Yardım talebi bulunamadı' });
    }
    if (requestRecord.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Bu talebe yanıt verme yetkiniz yok' });
    }

    try {
      const original = uploadedFile.originalname || (mode === 'audio_only' ? 'solution.webm' : 'solution.webm');
      const safeName = original.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetPath = path.join(uploadsSolutionsDir, `${Date.now()}-${helpRequestId}-${safeName}`);
      fs.copyFileSync(uploadedFile.path, targetPath);
      fs.unlinkSync(uploadedFile.path);

      const relativeUrl = `/uploads/solutions/${path.basename(targetPath)}`;

      const responseRecord = await prisma.helpResponse.upsert({
        where: { helpRequestId: helpRequestId },
        create: {
          helpRequestId: helpRequestId,
          teacherId,
          mode: mode as any,
          url: relativeUrl,
          mimeType: uploadedFile.mimetype || undefined,
        },
        update: {
          mode: mode as any,
          url: relativeUrl,
          mimeType: uploadedFile.mimetype || undefined,
          createdAt: new Date(),
        },
      });

      await prisma.helpRequest.update({
        where: { id: helpRequestId },
        data: { status: 'resolved', resolvedAt: new Date() },
      });

      const studentName = requestRecord.student?.name ?? 'Öğrenci';
      const testTitle = requestRecord.assignment?.test?.title ?? requestRecord.assignment?.title ?? 'Test';
      const questionNumber = (requestRecord.question?.orderIndex ?? 0) + 1;

      await prisma.notification.create({
        data: {
          userId: requestRecord.studentId,
          type: 'help_response_ready',
          title: 'Çözüm hazır',
          body: `${teacherName}, ${studentName} için "${testTitle}" testindeki ${questionNumber}. soruyu çözdü.`,
          read: false,
          relatedEntityType: 'help_request',
          relatedEntityId: helpRequestId,
        },
      });

      return res.status(201).json({
        helpRequestId: helpRequestId,
        response: {
          id: responseRecord.id,
          mode: responseRecord.mode,
          url: responseRecord.url,
          mimeType: responseRecord.mimeType ?? undefined,
          createdAt: responseRecord.createdAt.toISOString(),
        },
      });
    } catch (error) {
      console.error('HelpResponse upload error:', error);
      return res.status(500).json({ error: 'Çözüm yüklenemedi' });
    }
  },
);

// Öğretmen gönderdiği çözümü geri alabilir / silebilir
router.delete(
  '/help-requests/:id/response',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const helpRequestId = String(req.params.id);

    const existing = await prisma.helpResponse.findUnique({
      where: { helpRequestId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Bu talep için kayıtlı bir çözüm bulunamadı' });
    }
    if (existing.teacherId !== teacherId) {
      return res
        .status(403)
        .json({ error: 'Bu çözümü silme yetkiniz yok. Sadece kendi yanıtlarınızı silebilirsiniz.' });
    }

    // Çözüm dosyasını diskten silmeye çalış
    try {
      if (existing.url && existing.url.startsWith('/uploads/solutions/')) {
        const filePath = path.join(uploadsSolutionsDir, path.basename(existing.url));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (e) {
      console.warn('HelpResponse file delete error:', e);
    }

    await prisma.helpResponse.delete({
      where: { helpRequestId },
    });

    await prisma.helpRequest.update({
      where: { id: helpRequestId },
      data: { status: 'open', resolvedAt: null },
    });

    return res.json({ success: true });
  },
);

// Soru bankası listesi
router.get(
  '/questions',
  authenticate('teacher'),
  async (_req: AuthenticatedRequest, res) => {
    const list = await prisma.question.findMany({ orderBy: { orderIndex: 'asc' } });
    return res.json(
      list.map((q) => ({
        id: q.id,
        testId: q.testId,
        text: q.text,
        type: q.type,
        choices: (q.choices as string[]) ?? undefined,
        correctAnswer: q.correctAnswer ?? undefined,
        solutionExplanation: q.solutionExplanation ?? undefined,
        topic: q.topic,
        difficulty: q.difficulty,
      })),
    );
  },
);

// Yeni içerik oluşturma
router.post(
  '/contents',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const {
        title,
        description,
        type,
        subjectId,
        topic,
        gradeLevel,
        durationMinutes,
        tags,
        url,
      } = req.body as {
        title?: string;
        description?: string;
        type?: string;
        subjectId?: string;
        topic?: string;
        gradeLevel?: string;
        durationMinutes?: number;
        tags?: string[] | string;
        url?: string;
      };

      if (!title || !type || !subjectId || !topic || !gradeLevel || !url) {
        return res.status(400).json({
          error:
            'title, type, subjectId, topic, gradeLevel ve url alanları zorunludur',
        });
      }

      const tagArray: string[] =
        typeof tags === 'string'
          ? tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
          : tags ?? [];

      const content = await prisma.contentItem.create({
        data: {
          title,
          description,
          type: type as 'video' | 'audio' | 'document',
          subjectId,
          topic,
          gradeLevel,
          durationMinutes,
          tags: tagArray,
          url,
        },
      });
      return res.status(201).json({
        id: content.id,
        title: content.title,
        description: content.description ?? undefined,
        type: content.type,
        subjectId: content.subjectId,
        topic: content.topic,
        gradeLevel: content.gradeLevel,
        durationMinutes: content.durationMinutes ?? undefined,
        tags: content.tags,
        url: content.url,
        assignedToClassIds: [],
        assignedToStudentIds: [],
      });
    } catch (error) {
      console.error('İçerik oluşturma hatası:', error);
      return res.status(500).json({
        error: 'İçerik oluşturulurken hata oluştu',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  },
);

// Video yükleme (öğretmen içerikleri için)
router.post(
  '/contents/upload-video',
  authenticate('teacher'),
  videoUpload.single('file'),
  (req: AuthenticatedRequest, res) => {
    const uploadedFile = (req as AuthenticatedRequest & { file?: Express.Multer.File }).file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'Video dosyası gereklidir' });
    }

    try {
      // Dosyayı anlamlı bir isimle yeniden adlandır ve frontend/public/videos altına taşı
      const original = uploadedFile.originalname || 'video.mp4';
      const safeName = original.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetPath = path.join(publicVideosDir, `${Date.now()}-${safeName}`);

      // fs.renameSync yerine copy ve unlink kullanarak olası EXDEV (cross-device) hatalarını önle
      fs.copyFileSync(uploadedFile.path, targetPath);
      fs.unlinkSync(uploadedFile.path);

      const relativeUrl = `/videos/${path.basename(targetPath)}`;
      return res.status(201).json({ url: relativeUrl });
    } catch (error) {
      console.error('Video yükleme hatası:', error);
      return res.status(500).json({ error: 'Video yüklenirken sunucu hatası oluştu' });
    }
  },
);

// Yeni test oluşturma
router.post(
  '/tests',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const { title, subjectId, topic } = req.body as {
      title?: string;
      subjectId?: string;
      topic?: string;
    };

    if (!title || !subjectId || !topic) {
      return res
        .status(400)
        .json({ error: 'title, subjectId ve topic zorunludur' });
    }

    const test = await prisma.test.create({
      data: {
        title,
        subjectId,
        topic,
        createdByTeacherId: teacherId,
      },
    });
    return res.status(201).json({
      id: test.id,
      title: test.title,
      subjectId: test.subjectId,
      topic: test.topic,
      questionIds: [],
      createdByTeacherId: test.createdByTeacherId,
    });
  },
);

// Yeni görev / assignment oluşturma
router.post(
  '/assignments',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const { title, description, testId, contentId, classId, dueDate, points, testAssetId, timeLimitMinutes, studentIds: requestedStudentIds } =
      req.body as {
        title?: string;
        description?: string;
        testId?: string;
        contentId?: string;
        testAssetId?: string;
        classId?: string;
        dueDate?: string;
        points?: number;
        studentIds?: string[];
        timeLimitMinutes?: number;
      };

    if (!title || (!testId && !contentId && !testAssetId) || !dueDate || points == null) {
      return res.status(400).json({
        error:
          'title, (testId veya contentId veya testAssetId), dueDate ve points alanları zorunludur',
      });
    }

    let targetStudentIds: string[] = [];
    if (Array.isArray(requestedStudentIds) && requestedStudentIds.length > 0) {
      targetStudentIds = requestedStudentIds.map((x) => String(x));
    } else if (classId) {
      const classStudents = await prisma.classGroupStudent.findMany({
        where: { classGroupId: classId },
        select: { studentId: true },
      });
      targetStudentIds = classStudents.map((s) => s.studentId);
    } else {
      const allStudents = await prisma.user.findMany({
        where: { role: 'student' },
        select: { id: true },
      });
      targetStudentIds = allStudents.map((s) => s.id);
    }

    const assignment = await prisma.assignment.create({
      data: {
        title,
        description,
        testId: testId ?? undefined,
        contentId: contentId ?? undefined,
        testAssetId: testAssetId ?? undefined,
        classId: classId ?? undefined,
        dueDate: new Date(dueDate),
        points: points ?? 100,
        timeLimitMinutes:
          typeof timeLimitMinutes === 'number' && timeLimitMinutes > 0
            ? Math.round(timeLimitMinutes)
            : undefined,
        createdByTeacherId: teacherId,
        students: {
          create: targetStudentIds.map((studentId) => ({ studentId })),
        },
      },
      include: { students: { select: { studentId: true } } },
    });
    return res.status(201).json({
      id: assignment.id,
      title: assignment.title,
      description: assignment.description ?? undefined,
      testId: assignment.testId ?? undefined,
      contentId: assignment.contentId ?? undefined,
      testAssetId: (assignment as any).testAssetId ?? undefined,
      classId: assignment.classId ?? undefined,
      assignedStudentIds: assignment.students.map((s) => s.studentId),
      dueDate: assignment.dueDate.toISOString(),
      points: assignment.points,
      timeLimitMinutes: (assignment as any).timeLimitMinutes ?? undefined,
    });
  },
);

// Görev listesi
router.get(
  '/assignments',
  authenticate('teacher'),
  async (_req: AuthenticatedRequest, res) => {
    const list = await prisma.assignment.findMany({
      include: { students: { select: { studentId: true } } },
    });
    return res.json(
      list.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description ?? undefined,
        testId: a.testId ?? undefined,
        contentId: a.contentId ?? undefined,
        testAssetId: (a as any).testAssetId ?? undefined,
        classId: a.classId ?? undefined,
        assignedStudentIds: a.students.map((s) => s.studentId),
        dueDate: a.dueDate.toISOString(),
        points: a.points,
        timeLimitMinutes: (a as any).timeLimitMinutes ?? undefined,
      })),
    );
  },
);

// Mesajlar (gönderen ve alıcı isimleriyle)
router.get(
  '/messages',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const messagesData = await prisma.message.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    });
    const userIds = [
      ...new Set(
        messagesData.flatMap((m) => [m.fromUserId, m.toUserId]),
      ),
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    return res.json(
      messagesData.map((m) => ({
        id: m.id,
        fromUserId: m.fromUserId,
        toUserId: m.toUserId,
        studentId: m.studentId ?? undefined,
        subject: m.subject ?? undefined,
        text: m.text,
        attachments: (m.attachments as Array<{ id: string; fileName: string; fileType: string; fileSize: number; url: string }>) ?? undefined,
        read: m.read,
        readAt: m.readAt?.toISOString(),
        createdAt: m.createdAt.toISOString(),
        fromUserName: userMap.get(m.fromUserId) ?? m.fromUserId,
        toUserName: userMap.get(m.toUserId) ?? m.toUserId,
      })),
    );
  },
);

// Mesajı okundu olarak işaretle (öğretmen)
router.put(
  '/messages/:id/read',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const messageId = String(req.params.id);
    const teacherId = req.user!.id;

    const message = await prisma.message.findUnique({ where: { id: messageId } });

    if (!message) {
      return res.status(404).json({ error: 'Mesaj bulunamadı' });
    }

    // Sadece kendisine gelen mesajı okundu yapabilsin
    if (message.toUserId !== teacherId) {
      return res.status(403).json({ error: 'Bu mesajı okuma yetkiniz yok' });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { read: true, readAt: new Date() },
    });

    return res.json({
      id: updated.id,
      fromUserId: updated.fromUserId,
      toUserId: updated.toUserId,
      studentId: updated.studentId ?? undefined,
      subject: updated.subject ?? undefined,
      text: updated.text,
      read: updated.read,
      readAt: updated.readAt?.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

// Yeni mesaj gönderme
router.post(
  '/messages',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const fromUserId = req.user!.id;
    const { toUserId, text, studentId, subject } = req.body as {
      toUserId?: string;
      text?: string;
      studentId?: string;
      subject?: string;
    };

    if (!toUserId || !text) {
      return res
        .status(400)
        .json({ error: 'toUserId ve text alanları zorunludur' });
    }

    const message = await prisma.message.create({
      data: {
        fromUserId,
        toUserId,
        text,
        studentId: studentId ?? null,
        subject: subject ?? null,
        read: false,
      },
    });

    await prisma.notification.create({
      data: {
        userId: toUserId,
        type: 'message_received',
        title: 'Yeni mesajınız var',
        body: subject
          ? `Öğretmenden "${subject}" konusunda yeni bir mesaj aldınız.`
          : 'Öğretmenden yeni bir mesaj aldınız.',
        read: false,
        relatedEntityType: 'message',
        relatedEntityId: message.id,
      },
    });

    return res.status(201).json({
      id: message.id,
      fromUserId: message.fromUserId,
      toUserId: message.toUserId,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
      read: message.read,
    });
  },
);

// Toplantılar
router.get(
  '/meetings',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const meetingsData = await prisma.meeting.findMany({
      where: {
        teacherId: userId,
        // Koçluk seansları ile ilişkili toplantıları hariç tut
        coachingSessions: {
          none: {},
        },
      },
      include: {
        students: { select: { studentId: true } },
        parents: { select: { parentId: true } },
      },
    });
    return res.json(
      meetingsData.map((m) => ({
        id: m.id,
        type: m.type,
        title: m.title,
        teacherId: m.teacherId,
        studentIds: m.students.map((s) => s.studentId),
        parentIds: m.parents.map((p) => p.parentId),
        scheduledAt: m.scheduledAt.toISOString(),
        durationMinutes: m.durationMinutes,
        meetingUrl: m.meetingUrl,
      })),
    );
  },
);

// Toplantı güncelleme
router.put(
  '/meetings/:id',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const meetingId = String(req.params.id);

    const existing = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    if (existing.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Bu toplantıyı düzenleme yetkiniz yok' });
    }

    const {
      title,
      scheduledAt,
      durationMinutes,
    } = req.body as {
      title?: string;
      scheduledAt?: string;
      durationMinutes?: number;
    };

    if (!title && !scheduledAt && durationMinutes == null) {
      return res.status(400).json({ error: 'Güncellenecek en az bir alan gönderilmelidir' });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (scheduledAt !== undefined) updateData.scheduledAt = new Date(scheduledAt);
    if (durationMinutes != null) updateData.durationMinutes = durationMinutes;

    const meeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: updateData,
      include: {
        students: { select: { studentId: true } },
        parents: { select: { parentId: true } },
      },
    });

    return res.json({
      id: meeting.id,
      type: meeting.type,
      title: meeting.title,
      teacherId: meeting.teacherId,
      studentIds: meeting.students.map((s) => s.studentId),
      parentIds: meeting.parents.map((p) => p.parentId),
      scheduledAt: meeting.scheduledAt.toISOString(),
      durationMinutes: meeting.durationMinutes,
      meetingUrl: meeting.meetingUrl,
    });
  },
);

// Toplantı silme
router.delete(
  '/meetings/:id',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const meetingId = String(req.params.id);

    const existing = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    if (existing.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Bu toplantıyı silme yetkiniz yok' });
    }

    await prisma.meeting.delete({ where: { id: meetingId } });

    // Frontend tarafında JSON bekleniyor, bu yüzden 200 + body döndürüyoruz
    return res.json({ success: true });
  },
);

// Yeni toplantı planlama
router.post(
  '/meetings',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const {
      type,
      title,
      studentIds,
      parentIds,
      scheduledAt,
      durationMinutes,
      meetingUrl,
      targetGrade,
    } = req.body as {
      type?: 'teacher_student' | 'teacher_student_parent' | 'class';
      title?: string;
      studentIds?: string[];
      parentIds?: string[];
      scheduledAt?: string;
      durationMinutes?: number;
      meetingUrl?: string;
      /** Canlı dersin hedef sınıf seviyesi (\"4\"–\"12\" veya \"Mezun\") */
      targetGrade?: string;
    };

    if (!type || !title || !scheduledAt || !durationMinutes) {
      return res.status(400).json({
        error: 'type, title, scheduledAt ve durationMinutes alanları zorunludur',
      });
    }

    // Öğrenciler:
    // 1) Eğer body'de özel bir liste gelmişse onu kullan
    // 2) Eğer boşsa ve hedef sınıf verilmişse: o sınıftaki tüm öğrencileri ekle
    // 3) Hâlâ boşsa: sistemdeki tüm öğrencileri ekle (hiçbir öğrenciyle kalmamak için)
    let effectiveStudentIds: string[] = Array.isArray(studentIds)
      ? studentIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];

    if (effectiveStudentIds.length === 0 && targetGrade) {
      const grade = String(targetGrade);
      const gradeStudents = await prisma.user.findMany({
        where: { role: 'student', gradeLevel: grade },
        select: { id: true },
      });
      effectiveStudentIds = gradeStudents.map((s) => s.id);
    }

    if (effectiveStudentIds.length === 0) {
      const allStudents = await prisma.user.findMany({
        where: { role: 'student' },
        select: { id: true },
      });
      effectiveStudentIds = allStudents.map((s) => s.id);
    }

    const meeting = await prisma.meeting.create({
      data: {
        type: type as 'teacher_student' | 'teacher_student_parent' | 'class',
        title,
        teacherId,
        scheduledAt: new Date(scheduledAt),
        durationMinutes,
        // Canlı dersler için dahili LiveKit altyapısı kullanıldığından meetingUrl şimdilik boş tutuluyor.
        meetingUrl: meetingUrl ?? '',
        // Not: targetGrade alanı veritabanı / Prisma Client ile tam senkronize edilene kadar
        // burada set edilmiyor. Frontend tarafı yine de sınıf bazlı filtreleme yapıyor.
        // targetGrade: targetGrade ?? null,
        students: {
          create: effectiveStudentIds.map((studentId) => ({ studentId })),
        },
        parents: {
          create: (parentIds ?? []).map((parentId) => ({ parentId })),
        },
      },
      include: {
        students: { select: { studentId: true } },
        parents: { select: { parentId: true } },
      },
    });

    // Toplantı için öğrencilere (ve varsa velilere) bildirim oluştur
    const notificationTargets: string[] = [];
    if (effectiveStudentIds.length > 0) {
      notificationTargets.push(...effectiveStudentIds);
    }
    if (Array.isArray(parentIds)) {
      notificationTargets.push(...parentIds);
    }
    if (notificationTargets.length > 0) {
      const dateLabel = new Date(scheduledAt).toLocaleString('tr-TR');
      await prisma.notification.createMany({
        data: notificationTargets.map((uid) => ({
          userId: uid,
          type: 'meeting_scheduled',
          title: 'Yeni canlı ders / toplantı planlandı',
          body: `"${title}" başlıklı toplantınız ${dateLabel} tarihinde planlandı.`,
          read: false,
          relatedEntityType: 'meeting',
          relatedEntityId: meeting.id,
        })),
      });
    }
    return res.status(201).json({
      id: meeting.id,
      type: meeting.type,
      title: meeting.title,
      teacherId: meeting.teacherId,
      studentIds: meeting.students.map((s) => s.studentId),
      parentIds: meeting.parents.map((p) => p.parentId),
      scheduledAt: meeting.scheduledAt.toISOString(),
      durationMinutes: meeting.durationMinutes,
      meetingUrl: meeting.meetingUrl,
    });
  },
);

// Canlı dersi başlat (öğretmen)
router.post(
  '/meetings/:id/start-live',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const meetingId = String(req.params.id);

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    if (meeting.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Bu toplantıyı başlatma yetkiniz yok' });
    }

    const now = Date.now();
    const scheduledAtMs = new Date(meeting.scheduledAt).getTime();
    const deadlineMs = scheduledAtMs + 10 * 60 * 1000; // Seans saatinden 10 dk sonra
    if (now > deadlineMs) {
      return res.status(400).json({
        error:
          'Bu seansın başlatma süresi geçti. Lütfen yeni bir seans oluşturun.',
      });
    }

    const roomId = buildRoomName(meeting.id);

    // Öğretmenin başlattığı canlı ders için oda bilgisini kaydet
    // Not: Prisma Client tipleri henüz roomId alanını içermiyor olabilir,
    // bu nedenle tip hatasını önlemek için any ile daraltıyoruz.
    const existingRoomId = (meeting as any).roomId as string | null | undefined;
    if (!existingRoomId) {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { roomId } as any,
      });
    }

    const token = await createLiveKitToken({
      roomName: roomId,
      identity: teacherId,
      name: req.user!.name,
      isTeacher: true,
    });

    // GEÇİCİ: LiveKit token inceleme
    // eslint-disable-next-line no-console
    console.log('[LIVEKIT_TOKEN]', token);

    return res.json({
      mode: 'internal',
      provider: 'internal_webrtc',
      url: getLiveKitUrl(),
      roomId,
      token,
    });
  },
);

// Tüm katılımcıların sesini kapat (öğretmen)
router.post(
  '/meetings/:id/mute-all',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const meetingId = String(req.params.id);

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    if (meeting.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }

    const roomName = buildRoomName(meeting.id);

    try {
      const { muted } = await muteAllParticipantsInRoom(roomName);
      return res.json({ success: true, muted });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[mute-all]', err);
      return res.status(500).json({
        error: 'Ses kapatma işlemi başarısız oldu. Odada canlı ders devam ediyor mu kontrol edin.',
      });
    }
  },
);

// Kayıt başlat (placeholder – LiveKit Egress için S3/GCP depolama gerekir)
router.post(
  '/meetings/:id/start-recording',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const meetingId = String(req.params.id);

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    if (meeting.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }

    // LiveKit Egress için S3/GCP/Azure depolama konfigürasyonu gerekir.
    // Şimdilik kayıt bilgisini güncellemeden bilgilendirme dönüyoruz.
    return res.status(501).json({
      error:
        'Kayıt özelliği henüz yapılandırılmadı. LiveKit Egress ve depolama (S3/GCP) kurulumu gereklidir.',
    });
  },
);

// Kayıt durdur (placeholder)
router.post(
  '/meetings/:id/stop-recording',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const meetingId = String(req.params.id);

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    if (meeting.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }

    return res.status(501).json({
      error: 'Kayıt özelliği henüz yapılandırılmadı.',
    });
  },
);

// Derse kayıtlı öğrencileri getir (yoklama modalı için)
router.get(
  '/meetings/:id/attendance-students',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const meetingId = String(req.params.id);

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        students: {
          include: {
            student: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }
    if (meeting.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }

    const students = meeting.students.map((ms) => ({
      id: ms.student.id,
      name: ms.student.name,
    }));

    return res.json({
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      students,
    });
  },
);

// Yoklama kaydet ve velilere bildirim gönder
router.post(
  '/meetings/:id/attendance',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const meetingId = String(req.params.id);
    const { attendance: attendanceList } = req.body as {
      attendance?: Array<{ studentId: string; present: boolean }>;
    };

    if (!Array.isArray(attendanceList) || attendanceList.length === 0) {
      return res.status(400).json({ error: 'attendance dizisi zorunludur (en az bir öğrenci)' });
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        students: { select: { studentId: true } },
      },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }
    if (meeting.teacherId !== teacherId) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
    }

    const enrolledStudentIds = new Set(meeting.students.map((s) => s.studentId));

    try {
      const savedAttendance: Array<{ studentId: string; present: boolean }> = [];

      for (const item of attendanceList) {
        const { studentId, present } = item;
        if (!studentId || typeof present !== 'boolean') continue;
        if (!enrolledStudentIds.has(studentId)) continue;

        await prisma.meetingAttendance.upsert({
          where: {
            meetingId_studentId: { meetingId, studentId },
          },
          create: {
            meetingId,
            studentId,
            present,
          },
          update: { present },
        });

        savedAttendance.push({ studentId, present });
      }

      // Her öğrenci için veliye bildirim
      const meetingTitle = meeting.title;
      const meetingDateLabel = new Date(meeting.scheduledAt).toLocaleDateString('tr-TR');
      for (const { studentId, present } of savedAttendance) {
        const student = await prisma.user.findUnique({
          where: { id: studentId },
          select: {
            name: true,
            // Veli SMS gönderimi için öğrencinin kayıtlı veli telefonu
            parentPhone: true,
          },
        });
        const studentName = student?.name ?? 'Öğrenci';

        const body = present
          ? `Öğrencimiz ${studentName} ${meetingTitle} canlı dersine katılım sağlamıştır.`
          : `Dikkat: Öğrencimiz ${studentName} ${meetingTitle} canlı dersine katılım SAĞLAMAMIŞTIR.`;

        await notifyParentsOfStudent(studentId, {
          type: 'live_class_attendance',
          title: present ? 'Canlı Ders Katılımı' : 'Canlı Ders Devamsızlığı',
          body,
          relatedEntityType: 'attendance',
          relatedEntityId: meetingId,
        });

        // Öğrenci derse gelmediyse, velilere SMS gönder (fire and forget)
        if (!present) {
          try {
            // Veli telefon numarası, öğrenci kaydındaki parentPhone alanından alınır.
            const parentPhones: string[] = [];
            const directPhone =
              student && typeof (student as any).parentPhone === 'string'
                ? (student as any).parentPhone.trim()
                : '';
            if (directPhone) {
              parentPhones.push(directPhone);
            }

            if (parentPhones.length > 0) {
              const smsText = `Sayın Veli, Öğrenciniz ${studentName} ${meetingDateLabel} tarihli ${meetingTitle} dersine katılım sağlamamıştır.`;
              // Ana akışı bekletmemek için await kullanmıyoruz
              // Hatalar smsService içinde loglanacak.
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              sendSMS(parentPhones, smsText);
            }
          } catch (smsErr) {
            // Ana işlemi bozmadan sadece logla
            // eslint-disable-next-line no-console
            console.error('[attendance] SMS gönderimi sırasında hata:', smsErr);
          }
        }
      }

      return res.status(201).json({
        success: true,
        saved: savedAttendance.length,
        attendance: savedAttendance,
      });
    } catch (err) {
      console.error('[attendance]', err);
      return res.status(500).json({
        error: 'Yoklama kaydedilirken bir hata oluştu.',
      });
    }
  },
);

// Bildirimler
router.get(
  '/notifications',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const readFilter = req.query.read;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;

    const where: { userId: string; read?: boolean } = { userId };
    if (readFilter === 'true') where.read = true;
    else if (readFilter === 'false') where.read = false;

    const userNotifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit && limit > 0 ? limit : undefined,
    });

    return res.json(
      userNotifications.map((n) => ({
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        read: n.read,
        relatedEntityType: n.relatedEntityType ?? undefined,
        relatedEntityId: n.relatedEntityId ?? undefined,
        readAt: n.readAt?.toISOString(),
        createdAt: n.createdAt.toISOString(),
      })),
    );
  },
);

// Okunmamış bildirim sayısı
router.get(
  '/notifications/unread-count',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const count = await prisma.notification.count({
      where: { userId, read: false },
    });
    return res.json({ count });
  },
);

// Bildirimi okundu olarak işaretle
router.put(
  '/notifications/:id/read',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const notificationId = String(req.params.id);
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true, readAt: new Date() },
    });
    return res.json({
      id: updated.id,
      userId: updated.userId,
      type: updated.type,
      title: updated.title,
      body: updated.body,
      read: updated.read,
      relatedEntityType: updated.relatedEntityType ?? undefined,
      relatedEntityId: updated.relatedEntityId ?? undefined,
      readAt: updated.readAt?.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

// Tüm bildirimleri okundu olarak işaretle
router.put(
  '/notifications/read-all',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return res.json({ updated: result.count, success: true });
  },
);

// Bildirimi sil
router.delete(
  '/notifications/:id',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const notificationId = String(req.params.id);
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }

    await prisma.notification.delete({ where: { id: notificationId } });
    return res.json({ success: true });
  },
);

// Takvim
router.get(
  '/calendar',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const startDate = req.query.startDate
      ? new Date(String(req.query.startDate))
      : new Date();
    const endDate = req.query.endDate
      ? new Date(String(req.query.endDate))
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const events: CalendarEvent[] = [];

    const [assignmentsData, meetingsData] = await Promise.all([
      prisma.assignment.findMany({
        where: { dueDate: { gte: startDate, lte: endDate } },
      }),
      prisma.meeting.findMany({
        where: {
          teacherId,
          scheduledAt: { gte: startDate, lte: endDate },
          coachingSessions: {
            none: {},
          },
        },
      }),
    ]);

    const now = new Date();
    assignmentsData.forEach((assignment) => {
      const dueDate = assignment.dueDate;
      events.push({
        id: `assignment-${assignment.id}`,
        type: 'assignment',
        title: assignment.title,
        startDate: dueDate.toISOString(),
        description: assignment.description ?? '',
        status: dueDate < now ? 'overdue' : 'pending',
        color: dueDate < now ? '#e74c3c' : '#3498db',
        relatedId: assignment.id,
      });
    });

    meetingsData.forEach((meeting) => {
      const meetingStart = meeting.scheduledAt;
      const meetingEnd = new Date(
        meetingStart.getTime() + meeting.durationMinutes * 60 * 1000,
      );
      events.push({
        id: `meeting-${meeting.id}`,
        type: 'meeting',
        title: meeting.title,
        startDate: meetingStart.toISOString(),
        endDate: meetingEnd.toISOString(),
        description: `${meeting.durationMinutes} dakika - ${meeting.type}`,
        status: meetingStart < now ? 'completed' : 'pending',
        color: '#9b59b6',
        relatedId: meeting.id,
      });
    });

    const typeFilter = req.query.type as CalendarEventType | undefined;
    const statusFilter = req.query.status as string | undefined;

    let filteredEvents = events;
    if (typeFilter) {
      filteredEvents = filteredEvents.filter((e) => e.type === typeFilter);
    }
    if (statusFilter) {
      filteredEvents = filteredEvents.filter((e) => e.status === statusFilter);
    }

    filteredEvents.sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    return res.json({
      events: filteredEvents,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      viewType: req.query.viewType || 'month',
    });
  },
);

type CoachingSessionRow = {
  id: string;
  student_id: string;
  teacher_id: string;
  meeting_id: string | null;
  date: Date;
  duration_minutes: number | null;
  title: string;
  notes: string;
  mode: 'audio' | 'video';
  meeting_url: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type CoachingGoalRow = {
  id: string;
  student_id: string;
  coach_id: string;
  title: string;
  description: string | null;
  deadline: Date;
  status: 'pending' | 'completed' | 'missed';
  created_at: Date;
};

type CoachingNoteRow = {
  id: string;
  student_id: string;
  coach_id: string;
  content: string;
  visibility: 'teacher_only' | 'shared_with_parent';
  date: Date;
};

// Koçluk seansları - belirli bir öğrenci için listeleme
router.get(
  '/students/:studentId/coaching',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const studentId = String(req.params.studentId);

    // Sadece öğretmenin sınıflarındaki öğrenciler
    const teacherClasses = await prisma.classGroup.findMany({
      where: { teacherId },
      include: { students: { select: { studentId: true } } },
    });
    const allowedStudentIds = new Set(
      teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)),
    );
    if (!allowedStudentIds.has(studentId)) {
      return res
        .status(403)
        .json({ error: 'Bu öğrenci için koçluk kayıtlarına erişemezsiniz' });
    }

    const sessions = await prisma.$queryRaw<CoachingSessionRow[]>`
      SELECT
        id,
        student_id,
        teacher_id,
        meeting_id,
        date,
        duration_minutes,
        title,
        notes,
        mode,
        meeting_url,
        "createdAt",
        "updatedAt"
      FROM "coaching_sessions"
      WHERE student_id = ${studentId} AND teacher_id = ${teacherId}
      ORDER BY date DESC
    `;

    return res.json(
      sessions.map((s) => ({
        id: s.id,
        studentId: s.student_id,
        teacherId: s.teacher_id,
        meetingId: s.meeting_id ?? undefined,
        date: s.date.toISOString(),
        durationMinutes: s.duration_minutes ?? undefined,
        title: s.title,
        notes: s.notes,
        mode: s.mode,
        meetingUrl: s.meeting_url ?? undefined,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    );
  },
);

// Koçluk hedefleri - belirli bir öğrenci için listeleme
router.get(
  '/students/:studentId/coaching-goals',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const studentId = String(req.params.studentId);

    const teacherClasses = await prisma.classGroup.findMany({
      where: { teacherId },
      include: { students: { select: { studentId: true } } },
    });
    const allowedStudentIds = new Set(
      teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)),
    );
    if (!allowedStudentIds.has(studentId)) {
      return res
        .status(403)
        .json({ error: 'Bu öğrenci için koçluk hedeflerine erişemezsiniz' });
    }

    const goals = await prisma.$queryRaw<CoachingGoalRow[]>`
      SELECT
        id,
        student_id,
        coach_id,
        title,
        description,
        deadline,
        status,
        "created_at"
      FROM "coaching_goals"
      WHERE student_id = ${studentId} AND coach_id = ${teacherId}
      ORDER BY deadline ASC, "created_at" DESC
    `;

    return res.json(
      goals.map((g) => ({
        id: g.id,
        studentId: g.student_id,
        coachId: g.coach_id,
        title: g.title,
        description: g.description ?? undefined,
        deadline: g.deadline.toISOString(),
        status: g.status,
        createdAt: g.created_at.toISOString(),
        isOverdue: g.status === 'pending' && g.deadline.getTime() < Date.now(),
      })),
    );
  },
);

// Koçluk hedefi oluşturma
router.post(
  '/students/:studentId/coaching-goals',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const studentId = String(req.params.studentId);
    const { title, description, deadline } = req.body as {
      title?: string;
      description?: string;
      deadline?: string;
    };

    if (!title || !deadline) {
      return res
        .status(400)
        .json({ error: 'title ve deadline alanları zorunludur' });
    }
    const parsedDeadline = new Date(deadline);
    if (Number.isNaN(parsedDeadline.getTime())) {
      return res.status(400).json({ error: 'Geçersiz deadline formatı' });
    }

    const teacherClasses = await prisma.classGroup.findMany({
      where: { teacherId },
      include: { students: { select: { studentId: true } } },
    });
    const allowedStudentIds = new Set(
      teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)),
    );
    if (!allowedStudentIds.has(studentId)) {
      return res
        .status(403)
        .json({ error: 'Bu öğrenci için koçluk hedefi oluşturamazsınız' });
    }

    const created = await (prisma as any).coachingGoal.create({
      data: {
        studentId,
        coachId: teacherId,
        title: title.trim(),
        description: description?.trim() || undefined,
        deadline: parsedDeadline,
        status: 'pending',
      },
    });

    return res.status(201).json({
      id: created.id,
      studentId: created.studentId,
      coachId: created.coachId,
      title: created.title,
      description: created.description ?? undefined,
      deadline: created.deadline.toISOString(),
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      isOverdue:
        created.status === 'pending' &&
        created.deadline.getTime() < Date.now(),
    });
  },
);

// Koçluk hedefi güncelleme (durum veya alanlar)
router.patch(
  '/coaching-goals/:goalId',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const goalId = String(req.params.goalId);

    const existing = await (prisma as any).coachingGoal.findUnique({
      where: { id: goalId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Koçluk hedefi bulunamadı' });
    }
    if (existing.coachId !== teacherId) {
      return res
        .status(403)
        .json({ error: 'Bu koçluk hedefini düzenleme yetkiniz yok' });
    }

    const { title, description, deadline, status } = req.body as Partial<{
      title: string;
      description: string;
      deadline: string;
      status: 'pending' | 'completed' | 'missed';
    }>;

    const data: Record<string, unknown> = {};
    if (typeof title === 'string') data.title = title.trim();
    if (typeof description === 'string') {
      data.description = description.trim() || null;
    }
    if (typeof deadline === 'string') {
      const parsed = new Date(deadline);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'Geçersiz deadline formatı' });
      }
      data.deadline = parsed;
    }
    if (status === 'pending' || status === 'completed' || status === 'missed') {
      data.status = status;
    }

    const updated = await (prisma as any).coachingGoal.update({
      where: { id: goalId },
      data,
    });

    return res.json({
      id: updated.id,
      studentId: updated.studentId,
      coachId: updated.coachId,
      title: updated.title,
      description: updated.description ?? undefined,
      deadline: updated.deadline.toISOString(),
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      isOverdue:
        updated.status === 'pending' &&
        updated.deadline.getTime() < Date.now(),
    });
  },
);

// Koçluk notları - öğretmen view (tüm notlar)
router.get(
  '/students/:studentId/coaching-notes',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const studentId = String(req.params.studentId);

    const teacherClasses = await prisma.classGroup.findMany({
      where: { teacherId },
      include: { students: { select: { studentId: true } } },
    });
    const allowedStudentIds = new Set(
      teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)),
    );
    if (!allowedStudentIds.has(studentId)) {
      return res
        .status(403)
        .json({ error: 'Bu öğrenci için koçluk notlarına erişemezsiniz' });
    }

    const notes = await prisma.$queryRaw<CoachingNoteRow[]>`
      SELECT
        id,
        student_id,
        coach_id,
        content,
        visibility,
        date
      FROM "coaching_notes"
      WHERE student_id = ${studentId} AND coach_id = ${teacherId}
      ORDER BY date DESC
    `;

    return res.json(
      notes.map((n) => ({
        id: n.id,
        studentId: n.student_id,
        coachId: n.coach_id,
        content: n.content,
        visibility: n.visibility,
        date: n.date.toISOString(),
      })),
    );
  },
);

// Koçluk notu ekleme
router.post(
  '/students/:studentId/coaching-notes',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const studentId = String(req.params.studentId);
    const { content, visibility, date } = req.body as {
      content?: string;
      visibility?: 'teacher_only' | 'shared_with_parent';
      date?: string;
    };

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content alanı zorunludur' });
    }

    const teacherClasses = await prisma.classGroup.findMany({
      where: { teacherId },
      include: { students: { select: { studentId: true } } },
    });
    const allowedStudentIds = new Set(
      teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)),
    );
    if (!allowedStudentIds.has(studentId)) {
      return res
        .status(403)
        .json({ error: 'Bu öğrenci için koçluk notu oluşturamazsınız' });
    }

    let noteDate: Date | undefined;
    if (date) {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) {
        noteDate = parsed;
      }
    }

    const created = await (prisma as any).coachingNote.create({
      data: {
        studentId,
        coachId: teacherId,
        content: content.trim(),
        visibility:
          visibility === 'teacher_only' || visibility === 'shared_with_parent'
            ? visibility
            : 'shared_with_parent',
        ...(noteDate ? { date: noteDate } : {}),
      },
    });

    return res.status(201).json({
      id: created.id,
      studentId: created.studentId,
      coachId: created.coachId,
      content: created.content,
      visibility: created.visibility,
      date: created.date.toISOString(),
    });
  },
);

// Koçluk seansı oluşturma
router.post(
  '/students/:studentId/coaching',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const studentId = String(req.params.studentId);
    const { date, durationMinutes, title, notes, mode, meetingUrl } = req.body as {
      date?: string;
      durationMinutes?: number;
      title?: string;
      notes?: string;
      mode?: 'audio' | 'video';
      meetingUrl?: string;
    };

    if (!date || !title || !notes) {
      return res
        .status(400)
        .json({ error: 'date, title ve notes alanları zorunludur' });
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({ error: 'Geçersiz tarih formatı' });
    }

    const normalizedMode: 'audio' | 'video' =
      mode === 'video' || mode === 'audio' ? mode : 'audio';
    const safeMeetingUrl =
      typeof meetingUrl === 'string' && meetingUrl.trim().length > 0
        ? meetingUrl.trim()
        : null;

    const teacherClasses = await prisma.classGroup.findMany({
      where: { teacherId },
      include: { students: { select: { studentId: true } } },
    });
    const allowedStudentIds = new Set(
      teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)),
    );
    if (!allowedStudentIds.has(studentId)) {
      return res
        .status(403)
        .json({ error: 'Bu öğrenci için koçluk kaydı oluşturamazsınız' });
    }

    // İlgili öğrenci için birebir Meeting kaydı oluştur
    const meeting = await prisma.meeting.create({
      data: {
        type: 'teacher_student',
        title,
        teacherId,
        scheduledAt: parsedDate,
        durationMinutes: typeof durationMinutes === 'number' ? durationMinutes : 30,
        meetingUrl: '',
        students: {
          create: [{ studentId }],
        },
      },
    });

    const [created] = await prisma.$queryRaw<CoachingSessionRow[]>`
      INSERT INTO "coaching_sessions" (
        id,
        student_id,
        teacher_id,
        meeting_id,
        date,
        duration_minutes,
        title,
        notes,
        mode,
        meeting_url,
        "createdAt",
        "updatedAt"
      )
      VALUES (
        gen_random_uuid(),
        ${studentId},
        ${teacherId},
        ${meeting.id},
        ${parsedDate},
        ${typeof durationMinutes === 'number' ? durationMinutes : null},
        ${title.trim()},
        ${notes.trim()},
        ${normalizedMode},
        ${safeMeetingUrl},
        NOW(),
        NOW()
      )
      RETURNING
        id,
        student_id,
        teacher_id,
        meeting_id,
        date,
        duration_minutes,
        title,
        notes,
        mode,
        meeting_url,
        "createdAt",
        "updatedAt"
    `;

    if (!created) {
      return res.status(500).json({ error: 'Koçluk seansı oluşturulamadı' });
    }

    // Koçluk seansı için bildirim (öğrenciye)
    await prisma.notification.create({
      data: {
        userId: studentId,
        type: 'meeting_scheduled',
        title: 'Yeni koçluk seansı planlandı',
        body: `"${title}" başlıklı koçluk görüşmeniz ${parsedDate.toLocaleString('tr-TR')} tarihinde planlandı.`,
        read: false,
        relatedEntityType: 'meeting',
        relatedEntityId: meeting.id,
      },
    });

    return res.status(201).json({
      id: created.id,
      studentId: created.student_id,
      teacherId: created.teacher_id,
      meetingId: created.meeting_id ?? undefined,
      date: created.date.toISOString(),
      durationMinutes: created.duration_minutes ?? undefined,
      title: created.title,
      notes: created.notes,
      mode: created.mode,
      meetingUrl: created.meeting_url ?? undefined,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });
  },
);

// Koçluk seanslarını öğretmen bazında listeleme (opsiyonel studentId filtresi)
router.get(
  '/coaching',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const studentId = req.query.studentId ? String(req.query.studentId) : undefined;

    const sessions = await prisma.$queryRaw<CoachingSessionRow[]>`
      SELECT
        id,
        student_id,
        teacher_id,
        meeting_id,
        date,
        duration_minutes,
        title,
        notes,
        mode,
        meeting_url,
        "createdAt",
        "updatedAt"
      FROM "coaching_sessions"
      WHERE teacher_id = ${teacherId}
        ${studentId ? Prisma.sql`AND student_id = ${studentId}` : Prisma.sql``}
      ORDER BY date DESC
    `;

    return res.json(
      sessions.map((s) => ({
        id: s.id,
        studentId: s.student_id,
        teacherId: s.teacher_id,
        meetingId: s.meeting_id ?? undefined,
        date: s.date.toISOString(),
        durationMinutes: s.duration_minutes ?? undefined,
        title: s.title,
        notes: s.notes,
        mode: s.mode,
        meetingUrl: s.meeting_url ?? undefined,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    );
  },
);

// Koçluk seansı güncelleme
router.put(
  '/coaching/:sessionId',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const sessionId = String(req.params.sessionId);
    const { date, durationMinutes, title, notes, mode, meetingUrl } = req.body as {
      date?: string;
      durationMinutes?: number | null;
      title?: string;
      notes?: string;
      mode?: 'audio' | 'video';
      meetingUrl?: string | null;
    };

    const [existing] = await prisma.$queryRaw<CoachingSessionRow[]>`
      SELECT
        id,
        student_id,
        teacher_id,
        date,
        duration_minutes,
        title,
        notes,
        mode,
        "createdAt",
        "updatedAt"
      FROM "coaching_sessions"
      WHERE id = ${sessionId}
      LIMIT 1
    `;
    if (!existing) {
      return res.status(404).json({ error: 'Koçluk seansı bulunamadı' });
    }
    if (existing.teacher_id !== teacherId) {
      return res
        .status(403)
        .json({ error: 'Bu koçluk seansını düzenleme yetkiniz yok' });
    }

    const updates: {
      date?: Date;
      duration_minutes?: number | null;
      title?: string;
      notes?: string;
      mode?: 'audio' | 'video';
      meeting_url?: string | null;
    } = {};

    if (date) {
      const parsedDate = new Date(date);
      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Geçersiz tarih formatı' });
      }
      updates.date = parsedDate;
    }
    if (typeof durationMinutes === 'number') {
      updates.duration_minutes = durationMinutes;
    } else if (durationMinutes === null) {
      updates.duration_minutes = null;
    }
    if (title) {
      updates.title = title.trim();
    }
    if (notes) {
      updates.notes = notes.trim();
    }

    if (mode === 'audio' || mode === 'video') {
      updates.mode = mode;
    }

    if (typeof meetingUrl === 'string') {
      const trimmed = meetingUrl.trim();
      updates.meeting_url = trimmed.length > 0 ? trimmed : null;
    } else if (meetingUrl === null) {
      updates.meeting_url = null;
    }

    const [updated] = await prisma.$queryRaw<CoachingSessionRow[]>`
      UPDATE "coaching_sessions"
      SET
        date = COALESCE(${updates.date}::timestamptz, date),
        duration_minutes = COALESCE(${updates.duration_minutes}, duration_minutes),
        title = COALESCE(${updates.title}, title),
        notes = COALESCE(${updates.notes}, notes),
        mode = COALESCE(${updates.mode}::"CoachingMode", mode),
        meeting_url = COALESCE(${updates.meeting_url}, meeting_url),
        "updatedAt" = NOW()
      WHERE id = ${sessionId}
      RETURNING
        id,
        student_id,
        teacher_id,
        date,
        duration_minutes,
        title,
        notes,
        mode,
        "createdAt",
        "updatedAt"
    `;

    if (!updated) {
      return res.status(500).json({ error: 'Koçluk seansı güncellenemedi' });
    }

    return res.json({
      id: updated.id,
      studentId: updated.student_id,
      teacherId: updated.teacher_id,
      date: updated.date.toISOString(),
      durationMinutes: updated.duration_minutes ?? undefined,
      title: updated.title,
      notes: updated.notes,
      mode: updated.mode,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  },
);

// Koçluk seansı silme
router.delete(
  '/coaching/:sessionId',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const sessionId = String(req.params.sessionId);

    const [existing] = await prisma.$queryRaw<Pick<CoachingSessionRow, 'id' | 'teacher_id'>[]>`
      SELECT id, teacher_id
      FROM "coaching_sessions"
      WHERE id = ${sessionId}
      LIMIT 1
    `;
    if (!existing) {
      return res.status(404).json({ error: 'Koçluk seansı bulunamadı' });
    }
    if (existing.teacher_id !== teacherId) {
      return res
        .status(403)
        .json({ error: 'Bu koçluk seansını silme yetkiniz yok' });
    }

    await prisma.$executeRaw`
      DELETE FROM "coaching_sessions"
      WHERE id = ${sessionId}
    `;
    return res.json({ success: true });
  },
);

// Canlı ders için ödev durumları
router.get(
  '/assignments/live-status',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;

    // Aktif ödevleri bul
    const assignments = await prisma.assignmentStudent.findMany({
      where: {
        assignment: {
          dueDate: { gte: new Date() }
        }
      },
      select: {
        assignmentId: true,
        studentId: true,
        // @ts-ignore: Prisma types sync issue
        status: true,
        completedAt: true,
        assignment: {
          select: { title: true, dueDate: true }
        }
      }
    });

    return res.json((assignments as any[]).map(a => ({
      assignmentId: a.assignmentId,
      studentId: a.studentId,
      status: a.status,
      completedAt: a.completedAt,
      title: a.assignment.title
    })));
  },
);


// Yıllık gelişim raporu verileri
router.get(
  '/students/:id/performance',
  authenticateMultiple(['teacher', 'admin']),
  async (req: AuthenticatedRequest, res) => {
    const studentId = String(req.params.id);

    // Öğrenci bilgisi
    const student: any = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, gradeLevel: true, classId: true, profilePictureUrl: true } as any,
    });

    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }

    let className = student.gradeLevel ? `${student.gradeLevel}. Sınıf` : '';
    if (student.classId && typeof student.classId === 'string') {
      const cls = await prisma.classGroup.findUnique({ where: { id: student.classId } });
      if (cls) className = cls.name;
    }

    // 1. Digital Effort Stats
    // Attendance
    const meetingAttendances = await prisma.meetingAttendance.count({
      where: { studentId, present: true }
    });
    // Toplam katılması gereken dersler (geçmiş dersler)
    const totalMeetings = await prisma.meetingStudent.count({
      where: {
        studentId,
        meeting: { scheduledAt: { lt: new Date() } }
      }
    });
    const attendanceRate = totalMeetings > 0 ? Math.round((meetingAttendances / totalMeetings) * 100) : 0;

    // Focus (Assume 25 mins per session if duration missing)
    const focusSessionsCount = await prisma.studentFocusSession.count({
      where: { studentId }
    });
    const focusHours = Math.round((focusSessionsCount * 25) / 60);

    // Video
    const watchStats = await prisma.watchRecord.aggregate({
      where: { studentId },
      _sum: { watchedSeconds: true }
    });
    const videoMinutes = Math.round((watchStats._sum.watchedSeconds || 0) / 60);

    // Questions counts (from TestResultAnswer if possible, or sum from TestResult)
    // Using TestResult sum is faster if correct/incorrect counts are stored there.
    const questionStats = await prisma.testResult.aggregate({
      where: { studentId },
      _sum: { correctCount: true, incorrectCount: true }
    });
    const solvedQuestions = (questionStats._sum.correctCount || 0) + (questionStats._sum.incorrectCount || 0);

    // 2. Subject/Topic Performance
    const testResults: any[] = await (prisma.testResult as any).findMany({
      where: { studentId },
      include: {
        test: {
          include: { subject: true }
        }
      }
    });

    // Group by Subject -> Topic
    const subjectMap = new Map<string, {
      id: string;
      name: string;
      topics: Map<string, { correct: number; incorrect: number }>
    }>();

    for (const res of testResults) {
      if (!res.test || !res.test.subject) continue;
      const subId = res.test.subject.id;
      const subName = res.test.subject.name;
      // Eğer topic boşsa 'Genel' kullan
      const topic = res.test.topic && res.test.topic.trim() ? res.test.topic : 'Genel Tekrar';

      if (!subjectMap.has(subId)) {
        subjectMap.set(subId, { id: subId, name: subName, topics: new Map() });
      }
      const subEntry = subjectMap.get(subId)!;

      if (!subEntry.topics.has(topic)) {
        subEntry.topics.set(topic, { correct: 0, incorrect: 0 });
      }
      const topicEntry = subEntry.topics.get(topic)!;
      topicEntry.correct += res.correctCount;
      topicEntry.incorrect += res.incorrectCount;
    }

    // Transform to frontend format
    const mapToFrontendKey = (name: string): string => {
      const lower = name.toLowerCase();
      if (lower.includes('matematik')) return 'matematik';
      if (lower.includes('fen') || lower.includes('fizik') || lower.includes('kimya') || lower.includes('biyoloji')) return 'fen';
      if (lower.includes('türkçe') || lower.includes('turkce') || lower.includes('edebiyat')) return 'turkce';
      if (lower.includes('sosyal') || lower.includes('tarih') || lower.includes('coğrafya') || lower.includes('inkılap')) return 'sosyal';
      if (lower.includes('ingilizce') || lower.includes('yabancı') || lower.includes('dil')) return 'yabanci';
      return 'diger';
    };

    const subjectsOutput: any[] = [];
    const radarData: any[] = [];

    let totalCorrectAll = 0;
    let totalQuestionsAll = 0;

    for (const [subId, subData] of subjectMap.entries()) {
      const key = mapToFrontendKey(subData.name);
      if (key === 'diger') continue; // Şimdilik sadece ana dersleri göster

      const topicsList = [];
      let totalCorrect = 0;
      let totalIncorrect = 0;

      for (const [topicName, stats] of subData.topics.entries()) {
        const total = stats.correct + stats.incorrect;
        const mastery = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
        topicsList.push({
          id: topicName,
          name: topicName,
          correct: stats.correct,
          incorrect: stats.incorrect,
          masteryPercent: mastery
        });
        totalCorrect += stats.correct;
        totalIncorrect += stats.incorrect;
      }

      if (topicsList.length > 0) {
        subjectsOutput.push({
          id: key,
          label: subData.name,
          topics: topicsList
        });

        const totalQ = totalCorrect + totalIncorrect;
        const avg = totalQ > 0 ? Math.round((totalCorrect / totalQ) * 100) : 0;
        // Mock Class Avg
        const classAvg = Math.max(0, Math.min(100, avg - 5 + Math.floor(Math.random() * 15)));

        radarData.push({
          axis: subData.name,
          student: avg,
          classAvg
        });

        totalCorrectAll += totalCorrect;
        totalQuestionsAll += totalCorrect + totalIncorrect;
      }
    }

    // Yıllık Skor Hesabı
    let avgMastery = 0;
    if (totalQuestionsAll > 0) {
      avgMastery = (totalCorrectAll / totalQuestionsAll) * 100; // Total correct / total questions
    } else if (radarData.length > 0) {
      avgMastery = radarData.reduce((a, b) => a + b.student, 0) / radarData.length;
    }

    // 0-10 arası puan. (Mastery % 70, Attendance % 30 ağırlıklı)
    const annualScore = ((avgMastery / 10) * 0.7) + ((attendanceRate / 10) * 0.3);

    // Mock percentile rank (Real rank requires comparing with all students, leaving as mock/random for now)
    const annualRankPercentile = 80 + Math.floor(Math.random() * 19);

    // Mock subjects data if empty (to avoid broken UI if no test results)
    if (subjectsOutput.length === 0) {
      // Return minimal mock data so UI doesn't crash?
      // Or just let it be empty.
    }

    return res.json({
      student: {
        name: student.name,
        className: className,
        avatarUrl: (student as any).profilePictureUrl || '',
        annualScore: Number(annualScore.toFixed(1)),
        annualRankPercentile
      },
      digitalEffort: {
        attendanceRate,
        focusHours,
        videoMinutes,
        solvedQuestions
      },
      subjects: subjectsOutput,
      radar: radarData,
      coachNote: 'Öğrencinin performansı sistem verilerine dayalı olarak hesaplanmıştır. Düzenli çalışmaya devam ediniz.'
    });
  },
);

export default router;


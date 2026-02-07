import express from 'express';
import { GoogleGenAI } from '@google/genai';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { authenticate, AuthenticatedRequest } from './auth';
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
    const teacherStudentIds = teacherClasses.flatMap((c) =>
      c.students.map((s) => s.studentId),
    );

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
      return res.status(500).json({ error: 'GEMINI_API_KEY ayarlı değil' });
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
      const prompt = `Lütfen aşağıdaki kriterlere uygun test soruları üret:

- Sınıf seviyesi: ${gradeLevel || '9-12 (Lise)'}
- Konu: ${topic.trim()}
- Soru sayısı: ${Math.min(Math.max(Number(count) || 5, 1), 20)}
- Zorluk: ${difficulty || 'orta'} (kolay/orta/zor)

ZORUNLU FORMAT KURALLARI (bu formata tam uy):
1. Her soru mutlaka A) B) C) D) E) şıklı olsun (5 şık).
2. Her sorudan hemen önce (ilk soru hariç) ayrı satırda sadece "---SAYFA---" yaz. Böylece her soru ayrı sayfada görünecek.
3. Her soruyu "**1. Soru:**" "**2. Soru:**" şeklinde numaralandır.
4. Soru köklerini **kalın** yap. Matematik için x², x³, 4x³ gibi net metin kullan (LaTeX yok). Şekilli sorularda şekli açıkça tarif et, köşe/kenar bilgilerini belirt.
5. Tüm sorulardan sonra "---" ve "Cevap Anahtarı: 1-A, 2-B, 3-C, ..." formatında doğru cevapları listele.
6. Daima Türkçe yaz.

Örnek format:
**1. Soru:** f(x)=x² fonksiyonunun x=2 noktasındaki türevi kaçtır?
A) 2  B) 4  C) 6  D) 8  E) 10
---SAYFA---
**2. Soru:** ...
A) ...  B) ...  C) ...  D) ...  E) ...
---SAYFA---
...
---
Cevap Anahtarı: 1-B, 2-C, 3-A, ...`;
      const result = await callGemini(prompt, {
        systemInstruction: 'Sen deneyimli bir soru bankası yazarısın. Bloom taksonomisine uygun, net ve ölçülebilir sorular üretirsin.',
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
    const teacherStudents = await prisma.user.findMany({
      where: { id: { in: [...studentIds] }, role: 'student' },
      select: { id: true, name: true, email: true, gradeLevel: true, classId: true, lastSeenAt: true },
    });
    return res.json(
      teacherStudents.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        role: 'student' as const,
        gradeLevel: s.gradeLevel ?? '',
        classId: s.classId ?? '',
        lastSeenAt: s.lastSeenAt?.toISOString(),
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
      where: { teacherId: userId },
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
    } = req.body as {
      type?: 'teacher_student' | 'teacher_student_parent' | 'class';
      title?: string;
      studentIds?: string[];
      parentIds?: string[];
      scheduledAt?: string;
      durationMinutes?: number;
      meetingUrl?: string;
    };

    if (!type || !title || !scheduledAt || !durationMinutes) {
      return res.status(400).json({
        error: 'type, title, scheduledAt ve durationMinutes alanları zorunludur',
      });
    }

    const meeting = await prisma.meeting.create({
      data: {
        type: type as 'teacher_student' | 'teacher_student_parent' | 'class',
        title,
        teacherId,
        scheduledAt: new Date(scheduledAt),
        durationMinutes,
        // Harici link desteği ileride tekrar eklenecekse meetingUrl kullanılabilir.
        meetingUrl: meetingUrl ?? '',
        students: {
          create: (studentIds ?? []).map((studentId) => ({ studentId })),
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

export default router;


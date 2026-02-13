import express, { type Request, type Response, type RequestHandler } from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import { PDFDocument } from 'pdf-lib';
import { authenticateMultiple, type AuthenticatedRequest } from './auth';
import { callGemini } from './ai';
import { prisma as prismaClient } from './db';

// Cast prisma to any to avoid IDE type glitches; model exists at runtime
const prisma = prismaClient as any;

const router = express.Router();

// Multer memory storage – PDF dosyası RAM'de tutulur
const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: {
    // Maksimum 250 MB (çok büyük dosyalar sunucu belleğini zorlayabilir)
    fileSize: 250 * 1024 * 1024,
  },
});

const MAX_PAGES_PER_CALL = 10;

interface ParsedQuestion {
  question_text: string;
  options: string[];
  correct_option?: string | null;
  difficulty: string;
  topic: string;
}

type QuestionBankDifficulty = 'easy' | 'medium' | 'hard';

function mapDifficultyToQuestionBank(difficulty: string | null | undefined): QuestionBankDifficulty {
  const value = (difficulty ?? '').toString().trim().toLowerCase();

  if (value.startsWith('kol')) return 'easy'; // Kolay
  if (value.startsWith('zor')) return 'hard'; // Zor

  return 'medium'; // Varsayılan / Orta
}

function normalizeChoices(options: unknown): string[] {
  if (!Array.isArray(options)) return [];

  return (options as unknown[]).map((optRaw) => {
    const raw = String(optRaw ?? '').trim();
    if (!raw) return '';

    // "A) ...", "B) ...", "A. ...", "A ) ..." gibi önekleri temizle
    const match = raw.match(/^([A-E])\s*[\).\-\:]?\s*(.+)$/i);
    if (match && match[2]) {
      return match[2].trim();
    }

    return raw;
  }).filter((opt) => opt.length > 0);
}

function normalizeCorrectAnswer(correctOption: string | null | undefined): string {
  if (!correctOption) return '';

  const raw = correctOption.toString().trim();
  if (!raw) return '';

  // "A", "A)", "A )", "A. ..." gibi formlardan harfi çek
  const match = raw.match(/^([A-E])/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }

  return raw.charAt(0).toUpperCase();
}

function extractResponseText(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;

  const maybeText = (response as { text?: string | (() => string) }).text;
  if (typeof maybeText === 'function') {
    try {
      const value = maybeText();
      if (typeof value === 'string' && value.trim()) return value.trim();
    } catch {
      // ignore
    }
  } else if (typeof maybeText === 'string' && maybeText.trim()) {
    return maybeText.trim();
  }

  const candidates = (response as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }).candidates;

  if (Array.isArray(candidates) && candidates.length > 0) {
    const parts = candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const joined = parts
        .map((part) => (part?.text ?? '').trim())
        .filter(Boolean)
        .join('\n');
      if (joined.trim()) return joined.trim();
    }
  }

  return null;
}

function cleanJsonResponse(raw: string): string {
  let text = raw.trim();

  // Eğer model <json> ... </json> etiketleri kullandıysa, bu aralığı al
  const startTag = text.indexOf('<json>');
  const endTag = text.lastIndexOf('</json>');
  if (startTag !== -1 && endTag !== -1 && endTag > startTag) {
    text = text.slice(startTag + '<json>'.length, endTag);
  }

  // Olur da model ```json ile dönerse temizle
  if (text.startsWith('```json')) {
    text = text.slice('```json'.length);
  }
  if (text.startsWith('```')) {
    text = text.slice(3);
  }
  if (text.endsWith('```')) {
    text = text.slice(0, -3);
  }

  // Güvenli olsun diye, ilk '[' ile son ']' arasını al
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    text = text.slice(firstBracket, lastBracket + 1);
  }

  return text.trim();
}

async function slicePdfBuffer(
  buffer: Buffer,
  options: {
    mode?: 'firstN' | 'range';
    maxPages?: number;
    startPage?: number;
    endPage?: number;
  },
): Promise<Buffer> {
  if (!options.mode) return buffer;

  const srcDoc = await PDFDocument.load(buffer);
  const totalPages = srcDoc.getPageCount();

  let pageIndices: number[] = [];

  if (options.mode === 'firstN') {
    const maxPages = Math.max(1, Math.min(options.maxPages ?? 3, MAX_PAGES_PER_CALL, totalPages));
    pageIndices = Array.from({ length: maxPages }, (_v, i) => i);
  } else if (options.mode === 'range') {
    const start = Math.max(1, options.startPage ?? 1);
    const end = Math.min(totalPages, options.endPage ?? totalPages);
    if (end < start) {
      throw new Error('INVALID_PAGE_RANGE');
    }
    for (let i = start - 1; i < end; i += 1) {
      pageIndices.push(i);
      if (pageIndices.length >= MAX_PAGES_PER_CALL) break;
    }
  }

  if (pageIndices.length === 0) {
    return buffer;
  }

  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
  copiedPages.forEach((p) => newDoc.addPage(p));
  const newBytes = await newDoc.save();
  return Buffer.from(newBytes);
}

/**
 * POST /api/ai/parse-pdf
 * Admin tarafından yüklenen PDF test kitabını Gemini 1.5 Flash ile ayrıştırır.
 */
router.post(
  '/parse-pdf',
  authenticateMultiple(['admin', 'teacher']) as unknown as RequestHandler,
  upload.single('file'),
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    void authReq;

    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Lütfen bir PDF dosyası yükleyin.',
        });
      }

      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({
          success: false,
          error: 'Yalnızca PDF dosyaları desteklenmektedir.',
        });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: 'Yapay zeka servisi yapılandırılmamış. Lütfen yönetici ile iletişime geçin.',
        });
      }

      const genAi = new GoogleGenAI({ apiKey });
      const modelName = process.env.GEMINI_MODEL?.trim() || 'gemini-1.5-flash-latest';

      // Sayfa aralığı / ilk N sayfa parametreleri (multipart body'den gelir)
      const pageModeRaw = (req.body.pageMode as string | undefined) ?? undefined;
      const pageMode = pageModeRaw === 'firstN' || pageModeRaw === 'range' ? pageModeRaw : undefined;
      const maxPages = req.body.maxPages ? Number(req.body.maxPages) : undefined;
      const startPage = req.body.startPage ? Number(req.body.startPage) : undefined;
      const endPage = req.body.endPage ? Number(req.body.endPage) : undefined;

      let workingBuffer = req.file.buffer;
      try {
        if (pageMode) {
          workingBuffer = await slicePdfBuffer(workingBuffer, {
            mode: pageMode,
            maxPages,
            startPage,
            endPage,
          });
        }
      } catch (sliceErr) {
        // eslint-disable-next-line no-console
        console.error('[AI][parse-pdf] PDF slice error:', sliceErr);
        return res.status(400).json({
          success: false,
          error: 'Sayfa aralığı işlenemedi. Lütfen geçerli bir sayfa aralığı girin.',
        });
      }

      const pdfBase64 = workingBuffer.toString('base64');

      const systemInstruction = [
        'Sen uzman bir ölçme-değerlendirme öğretmenisin. Türkçe, matematik, fen, sosyal, İngilizce vb. TÜM derslerden gelen çoktan seçmeli sınav PDF’lerini analiz edersin.',
        '',
        'Kurallar:',
        '1. Sadece çoktan seçmeli soruları ayıkla.',
        '2. Her soru için TAM soru metnini (giriş cümlesi, paragraf, tablo açıklaması dahil) `question_text` alanına yaz. ŞIKLARI buraya KOPYALAMA.',
        '3. Şıkları (A,B,C,D,E) ayrı ayrı `options` listesine yaz (örn: ["A) ...", "B) ...", ...]).',
        '4. Varsa doğru cevabı `correct_option` alanına A, B, C, D veya E harfi olarak yaz.',
        '5. Her soru için kısa ve anlamlı bir konu başlığı tahmin et (örn: \"Paragrafta Anlam\", \"Üslü Sayılar\", \"Kimya – Asit Baz\") ve `topic` alanına yaz.',
        '6. Eğer konu başlığını kestiremiyorsan bile `topic` alanına en azından ilgili ders adını veya \"Genel\" yaz (asla boş bırakma).',
        '7. İstersen her soru için `difficulty` alanına \"Kolay\", \"Orta\" veya \"Zor\" değeri yazabilirsin; bu alan boş da olabilir.',
        '8. ÇIKTIYI SADECE GEÇERLİ BİR JSON ARRAY OLARAK VER. Başında veya sonunda açıklama, doğal dil metni, yorum satırı, Markdown, ```json gibi işaretler OLMAMALIDIR.',
        '9. JSON içinde hiç yorum (// veya /* */), fazladan virgül veya metin kullanma. Tüm anahtarlar ve string değerler çift tırnak ile yazılmalıdır.',
        '10. JSON çıktını <json> ve </json> etiketleri arasına koy. Etiketlerin dışında hiçbir şey yazma.',
        '',
        'Format tam olarak şöyle olmalıdır:',
        '<json>',
        '[',
        '  {',
        '    "question_text": "Soru metni...",',
        '    "options": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],',
        '    "correct_option": "A",',
        '    "difficulty": "Orta" veya null veya hiç yok,',
        '    "topic": "Üslü Sayılar"',
        '  }',
        ']',
        '</json>',
      ].join('\n');

      const response = await (genAi as any).models.generateContent({
        model: modelName,
        systemInstruction: {
          role: 'system',
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: pdfBase64,
                  mimeType: req.file.mimetype || 'application/pdf',
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 4096,
          // Modelden doğrudan JSON üretmesini istiyoruz
          responseMimeType: 'application/json',
        },
      } as Parameters<(typeof genAi)['models']['generateContent']>[0]);

      const rawText = extractResponseText(response);
      if (!rawText) {
        return res.status(500).json({
          success: false,
          error: 'Yapay zeka yanıtı alınamadı. Lütfen daha sonra tekrar deneyin.',
        });
      }

      let parsed: ParsedQuestion[];
      try {
        const cleaned = cleanJsonResponse(rawText);
        const json = JSON.parse(cleaned);
        if (!Array.isArray(json)) {
          throw new Error('Beklenen format JSON array değil.');
        }
        parsed = json as ParsedQuestion[];
      } catch (err) {
        // İlk parse başarısız olduysa, metni ikinci bir AI çağrısıyla JSON'a dönüştürmeyi dene
        // eslint-disable-next-line no-console
        console.error('[AI][parse-pdf] JSON parse error, trying repair step:', err);
        try {
          const repairPrompt = [
            'Aşağıda bir yapay zeka çıktısı göreceksin. Bu çıktı PDF test kitabındaki sorularla ilgili, ancak geçerli bir JSON array formatında değil.',
            '',
            'Görev:',
            '1. Bu metindeki soru verilerini kullanarak geçerli bir JSON array oluştur.',
            '2. HER ELEMAN aşağıdaki yapıda olmalı:',
            '   {',
            '     "question_text": "Soru metni...",',
            '     "options": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],',
            '     "correct_option": "A" veya null veya hiç yok,',
            '     "difficulty": "Kolay" | "Orta" | "Zor",',
            '     "topic": "Konu başlığı"',
            '   }',
            '3. SADECE geçerli bir JSON array döndür. Başında/sonunda açıklama, yorum, Markdown, ```json vb. OLMAMALI.',
            '',
            'Kaynak metin:',
            rawText,
          ].join('\n\n');

          const repaired = await callGemini(repairPrompt, {
            systemInstruction:
              'Sen bir JSON onarım asistanısın. Görevin sadece geçerli bir JSON array döndürmek. Doğal dil açıklaması yazma.',
            temperature: 0.1,
            maxOutputTokens: 4096,
          });

          const cleanedRepaired = cleanJsonResponse(repaired);
          const json = JSON.parse(cleanedRepaired);
          if (!Array.isArray(json)) {
            throw new Error('Onarım sonrası çıktı JSON array değil.');
          }
          parsed = json as ParsedQuestion[];
        } catch (repairErr) {
          // eslint-disable-next-line no-console
          console.error('[AI][parse-pdf] JSON repair failed:', repairErr);
          return res.status(500).json({
            success: false,
            error:
              'Yapay zekadan gelen yanıt geçerli formata dönüştürülemedi. Lütfen daha sade bir PDF sayfası deneyin veya daha küçük parçalar halinde yükleyin.',
          });
        }
      }

      return res.json({
        success: true,
        data: parsed,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AI][parse-pdf] Unexpected error:', error);
      return res.status(500).json({
        success: false,
        error: 'PDF analiz edilirken beklenmeyen bir hata oluştu.',
      });
    }
  },
);

/**
 * POST /api/ai/save-parsed-questions
 * Frontend'de ayrıştırılmış (parse edilmiş) soruları soru bankasına kaydeder.
 * Beklenen body:
 * {
 *   subjectId: string;
 *   gradeLevel: string;
 *   questions: ParsedQuestion[];
 * }
 *
 * Not: Konu başlığı öğretmen tarafından girilmez.
 * Her soru için AI'ın döndürdüğü `topic` alanı kullanılır.
 */
router.post(
  '/save-parsed-questions',
  authenticateMultiple(['admin', 'teacher']) as unknown as RequestHandler,
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;

    try {
      const { subjectId, gradeLevel, questions } = req.body as {
        subjectId?: string;
        gradeLevel?: string;
        questions?: ParsedQuestion[];
      };

      if (!subjectId || !gradeLevel) {
        return res.status(400).json({
          success: false,
          error: 'Ders ve sınıf seviyesi zorunludur.',
        });
      }

      if (!Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Kaydedilecek soru bulunamadı.',
        });
      }

      const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (!subject) {
        return res.status(400).json({
          success: false,
          error: 'Geçersiz ders ID.',
        });
      }

      const createdByTeacherId =
        authReq.user && authReq.user.role === 'teacher' ? authReq.user.id : null;

      const dataToInsert = questions.map((q) => {
        const rawTopic = (q.topic ?? '').toString().trim();
        const topicValue = rawTopic || 'Genel';

        return {
        subjectId,
        gradeLevel,
        topic: topicValue,
        text: q.question_text ?? '',
        type: 'multiple_choice',
        choices: normalizeChoices(q.options),
        correctAnswer: normalizeCorrectAnswer(q.correct_option ?? null) || 'A',
        difficulty: mapDifficultyToQuestionBank(q.difficulty),
        bloomLevel: null,
        subtopic: null,
        kazanimKodu: null,
        estimatedMinutes: null,
        distractorReasons: null,
        solutionExplanation: null,
        source: 'import' as const,
        createdByTeacherId,
        isApproved: true,
        approvedByTeacherId: createdByTeacherId,
        qualityScore: null,
        usageCount: 0,
        tags: [] as string[],
      };
      });

      const result = await prisma.questionBank.createMany({
        data: dataToInsert,
      });

      return res.json({
        success: true,
        saved: result.count ?? dataToInsert.length,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AI][save-parsed-questions] Unexpected error:', error);
      return res.status(500).json({
        success: false,
        error: 'Sorular veritabanına kaydedilirken bir hata oluştu.',
      });
    }
  },
);

export default router;

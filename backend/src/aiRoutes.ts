import express, { type Request, type Response, type RequestHandler } from 'express';
import multer from 'multer';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import { PDFDocument } from 'pdf-lib';
import { authenticateMultiple, type AuthenticatedRequest } from './auth';
import { callGemini } from './ai';
import { prisma as prismaClient } from './db';

// Try to import pdfExtractor service (may fail if dependencies missing)
let extractQuestionsFromPdf: ((buffer: Buffer, config: any) => Promise<any[]>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfExtractorService = require('./services/pdfExtractor.service');
  if (pdfExtractorService && typeof pdfExtractorService.extractQuestionsFromPdf === 'function') {
    extractQuestionsFromPdf = pdfExtractorService.extractQuestionsFromPdf;
  }
} catch (err) {
  // Service not available - will use fallback approach
  // eslint-disable-next-line no-console
  console.warn('[AI Routes] PDF extractor service not available, will use fallback:', err instanceof Error ? err.message : String(err));
}

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
const CHUNK_SIZE = 3; // Büyük PDF'leri daha küçük parçalara bölerek işle (daha stabil sonuç için)

const USER_CONFIGURED_MODEL = process.env.GEMINI_MODEL?.trim();
const FALLBACK_MODELS = [
  // Prefer newer fast models first
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  // Keep older but widely available fallbacks
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest',
];

function resolveModelCandidates(): string[] {
  const candidates = USER_CONFIGURED_MODEL
    ? [USER_CONFIGURED_MODEL, ...FALLBACK_MODELS]
    : FALLBACK_MODELS;
  return Array.from(new Set(candidates.map((m) => m.trim()).filter(Boolean)));
}

function isModelNotFoundError(error: unknown): boolean {
  const e = error as any;
  const msg = (e?.message ? String(e.message) : String(error ?? '')).toLowerCase();
  const status = typeof e?.status === 'number' ? e.status : undefined;
  return (
    status === 404 ||
    msg.includes('not found') ||
    msg.includes('unknown model') ||
    msg.includes('call listmodels') ||
    msg.includes('is not found for api version')
  );
}

function isQuotaError(error: unknown): boolean {
  const e = error as any;
  const status =
    typeof e?.status === 'number'
      ? e.status
      : typeof e?.response?.status === 'number'
        ? e.response.status
        : undefined;
  if (status === 429) return true;
  const msg = (e?.message ? String(e.message) : String(error ?? '')).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit')
  );
}

interface ParsedQuestion {
  question_text: string;
  imageUrl?: string;
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

  const r = response as Record<string, unknown>;

  // @google/genai: response.text can be a getter returning string
  try {
    const t = r.text;
    if (typeof t === 'string' && t.trim()) return t.trim();
    if (typeof t === 'function') {
      const value = (t as () => string)();
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  } catch {
    // ignore
  }

  const candidates = r.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
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

      const fileBuffer = (req.file as Express.Multer.File & { buffer?: Buffer }).buffer;
      if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
        return res.status(400).json({
          success: false,
          error: 'PDF dosyası yüklenemedi. Lütfen tekrar deneyin.',
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
      const modelCandidates = resolveModelCandidates();

      // Sayfa aralığı / ilk N sayfa parametreleri (multipart body'den gelir)
      const pageModeRaw = (req.body.pageMode as string | undefined) ?? undefined;
      const pageMode = pageModeRaw === 'firstN' || pageModeRaw === 'range' ? pageModeRaw : undefined;
      const maxPages = req.body.maxPages ? Number(req.body.maxPages) : undefined;
      const startPage = req.body.startPage ? Number(req.body.startPage) : undefined;
      const endPage = req.body.endPage ? Number(req.body.endPage) : undefined;

      let workingBuffer = fileBuffer;
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

      // Toplam sayfa sayısını kontrol et – büyük PDF'leri chunk'lara böl
      const srcDocForCount = await PDFDocument.load(workingBuffer);
      const totalPageCount = srcDocForCount.getPageCount();
      // eslint-disable-next-line no-console
      console.log(`[AI][parse-pdf] PDF has ${totalPageCount} pages`);

      const systemInstruction = [
        'Sen uzman bir ölçme-değerlendirme öğretmenisin. Türkçe, matematik, fen, sosyal, İngilizce vb. TÜM derslerden gelen çoktan seçmeli sınav PDF\'lerini analiz edersin.',
        '',
        'KRİTİK KURALLAR:',
        '',
        '1. TÜM SORULARI YAKALA:',
        '   - PDF\'deki HER çoktan seçmeli soruyu bul ve çıkar. Hiçbir soru atlanmamalı.',
        '   - Soru numaralarını (1., 2., 3. vb.) veya harflerini (A., B., C. vb.) takip ederek tüm soruları sırayla işle.',
        '   - Sayfa sonlarında veya başlarında kalan soruları da dahil et.',
        '',
        '2. METİN BAĞLAMI ÇOK ÖNEMLİ:',
        '   - Bir sorunun üstünde, önünde veya yanında metin, paragraf, tablo, grafik, açıklama varsa MUTLAKA dahil et.',
        '   - Örnek: "Aşağıdaki paragrafa göre 1-3. soruları cevaplayınız" şeklinde bir başlık varsa, bu başlık ve paragraf TÜM ilgili soruların `question_text` alanına dahil edilmeli.',
        '   - Bir metin bloğundan sonra birden fazla soru (örn: 1, 2, 3. sorular) geliyorsa, her soru için o metin bloğunu da ekle.',
        '   - Tablo, grafik veya görsel açıklamaları soru metnine dahil et.',
        '   - KURAL: Soru metni, soruyu anlamak için gereken TÜM bağlamı içermeli. Bağımsız okunabilir olmalı.',
        '',
        '3. SORU METNİ FORMATI:',
        '   - `question_text` alanına şunları dahil et:',
        '     * Soru numarası (varsa: "1.", "2." vb.)',
        '     * Üstteki/açıklayıcı metin, paragraf, tablo açıklaması (VARSa)',
        '     * Soru kökü (asıl soru cümlesi)',
        '     * ŞIKLARI buraya KOPYALAMA - şıklar ayrı `options` listesinde olacak',
        '',
        '4. ŞIKLAR:',
        '   - Şıkları (A, B, C, D, E) ayrı ayrı `options` listesine yaz (örn: ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."]).',
        '   - TEMİZLİK KURALI: Şık metinlerindeki tüm işaretlemeleri (koyu yazı, altı çizili, yanındaki "X", "Cevap", "(Doğru)" gibi ibareleri) KESİNLİKLE SİL. Öğrenci sadece şıkkın içeriğini görmeli.',
        '   - Şık sayısı 4 veya 5 olabilir. Mevcut şıkları olduğu gibi al.',
        '',
        '5. DOĞRU CEVAP:',
        '   - Varsa doğru cevabı `correct_option` alanına A, B, C, D veya E harfi olarak yaz.',
        '   - Eğer PDF üzerinde doğru şık işaretlenmişse (yuvarlak içine alınmış, koyu yazılmış vb.), bunu algıla ve `correct_option`\'a yaz, AMA `options` veya `question_text` içinden bu işareti temizle.',
        '   - Yoksa bu alanı null bırak.',
        '',
        '6. KONU VE GÖRSELLER:',
        '   - Her soru için kısa ve anlamlı bir konu başlığı tahmin et.',
        '   - GÖRSELLİ SORULAR (Geometri, Grafik vb.): Eğer soru bir şekil içeriyorsa, bu şekli `question_text` içine metin olarak tasvir etmeye çalış (örn: "[Görsel: ABC üçgeni, A açısı 90 derece...]"). Bu sayede metin tabanlı da olsa soru anlaşılabilir olsun.',
        '',
        '7. ZORLUK SEVİYESİ:',
        '   - İstersen her soru için `difficulty` alanına "Kolay", "Orta" veya "Zor" değeri yazabilirsin; bu alan boş da olabilir.',
        '',
        '8. ÇIKTI FORMATI:',
        '   - ÇIKTIYI SADECE GEÇERLİ BİR JSON ARRAY OLARAK VER. Başında veya sonunda açıklama, doğal dil metni, yorum satırı, Markdown, ```json gibi işaretler OLMAMALIDIR.',
        '   - JSON içinde hiç yorum (// veya /* */), fazladan virgül veya metin kullanma. Tüm anahtarlar ve string değerler çift tırnak ile yazılmalıdır.',
        '   - JSON çıktını <json> ve </json> etiketleri arasına koy. Etiketlerin dışında hiçbir şey yazma.',
        '',
        'ÖRNEK FORMAT:',
        '<json>',
        '[',
        '  {',
        '    "question_text": "Aşağıdaki paragrafa göre 1-3. soruları cevaplayınız.\\n\\nParagraf metni buraya gelir...\\n\\n1. Bu paragrafa göre...",',
        '    "options": ["A) Seçenek 1", "B) Seçenek 2", "C) Seçenek 3", "D) Seçenek 4"],',
        '    "correct_option": "B",',
        '    "difficulty": "Orta",',
        '    "topic": "Paragrafta Anlam"',
        '  },',
        '  {',
        '    "question_text": "2. Aynı paragrafa göre...",',
        '    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],',
        '    "correct_option": "A",',
        '    "difficulty": "Orta",',
        '    "topic": "Paragrafta Anlam"',
        '  }',
        ']',
        '</json>',
        '',
        'ÖNEMLİ HATIRLATMA:',
        '- PDF\'deki TÜM soruları çıkar. Hiçbirini atlama. Sayfa sayfa kontrol et.',
        '- Soru metninin üstündeki/açıklayıcı metinleri MUTLAKA dahil et.',
        '- Her soru bağımsız okunabilir ve anlaşılır olmalı.',
        '- ASLA placeholder metinler ("Soru metni 1", "Soru 1", "..." vb.) kullanma. PDF\'deki GERÇEK soru metinlerini olduğu gibi kopyala.',
        '- Soru numarası varsa dahil et, ama soru içeriğini tam olarak al.',
        '- Şıkları da PDF\'deki gibi tam olarak kopyala, kısaltma yapma.',
      ].join('\n');

      // -- Chunk mantığı: büyük PDF'leri parçalar halinde işle --
      const allParsed: ParsedQuestion[] = [];
      const chunkCount = Math.ceil(totalPageCount / CHUNK_SIZE);

      for (let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
        const chunkStart = chunkIdx * CHUNK_SIZE + 1; // 1-indexed
        const chunkEnd = Math.min((chunkIdx + 1) * CHUNK_SIZE, totalPageCount);

        // eslint-disable-next-line no-console
        console.log(`[AI][parse-pdf] Processing chunk ${chunkIdx + 1}/${chunkCount} (pages ${chunkStart}-${chunkEnd})`);

        let chunkBuffer: Buffer;
        if (chunkCount === 1) {
          // Tek chunk – tüm PDF'i gönder
          chunkBuffer = workingBuffer;
        } else {
          // Çok chunk – ilgili sayfaları ayır
          chunkBuffer = await slicePdfBuffer(workingBuffer, {
            mode: 'range',
            startPage: chunkStart,
            endPage: chunkEnd,
          });
        }

        const pdfBase64 = chunkBuffer.toString('base64');

        let response: any = null;
        let lastModelError: unknown = null;
        for (const model of modelCandidates) {
          try {
            response = await genAi.models.generateContent({
              model,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      inlineData: {
                        data: pdfBase64,
                        mimeType: req.file!.mimetype || 'application/pdf',
                      },
                    },
                  ],
                },
              ],
              config: {
                systemInstruction,
                temperature: 0.1,
                maxOutputTokens: 65536,
                responseMimeType: 'application/json',
              },
            });
            break;
          } catch (err) {
            lastModelError = err;
            if (isModelNotFoundError(err)) {
              // eslint-disable-next-line no-console
              console.warn('[AI][parse-pdf] Model not available, trying next:', model);
              continue;
            }
            if (isQuotaError(err)) {
              // eslint-disable-next-line no-console
              console.warn('[AI][parse-pdf] Quota exceeded for model, trying next:', model);
              continue;
            }
            throw err;
          }
        }
        if (!response) {
          throw lastModelError ?? new Error('Yapay zeka modeli bulunamadı');
        }

        const rawText = extractResponseText(response);
        if (!rawText) {
          // eslint-disable-next-line no-console
          console.warn(`[AI][parse-pdf] No response for chunk ${chunkIdx + 1}, skipping...`);
          continue;
        }

        let chunkParsed: ParsedQuestion[];
        try {
          const cleaned = cleanJsonResponse(rawText);
          // eslint-disable-next-line no-console
          console.log(`[AI][parse-pdf] Chunk ${chunkIdx + 1} cleaned JSON length:`, cleaned.length);
          const json = JSON.parse(cleaned);
          if (!Array.isArray(json)) {
            throw new Error('Beklenen format JSON array değil.');
          }
          chunkParsed = json as ParsedQuestion[];
          // eslint-disable-next-line no-console
          console.log(`[AI][parse-pdf] Chunk ${chunkIdx + 1}: parsed ${chunkParsed.length} questions`);
        } catch (err) {
          // İlk parse başarısız olduysa, metni ikinci bir AI çağrısıyla JSON'a dönüştürmeyi dene
          // eslint-disable-next-line no-console
          console.error(`[AI][parse-pdf] Chunk ${chunkIdx + 1} JSON parse error:`, err);
          // eslint-disable-next-line no-console
          console.error(`[AI][parse-pdf] Raw text (first 1000 chars):`, rawText.slice(0, 1000));
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
              '4. Response MIME type application/json olarak ayarlanmış, bu yüzden SADECE JSON döndür.',
              '',
              'Kaynak metin:',
              rawText.slice(0, 30000),
            ].join('\n\n');

            const repaired = await callGemini(repairPrompt, {
              systemInstruction:
                'Sen bir JSON onarım asistanısın. Görevin sadece geçerli bir JSON array döndürmek. Doğal dil açıklaması yazma. Sadece JSON döndür.',
              temperature: 0.1,
              maxOutputTokens: 65536,
              responseMimeType: 'application/json',
            });

            // eslint-disable-next-line no-console
            console.log(`[AI][parse-pdf] Repair response length for chunk ${chunkIdx + 1}:`, repaired.length);
            const cleanedRepaired = cleanJsonResponse(repaired);
            const json = JSON.parse(cleanedRepaired);
            if (!Array.isArray(json)) {
              throw new Error('Onarım sonrası çıktı JSON array değil.');
            }
            chunkParsed = json as ParsedQuestion[];
            // eslint-disable-next-line no-console
            console.log(`[AI][parse-pdf] Chunk ${chunkIdx + 1} repaired: ${chunkParsed.length} questions`);
          } catch (repairErr) {
            // eslint-disable-next-line no-console
            console.error(`[AI][parse-pdf] Chunk ${chunkIdx + 1} JSON repair failed:`, repairErr);
            // Chunk'un soruları alınamazsa diğer chunk'larla devam et
            if (chunkCount > 1) {
              // eslint-disable-next-line no-console
              console.warn(`[AI][parse-pdf] Skipping failed chunk ${chunkIdx + 1}, continuing...`);
              continue;
            }
            return res.status(500).json({
              success: false,
              error:
                'Yapay zekadan gelen yanıt geçerli formata dönüştürülemedi. Lütfen daha sade bir PDF sayfası deneyin veya daha küçük parçalar halinde yükleyin. Hata detayları: ' +
                (repairErr instanceof Error ? repairErr.message : String(repairErr)),
            });
          }
        }

        allParsed.push(...chunkParsed);
      }

      // eslint-disable-next-line no-console
      console.log(`[AI][parse-pdf] Total questions parsed across all chunks: ${allParsed.length}`);

      if (allParsed.length === 0) {
        return res.status(500).json({
          success: false,
          error: 'PDF\'den hiçbir soru çıkarılamadı. Lütfen farklı bir PDF deneyin.',
        });
      }

      return res.json({
        success: true,
        data: allParsed,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // eslint-disable-next-line no-console
      console.error('[AI][parse-pdf] Unexpected error:', err.message, err.stack);

      // 429 / kota aşımı: kullanıcıya anlaşılır mesaj ver
      const raw = err.message || String(error);
      const isQuota =
        raw.includes('429') ||
        raw.includes('quota') ||
        raw.includes('RESOURCE_EXHAUSTED') ||
        (error as { status?: number }).status === 429;
      if (isQuota) {
        let retrySec: number | null = null;
        try {
          const parsed = JSON.parse(raw) as {
            error?: { details?: Array<{ '@type'?: string; retryDelay?: string }> };
          };
          const retryInfo = parsed?.error?.details?.find((d) =>
            d['@type']?.includes('RetryInfo'),
          );
          if (retryInfo?.retryDelay) {
            const match = retryInfo.retryDelay.match(/(\d+)/);
            if (match && match[1]) retrySec = parseInt(match[1], 10);
          }
        } catch {
          const match = raw.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
          if (match && match[1]) retrySec = Math.ceil(parseFloat(match[1]));
        }
        const waitHint =
          retrySec != null ? ` Yaklaşık ${retrySec} saniye sonra tekrar deneyin.` : '';
        return res.status(429).json({
          success: false,
          error:
            'Günlük ücretsiz istek kotası aşıldı (model başına 20 istek).' +
            waitHint +
            ' Daha fazla kullanım için: https://ai.google.dev/gemini-api/docs/rate-limits',
        });
      }

      const message = `PDF analiz hatası: ${err.message}`;
      return res.status(500).json({
        success: false,
        error: message,
      });
    }
  },
);

/**
 * POST /api/ai/extract-questions
 * PDF sayfalarını görsele çevirip Gemini ile soru bölgelerini tespit eder,
 * Sharp ile her soruyu kırpıp görsel olarak döndürür.
 */
router.post(
  '/extract-questions',
  authenticateMultiple(['admin', 'teacher', 'student']) as unknown as RequestHandler,
  upload.single('file'),
  async (req: Request, res: Response) => {
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
      const fileBuffer = (req.file as Express.Multer.File & { buffer?: Buffer }).buffer;
      if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
        return res.status(400).json({
          success: false,
          error: 'PDF dosyası yüklenemedi. Lütfen tekrar deneyin.',
        });
      }
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: 'Yapay zeka servisi yapılandırılmamış. Lütfen yönetici ile iletişime geçin.',
        });
      }

      // Canvas tabanlı extractor varsa onu kullan, yoksa fallback
      if (extractQuestionsFromPdf) {
        try {
          const outputDir = path.join(__dirname, '..', 'uploads', 'question-images');
          const questions = await extractQuestionsFromPdf(fileBuffer, {
            apiKey,
            modelName: resolveModelCandidates()[0] ?? (process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash'),
            scale: 2.0,
            skipEmptyPages: true,
            outputDir,
          });
          return res.json({
            success: true,
            questions,
            count: questions.length,
          });
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[AI] Canvas extractor failed, falling back to pdf-lib:', err);
          // Fall through to fallback
        }
      }

      // Fallback: Canvas yok – pdf-lib ile her sayfayı ayrı PDF olarak Gemini'ye gönder
      // eslint-disable-next-line no-console
      console.log('[AI][extract-questions] Using pdf-lib fallback (no canvas)');

      const genAi = new GoogleGenAI({ apiKey });
      const modelCandidates = resolveModelCandidates();

      let srcDoc: Awaited<ReturnType<typeof PDFDocument.load>>;
      let numPages: number;
      try {
        srcDoc = await PDFDocument.load(fileBuffer);
        numPages = srcDoc.getPageCount();
      } catch (pdfErr) {
        // eslint-disable-next-line no-console
        console.error('[AI][extract-questions] PDFDocument.load failed:', pdfErr);
        return res.json({
          success: true,
          questions: [],
          count: 0,
          error: 'PDF okunamadı, cevap formu boş açıldı.',
        });
      }

      interface FallbackQuestion {
        questionNumber: number;
        question_text: string;
        options: string[];
        correct_option?: string | null;
        difficulty?: string;
        topic?: string;
        originalPage: number;
        imageUrl: string;
      }

      const allQuestions: FallbackQuestion[] = [];
      let globalQNum = 1;

      for (let pageIdx = 0; pageIdx < numPages; pageIdx++) {
        try {
          // Her sayfayı ayrı bir PDF olarak oluştur
          const singlePageDoc = await PDFDocument.create();
          const [copiedPage] = await singlePageDoc.copyPages(srcDoc, [pageIdx]);
          singlePageDoc.addPage(copiedPage);
          const singlePageBytes = await singlePageDoc.save();
          const pageBase64 = Buffer.from(singlePageBytes).toString('base64');

          // eslint-disable-next-line no-console
          console.log(`[AI][extract-questions] Processing page ${pageIdx + 1}/${numPages}`);

          let response: any = null;
          let lastModelError: unknown = null;
          for (const model of modelCandidates) {
            try {
              response = await genAi.models.generateContent({
                model,
                contents: [
                  {
                    role: 'user',
                    parts: [
                      {
                        inlineData: {
                          data: pageBase64,
                          mimeType: 'application/pdf',
                        },
                      },
                      {
                        text: `Bu PDF sayfasındaki tüm çoktan seçmeli soruları bul. Her soru için aşağıdaki alanları çıkar:
- questionNumber: soru numarası (sayfa içinde 1'den başla, tam sayı)
- question_text: soru metni (tam metin, Türkçe)
- options: şıklar dizisi, örn. ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."]
- correct_option: doğru şık harfi ("A", "B", "C", "D" veya "E") veya bilinmiyorsa null
- topic: sorunun konu başlığı (örn. "Türev", "İntegral", "Osmanlı Tarihi", bilinmiyorsa "Genel")
- difficulty: zorluk seviyesi ("Kolay", "Orta" veya "Zor")

Yanıtı SADECE geçerli bir JSON dizisi olarak ver. Başına veya sonuna hiçbir açıklama, markdown kodu veya başka metin ekleme.
Format örneği: [{"questionNumber":1,"question_text":"...","options":["A) ...","B) ...","C) ...","D) ...","E) ..."],"correct_option":null,"topic":"Genel","difficulty":"Orta"}]
Eğer sayfada soru yoksa tam olarak şunu döndür: []`,
                      },
                    ],
                  },
                ],
                config: {
                  temperature: 0.1,
                  maxOutputTokens: 8192,
                },
              });
              break;
            } catch (err) {
              lastModelError = err;
              if (isModelNotFoundError(err)) {
                // eslint-disable-next-line no-console
                console.warn('[AI][extract-questions] Model not available, trying next:', model);
                continue;
              }
              throw err;
            }
          }
          if (!response) {
            throw lastModelError ?? new Error('Yapay zeka modeli bulunamadı');
          }

          let rawText = extractResponseText(response);
          if (!rawText) {
            // eslint-disable-next-line no-console
            console.warn(`[AI][extract-questions] Page ${pageIdx + 1} empty response, skipping`);
            continue;
          }

          const parsePageResponse = (text: string): unknown[] | null => {
            try {
              const cleaned = cleanJsonResponse(text);
              const parsed = JSON.parse(cleaned);
              return Array.isArray(parsed) ? parsed : null;
            } catch {
              return null;
            }
          };

          let pageQuestions = parsePageResponse(rawText);

          // Parse failed: try repair with a second Gemini call
          if (!pageQuestions && rawText.length > 10) {
            try {
              let repairResponse: any = null;
              let lastRepairErr: unknown = null;
              for (const model of modelCandidates) {
                try {
                  repairResponse = await genAi.models.generateContent({
                    model,
                    contents: [
                      {
                        role: 'user',
                        parts: [{
                          text: `Aşağıdaki metni geçerli bir JSON dizisine dönüştür. Çıktı sadece soru nesnelerinden oluşan bir dizi olmalı. Her nesnede: questionNumber (sayı), question_text (metin), options (dizi), correct_option (harf veya null). Başka metin ekleme, sadece JSON:\n\n${rawText.slice(0, 12000)}`,
                        }],
                      },
                    ],
                    config: {
                      temperature: 0,
                      maxOutputTokens: 8192,
                    },
                  });
                  break;
                } catch (err) {
                  lastRepairErr = err;
                  if (isModelNotFoundError(err)) continue;
                  throw err;
                }
              }
              if (!repairResponse) throw lastRepairErr ?? new Error('Yapay zeka modeli bulunamadı');
              const repairText = extractResponseText(repairResponse);
              if (repairText) pageQuestions = parsePageResponse(repairText);
            } catch (repairErr) {
              // eslint-disable-next-line no-console
              console.warn(`[AI][extract-questions] Page ${pageIdx + 1} repair failed:`, repairErr instanceof Error ? repairErr.message : '');
            }
          }

          if (Array.isArray(pageQuestions) && pageQuestions.length > 0) {
            for (const q of pageQuestions) {
              const qObj = q as Record<string, unknown>;
              const qNum = qObj.questionNumber ?? globalQNum;
              allQuestions.push({
                questionNumber: typeof qNum === 'number' ? qNum : globalQNum,
                question_text: String(qObj.question_text ?? ''),
                options: Array.isArray(qObj.options) ? (qObj.options as string[]).map(String) : [],
                correct_option: qObj.correct_option != null ? String(qObj.correct_option) : null,
                difficulty: String(qObj.difficulty ?? 'Orta'),
                topic: String(qObj.topic ?? 'Genel'),
                originalPage: pageIdx + 1,
                imageUrl: '',
              });
              globalQNum++;
            }
          }
        } catch (pageErr) {
          // eslint-disable-next-line no-console
          console.warn(`[AI][extract-questions] Page ${pageIdx + 1} error, skipping:`, pageErr instanceof Error ? pageErr.message : String(pageErr));
        }
      }

      // Hiç soru çıkmadıysa sayfa sayısına göre placeholder üret (frontend boş form göstermesin)
      if (allQuestions.length === 0 && numPages > 0) {
        for (let i = 0; i < numPages; i++) {
          allQuestions.push({
            questionNumber: i + 1,
            question_text: `Sayfa ${i + 1} – Soru metni otomatik çıkarılamadı. Lütfen PDF'ten okuyun.`,
            options: ['A)', 'B)', 'C)', 'D)', 'E)'],
            correct_option: null,
            difficulty: 'Orta',
            topic: 'Genel',
            originalPage: i + 1,
            imageUrl: '',
          });
        }
        // eslint-disable-next-line no-console
        console.log(`[AI][extract-questions] No questions extracted, returning ${allQuestions.length} placeholders`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`[AI][extract-questions] Fallback extracted ${allQuestions.length} questions`);
      }

      return res.json({
        success: true,
        questions: allQuestions,
        count: allQuestions.length,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // eslint-disable-next-line no-console
      console.error('[AI][extract-questions] Error:', err.message, err.stack);
      return res.status(500).json({
        success: false,
        error: `Görsel çıkarma hatası: ${err.message}`,
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

      const dataToInsert = (questions as ParsedQuestion[]).map((q: ParsedQuestion) => {
        const rawTopic = (q.topic ?? '').toString().trim();
        const topicValue = rawTopic || 'Genel';

        return {
          subjectId,
          gradeLevel,
          topic: topicValue,
          text: q.question_text ?? '',
          imageUrl: q.imageUrl || null,
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

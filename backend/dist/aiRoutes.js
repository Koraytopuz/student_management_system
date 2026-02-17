"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const genai_1 = require("@google/genai");
const pdf_lib_1 = require("pdf-lib");
const auth_1 = require("./auth");
const ai_1 = require("./ai");
const db_1 = require("./db");
// Try to import pdfExtractor service (may fail if dependencies missing)
let extractQuestionsFromPdf = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfExtractorService = require('./services/pdfExtractor.service');
    if (pdfExtractorService && typeof pdfExtractorService.extractQuestionsFromPdf === 'function') {
        extractQuestionsFromPdf = pdfExtractorService.extractQuestionsFromPdf;
    }
}
catch (err) {
    // Service not available - will use fallback approach
    // eslint-disable-next-line no-console
    console.warn('[AI Routes] PDF extractor service not available, will use fallback:', err instanceof Error ? err.message : String(err));
}
// Cast prisma to any to avoid IDE type glitches; model exists at runtime
const prisma = db_1.prisma;
const router = express_1.default.Router();
// Multer memory storage – PDF dosyası RAM'de tutulur
const memoryStorage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage: memoryStorage,
    limits: {
        // Maksimum 250 MB (çok büyük dosyalar sunucu belleğini zorlayabilir)
        fileSize: 250 * 1024 * 1024,
    },
});
const MAX_PAGES_PER_CALL = 10;
const CHUNK_SIZE = 10; // Büyük PDF'leri CHUNK_SIZE sayfalık gruplara böl
function mapDifficultyToQuestionBank(difficulty) {
    const value = (difficulty !== null && difficulty !== void 0 ? difficulty : '').toString().trim().toLowerCase();
    if (value.startsWith('kol'))
        return 'easy'; // Kolay
    if (value.startsWith('zor'))
        return 'hard'; // Zor
    return 'medium'; // Varsayılan / Orta
}
function normalizeChoices(options) {
    if (!Array.isArray(options))
        return [];
    return options.map((optRaw) => {
        const raw = String(optRaw !== null && optRaw !== void 0 ? optRaw : '').trim();
        if (!raw)
            return '';
        // "A) ...", "B) ...", "A. ...", "A ) ..." gibi önekleri temizle
        const match = raw.match(/^([A-E])\s*[\).\-\:]?\s*(.+)$/i);
        if (match && match[2]) {
            return match[2].trim();
        }
        return raw;
    }).filter((opt) => opt.length > 0);
}
function normalizeCorrectAnswer(correctOption) {
    if (!correctOption)
        return '';
    const raw = correctOption.toString().trim();
    if (!raw)
        return '';
    // "A", "A)", "A )", "A. ..." gibi formlardan harfi çek
    const match = raw.match(/^([A-E])/i);
    if (match && match[1]) {
        return match[1].toUpperCase();
    }
    return raw.charAt(0).toUpperCase();
}
function extractResponseText(response) {
    var _a, _b;
    if (!response || typeof response !== 'object')
        return null;
    const maybeText = response.text;
    if (typeof maybeText === 'function') {
        try {
            const value = maybeText();
            if (typeof value === 'string' && value.trim())
                return value.trim();
        }
        catch {
            // ignore
        }
    }
    else if (typeof maybeText === 'string' && maybeText.trim()) {
        return maybeText.trim();
    }
    const candidates = response.candidates;
    if (Array.isArray(candidates) && candidates.length > 0) {
        const parts = (_b = (_a = candidates[0]) === null || _a === void 0 ? void 0 : _a.content) === null || _b === void 0 ? void 0 : _b.parts;
        if (Array.isArray(parts)) {
            const joined = parts
                .map((part) => { var _a; return ((_a = part === null || part === void 0 ? void 0 : part.text) !== null && _a !== void 0 ? _a : '').trim(); })
                .filter(Boolean)
                .join('\n');
            if (joined.trim())
                return joined.trim();
        }
    }
    return null;
}
function cleanJsonResponse(raw) {
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
async function slicePdfBuffer(buffer, options) {
    var _a, _b, _c;
    if (!options.mode)
        return buffer;
    const srcDoc = await pdf_lib_1.PDFDocument.load(buffer);
    const totalPages = srcDoc.getPageCount();
    let pageIndices = [];
    if (options.mode === 'firstN') {
        const maxPages = Math.max(1, Math.min((_a = options.maxPages) !== null && _a !== void 0 ? _a : 3, MAX_PAGES_PER_CALL, totalPages));
        pageIndices = Array.from({ length: maxPages }, (_v, i) => i);
    }
    else if (options.mode === 'range') {
        const start = Math.max(1, (_b = options.startPage) !== null && _b !== void 0 ? _b : 1);
        const end = Math.min(totalPages, (_c = options.endPage) !== null && _c !== void 0 ? _c : totalPages);
        if (end < start) {
            throw new Error('INVALID_PAGE_RANGE');
        }
        for (let i = start - 1; i < end; i += 1) {
            pageIndices.push(i);
            if (pageIndices.length >= MAX_PAGES_PER_CALL)
                break;
        }
    }
    if (pageIndices.length === 0) {
        return buffer;
    }
    const newDoc = await pdf_lib_1.PDFDocument.create();
    const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((p) => newDoc.addPage(p));
    const newBytes = await newDoc.save();
    return Buffer.from(newBytes);
}
/**
 * POST /api/ai/parse-pdf
 * Admin tarafından yüklenen PDF test kitabını Gemini 1.5 Flash ile ayrıştırır.
 */
router.post('/parse-pdf', (0, auth_1.authenticateMultiple)(['admin', 'teacher']), upload.single('file'), async (req, res) => {
    var _a, _b, _c, _d;
    const authReq = req;
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
        const fileBuffer = req.file.buffer;
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
        const genAi = new genai_1.GoogleGenAI({ apiKey });
        const modelName = ((_a = process.env.GEMINI_MODEL) === null || _a === void 0 ? void 0 : _a.trim()) || 'gemini-1.5-flash-latest';
        // Sayfa aralığı / ilk N sayfa parametreleri (multipart body'den gelir)
        const pageModeRaw = (_b = req.body.pageMode) !== null && _b !== void 0 ? _b : undefined;
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
        }
        catch (sliceErr) {
            // eslint-disable-next-line no-console
            console.error('[AI][parse-pdf] PDF slice error:', sliceErr);
            return res.status(400).json({
                success: false,
                error: 'Sayfa aralığı işlenemedi. Lütfen geçerli bir sayfa aralığı girin.',
            });
        }
        // Toplam sayfa sayısını kontrol et – büyük PDF'leri chunk'lara böl
        const srcDocForCount = await pdf_lib_1.PDFDocument.load(workingBuffer);
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
            '   - Şık sayısı 4 veya 5 olabilir. Mevcut şıkları olduğu gibi al.',
            '',
            '5. DOĞRU CEVAP:',
            '   - Varsa doğru cevabı `correct_option` alanına A, B, C, D veya E harfi olarak yaz.',
            '   - Yoksa bu alanı null bırak veya hiç ekleme.',
            '',
            '6. KONU BAŞLIĞI:',
            '   - Her soru için kısa ve anlamlı bir konu başlığı tahmin et (örn: "Paragrafta Anlam", "Üslü Sayılar", "Kimya – Asit Baz", "Tarih – Osmanlı Dönemi").',
            '   - Eğer konu başlığını kestiremiyorsan bile `topic` alanına en azından ilgili ders adını veya "Genel" yaz (asla boş bırakma).',
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
        const allParsed = [];
        const chunkCount = Math.ceil(totalPageCount / CHUNK_SIZE);
        for (let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
            const chunkStart = chunkIdx * CHUNK_SIZE + 1; // 1-indexed
            const chunkEnd = Math.min((chunkIdx + 1) * CHUNK_SIZE, totalPageCount);
            // eslint-disable-next-line no-console
            console.log(`[AI][parse-pdf] Processing chunk ${chunkIdx + 1}/${chunkCount} (pages ${chunkStart}-${chunkEnd})`);
            let chunkBuffer;
            if (chunkCount === 1) {
                // Tek chunk – tüm PDF'i gönder
                chunkBuffer = workingBuffer;
            }
            else {
                // Çok chunk – ilgili sayfaları ayır
                chunkBuffer = await slicePdfBuffer(workingBuffer, {
                    mode: 'range',
                    startPage: chunkStart,
                    endPage: chunkEnd,
                });
            }
            const pdfBase64 = chunkBuffer.toString('base64');
            const response = await genAi.models.generateContent({
                model: modelName,
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
                config: {
                    systemInstruction,
                    temperature: 0.1,
                    maxOutputTokens: 65536,
                    responseMimeType: 'application/json',
                },
            });
            const rawText = extractResponseText(response);
            if (!rawText) {
                // eslint-disable-next-line no-console
                console.warn(`[AI][parse-pdf] No response for chunk ${chunkIdx + 1}, skipping...`);
                continue;
            }
            let chunkParsed;
            try {
                const cleaned = cleanJsonResponse(rawText);
                // eslint-disable-next-line no-console
                console.log(`[AI][parse-pdf] Chunk ${chunkIdx + 1} cleaned JSON length:`, cleaned.length);
                const json = JSON.parse(cleaned);
                if (!Array.isArray(json)) {
                    throw new Error('Beklenen format JSON array değil.');
                }
                chunkParsed = json;
                // eslint-disable-next-line no-console
                console.log(`[AI][parse-pdf] Chunk ${chunkIdx + 1}: parsed ${chunkParsed.length} questions`);
            }
            catch (err) {
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
                    const repaired = await (0, ai_1.callGemini)(repairPrompt, {
                        systemInstruction: 'Sen bir JSON onarım asistanısın. Görevin sadece geçerli bir JSON array döndürmek. Doğal dil açıklaması yazma. Sadece JSON döndür.',
                        temperature: 0.1,
                        maxOutputTokens: 65536,
                    });
                    // eslint-disable-next-line no-console
                    console.log(`[AI][parse-pdf] Repair response length for chunk ${chunkIdx + 1}:`, repaired.length);
                    const cleanedRepaired = cleanJsonResponse(repaired);
                    const json = JSON.parse(cleanedRepaired);
                    if (!Array.isArray(json)) {
                        throw new Error('Onarım sonrası çıktı JSON array değil.');
                    }
                    chunkParsed = json;
                    // eslint-disable-next-line no-console
                    console.log(`[AI][parse-pdf] Chunk ${chunkIdx + 1} repaired: ${chunkParsed.length} questions`);
                }
                catch (repairErr) {
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
                        error: 'Yapay zekadan gelen yanıt geçerli formata dönüştürülemedi. Lütfen daha sade bir PDF sayfası deneyin veya daha küçük parçalar halinde yükleyin. Hata detayları: ' +
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
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        // eslint-disable-next-line no-console
        console.error('[AI][parse-pdf] Unexpected error:', err.message, err.stack);
        // 429 / kota aşımı: kullanıcıya anlaşılır mesaj ver
        const raw = err.message || String(error);
        const isQuota = raw.includes('429') ||
            raw.includes('quota') ||
            raw.includes('RESOURCE_EXHAUSTED') ||
            error.status === 429;
        if (isQuota) {
            let retrySec = null;
            try {
                const parsed = JSON.parse(raw);
                const retryInfo = (_d = (_c = parsed === null || parsed === void 0 ? void 0 : parsed.error) === null || _c === void 0 ? void 0 : _c.details) === null || _d === void 0 ? void 0 : _d.find((d) => { var _a; return (_a = d['@type']) === null || _a === void 0 ? void 0 : _a.includes('RetryInfo'); });
                if (retryInfo === null || retryInfo === void 0 ? void 0 : retryInfo.retryDelay) {
                    const match = retryInfo.retryDelay.match(/(\d+)/);
                    if (match && match[1])
                        retrySec = parseInt(match[1], 10);
                }
            }
            catch {
                const match = raw.match(/retry in (\d+(?:\.\d+)?)\s*s/i);
                if (match && match[1])
                    retrySec = Math.ceil(parseFloat(match[1]));
            }
            const waitHint = retrySec != null ? ` Yaklaşık ${retrySec} saniye sonra tekrar deneyin.` : '';
            return res.status(429).json({
                success: false,
                error: 'Günlük ücretsiz istek kotası aşıldı (model başına 20 istek).' +
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
});
/**
 * POST /api/ai/extract-questions
 * PDF sayfalarını görsele çevirip Gemini ile soru bölgelerini tespit eder,
 * Sharp ile her soruyu kırpıp görsel olarak döndürür.
 */
router.post('/extract-questions', (0, auth_1.authenticateMultiple)(['admin', 'teacher']), upload.single('file'), async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g;
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
        const fileBuffer = req.file.buffer;
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
            const outputDir = path_1.default.join(__dirname, '..', 'uploads', 'question-images');
            const questions = await extractQuestionsFromPdf(fileBuffer, {
                apiKey,
                modelName: ((_a = process.env.GEMINI_MODEL) === null || _a === void 0 ? void 0 : _a.trim()) || 'gemini-2.0-flash',
                scale: 2.0,
                skipEmptyPages: true,
                outputDir,
            });
            return res.json({
                success: true,
                questions,
                count: questions.length,
            });
        }
        // Fallback: Canvas yok – pdf-lib ile her sayfayı ayrı PDF olarak Gemini'ye gönder
        // eslint-disable-next-line no-console
        console.log('[AI][extract-questions] Using pdf-lib fallback (no canvas)');
        const genAi = new genai_1.GoogleGenAI({ apiKey });
        const modelName = ((_b = process.env.GEMINI_MODEL) === null || _b === void 0 ? void 0 : _b.trim()) || 'gemini-2.0-flash';
        const srcDoc = await pdf_lib_1.PDFDocument.load(fileBuffer);
        const numPages = srcDoc.getPageCount();
        const allQuestions = [];
        let globalQNum = 1;
        for (let pageIdx = 0; pageIdx < numPages; pageIdx++) {
            try {
                // Her sayfayı ayrı bir PDF olarak oluştur
                const singlePageDoc = await pdf_lib_1.PDFDocument.create();
                const [copiedPage] = await singlePageDoc.copyPages(srcDoc, [pageIdx]);
                singlePageDoc.addPage(copiedPage);
                const singlePageBytes = await singlePageDoc.save();
                const pageBase64 = Buffer.from(singlePageBytes).toString('base64');
                // eslint-disable-next-line no-console
                console.log(`[AI][extract-questions] Processing page ${pageIdx + 1}/${numPages}`);
                const response = await genAi.models.generateContent({
                    model: modelName,
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
                                    text: `Bu PDF sayfasındaki tüm çoktan seçmeli soruları bul. Her soru için şunları döndür:
- questionNumber: soru numarası
- question_text: soru metni (paragraf, bağlam dahil)
- options: şıklar dizisi ("A) ...", "B) ..." şeklinde)
- correct_option: doğru cevap harfi (varsa, yoksa null)
- difficulty: zorluk (Kolay/Orta/Zor)
- topic: konu başlığı

SADECE JSON array döndür. Markdown, açıklama veya başka metin YAZMA.`,
                                },
                            ],
                        },
                    ],
                    config: {
                        temperature: 0.1,
                        maxOutputTokens: 65536,
                        responseMimeType: 'application/json',
                    },
                });
                const rawText = extractResponseText(response);
                if (!rawText)
                    continue;
                try {
                    const cleaned = cleanJsonResponse(rawText);
                    const pageQuestions = JSON.parse(cleaned);
                    if (Array.isArray(pageQuestions)) {
                        for (const q of pageQuestions) {
                            const qNum = (_c = q.questionNumber) !== null && _c !== void 0 ? _c : globalQNum;
                            allQuestions.push({
                                questionNumber: typeof qNum === 'number' ? qNum : globalQNum,
                                question_text: (_d = q.question_text) !== null && _d !== void 0 ? _d : '',
                                options: Array.isArray(q.options) ? q.options : [],
                                correct_option: (_e = q.correct_option) !== null && _e !== void 0 ? _e : null,
                                difficulty: (_f = q.difficulty) !== null && _f !== void 0 ? _f : 'Orta',
                                topic: (_g = q.topic) !== null && _g !== void 0 ? _g : 'Genel',
                                originalPage: pageIdx + 1,
                                imageUrl: '', // Görsel yok, metin tabanlı
                            });
                            globalQNum++;
                        }
                    }
                }
                catch (parseErr) {
                    // eslint-disable-next-line no-console
                    console.warn(`[AI][extract-questions] Page ${pageIdx + 1} parse error, skipping`);
                }
            }
            catch (pageErr) {
                // eslint-disable-next-line no-console
                console.warn(`[AI][extract-questions] Page ${pageIdx + 1} error, skipping:`, pageErr instanceof Error ? pageErr.message : String(pageErr));
            }
        }
        // eslint-disable-next-line no-console
        console.log(`[AI][extract-questions] Fallback extracted ${allQuestions.length} questions`);
        return res.json({
            success: true,
            questions: allQuestions,
            count: allQuestions.length,
        });
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        // eslint-disable-next-line no-console
        console.error('[AI][extract-questions] Error:', err.message, err.stack);
        return res.status(500).json({
            success: false,
            error: `Görsel çıkarma hatası: ${err.message}`,
        });
    }
});
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
router.post('/save-parsed-questions', (0, auth_1.authenticateMultiple)(['admin', 'teacher']), async (req, res) => {
    var _a;
    const authReq = req;
    try {
        const { subjectId, gradeLevel, questions } = req.body;
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
        const createdByTeacherId = authReq.user && authReq.user.role === 'teacher' ? authReq.user.id : null;
        const dataToInsert = questions.map((q) => {
            var _a, _b, _c;
            const rawTopic = ((_a = q.topic) !== null && _a !== void 0 ? _a : '').toString().trim();
            const topicValue = rawTopic || 'Genel';
            return {
                subjectId,
                gradeLevel,
                topic: topicValue,
                text: (_b = q.question_text) !== null && _b !== void 0 ? _b : '',
                type: 'multiple_choice',
                choices: normalizeChoices(q.options),
                correctAnswer: normalizeCorrectAnswer((_c = q.correct_option) !== null && _c !== void 0 ? _c : null) || 'A',
                difficulty: mapDifficultyToQuestionBank(q.difficulty),
                bloomLevel: null,
                subtopic: null,
                kazanimKodu: null,
                estimatedMinutes: null,
                distractorReasons: null,
                solutionExplanation: null,
                source: 'import',
                createdByTeacherId,
                isApproved: true,
                approvedByTeacherId: createdByTeacherId,
                qualityScore: null,
                usageCount: 0,
                tags: [],
            };
        });
        const result = await prisma.questionBank.createMany({
            data: dataToInsert,
        });
        return res.json({
            success: true,
            saved: (_a = result.count) !== null && _a !== void 0 ? _a : dataToInsert.length,
        });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AI][save-parsed-questions] Unexpected error:', error);
        return res.status(500).json({
            success: false,
            error: 'Sorular veritabanına kaydedilirken bir hata oluştu.',
        });
    }
});
exports.default = router;
//# sourceMappingURL=aiRoutes.js.map
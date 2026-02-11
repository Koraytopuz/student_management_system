"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const genai_1 = require("@google/genai");
const pdf_lib_1 = require("pdf-lib");
const auth_1 = require("./auth");
const ai_1 = require("./ai");
const db_1 = require("./db");
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
    var _a, _b;
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
        }
        catch (sliceErr) {
            // eslint-disable-next-line no-console
            console.error('[AI][parse-pdf] PDF slice error:', sliceErr);
            return res.status(400).json({
                success: false,
                error: 'Sayfa aralığı işlenemedi. Lütfen geçerli bir sayfa aralığı girin.',
            });
        }
        const pdfBase64 = workingBuffer.toString('base64');
        const systemInstruction = [
            'Sen uzman bir matematik ve fen bilimleri öğretmenisin. Sana verilen PDF sayfasındaki çoktan seçmeli soruları analiz et.',
            '',
            'Kurallar:',
            '1. Sadece çoktan seçmeli soruları ayıkla.',
            '2. Her soru için soru metnini, şıkları (A,B,C,D,E) ve varsa doğru cevabı çıkar.',
            '3. Matematiksel ifadeleri (karekök, üs, integral vb.) mutlaka LaTeX formatında yaz (örn: $x^2$, $\\\\sqrt{25}$).',
            '4. Her soru için zorluk seviyesini (Kolay, Orta, Zor) ve konu başlığını tahmin et.',
            '5. ÇIKTIYI SADECE GEÇERLİ BİR JSON ARRAY OLARAK VER. Başında veya sonunda açıklama, doğal dil metni, yorum satırı, Markdown, ```json gibi işaretler OLMAMALIDIR.',
            '6. JSON içinde hiç yorum (// veya /* */), fazladan virgül veya metin kullanma. Tüm anahtarlar ve string değerler çift tırnak ile yazılmalıdır.',
            '7. JSON çıktını <json> ve </json> etiketleri arasına koy. Etiketlerin dışında hiçbir şey yazma.',
            '',
            'Format tam olarak şöyle olmalıdır:',
            '<json>',
            '[',
            '  {',
            '    "question_text": "Soru metni...",',
            '    "options": ["A) ...", "B) ...", "C) ...", "D) ...", "E) ..."],',
            '    "correct_option": "A",',
            '    "difficulty": "Orta",',
            '    "topic": "Üslü Sayılar"',
            '  }',
            ']',
            '</json>',
        ].join('\n');
        const response = await genAi.models.generateContent({
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
        });
        const rawText = extractResponseText(response);
        if (!rawText) {
            return res.status(500).json({
                success: false,
                error: 'Yapay zeka yanıtı alınamadı. Lütfen daha sonra tekrar deneyin.',
            });
        }
        let parsed;
        try {
            const cleaned = cleanJsonResponse(rawText);
            const json = JSON.parse(cleaned);
            if (!Array.isArray(json)) {
                throw new Error('Beklenen format JSON array değil.');
            }
            parsed = json;
        }
        catch (err) {
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
                const repaired = await (0, ai_1.callGemini)(repairPrompt, {
                    systemInstruction: 'Sen bir JSON onarım asistanısın. Görevin sadece geçerli bir JSON array döndürmek. Doğal dil açıklaması yazma.',
                    temperature: 0.1,
                    maxOutputTokens: 4096,
                });
                const cleanedRepaired = cleanJsonResponse(repaired);
                const json = JSON.parse(cleanedRepaired);
                if (!Array.isArray(json)) {
                    throw new Error('Onarım sonrası çıktı JSON array değil.');
                }
                parsed = json;
            }
            catch (repairErr) {
                // eslint-disable-next-line no-console
                console.error('[AI][parse-pdf] JSON repair failed:', repairErr);
                return res.status(500).json({
                    success: false,
                    error: 'Yapay zekadan gelen yanıt geçerli formata dönüştürülemedi. Lütfen daha sade bir PDF sayfası deneyin veya daha küçük parçalar halinde yükleyin.',
                });
            }
        }
        return res.json({
            success: true,
            data: parsed,
        });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AI][parse-pdf] Unexpected error:', error);
        return res.status(500).json({
            success: false,
            error: 'PDF analiz edilirken beklenmeyen bir hata oluştu.',
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
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Soru Bankası API Routes
 * CRUD işlemleri, arama, filtreleme ve AI soru üretimi
 */
const express_1 = __importDefault(require("express"));
const db_1 = require("./db");
const auth_1 = require("./auth");
const ai_1 = require("./ai");
// Cast prisma to any to avoid "questionBank does not exist" type errors
// This is a workaround for stale IDE cache issues; model exists at runtime
const prisma = db_1.prisma;
const router = express_1.default.Router();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Bloom level Türkçe eşleştirmesi
 */
const bloomLevelLabels = {
    hatirlama: 'Hatırlama',
    anlama: 'Anlama',
    uygulama: 'Uygulama',
    analiz: 'Analiz',
    degerlendirme: 'Değerlendirme',
    yaratma: 'Yaratma',
};
/**
 * AI tarafından üretilen soruları parse et
 */
function parseAIGeneratedQuestions(text) {
    var _a;
    const questions = [];
    // JSON formatı bekleniyor
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        // Eğer tek bir soru ise array'e çevir
        if (parsed.text) {
            return [parsed];
        }
    }
    catch {
        // JSON parse başarısız olursa, metin formatını dene
    }
    // Basit metin parser - "Soru X:" formatı
    const questionBlocks = text.split(/Soru\s*\d+[:.]/i).filter(Boolean);
    for (const block of questionBlocks) {
        const lines = block.trim().split('\n').filter(Boolean);
        if (lines.length === 0)
            continue;
        const question = {
            text: '',
            choices: [],
            type: 'multiple_choice',
        };
        let currentSection = 'text';
        for (const line of lines) {
            const trimmed = line.trim();
            // Şık tespiti (A), B), A., B. vb.)
            const choiceMatch = trimmed.match(/^([A-E])[).]\s*(.+)/i);
            if (choiceMatch) {
                question.choices = question.choices || [];
                question.choices.push(choiceMatch[2]);
                continue;
            }
            // Doğru cevap
            if (trimmed.toLowerCase().startsWith('doğru cevap:') || trimmed.toLowerCase().startsWith('cevap:')) {
                question.correctAnswer = (_a = trimmed.split(':')[1]) === null || _a === void 0 ? void 0 : _a.trim();
                continue;
            }
            // Çözüm
            if (trimmed.toLowerCase().startsWith('çözüm:') || trimmed.toLowerCase().startsWith('açıklama:')) {
                currentSection = 'solution';
                question.solutionExplanation = trimmed.split(':').slice(1).join(':').trim();
                continue;
            }
            // Soru metni
            if (currentSection === 'text') {
                question.text += (question.text ? ' ' : '') + trimmed;
            }
            else if (currentSection === 'solution') {
                question.solutionExplanation += ' ' + trimmed;
            }
        }
        if (question.text) {
            questions.push(question);
        }
    }
    return questions;
}
// ============================================================================
// ROUTES
// ============================================================================
/**
 * GET /questionbank - Soru listesi (filtreli, sayfalı)
 */
router.get('/', (0, auth_1.authenticateMultiple)(['teacher', 'admin']), async (req, res) => {
    const { subjectId, gradeLevel, topic, difficulty, bloomLevel, type, isApproved, source, search, page = 1, limit = 20, } = req.query;
    const where = {};
    if (subjectId)
        where.subjectId = subjectId;
    if (gradeLevel)
        where.gradeLevel = gradeLevel;
    if (topic)
        where.topic = { contains: topic, mode: 'insensitive' };
    if (difficulty)
        where.difficulty = difficulty;
    if (bloomLevel)
        where.bloomLevel = bloomLevel;
    if (type)
        where.type = type;
    if (typeof isApproved === 'boolean')
        where.isApproved = isApproved;
    if (source)
        where.source = source;
    if (search) {
        where.OR = [
            { text: { contains: search, mode: 'insensitive' } },
            { topic: { contains: search, mode: 'insensitive' } },
            { tags: { hasSome: [search] } },
        ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const [questions, total] = await Promise.all([
        prisma.questionBank.findMany({
            where,
            include: { subject: true },
            orderBy: { createdAt: 'desc' },
            skip,
            take,
        }),
        prisma.questionBank.count({ where }),
    ]);
    return res.json({
        questions,
        pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
        },
    });
});
/**
 * POST /questionbank/generate - AI ile soru üret
 */
router.post('/generate', (0, auth_1.authenticateMultiple)(['teacher', 'admin']), async (req, res) => {
    var _a;
    const authReq = req;
    const teacherId = authReq.user.id;
    const data = req.body;
    // Validasyon
    if (!data.subjectId || !data.gradeLevel || !data.topic || !data.count) {
        return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
    }
    if (data.count > 10) {
        return res.status(400).json({ error: 'Tek seferde en fazla 10 soru üretilebilir' });
    }
    // Ders bilgisini al
    const subject = await prisma.subject.findUnique({ where: { id: data.subjectId } });
    if (!subject) {
        return res.status(400).json({ error: 'Geçersiz ders ID' });
    }
    // Referans soruları al (Few-shot learning için)
    let referenceQuestions = [];
    if ((_a = data.referenceQuestionIds) === null || _a === void 0 ? void 0 : _a.length) {
        const refs = await prisma.questionBank.findMany({
            where: { id: { in: data.referenceQuestionIds } },
            select: { text: true, choices: true, correctAnswer: true },
        });
        referenceQuestions = refs.map((q) => {
            const choices = Array.isArray(q.choices) ? q.choices.map((c, i) => `${String.fromCharCode(65 + i)}) ${c}`).join('\n') : '';
            return `Soru: ${q.text}\n${choices}\nDoğru Cevap: ${q.correctAnswer}`;
        });
    }
    else {
        // Aynı konudan en kaliteli 3 soruyu referans al
        const autoRefs = await prisma.questionBank.findMany({
            where: {
                subjectId: data.subjectId,
                gradeLevel: data.gradeLevel,
                topic: { contains: data.topic, mode: 'insensitive' },
                isApproved: true,
            },
            orderBy: { usageCount: 'desc' },
            take: 3,
            select: { text: true, choices: true, correctAnswer: true },
        });
        referenceQuestions = autoRefs.map((q) => {
            const choices = Array.isArray(q.choices) ? q.choices.map((c, i) => `${String.fromCharCode(65 + i)}) ${c}`).join('\n') : '';
            return `Soru: ${q.text}\n${choices}\nDoğru Cevap: ${q.correctAnswer}`;
        });
    }
    // Bloom seviyesi Türkçe karşılığı
    const bloomLabel = data.bloomLevel ? bloomLevelLabels[data.bloomLevel] : 'Uygulama';
    // Zorluk Türkçe
    const difficultyLabel = data.difficulty === 'easy' ? 'Kolay' : data.difficulty === 'medium' ? 'Orta' : 'Zor';
    // Soru tipi Türkçe
    const typeLabel = data.questionType === 'multiple_choice' ? 'çoktan seçmeli' : data.questionType === 'true_false' ? 'doğru/yanlış' : 'açık uçlu';
    // AI prompt – görselli sorular dahil, bazı sorular görsel içermeli
    const visualQuestionCount = Math.max(1, Math.floor(data.count * 0.3)); // %30'u görselli olsun, en az 1
    const prompt = `Sen bir Türk eğitim uzmanı ve soru yazarısın. İstediğim tam ${data.count} adet ${typeLabel} soru üret.

Parametreler: Ders=${subject.name}, Sınıf=${data.gradeLevel}, Konu=${data.topic}, Zorluk=${difficultyLabel}, Bloom=${bloomLabel}.

Kurallar:
- Sorular MEB müfredatına uygun, sade dil, ${data.gradeLevel}. sınıf seviyesinde olsun.
- ${data.questionType === 'multiple_choice' ? 'Her soruda tam 5 şık: A, B, C, D, E. choices dizisinde sadece şık metinleri (A) B) ön eki olmadan) ver.' : ''}
- Çeldiriciler yaygın öğrenci hatalarına dayansın; distractorReasons ile kısa gerekçe ver.
- solutionExplanation tek paragraf, okunaklı ve net olsun; gereksiz tekrar veya dev cümleler yazma.

ÖNEMLİ - Görselli Sorular:
- Toplam ${data.count} sorudan en az ${visualQuestionCount} tanesi görsel gerektiren soru olsun (grafik, şekil, tablo, diyagram).
- Görsel gerektiren sorularda "imageDescription" alanına görselin ne göstermesi gerektiğini kısa metinle yaz (örn: "x² parabolünün tepe noktası (2,4) olan grafiği", "3x4'lük veri tablosu: satırlar A,B,C; sütunlar 1,2,3,4").
- Görsel gerektirmeyen sorularda "imageDescription": null yaz.
- "image" veya görsel URL alanı EKLEME – yapay zeka görsel oluşturamaz, sadece imageDescription yaz.

Yanıtın SADECE aşağıdaki JSON dizisi olsun, başında/sonunda açıklama veya markdown kodu olmasın:
[
  {"text":"Görselli soru metni (örn: Grafikte verilen fonksiyonun...)","imageDescription":"Parabol grafiği, tepe (2,4)","choices":["şık1","şık2","şık3","şık4","şık5"],"correctAnswer":"A","distractorReasons":["B neden yanlış","C neden yanlış","D neden yanlış","E neden yanlış"],"solutionExplanation":"Kısa çözüm paragrafı."},
  {"text":"Normal soru metni","imageDescription":null,"choices":["şık1","şık2","şık3","şık4","şık5"],"correctAnswer":"B","distractorReasons":["A neden yanlış","C neden yanlış","D neden yanlış","E neden yanlış"],"solutionExplanation":"Kısa çözüm paragrafı."}
]
${referenceQuestions.length > 0 ? `\nÖrnek stil:\n${referenceQuestions.slice(0, 1).join('\n')}` : ''}`;
    try {
        const response = await (0, ai_1.callGemini)(prompt, {
            temperature: 0.7,
            maxOutputTokens: 4096,
        });
        // JSON parse için temizlik
        let cleanedResponse = response.trim();
        // Markdown code block varsa temizle
        if (cleanedResponse.startsWith('```json')) {
            cleanedResponse = cleanedResponse.slice(7);
        }
        if (cleanedResponse.startsWith('```')) {
            cleanedResponse = cleanedResponse.slice(3);
        }
        if (cleanedResponse.endsWith('```')) {
            cleanedResponse = cleanedResponse.slice(0, -3);
        }
        cleanedResponse = cleanedResponse.trim();
        console.log('[QUESTIONBANK] AI raw response length:', cleanedResponse.length);
        console.log('[QUESTIONBANK] AI response preview:', cleanedResponse.substring(0, 200));
        let generatedQuestions;
        try {
            generatedQuestions = parseAIGeneratedQuestions(cleanedResponse);
        }
        catch (parseError) {
            console.error('[QUESTIONBANK] Parse error:', parseError);
            return res.status(500).json({
                error: 'AI yanıtı parse edilemedi',
                details: process.env.NODE_ENV === 'development' ? parseError.message : undefined,
                rawResponse: cleanedResponse.substring(0, 1000)
            });
        }
        if (!generatedQuestions || generatedQuestions.length === 0) {
            console.error('[QUESTIONBANK] No questions generated, raw response:', cleanedResponse.substring(0, 500));
            return res.status(500).json({
                error: 'AI soru üretemedi',
                rawResponse: cleanedResponse.substring(0, 1000)
            });
        }
        // Debug: AI'dan gelen image alanlarını logla
        console.log('[QUESTIONBANK] Generated questions count:', generatedQuestions.length);
        console.log('[QUESTIONBANK] Generated questions with image fields:', generatedQuestions.map((q, idx) => ({
            index: idx + 1,
            hasImage: !!q.image,
            image: q.image,
            textPreview: (q.text || '').substring(0, 50) + '...'
        })));
        // Üretilen soruları veritabanına kaydet (onaysız olarak)
        const savedQuestions = await Promise.all(generatedQuestions.map(async (q, idx) => {
            const imageDesc = q.imageDescription;
            const questionText = imageDesc && String(imageDesc).trim()
                ? `${(q.text || '').trim()}\n\n[Görsel tasviri: ${String(imageDesc).trim()}]`
                : (q.text || '');
            const baseData = {
                subjectId: data.subjectId,
                gradeLevel: data.gradeLevel,
                topic: data.topic,
                text: questionText,
                type: data.questionType,
                choices: q.choices || null,
                correctAnswer: q.correctAnswer || '',
                distractorReasons: q.distractorReasons || null,
                solutionExplanation: q.solutionExplanation || null,
                difficulty: data.difficulty,
                bloomLevel: data.bloomLevel || null,
                source: 'ai',
                createdByTeacherId: teacherId,
                isApproved: false,
                tags: [],
            };
            // imageUrl schema'dan kaldırıldı (migration uygulanmamış DB'ler için); sorular imageUrl olmadan kaydedilir
            return await prisma.questionBank.create({
                data: baseData,
                include: { subject: true },
            });
        }));
        return res.json({
            success: true,
            message: `${savedQuestions.length} soru üretildi`,
            questions: savedQuestions,
        });
    }
    catch (error) {
        console.error('[QUESTIONBANK] AI generation error:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        console.error('[QUESTIONBANK] Error details:', {
            name: errorName,
            message: errorMessage,
            stack: errorStack,
            body: req.body
        });
        return res.status(500).json({
            error: 'Soru üretiminde hata oluştu',
            details: process.env.NODE_ENV === 'development' ? `${errorName}: ${errorMessage}` : undefined
        });
    }
});
/**
 * GET /questionbank/subjects/list - Ders listesi
 */
router.get('/subjects/list', 
// Hem öğretmen hem de admin paneli bu listeyi kullanabildiği için rol kısıtı koymuyoruz
(0, auth_1.authenticate)(), async (_req, res) => {
    const subjects = await prisma.subject.findMany({
        orderBy: { name: 'asc' },
    });
    return res.json(subjects);
});
/**
 * GET /questionbank/stats - Soru bankası istatistikleri
 */
router.get('/stats', (0, auth_1.authenticateMultiple)(['teacher', 'admin']), async (_req, res) => {
    const [totalQuestions, approvedQuestions, pendingQuestions, aiGenerated, teacherCreated, bySubject, byGrade, byDifficulty,] = await Promise.all([
        prisma.questionBank.count(),
        prisma.questionBank.count({ where: { isApproved: true } }),
        prisma.questionBank.count({ where: { isApproved: false } }),
        prisma.questionBank.count({ where: { source: 'ai' } }),
        prisma.questionBank.count({ where: { source: 'teacher' } }),
        prisma.questionBank.groupBy({
            by: ['subjectId'],
            _count: { id: true },
        }),
        prisma.questionBank.groupBy({
            by: ['gradeLevel'],
            _count: { id: true },
        }),
        prisma.questionBank.groupBy({
            by: ['difficulty'],
            _count: { id: true },
        }),
    ]);
    // Ders isimlerini al
    const subjectIds = bySubject.map((s) => s.subjectId);
    const subjects = await prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, name: true },
    });
    const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s.name]));
    return res.json({
        total: totalQuestions,
        approved: approvedQuestions,
        pending: pendingQuestions,
        bySource: {
            ai: aiGenerated,
            teacher: teacherCreated,
        },
        bySubject: bySubject.map((s) => ({
            subjectId: s.subjectId,
            subjectName: subjectMap[s.subjectId] || 'Bilinmeyen',
            count: s._count.id,
        })),
        byGrade: byGrade.map((g) => ({
            gradeLevel: g.gradeLevel,
            count: g._count.id,
        })),
        byDifficulty: byDifficulty.map((d) => ({
            difficulty: d.difficulty,
            count: d._count.id,
        })),
    });
});
/**
 * GET /curriculum/subjects - Sınıfa göre dersler
 */
router.get('/curriculum/subjects', (0, auth_1.authenticateMultiple)(['teacher', 'admin']), async (req, res) => {
    const { gradeLevel } = req.query;
    if (!gradeLevel) {
        return res.status(400).json({ error: 'gradeLevel parametresi zorunludur' });
    }
    // Belirtilen sınıf seviyesindeki tüm dersleri getir
    const subjects = await prisma.curriculumTopic.findMany({
        where: { gradeLevel: String(gradeLevel) },
        select: {
            subject: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
        distinct: ['subjectId'],
    });
    // Benzersiz dersleri döndür
    const uniqueSubjects = subjects
        .map((item) => item.subject)
        .filter((subject, index, self) => index === self.findIndex((s) => s.id === subject.id));
    return res.json(uniqueSubjects);
});
/**
 * GET /curriculum/topics - Müfredat konuları
 */
router.get('/curriculum/topics', (0, auth_1.authenticateMultiple)(['teacher', 'admin']), async (req, res) => {
    const { subjectId, gradeLevel } = req.query;
    const where = {};
    if (subjectId)
        where.subjectId = subjectId;
    if (gradeLevel)
        where.gradeLevel = gradeLevel;
    const topics = await prisma.curriculumTopic.findMany({
        where,
        include: { subject: true },
        orderBy: [{ gradeLevel: 'asc' }, { unitNumber: 'asc' }, { orderIndex: 'asc' }],
    });
    return res.json(topics);
});
/**
 * GET /questionbank/:id - Tek soru detayı
 */
router.get('/:id', (0, auth_1.authenticateMultiple)(['teacher', 'admin']), async (req, res) => {
    const { id } = req.params;
    const question = await prisma.questionBank.findUnique({
        where: { id },
        include: { subject: true },
    });
    if (!question) {
        return res.status(404).json({ error: 'Soru bulunamadı' });
    }
    return res.json(question);
});
/**
 * POST /questionbank - Yeni soru oluştur
 */
router.post('/', (0, auth_1.authenticateMultiple)(['teacher', 'admin']), async (req, res) => {
    const authReq = req;
    const teacherId = authReq.user.id;
    const data = req.body;
    // Validasyon
    if (!data.subjectId || !data.gradeLevel || !data.topic || !data.text || !data.correctAnswer) {
        return res.status(400).json({ error: 'Zorunlu alanlar eksik' });
    }
    // Ders kontrolü
    const subject = await prisma.subject.findUnique({ where: { id: data.subjectId } });
    if (!subject) {
        return res.status(400).json({ error: 'Geçersiz ders ID' });
    }
    const question = await prisma.questionBank.create({
        data: {
            subjectId: data.subjectId,
            gradeLevel: data.gradeLevel,
            topic: data.topic,
            subtopic: data.subtopic,
            kazanimKodu: data.kazanimKodu,
            text: data.text,
            type: data.type,
            ...(data.choices && { choices: data.choices }),
            correctAnswer: data.correctAnswer,
            ...(data.distractorReasons && { distractorReasons: data.distractorReasons }),
            solutionExplanation: data.solutionExplanation,
            difficulty: data.difficulty,
            bloomLevel: data.bloomLevel,
            estimatedMinutes: data.estimatedMinutes,
            tags: data.tags || [],
            source: 'teacher',
            createdByTeacherId: teacherId,
            isApproved: true, // Öğretmen tarafından eklenen sorular otomatik onaylı
            approvedByTeacherId: teacherId,
        },
        include: { subject: true },
    });
    return res.status(201).json(question);
});
/**
 * PUT /questionbank/:id - Soru güncelle
 */
router.put('/:id', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    const existing = await prisma.questionBank.findUnique({ where: { id } });
    if (!existing) {
        return res.status(404).json({ error: 'Soru bulunamadı' });
    }
    const question = await prisma.questionBank.update({
        where: { id },
        data: {
            ...(data.subjectId && { subjectId: data.subjectId }),
            ...(data.gradeLevel && { gradeLevel: data.gradeLevel }),
            ...(data.topic && { topic: data.topic }),
            ...(data.subtopic !== undefined && { subtopic: data.subtopic }),
            ...(data.kazanimKodu !== undefined && { kazanimKodu: data.kazanimKodu }),
            ...(data.text && { text: data.text }),
            ...(data.type && { type: data.type }),
            ...(data.choices !== undefined && { choices: data.choices }),
            ...(data.correctAnswer && { correctAnswer: data.correctAnswer }),
            ...(data.distractorReasons !== undefined && { distractorReasons: data.distractorReasons }),
            ...(data.solutionExplanation !== undefined && { solutionExplanation: data.solutionExplanation }),
            ...(data.difficulty && { difficulty: data.difficulty }),
            ...(data.bloomLevel !== undefined && { bloomLevel: data.bloomLevel }),
            ...(data.estimatedMinutes !== undefined && { estimatedMinutes: data.estimatedMinutes }),
            ...(data.tags !== undefined && { tags: data.tags }),
        },
        include: { subject: true },
    });
    return res.json(question);
});
/**
 * DELETE /questionbank/:id - Soru sil
 */
router.delete('/:id', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.questionBank.findUnique({ where: { id } });
    if (!existing) {
        return res.status(404).json({ error: 'Soru bulunamadı' });
    }
    await prisma.questionBank.delete({ where: { id } });
    return res.json({ success: true, message: 'Soru silindi' });
});
/**
 * POST /questionbank/:id/approve - Soruyu onayla
 */
router.post('/:id/approve', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const authReq = req;
    const { id } = req.params;
    const teacherId = authReq.user.id;
    const existing = await prisma.questionBank.findUnique({ where: { id } });
    if (!existing) {
        return res.status(404).json({ error: 'Soru bulunamadı' });
    }
    const question = await prisma.questionBank.update({
        where: { id },
        data: {
            isApproved: true,
            approvedByTeacherId: teacherId,
        },
        include: { subject: true },
    });
    return res.json(question);
});
/**
 * POST /questionbank/bulk-approve - Tüm onaylanmamış soruları toplu onayla
 */
router.post('/bulk-approve', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const authReq = req;
    const teacherId = authReq.user.id;
    const { source, subjectId, gradeLevel } = req.body;
    const where = {
        isApproved: false,
    };
    if (source)
        where.source = source;
    if (subjectId)
        where.subjectId = subjectId;
    if (gradeLevel)
        where.gradeLevel = gradeLevel;
    const result = await prisma.questionBank.updateMany({
        where,
        data: {
            isApproved: true,
            approvedByTeacherId: teacherId,
        },
    });
    return res.json({
        success: true,
        message: `${result.count} soru onaylandı`,
        count: result.count,
    });
});
exports.default = router;
//# sourceMappingURL=routes.questionbank.js.map
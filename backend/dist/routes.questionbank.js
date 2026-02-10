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
router.get('/', (0, auth_1.authenticate)('teacher'), async (req, res) => {
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
router.post('/generate', (0, auth_1.authenticate)('teacher'), async (req, res) => {
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
    // AI prompt
    const prompt = `Sen bir Türk eğitim uzmanı ve soru yazarısın. Aşağıdaki parametrelere göre ${data.count} adet ${typeLabel} soru üret.

## Parametreler
- Ders: ${subject.name}
- Sınıf: ${data.gradeLevel}. sınıf
- Konu: ${data.topic}
- Zorluk: ${difficultyLabel}
- Bilişsel Seviye (Bloom): ${bloomLabel}

## Kurallar
1. Sorular Türk Milli Eğitim müfredatına uygun olmalı
2. Dil sade, anlaşılır ve ${data.gradeLevel}. sınıf seviyesine uygun olmalı
3. ${data.questionType === 'multiple_choice' ? 'Her soruda 5 şık (A, B, C, D, E) olmalı' : ''}
4. Çeldiriciler rastgele değil, öğrencilerin yapabileceği yaygın hatalar göz önünde bulundurularak yazılmalı
5. Her çeldiricinin neden yanlış olduğunu kısaca açıkla
6. Yanıtı JSON formatında ver

${referenceQuestions.length > 0 ? `## Örnek Sorular (Bu stilden ilham al)
${referenceQuestions.join('\n\n---\n\n')}` : ''}

## Çıktı Formatı (JSON)
Yanıtını sadece JSON olarak ver, başka açıklama ekleme:
[
  {
    "text": "Soru metni",
    "choices": ["A şıkkı", "B şıkkı", "C şıkkı", "D şıkkı", "E şıkkı"],
    "correctAnswer": "A",
    "distractorReasons": ["B yanlış çünkü...", "C yanlış çünkü...", "D yanlış çünkü...", "E yanlış çünkü..."],
    "solutionExplanation": "Detaylı çözüm açıklaması"
  }
]`;
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
        const generatedQuestions = parseAIGeneratedQuestions(cleanedResponse);
        if (generatedQuestions.length === 0) {
            return res.status(500).json({
                error: 'AI soru üretemedi',
                rawResponse: response.substring(0, 500)
            });
        }
        // Üretilen soruları veritabanına kaydet (onaysız olarak)
        const savedQuestions = await Promise.all(generatedQuestions.map((q) => prisma.questionBank.create({
            data: {
                subjectId: data.subjectId,
                gradeLevel: data.gradeLevel,
                topic: data.topic,
                text: q.text || '',
                type: data.questionType,
                choices: q.choices || null,
                correctAnswer: q.correctAnswer || '',
                distractorReasons: q.distractorReasons || null,
                solutionExplanation: q.solutionExplanation || null,
                difficulty: data.difficulty,
                bloomLevel: data.bloomLevel || null,
                source: 'ai',
                createdByTeacherId: teacherId,
                isApproved: false, // AI soruları onay bekler
                tags: [],
            },
            include: { subject: true },
        })));
        return res.json({
            success: true,
            message: `${savedQuestions.length} soru üretildi`,
            questions: savedQuestions,
        });
    }
    catch (error) {
        console.error('[QUESTIONBANK] AI generation error:', error);
        return res.status(500).json({ error: 'Soru üretiminde hata oluştu' });
    }
});
/**
 * GET /questionbank/subjects/list - Ders listesi
 */
router.get('/subjects/list', (0, auth_1.authenticate)('teacher'), async (_req, res) => {
    const subjects = await prisma.subject.findMany({
        orderBy: { name: 'asc' },
    });
    return res.json(subjects);
});
/**
 * GET /questionbank/stats - Soru bankası istatistikleri
 */
router.get('/stats', (0, auth_1.authenticate)('teacher'), async (_req, res) => {
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
router.get('/curriculum/subjects', (0, auth_1.authenticate)('teacher'), async (req, res) => {
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
router.get('/curriculum/topics', (0, auth_1.authenticate)('teacher'), async (req, res) => {
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
router.get('/:id', (0, auth_1.authenticate)('teacher'), async (req, res) => {
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
router.post('/', (0, auth_1.authenticate)('teacher'), async (req, res) => {
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
exports.default = router;
//# sourceMappingURL=routes.questionbank.js.map
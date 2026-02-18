/**
 * Soru Bankası API Routes
 * CRUD işlemleri, arama, filtreleme ve AI soru üretimi
 */
import express, { Request, Response, RequestHandler } from 'express';
import { prisma as prismaClient } from './db';
import { authenticate, authenticateMultiple, AuthenticatedRequest } from './auth';
import { callGemini } from './ai';

// Cast prisma to any to avoid "questionBank does not exist" type errors
// This is a workaround for stale IDE cache issues; model exists at runtime
const prisma = prismaClient as any;


// Types from Prisma - manually defined to avoid import issues
type BloomLevel = 'hatirlama' | 'anlama' | 'uygulama' | 'analiz' | 'degerlendirme' | 'yaratma';
type QuestionSource = 'teacher' | 'ai' | 'import';
type QuestionType = 'multiple_choice' | 'true_false' | 'open_ended';

const router = express.Router();

// ============================================================================
// TYPES
// ============================================================================

interface QuestionBankCreateInput {
    subjectId: string;
    gradeLevel: string;
    topic: string;
    subtopic?: string;
    kazanimKodu?: string;
    text: string;
    imageUrl?: string;
    type: 'multiple_choice' | 'true_false' | 'open_ended';
    choices?: string[];
    correctAnswer: string;
    distractorReasons?: string[];
    solutionExplanation?: string;
    difficulty: 'easy' | 'medium' | 'hard';
    bloomLevel?: BloomLevel;
    estimatedMinutes?: number;
    tags?: string[];
}

interface QuestionBankSearchParams {
    subjectId?: string;
    gradeLevel?: string;
    topic?: string;
    difficulty?: string;
    bloomLevel?: string;
    type?: string;
    isApproved?: boolean;
    source?: string;
    search?: string;
    page?: number;
    limit?: number;
}

interface AIGenerateRequest {
    subjectId: string;
    gradeLevel: string;
    topic: string;
    difficulty: 'easy' | 'medium' | 'hard';
    bloomLevel?: BloomLevel;
    questionType: 'multiple_choice' | 'true_false' | 'open_ended';
    count: number;
    referenceQuestionIds?: string[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Bloom level Türkçe eşleştirmesi
 */
const bloomLevelLabels: Record<BloomLevel, string> = {
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
function parseAIGeneratedQuestions(text: string): Partial<QuestionBankCreateInput>[] {
    const questions: Partial<QuestionBankCreateInput>[] = [];

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
    } catch {
        // JSON parse başarısız olursa, metin formatını dene
    }

    // Basit metin parser - "Soru X:" formatı
    const questionBlocks = text.split(/Soru\s*\d+[:.]/i).filter(Boolean);

    for (const block of questionBlocks) {
        const lines = block.trim().split('\n').filter(Boolean);
        if (lines.length === 0) continue;

        const question: Partial<QuestionBankCreateInput> = {
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
                question.choices.push(choiceMatch[2] as string);
                continue;
            }

            // Doğru cevap
            if (trimmed.toLowerCase().startsWith('doğru cevap:') || trimmed.toLowerCase().startsWith('cevap:')) {
                question.correctAnswer = trimmed.split(':')[1]?.trim();
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
            } else if (currentSection === 'solution') {
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
router.get(
    '/',
    authenticateMultiple(['teacher', 'admin']) as unknown as RequestHandler,

    async (req: Request, res: Response) => {
        const authReq = req as AuthenticatedRequest;
        const institutionName: string | undefined = (authReq.user as any)?.institutionName;
        const {
            subjectId,
            gradeLevel,
            topic,
            difficulty,
            bloomLevel,
            type,
            isApproved,
            source,
            search,
            page = 1,
            limit = 20,
        } = req.query as unknown as QuestionBankSearchParams;

        const where: any = {};

        if (subjectId) where.subjectId = subjectId;
        if (gradeLevel) where.gradeLevel = gradeLevel;
        if (topic) where.topic = { contains: topic, mode: 'insensitive' };
        if (difficulty) where.difficulty = difficulty;
        if (bloomLevel) where.bloomLevel = bloomLevel as BloomLevel;
        if (type) where.type = type as QuestionType;
        if (typeof isApproved === 'boolean') where.isApproved = isApproved;
        if (source) where.source = source as QuestionSource;
        if (search) {
            where.OR = [
                { text: { contains: search, mode: 'insensitive' } },
                { topic: { contains: search, mode: 'insensitive' } },
                { tags: { hasSome: [search] } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);

        // Kurum filtresi: kurum adı varsa sadece o kuruma veya kurumsuz (global) sorular
        if (institutionName) {
            where.OR = where.OR ?? [];
            where.OR.push(
                { institutionName },
                { institutionName: null },
            );
        }

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
    },
);

/**
 * POST /questionbank/generate - AI ile soru üret
 */
router.post(
    '/generate',
    authenticateMultiple(['teacher', 'admin']) as unknown as RequestHandler,
    async (req: Request, res: Response) => {
        const authReq = req as AuthenticatedRequest;
        const teacherId = authReq.user!.id;
        const institutionName: string | undefined = (authReq.user as any)?.institutionName;
        const data = req.body as AIGenerateRequest;

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
        let referenceQuestions: string[] = [];
        if (data.referenceQuestionIds?.length) {
            const refs = await prisma.questionBank.findMany({
                where: { id: { in: data.referenceQuestionIds } },
                select: { text: true, choices: true, correctAnswer: true },
            });
            referenceQuestions = refs.map((q: { text: string; choices: unknown; correctAnswer: string }) => {
                const choices = Array.isArray(q.choices) ? (q.choices as string[]).map((c, i) => `${String.fromCharCode(65 + i)}) ${c}`).join('\n') : '';
                return `Soru: ${q.text}\n${choices}\nDoğru Cevap: ${q.correctAnswer}`;
            });
        } else {
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
            referenceQuestions = autoRefs.map((q: { text: string; choices: unknown; correctAnswer: string }) => {
                const choices = Array.isArray(q.choices) ? (q.choices as string[]).map((c, i) => `${String.fromCharCode(65 + i)}) ${c}`).join('\n') : '';
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

        let typeSpecificRules = '';
        let jsonExample = '';

        if (data.questionType === 'multiple_choice') {
            typeSpecificRules = `
- Her soruda TAM 5 ŞIK olmalı: A, B, C, D, E.
- "choices" dizisinde sadece şık metinleri strings olarak yer almalı (A) B) gibi ön ekler KOYMA).
- "correctAnswer" alanı "A", "B", "C", "D" veya "E" olmalı.
- "distractorReasons" dizisinde her yanlış şık için kısa bir açıklama olmalı.`;
            jsonExample = `
  {
    "text": "Soru metni...",
    "imageDescription": null,
    "choices": ["Şık 1", "Şık 2", "Şık 3", "Şık 4", "Şık 5"],
    "correctAnswer": "A",
    "distractorReasons": ["B yanlış çünkü...", "C yanlış çünkü...", "D yanlış çünkü...", "E yanlış çünkü..."],
    "solutionExplanation": "Çözüm açıklaması..."
  }`;
        } else if (data.questionType === 'true_false') {
            typeSpecificRules = `
- "choices" dizisi tam olarak ["Doğru", "Yanlış"] olmalı.
- "correctAnswer" alanı "Doğru" veya "Yanlış" olmalı.
- "distractorReasons" boş dizi [] olabilir.`;
            jsonExample = `
  {
    "text": "Soru metni...",
    "imageDescription": null,
    "choices": ["Doğru", "Yanlış"],
    "correctAnswer": "Doğru",
    "distractorReasons": [],
    "solutionExplanation": "Neden doğru olduğuna dair açıklama..."
  }`;
        } else if (data.questionType === 'open_ended') {
            typeSpecificRules = `
- Açık uçlu sorudur, ŞIK YOKTUR.
- "choices" alanı boş dizi [] olmalı.
- "correctAnswer" alanına örnek/beklenen cevabı yaz.
- "distractorReasons" alanı boş dizi [] olmalı.`;
            jsonExample = `
  {
    "text": "Soru metni...",
    "imageDescription": null,
    "choices": [],
    "correctAnswer": "Beklenen cevap metni...",
    "distractorReasons": [],
    "solutionExplanation": "Çözüm açıklaması..."
  }`;
        }

        const prompt = `Sen bir Türk eğitim uzmanı ve soru yazarısın. İstediğim tam ${data.count} adet ${typeLabel} soru üret.

Parametreler: Ders=${subject.name}, Sınıf=${data.gradeLevel}, Konu=${data.topic}, Zorluk=${difficultyLabel}, Bloom=${bloomLabel}.

Genel Kurallar:
- Sorular MEB müfredatına uygun, sade dil, ${data.gradeLevel}. sınıf seviyesinde olsun.
- solutionExplanation tek paragraf, okunaklı ve net olsun.

Soru Tipi Kuralları (${typeLabel}):
${typeSpecificRules}

Görselli Sorular:
- Toplam ${data.count} sorudan en az ${visualQuestionCount} tanesi görsel gerektiren soru olsun (grafik, şekil, tablo).
- Bu sorularda "imageDescription" alanına görseli tarif et (örn: "x² parabolü..."). Diğerlerinde null yap.
- ASLA "image" veya URL alanı ekleme.

ÇIKTI FORMATI:
- Yanıtın SADECE ve SADECE geçerli bir JSON array olmalı.
- Başında/sonunda hiçbir açıklama, "düşünüyorum...", "işte sorular...", markdown (\`\`\`json) vb. OLMAMALI.
- JSON formatı dışına çıkma.

Beklenen JSON Formatı:
[${jsonExample}, ...
]

${referenceQuestions.length > 0 ? `\nReferans Sorular:\n${referenceQuestions.slice(0, 1).join('\n')}` : ''}`;

        try {
            const response = await callGemini(prompt, {
                temperature: 0.7,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
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

            let generatedQuestions: Partial<QuestionBankCreateInput>[];
            try {
                generatedQuestions = parseAIGeneratedQuestions(cleanedResponse);
            } catch (parseError: any) {
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
            console.log('[QUESTIONBANK] Generated questions with image fields:', generatedQuestions.map((q: any, idx: number) => ({
                index: idx + 1,
                hasImage: !!(q as any).image,
                image: (q as any).image,
                textPreview: (q.text || '').substring(0, 50) + '...'
            })));

            // Üretilen soruları veritabanına kaydet (onaysız olarak)
            const savedQuestions = await Promise.all(
                generatedQuestions.map(async (q, idx) => {
                    const imageDesc = (q as any).imageDescription;
                    const questionText = imageDesc && String(imageDesc).trim()
                        ? `${(q.text || '').trim()}\n\n[Görsel tasviri: ${String(imageDesc).trim()}]`
                        : (q.text || '');
                    const baseData = {
                        subjectId: data.subjectId,
                        gradeLevel: data.gradeLevel,
                        topic: data.topic,
                        text: questionText,
                        type: data.questionType as QuestionType,
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
                        institutionName: institutionName ?? null,
                    };

                    // imageUrl schema'dan kaldırıldı (migration uygulanmamış DB'ler için); sorular imageUrl olmadan kaydedilir
                    return await prisma.questionBank.create({
                        data: baseData,
                        include: { subject: true },
                    });
                })
            );

            return res.json({
                success: true,
                message: `${savedQuestions.length} soru üretildi`,
                questions: savedQuestions,
            });
        } catch (error) {
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
    },
);

/**
 * GET /questionbank/subjects/list - Ders listesi
 */
router.get(
    '/subjects/list',
    // Hem öğretmen hem de admin paneli bu listeyi kullanabildiği için rol kısıtı koymuyoruz
    authenticate() as unknown as RequestHandler,
    async (_req: Request, res: Response) => {
        const subjects = await prisma.subject.findMany({
            orderBy: { name: 'asc' },
        });
        return res.json(subjects);
    },
);

/**
 * GET /questionbank/stats - Soru bankası istatistikleri
 */
router.get(
    '/stats',
    authenticateMultiple(['teacher', 'admin']) as unknown as RequestHandler,
    async (_req: Request, res: Response) => {
        const [
            totalQuestions,
            approvedQuestions,
            pendingQuestions,
            aiGenerated,
            teacherCreated,
            bySubject,
            byGrade,
            byDifficulty,
        ] = await Promise.all([
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
        const subjectIds = bySubject.map((s: { subjectId: string; _count: { id: number } }) => s.subjectId);
        const subjects = await prisma.subject.findMany({
            where: { id: { in: subjectIds } },
            select: { id: true, name: true },
        });
        const subjectMap = Object.fromEntries(subjects.map((s: { id: string; name: string }) => [s.id, s.name]));

        return res.json({
            total: totalQuestions,
            approved: approvedQuestions,
            pending: pendingQuestions,
            bySource: {
                ai: aiGenerated,
                teacher: teacherCreated,
            },
            bySubject: bySubject.map((s: { subjectId: string; _count: { id: number } }) => ({
                subjectId: s.subjectId,
                subjectName: subjectMap[s.subjectId] || 'Bilinmeyen',
                count: s._count.id,
            })),
            byGrade: byGrade.map((g: { gradeLevel: string; _count: { id: number } }) => ({
                gradeLevel: g.gradeLevel,
                count: g._count.id,
            })),
            byDifficulty: byDifficulty.map((d: { difficulty: string; _count: { id: number } }) => ({
                difficulty: d.difficulty,
                count: d._count.id,
            })),
        });
    },
);

/**
 * GET /curriculum/subjects - Sınıfa göre dersler
 */
router.get(
    '/curriculum/subjects',
    authenticateMultiple(['teacher', 'admin']) as unknown as RequestHandler,
    async (req: Request, res: Response) => {
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
            .map((item: any) => item.subject)
            .filter((subject: any, index: number, self: any[]) =>
                index === self.findIndex((s: any) => s.id === subject.id)
            );

        return res.json(uniqueSubjects);
    },
);

/**
 * GET /curriculum/topics - Müfredat konuları
 */
router.get(
    '/curriculum/topics',
    authenticateMultiple(['teacher', 'admin']) as unknown as RequestHandler,
    async (req: Request, res: Response) => {
        const { subjectId, gradeLevel } = req.query;

        const where: any = {};
        if (subjectId) where.subjectId = subjectId;
        if (gradeLevel) where.gradeLevel = gradeLevel;

        const topics = await prisma.curriculumTopic.findMany({
            where,
            include: { subject: true },
            orderBy: [{ gradeLevel: 'asc' }, { unitNumber: 'asc' }, { orderIndex: 'asc' }],
        });

        return res.json(topics);
    },
);



/**
 * GET /questionbank/:id - Tek soru detayı
 */
router.get(
    '/:id',
    authenticateMultiple(['teacher', 'admin']) as unknown as RequestHandler,
    async (req: Request, res: Response) => {
        const { id } = req.params;

        const question = await prisma.questionBank.findUnique({
            where: { id },
            include: { subject: true },
        });

        if (!question) {
            return res.status(404).json({ error: 'Soru bulunamadı' });
        }

        return res.json(question);
    },
);

/**
 * POST /questionbank - Yeni soru oluştur
 */
router.post(
    '/',
    authenticateMultiple(['teacher', 'admin']) as unknown as RequestHandler,
    async (req: Request, res: Response) => {
        const authReq = req as AuthenticatedRequest;
        const teacherId = authReq.user!.id;
        const institutionName: string | undefined = (authReq.user as any)?.institutionName;
        const data = req.body as QuestionBankCreateInput;

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
                imageUrl: data.imageUrl,
                type: data.type as QuestionType,
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
                institutionName: institutionName ?? null,
            },
            include: { subject: true },
        });


        return res.status(201).json(question);
    },
);

/**
 * PUT /questionbank/:id - Soru güncelle
 */
router.put(
    '/:id',
    authenticate('teacher') as unknown as RequestHandler,
    async (req: Request, res: Response) => {
        const { id } = req.params;
        const data = req.body as Partial<QuestionBankCreateInput>;

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
                ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
                ...(data.type && { type: data.type as QuestionType }),
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
    },
);

/**
 * DELETE /questionbank/:id - Soru sil
 */
router.delete(
    '/:id',
    authenticate('teacher') as unknown as RequestHandler,
    async (req: Request, res: Response) => {
        const { id } = req.params;

        const existing = await prisma.questionBank.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Soru bulunamadı' });
        }

        await prisma.questionBank.delete({ where: { id } });
        return res.json({ success: true, message: 'Soru silindi' });
    },
);

/**
 * POST /questionbank/:id/approve - Soruyu onayla
 */
router.post(
    '/:id/approve',
    authenticate('teacher') as unknown as RequestHandler,
    async (req: Request, res: Response) => {
        const authReq = req as AuthenticatedRequest;
        const { id } = req.params;
        const teacherId = authReq.user!.id;

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
    },
);

/**
 * POST /questionbank/bulk-approve - Tüm onaylanmamış soruları toplu onayla
 */
router.post(
    '/bulk-approve',
    authenticate('teacher') as unknown as RequestHandler,
    async (req: Request, res: Response) => {
        const authReq = req as AuthenticatedRequest;
        const teacherId = authReq.user!.id;
        const { source, subjectId, gradeLevel } = req.body as { source?: string; subjectId?: string; gradeLevel?: string };

        const where: any = {
            isApproved: false,
        };
        if (source) where.source = source;
        if (subjectId) where.subjectId = subjectId;
        if (gradeLevel) where.gradeLevel = gradeLevel;

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
    },
);

export default router;

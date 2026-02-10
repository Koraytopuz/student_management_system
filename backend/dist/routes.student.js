"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const auth_1 = require("./auth");
const db_1 = require("./db");
const badgeService_1 = require("./services/badgeService");
const notificationService_1 = require("./services/notificationService");
const livekit_1 = require("./livekit");
const ai_1 = require("./ai");
const router = express_1.default.Router();
// Basit metin PDF'i üretmek için yardımcı fonksiyon
async function generateFeedbackPdf(text) {
    const fontPath = path_1.default.join(__dirname, 'assets', 'fonts', 'arial.ttf');
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ margin: 50 });
        if (fs_1.default.existsSync(fontPath)) {
            doc.font(fontPath);
        }
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.fontSize(16).text('Detaylı Test Geri Bildirimi', { align: 'left' });
        doc.moveDown();
        doc.fontSize(12).text(text, {
            align: 'left',
            lineGap: 6,
        });
        doc.end();
    });
}
function shuffleArray(items) {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}
const USER_CONFIGURED_GEMINI_MODEL = (_a = process.env.GEMINI_MODEL) === null || _a === void 0 ? void 0 : _a.trim();
const DEFAULT_MODEL = 'gemini-3-flash-preview';
function resolveModelCandidates(_hasImage) {
    if (USER_CONFIGURED_GEMINI_MODEL) {
        return [USER_CONFIGURED_GEMINI_MODEL];
    }
    // Tek ve modern bir varsayılan model kullanıyoruz
    return [DEFAULT_MODEL];
}
const SYSTEM_PROMPT = 'Sen nazik ve net bir ogrenci asistanisin. Sorulara kisa, uygulanabilir ve adim adim yanit ver. ' +
    'Konu net degilse kisa bir netlestirme sorusu sor. Odevleri dogrudan cozmeyip yol goster. ' +
    'Cevaplarini Turkce ver.';
function extractBase64Payload(raw, fallbackMime) {
    var _a, _b, _c;
    if (!raw)
        return null;
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    const dataUrlMatch = trimmed.match(/^data:(.+);base64,(.+)$/);
    if (dataUrlMatch) {
        const mimeType = (_b = (_a = dataUrlMatch[1]) !== null && _a !== void 0 ? _a : fallbackMime) !== null && _b !== void 0 ? _b : 'image/png';
        const data = (_c = dataUrlMatch[2]) !== null && _c !== void 0 ? _c : '';
        if (!data)
            return null;
        return {
            mimeType,
            data,
        };
    }
    const sanitizedData = trimmed.replace(/\s+/g, '');
    if (!sanitizedData)
        return null;
    return {
        data: sanitizedData,
        mimeType: fallbackMime !== null && fallbackMime !== void 0 ? fallbackMime : 'image/png',
    };
}
function sanitizeMessages(messages) {
    return messages
        .filter((item) => {
        const hasText = item.content && item.content.trim().length > 0;
        const hasImage = item.imageBase64 && item.imageBase64.trim().length > 0;
        return hasText || hasImage;
    })
        .slice(-8)
        .map((item) => {
        var _a;
        return ({
            ...item,
            content: (_a = item.content) === null || _a === void 0 ? void 0 : _a.trim(),
        });
    });
}
function toGeminiParts(message) {
    const parts = [];
    if (message.content) {
        parts.push({ text: message.content });
    }
    const imagePayload = extractBase64Payload(message.imageBase64, message.imageMimeType);
    if (imagePayload) {
        parts.push({
            inlineData: {
                data: imagePayload.data,
                mimeType: imagePayload.mimeType,
            },
        });
    }
    if (parts.length === 0) {
        parts.push({ text: ' ' });
    }
    return parts;
}
function toGeminiContents(history, latest) {
    const combined = [...sanitizeMessages(history), latest];
    return combined.map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: toGeminiParts(item),
    }));
}
function extractResponseText(response) {
    var _a, _b;
    if (!response || typeof response !== 'object')
        return null;
    const maybeText = response.text;
    if (typeof maybeText === 'function') {
        try {
            const value = maybeText();
            if (typeof value === 'string' && value.trim()) {
                return value.trim();
            }
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
            if (joined.trim()) {
                return joined.trim();
            }
        }
    }
    return null;
}
function extractErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message;
    }
    try {
        return JSON.stringify(error);
    }
    catch {
        return 'Bilinmeyen hata';
    }
}
function isModelNotFoundError(error) {
    const message = extractErrorMessage(error).toLowerCase();
    return message.includes('not found') || message.includes('unknown model');
}
// Öğrenci dashboard özeti
router.get('/dashboard', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [pendingAssignmentsCount, studentResults, lastWatched] = await Promise.all([
        db_1.prisma.assignment.count({
            where: { students: { some: { studentId } } },
        }),
        db_1.prisma.testResult.findMany({
            where: { studentId, completedAt: { gte: last7Days } },
            include: { answers: true },
        }),
        db_1.prisma.watchRecord.findMany({
            where: { studentId },
            orderBy: { lastWatchedAt: 'desc' },
            take: 5,
            include: { content: { select: { title: true } } },
        }),
    ]);
    const testsSolvedThisWeek = studentResults.length;
    const totalQuestionsThisWeek = studentResults.reduce((sum, r) => sum + r.answers.length, 0);
    const averageScorePercent = studentResults.length === 0
        ? 0
        : Math.round(studentResults.reduce((sum, r) => sum + r.scorePercent, 0) /
            studentResults.length);
    const lastWatchedContents = lastWatched.map((w) => {
        var _a, _b;
        return ({
            contentId: w.contentId,
            title: (_b = (_a = w.content) === null || _a === void 0 ? void 0 : _a.title) !== null && _b !== void 0 ? _b : 'Bilinmeyen içerik',
            lastPositionSeconds: w.watchedSeconds,
        });
    });
    const summary = {
        pendingAssignmentsCount,
        testsSolvedThisWeek,
        totalQuestionsThisWeek,
        averageScorePercent,
        lastWatchedContents,
    };
    return res.json(summary);
});
// Öğrenci koçluk seansları (sadece kendi seanslarını görür, not içeriği gösterilmez)
router.get('/coaching', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const sessions = await db_1.prisma.$queryRaw `
      SELECT
        s.id,
        s.student_id,
        s.teacher_id,
        s.meeting_id,
        s.date,
        s.duration_minutes,
        s.title,
        s.mode,
        s.meeting_url,
        s."createdAt",
        s."updatedAt",
        u.name AS teacher_name
      FROM "coaching_sessions" s
      JOIN "users" u ON u.id = s.teacher_id
      WHERE s.student_id = ${studentId}
      ORDER BY s.date DESC
    `;
    return res.json(sessions.map((s) => {
        var _a, _b, _c;
        return ({
            id: s.id,
            teacherId: s.teacher_id,
            meetingId: (_a = s.meeting_id) !== null && _a !== void 0 ? _a : undefined,
            teacherName: s.teacher_name,
            date: s.date.toISOString(),
            durationMinutes: (_b = s.duration_minutes) !== null && _b !== void 0 ? _b : undefined,
            title: s.title,
            mode: s.mode,
            meetingUrl: (_c = s.meeting_url) !== null && _c !== void 0 ? _c : undefined,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
        });
    }));
});
router.post('/ai/chat', 
// authenticate('student'), // Chatbot temporarily disabled for students
async (req, res) => {
    return res.status(404).json({ error: 'Chatbot service not available for students' });
    /*
    const { message, history, imageBase64, imageMimeType } = req.body as {
      message?: string;
      history?: AiChatMessage[];
      imageBase64?: string;
      imageMimeType?: string;
    };

    // ... (code omitted) ...

    return res.status(502).json({ error: 'Yapay zeka yanıt veremedi' });
  } catch (error) {
    console.error('[AI_CHAT] Gemini API request failed', error);
    return res.status(500).json({
      error: 'Yapay zeka servisine bağlanılamadı',
    });
  }
  */
});
// Öğrenciye özel çalışma planı önerisi
router.post('/ai/study-plan', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const { focusTopic, weeklyHours = 5, gradeLevel, subject, } = req.body;
    try {
        const [studentResults, watchRecords] = await Promise.all([
            db_1.prisma.testResult.findMany({
                where: { studentId },
                include: { assignment: { include: { test: true } } },
                orderBy: { completedAt: 'desc' },
                take: 20,
            }),
            db_1.prisma.watchRecord.findMany({
                where: { studentId },
                include: { content: true },
                orderBy: { lastWatchedAt: 'desc' },
                take: 15,
            }),
        ]);
        const weakTopics = studentResults
            .map((r) => { var _a, _b; return (_b = (_a = r.assignment) === null || _a === void 0 ? void 0 : _a.test) === null || _b === void 0 ? void 0 : _b.topic; })
            .filter((t) => Boolean(t));
        const watchedTopics = watchRecords.map((w) => { var _a; return (_a = w.content) === null || _a === void 0 ? void 0 : _a.topic; }).filter(Boolean);
        const avgScore = studentResults.length > 0
            ? studentResults.reduce((s, r) => s + r.scorePercent, 0) / studentResults.length
            : null;
        const context = `
Öğrenci verileri:
- Sınıf: ${gradeLevel || 'belirtilmedi'}
- Ders: ${subject || 'belirtilmedi'}
- Son test sayısı: ${studentResults.length}
- Ortalama puan: ${avgScore != null ? Math.round(avgScore) + '%' : 'veri yok'}
- Test çözülen konular: ${[...new Set(weakTopics)].slice(0, 10).join(', ') || 'yok'}
- İzlenen içerik konuları: ${[...new Set(watchedTopics)].slice(0, 10).join(', ') || 'yok'}
- Odak konu (öğrenci talebi): ${focusTopic || 'belirtilmedi'}
- Haftalık hedef çalışma saati: ${weeklyHours}
`.trim();
        const prompt = `Öğrenciye özel haftalık çalışma planı hazırla. Türkçe yaz.

${context}

Planı şu formatta ver:
1. Genel değerlendirme (2-3 cümle)
2. Bu hafta için öncelikli konular (liste) — özellikle varsa odak konu "${focusTopic || ''}" ve ders "${subject || ''}" etrafında yoğunlaş.
3. Günlük/haftalık örnek program (örnek: Pazartesi 1 saat ${subject || 'ders'} - ${focusTopic || 'konu'} tekrar ve soru çözümü)
4. Önerilen kaynak türleri (video, test, konu anlatımı, tekrar notları vb.)
5. Kısa motivasyon notu

ÖNEMLİ:
- Eğer odak konu belirtilmişse, planın en az %70'i bu konu etrafında olsun; diğer konular destekleyici nitelikte kalsın.
- Sınıf seviyesi (${gradeLevel || 'belirtilmedi'}) ve ders bilgisine (${subject || 'belirtilmedi'}) uygun, gerçekçi ve uygulanabilir öneriler ver.`;
        const result = await (0, ai_1.callGemini)(prompt, {
            systemInstruction: 'Sen deneyimli bir rehber öğretmensin. Öğrencilere gerçekçi, uygulanabilir ve motive edici çalışma planları hazırlarsın.',
            temperature: 0.6,
            maxOutputTokens: 2048,
        });
        // Oluşturulan çalışma planını kaydet
        const created = await db_1.prisma.studyPlan.create({
            data: {
                studentId,
                focusTopic: (focusTopic === null || focusTopic === void 0 ? void 0 : focusTopic.trim()) || null,
                gradeLevel: (gradeLevel === null || gradeLevel === void 0 ? void 0 : gradeLevel.trim()) || null,
                subject: (subject === null || subject === void 0 ? void 0 : subject.trim()) || null,
                weeklyHours,
                content: result,
            },
        });
        return res.json({ studyPlan: result, planId: created.id });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AI_STUDY_PLAN]', error);
        return res.status(502).json({
            error: error instanceof Error ? error.message : 'Çalışma planı oluşturulamadı',
        });
    }
});
// Metin özetleme (öğrenci)
router.post('/ai/summarize', (0, auth_1.authenticate)('student'), async (req, res) => {
    const { text, maxLength = 'orta' } = req.body;
    if (!text || !String(text).trim()) {
        return res.status(400).json({ error: 'Metin alanı zorunludur' });
    }
    try {
        const lengthHint = maxLength === 'kısa' ? '2-3 cümle' : maxLength === 'uzun' ? '1 paragraf' : '4-6 cümle';
        const prompt = `Aşağıdaki metni Türkçe olarak özetle. Özet yaklaşık ${lengthHint} uzunluğunda olsun. Ana fikirleri koru:\n\n${String(text).trim()}`;
        const result = await (0, ai_1.callGemini)(prompt, {
            systemInstruction: 'Sen metin özetleme uzmanısın. Özetlerde objektif kalır, ana fikirleri korursun.',
            temperature: 0.3,
            maxOutputTokens: 1024,
        });
        return res.json({ summary: result });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AI_SUMMARIZE]', error);
        return res.status(502).json({
            error: error instanceof Error ? error.message : 'Özet oluşturulamadı',
        });
    }
});
// ---------------------------------------------------------------------------
// Soru Bankası – Öğrenci tarafı meta verisi
// ---------------------------------------------------------------------------
router.get('/questionbank/meta', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a;
    const studentId = req.user.id;
    const student = await db_1.prisma.user.findUnique({
        where: { id: studentId },
        select: { gradeLevel: true },
    });
    const requestedGrade = (_a = req.query.gradeLevel) === null || _a === void 0 ? void 0 : _a.trim();
    const gradeLevel = requestedGrade || (student === null || student === void 0 ? void 0 : student.gradeLevel) || '9';
    const groups = await db_1.prisma.questionBank.groupBy({
        by: ['subjectId', 'gradeLevel', 'topic', 'subtopic'],
        where: {
            gradeLevel,
            // Not: İsterseniz sadece onaylı soruları açmak için isApproved: true ekleyebilirsiniz.
        },
        _count: { id: true },
    });
    if (groups.length === 0) {
        return res.json({
            gradeLevel,
            subjects: [],
        });
    }
    const subjectIds = Array.from(new Set(groups.map((g) => g.subjectId)));
    const subjects = await db_1.prisma.subject.findMany({
        where: { id: { in: subjectIds } },
        select: { id: true, name: true },
    });
    const subjectMap = new Map(subjects.map((s) => [s.id, s.name]));
    const subjectMetaMap = new Map();
    groups.forEach((g) => {
        var _a;
        const subjectId = g.subjectId;
        let subjectMeta = subjectMetaMap.get(subjectId);
        if (!subjectMeta) {
            subjectMeta = {
                subjectId,
                subjectName: (_a = subjectMap.get(subjectId)) !== null && _a !== void 0 ? _a : 'Bilinmeyen',
                gradeLevel: g.gradeLevel,
                topics: new Map(),
            };
            subjectMetaMap.set(subjectId, subjectMeta);
        }
        const topicKey = g.topic || 'Genel';
        let topicMeta = subjectMeta.topics.get(topicKey);
        if (!topicMeta) {
            topicMeta = {
                topic: topicKey,
                subtopics: new Set(),
                questionCount: 0,
            };
            subjectMeta.topics.set(topicKey, topicMeta);
        }
        if (g.subtopic) {
            topicMeta.subtopics.add(g.subtopic);
        }
        topicMeta.questionCount += g._count.id;
    });
    const subjectsPayload = Array.from(subjectMetaMap.values()).map((s) => ({
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        gradeLevel: s.gradeLevel,
        topics: Array.from(s.topics.values()).map((t) => ({
            topic: t.topic,
            subtopics: Array.from(t.subtopics),
            questionCount: t.questionCount,
        })),
    }));
    return res.json({
        gradeLevel,
        subjects: subjectsPayload,
    });
});
// Test sonucu için AI destekli geri bildirim
router.post('/ai/test-feedback', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const { testResultId, format } = req.body;
    if (!testResultId) {
        return res.status(400).json({ error: 'testResultId zorunludur' });
    }
    const testResult = await db_1.prisma.testResult.findFirst({
        where: { id: testResultId, studentId },
        include: { answers: true, assignment: { include: { test: true } } },
    });
    if (!testResult) {
        return res.status(404).json({ error: 'Test sonucu bulunamadı' });
    }
    const test = testResult.assignment.test;
    if (!test) {
        return res
            .status(404)
            .json({ error: 'Bu test sonucu için test bilgisi bulunamadı' });
    }
    const questions = await db_1.prisma.question.findMany({
        where: { testId: test.id },
        orderBy: { orderIndex: 'asc' },
    });
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const topicStatsMap = new Map();
    testResult.answers.forEach((ans) => {
        const q = questionMap.get(ans.questionId);
        const topicKey = (q === null || q === void 0 ? void 0 : q.topic) || test.topic || 'Genel';
        let stats = topicStatsMap.get(topicKey);
        if (!stats) {
            stats = { total: 0, correct: 0, incorrect: 0, blank: 0 };
            topicStatsMap.set(topicKey, stats);
        }
        stats.total += 1;
        if (!ans.answer)
            stats.blank += 1;
        else if (ans.isCorrect)
            stats.correct += 1;
        else
            stats.incorrect += 1;
    });
    const topicSummaries = Array.from(topicStatsMap.entries()).map(([topicName, stats]) => {
        const score = stats.total === 0
            ? 0
            : Math.round((stats.correct / stats.total) * 100);
        return {
            topic: topicName,
            ...stats,
            scorePercent: score,
        };
    });
    const weakTopics = topicSummaries
        .filter((t) => t.scorePercent < 50)
        .map((t) => t.topic);
    const strongTopics = topicSummaries
        .filter((t) => t.scorePercent >= 75)
        .map((t) => t.topic);
    const context = `
Test adı: ${test.title}
Genel skor: ${testResult.scorePercent}%
Doğru: ${testResult.correctCount}, Yanlış: ${testResult.incorrectCount}, Boş: ${testResult.blankCount}

Konu bazlı performans:
${topicSummaries
        .map((t) => `- ${t.topic}: ${t.scorePercent}% (Doğru: ${t.correct}, Yanlış: ${t.incorrect}, Boş: ${t.blank})`)
        .join('\n')}

Zayıf konular: ${weakTopics.join(', ') || 'yok'}
Güçlü konular: ${strongTopics.join(', ') || 'yok'}
`.trim();
    const prompt = `Aşağıdaki test sonucunu analiz ederek öğrenciye Türkçe, kısa ama motive edici bir geri bildirim hazırla.

Kurallar:
- 3-5 cümlelik net bir açıklama yaz.
- Önce genel performansı değerlendir.
- Ardından özellikle zayıf olduğu konulara odaklanarak çalışması gereken alanları öner.
- Çok teknik terim kullanma, sade ve anlaşılır ol.

${context}
`;
    try {
        const feedbackText = await (0, ai_1.callGemini)(prompt, {
            systemInstruction: 'Sen deneyimli bir matematik ve fen koçu olarak öğrencilere net, motive edici ve uygulanabilir geri bildirimler verirsin.',
            temperature: 0.6,
            maxOutputTokens: 1024,
        });
        let attachment;
        if (format === 'pdf') {
            const buffer = await generateFeedbackPdf(feedbackText);
            attachment = {
                filename: `test-yorumu-${testResultId}.pdf`,
                mimeType: 'application/pdf',
                data: buffer.toString('base64'),
            };
        }
        return res.json({
            feedback: feedbackText,
            weakTopics,
            strongTopics,
            ...(attachment ? { attachment } : {}),
        });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AI_TEST_FEEDBACK]', error);
        return res.status(502).json({
            error: error instanceof Error
                ? error.message
                : 'Test geri bildirimi oluşturulamadı',
        });
    }
});
// Öğrencinin kayıtlı çalışma planları listesi
router.get('/study-plans', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const plans = await db_1.prisma.studyPlan.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 50,
    });
    return res.json(plans.map((p) => {
        var _a, _b, _c;
        return ({
            id: p.id,
            studentId: p.studentId,
            focusTopic: (_a = p.focusTopic) !== null && _a !== void 0 ? _a : undefined,
            gradeLevel: (_b = p.gradeLevel) !== null && _b !== void 0 ? _b : undefined,
            subject: (_c = p.subject) !== null && _c !== void 0 ? _c : undefined,
            weeklyHours: p.weeklyHours,
            content: p.content,
            createdAt: p.createdAt.toISOString(),
        });
    }));
});
// Belirli çalışma planını PDF olarak indirilebilir hale getir
router.get('/study-plans/:id/pdf', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const id = String(req.params.id);
    const plan = await db_1.prisma.studyPlan.findFirst({
        where: { id, studentId },
    });
    if (!plan) {
        return res.status(404).json({ error: 'Çalışma planı bulunamadı' });
    }
    const headerLines = [];
    if (plan.gradeLevel) {
        headerLines.push(`Sınıf: ${plan.gradeLevel}`);
    }
    if (plan.subject) {
        headerLines.push(`Ders: ${plan.subject}`);
    }
    if (plan.focusTopic) {
        headerLines.push(`Odak konu: ${plan.focusTopic}`);
    }
    headerLines.push(`Haftalık hedef saat: ${plan.weeklyHours}`);
    const pdfText = `${headerLines.join('\n')}\n\n${plan.content}`;
    const buffer = await generateFeedbackPdf(pdfText);
    return res.json({
        filename: `calisma-plani-${id}.pdf`,
        mimeType: 'application/pdf',
        data: buffer.toString('base64'),
    });
});
// Görev listesi (sadece bekleyen)
router.get('/assignments', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    // Sadece pending durumundaki assignmentları getir
    const assignmentStudents = await db_1.prisma.assignmentStudent.findMany({
        where: {
            studentId,
            // @ts-ignore: Prisma types sync issue
            status: 'pending',
        },
        include: {
            assignment: {
                include: {
                    students: { select: { studentId: true } },
                    testAsset: true,
                },
            },
        },
    });
    return res.json(
    // @ts-ignore: Prisma types sync issue - assignment relation exists at runtime
    assignmentStudents.map((as) => {
        var _a, _b, _c, _d, _e, _f, _g;
        return ({
            id: as.assignment.id,
            title: as.assignment.title,
            description: (_a = as.assignment.description) !== null && _a !== void 0 ? _a : undefined,
            testId: (_b = as.assignment.testId) !== null && _b !== void 0 ? _b : undefined,
            contentId: (_c = as.assignment.contentId) !== null && _c !== void 0 ? _c : undefined,
            // @ts-ignore: Prisma types sync issue
            testAssetId: (_d = as.assignment.testAssetId) !== null && _d !== void 0 ? _d : undefined,
            classId: (_e = as.assignment.classId) !== null && _e !== void 0 ? _e : undefined,
            assignedStudentIds: as.assignment.students.map((s) => s.studentId),
            dueDate: as.assignment.dueDate.toISOString(),
            points: as.assignment.points,
            // @ts-ignore: Prisma types sync issue
            timeLimitMinutes: (_f = as.assignment.timeLimitMinutes) !== null && _f !== void 0 ? _f : undefined,
            // Test dosyası için öğrenci tarafında görüntüleme bilgileri
            testAsset: as.assignment.testAsset
                ? {
                    id: as.assignment.testAsset.id,
                    title: as.assignment.testAsset.title,
                    fileUrl: as.assignment.testAsset.fileUrl,
                    fileName: as.assignment.testAsset.fileName,
                    mimeType: as.assignment.testAsset.mimeType,
                    answerKeyJson: (_g = as.assignment.testAsset.answerKeyJson) !== null && _g !== void 0 ? _g : undefined,
                }
                : undefined,
        });
    }));
});
// Bekleyen ödevler (canlı ders için) - Types verified via tsc
router.get('/assignments/pending', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const now = new Date();
    const pendingAssignments = await db_1.prisma.assignmentStudent.findMany({
        where: {
            studentId,
            // @ts-ignore: Prisma types sync issue
            status: 'pending',
            assignment: {
                dueDate: { gte: now }
            }
        },
        include: {
            assignment: {
                select: {
                    id: true,
                    title: true,
                    description: true,
                    dueDate: true,
                    points: true,
                    testId: true,
                    contentId: true
                }
            }
        },
        orderBy: {
            assignment: {
                dueDate: 'asc'
            }
        }
    });
    return res.json(pendingAssignments.map((as) => {
        var _a, _b, _c, _d, _e;
        return ({
            // @ts-ignore: Prisma types sync issue
            id: as.assignment.id,
            // @ts-ignore: Prisma types sync issue
            title: as.assignment.title,
            // @ts-ignore: Prisma types sync issue
            description: (_a = as.assignment.description) !== null && _a !== void 0 ? _a : undefined,
            // @ts-ignore: Prisma types sync issue
            dueDate: as.assignment.dueDate.toISOString(),
            // @ts-ignore: Prisma types sync issue
            points: as.assignment.points,
            // @ts-ignore: Prisma types sync issue
            testId: (_b = as.assignment.testId) !== null && _b !== void 0 ? _b : undefined,
            // @ts-ignore: Prisma types sync issue
            contentId: (_c = as.assignment.contentId) !== null && _c !== void 0 ? _c : undefined,
            // @ts-ignore: Prisma types sync issue
            testAssetId: (_d = as.assignment.testAssetId) !== null && _d !== void 0 ? _d : undefined,
            // @ts-ignore: Prisma types sync issue
            timeLimitMinutes: (_e = as.assignment.timeLimitMinutes) !== null && _e !== void 0 ? _e : undefined,
        });
    }));
});
// Ödevi tamamla (PDF test için answers gönderilirse doğru/yanlış/boş hesaplanır)
router.post('/assignments/:id/complete', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const studentId = req.user.id;
    const assignmentId = String(req.params.id);
    const { submittedInLiveClass, answers: rawAnswers } = req.body;
    const assignmentStudent = await db_1.prisma.assignmentStudent.findUnique({
        where: {
            assignmentId_studentId: {
                assignmentId,
                studentId
            }
        },
        include: {
            assignment: {
                include: { testAsset: true }
            }
        }
    });
    if (!assignmentStudent) {
        return res.status(404).json({ error: 'Ödev bulunamadı' });
    }
    const updated = await db_1.prisma.assignmentStudent.update({
        where: {
            assignmentId_studentId: {
                assignmentId,
                studentId
            }
        },
        data: {
            // @ts-ignore: Prisma types sync issue
            status: 'completed',
            // @ts-ignore: Prisma types sync issue
            completedAt: new Date(),
            // @ts-ignore: Prisma types sync issue
            submittedInLiveClass: submittedInLiveClass !== null && submittedInLiveClass !== void 0 ? submittedInLiveClass : false
        }
    });
    const assignment = assignmentStudent.assignment;
    const testAsset = assignment === null || assignment === void 0 ? void 0 : assignment.testAsset;
    const answerKeyJson = testAsset === null || testAsset === void 0 ? void 0 : testAsset.answerKeyJson;
    let correctCount = 0;
    let incorrectCount = 0;
    let blankCount = 0;
    let scorePercent = 0;
    if ((assignment === null || assignment === void 0 ? void 0 : assignment.testAssetId) && answerKeyJson && rawAnswers && typeof rawAnswers === 'object') {
        try {
            const answerKey = JSON.parse(answerKeyJson);
            const keys = Object.keys(answerKey).sort((a, b) => Number(a) - Number(b));
            const total = keys.length;
            for (const key of keys) {
                const correct = ((_a = answerKey[key]) !== null && _a !== void 0 ? _a : '').trim().toUpperCase();
                const student = ((_c = (_b = rawAnswers[key]) !== null && _b !== void 0 ? _b : rawAnswers[String(Number(key))]) !== null && _c !== void 0 ? _c : '').trim().toUpperCase();
                if (!student) {
                    blankCount++;
                }
                else if (student === correct) {
                    correctCount++;
                }
                else {
                    incorrectCount++;
                }
            }
            scorePercent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
        }
        catch {
            // answerKey parse hatası – istatistik döndürme
        }
    }
    const body = {
        success: true,
        assignmentId: updated.assignmentId,
        studentId: updated.studentId,
        // @ts-ignore: Prisma types sync issue
        status: updated.status,
        // @ts-ignore: Prisma types sync issue
        completedAt: (_d = updated.completedAt) === null || _d === void 0 ? void 0 : _d.toISOString()
    };
    if ((assignment === null || assignment === void 0 ? void 0 : assignment.testAssetId) && answerKeyJson) {
        body.correctCount = correctCount;
        body.incorrectCount = incorrectCount;
        body.blankCount = blankCount;
        body.scorePercent = scorePercent;
        // Senaryo A: PDF/TestAsset sınav sonuç bildirimi – velilere otomatik bildirim
        const student = await db_1.prisma.user.findUnique({
            where: { id: studentId },
            select: { name: true },
        });
        const examTitle = (_g = (_f = (_e = assignment.testAsset) === null || _e === void 0 ? void 0 : _e.title) !== null && _f !== void 0 ? _f : assignment.title) !== null && _g !== void 0 ? _g : 'Test';
        const bodyText = `Sayın Veli, öğrencimiz ${(_h = student === null || student === void 0 ? void 0 : student.name) !== null && _h !== void 0 ? _h : 'Öğrenci'}, ${examTitle} testini tamamlamıştır. Sonuç: ${correctCount} Doğru, ${incorrectCount} Yanlış, ${blankCount} Boş. Başarı Oranı: %${scorePercent}.`;
        (0, notificationService_1.notifyParentsOfStudent)(studentId, {
            type: 'exam_result_to_parent',
            title: 'Sınav Sonucu',
            body: bodyText,
            relatedEntityType: 'test',
            relatedEntityId: assignmentId,
        }).catch(() => { });
    }
    return res.json(body);
});
// Görev detayı
router.get('/assignments/:id', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d, _e, _f;
    const studentId = req.user.id;
    const id = String(req.params.id);
    const assignment = await db_1.prisma.assignment.findFirst({
        where: {
            id,
            students: { some: { studentId } },
        },
        include: { students: { select: { studentId: true } } },
    });
    if (!assignment) {
        return res.status(404).json({ error: 'Görev bulunamadı' });
    }
    let test = null;
    let testQuestions = [];
    if (assignment.testId) {
        test = await db_1.prisma.test.findUnique({
            where: { id: assignment.testId },
            include: { questions: { orderBy: { orderIndex: 'asc' } } },
        });
        if (test) {
            testQuestions = test.questions.map((q) => {
                var _a, _b, _c;
                return ({
                    id: q.id,
                    text: q.text,
                    type: q.type,
                    choices: (_a = q.choices) !== null && _a !== void 0 ? _a : undefined,
                    correctAnswer: (_b = q.correctAnswer) !== null && _b !== void 0 ? _b : undefined,
                    solutionExplanation: (_c = q.solutionExplanation) !== null && _c !== void 0 ? _c : undefined,
                    topic: q.topic,
                    difficulty: q.difficulty,
                });
            });
        }
    }
    return res.json({
        assignment: {
            id: assignment.id,
            title: assignment.title,
            description: (_a = assignment.description) !== null && _a !== void 0 ? _a : undefined,
            testId: (_b = assignment.testId) !== null && _b !== void 0 ? _b : undefined,
            contentId: (_c = assignment.contentId) !== null && _c !== void 0 ? _c : undefined,
            // @ts-ignore: Prisma types may lag behind schema
            testAssetId: (_d = assignment.testAssetId) !== null && _d !== void 0 ? _d : undefined,
            classId: (_e = assignment.classId) !== null && _e !== void 0 ? _e : undefined,
            assignedStudentIds: assignment.students.map((s) => s.studentId),
            dueDate: assignment.dueDate.toISOString(),
            points: assignment.points,
            // @ts-ignore
            timeLimitMinutes: (_f = assignment.timeLimitMinutes) !== null && _f !== void 0 ? _f : undefined,
        },
        test: test
            ? {
                id: test.id,
                title: test.title,
                subjectId: test.subjectId,
                topic: test.topic,
                questionIds: test.questions.map((q) => q.id),
                createdByTeacherId: test.createdByTeacherId,
            }
            : undefined,
        questions: testQuestions,
    });
});
// ---------------------------------------------------------------------------
// Soru Bankası – Öğrenci için dinamik test başlatma
// ---------------------------------------------------------------------------
router.post('/questionbank/start-test', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const studentId = req.user.id;
    const { subjectId, topic, subtopic, gradeLevel: gradeFromBody, questionCount, } = req.body;
    if (!subjectId || !topic) {
        return res
            .status(400)
            .json({ error: 'subjectId ve topic alanları zorunludur' });
    }
    const student = await db_1.prisma.user.findUnique({
        where: { id: studentId },
        select: { gradeLevel: true, classId: true },
    });
    const gradeLevel = gradeFromBody || (student === null || student === void 0 ? void 0 : student.gradeLevel) || '9';
    const subject = await db_1.prisma.subject.findUnique({
        where: { id: subjectId },
        select: { id: true, name: true },
    });
    if (!subject) {
        return res.status(400).json({ error: 'Geçersiz subjectId' });
    }
    const where = {
        subjectId,
        gradeLevel,
        topic: { contains: topic, mode: 'insensitive' },
    };
    if (subtopic) {
        where.subtopic = { contains: subtopic, mode: 'insensitive' };
    }
    // Not: Öğrenciye sadece onaylı soruları göstermek isterseniz aşağıyı açabilirsiniz:
    // where.isApproved = true;
    const qbQuestions = await db_1.prisma.questionBank.findMany({
        where,
    });
    if (!qbQuestions.length) {
        return res
            .status(404)
            .json({ error: 'Bu filtrelere uygun soru bulunamadı' });
    }
    const desired = typeof questionCount === 'number' && Number.isFinite(questionCount)
        ? Math.max(1, Math.min(Math.floor(questionCount), qbQuestions.length))
        : Math.min(10, qbQuestions.length);
    const selected = shuffleArray(qbQuestions).slice(0, desired);
    // Test oluşturmak için öğretmen kimliği – öncelik: sınıf öğretmeni, yoksa ilk öğretmen
    let createdByTeacherId = null;
    if (student === null || student === void 0 ? void 0 : student.classId) {
        const classGroup = await db_1.prisma.classGroup.findUnique({
            where: { id: student.classId },
            select: { teacherId: true },
        });
        if (classGroup === null || classGroup === void 0 ? void 0 : classGroup.teacherId) {
            createdByTeacherId = classGroup.teacherId;
        }
    }
    if (!createdByTeacherId) {
        const anyTeacher = await db_1.prisma.user.findFirst({
            where: { role: 'teacher' },
            select: { id: true },
        });
        createdByTeacherId = (_a = anyTeacher === null || anyTeacher === void 0 ? void 0 : anyTeacher.id) !== null && _a !== void 0 ? _a : null;
    }
    if (!createdByTeacherId) {
        const anyUser = await db_1.prisma.user.findFirst({
            select: { id: true },
        });
        createdByTeacherId = (_b = anyUser === null || anyUser === void 0 ? void 0 : anyUser.id) !== null && _b !== void 0 ? _b : studentId;
    }
    const test = await db_1.prisma.test.create({
        data: {
            title: `Soru Bankası Testi – ${topic}`,
            subjectId: subject.id,
            topic,
            createdByTeacherId,
            questions: {
                create: selected.map((q, index) => ({
                    text: q.text,
                    type: q.type,
                    choices: q.choices,
                    correctAnswer: q.correctAnswer,
                    solutionExplanation: q.solutionExplanation,
                    topic: q.topic,
                    difficulty: q.difficulty,
                    orderIndex: index,
                })),
            },
        },
        include: { questions: true },
    });
    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const assignment = await db_1.prisma.assignment.create({
        data: {
            title: `Soru Bankası – ${subject.name} / ${topic}`,
            description: 'Soru bankasından otomatik oluşturulan pratik testi',
            testId: test.id,
            classId: (_c = student === null || student === void 0 ? void 0 : student.classId) !== null && _c !== void 0 ? _c : null,
            dueDate,
            points: 100,
            students: {
                create: [{ studentId }],
            },
        },
        include: {
            students: { select: { studentId: true } },
        },
    });
    const sortedQuestions = [...test.questions].sort((a, b) => { var _a, _b; return ((_a = a.orderIndex) !== null && _a !== void 0 ? _a : 0) - ((_b = b.orderIndex) !== null && _b !== void 0 ? _b : 0); });
    const responseQuestions = sortedQuestions.map((q) => {
        var _a, _b, _c;
        return ({
            id: q.id,
            text: q.text,
            type: q.type,
            // question.choices Json alanı string[] tutar; runtime'da cast ediyoruz
            choices: (_a = q.choices) !== null && _a !== void 0 ? _a : undefined,
            correctAnswer: (_b = q.correctAnswer) !== null && _b !== void 0 ? _b : undefined,
            solutionExplanation: (_c = q.solutionExplanation) !== null && _c !== void 0 ? _c : undefined,
            topic: q.topic,
            difficulty: q.difficulty,
        });
    });
    return res.status(201).json({
        assignment: {
            id: assignment.id,
            title: assignment.title,
            description: (_d = assignment.description) !== null && _d !== void 0 ? _d : undefined,
            testId: (_e = assignment.testId) !== null && _e !== void 0 ? _e : undefined,
            contentId: (_f = assignment.contentId) !== null && _f !== void 0 ? _f : undefined,
            // @ts-ignore: Prisma types may lag behind schema
            testAssetId: (_g = assignment.testAssetId) !== null && _g !== void 0 ? _g : undefined,
            classId: (_h = assignment.classId) !== null && _h !== void 0 ? _h : undefined,
            assignedStudentIds: assignment.students.map((s) => s.studentId),
            dueDate: assignment.dueDate.toISOString(),
            points: assignment.points,
            // @ts-ignore
            timeLimitMinutes: (_j = assignment.timeLimitMinutes) !== null && _j !== void 0 ? _j : undefined,
        },
        test: {
            id: test.id,
            title: test.title,
            subjectId: test.subjectId,
            topic: test.topic,
            questionIds: sortedQuestions.map((q) => q.id),
            createdByTeacherId: test.createdByTeacherId,
        },
        questions: responseQuestions,
    });
});
// Öğretmene sor (yardım talebi) - test veya PDF test içindeki soru için
router.post('/help-requests', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const studentId = req.user.id;
    const { assignmentId, questionId, message, studentAnswer } = req.body;
    if (!assignmentId) {
        return res.status(400).json({ error: 'assignmentId zorunludur' });
    }
    if (!questionId) {
        return res.status(400).json({ error: 'questionId zorunludur' });
    }
    const assignment = await db_1.prisma.assignment.findFirst({
        where: { id: assignmentId, students: { some: { studentId } } },
        include: { test: true, testAsset: true },
    });
    if (!assignment) {
        return res.status(404).json({ error: 'Görev bulunamadı' });
    }
    const teacherId = (_a = assignment.createdByTeacherId) !== null && _a !== void 0 ? _a : (assignment.classId
        ? (_b = (await db_1.prisma.classGroup.findUnique({ where: { id: assignment.classId } }))) === null || _b === void 0 ? void 0 : _b.teacherId
        : null);
    if (!teacherId) {
        return res.status(409).json({ error: 'Bu görev için öğretmen bilgisi bulunamadı' });
    }
    const testTitle = (_f = (_d = (_c = assignment.test) === null || _c === void 0 ? void 0 : _c.title) !== null && _d !== void 0 ? _d : (_e = assignment.testAsset) === null || _e === void 0 ? void 0 : _e.title) !== null && _f !== void 0 ? _f : assignment.title;
    // PDF test (testAsset) – questionId "pdf-page-N" formatında
    const pdfPageMatch = /^pdf-page-(\d+)$/.exec(questionId);
    const isPdfTest = !!assignment.testAssetId && !assignment.testId;
    let notificationBody;
    let dbQuestionId;
    if (isPdfTest && pdfPageMatch && pdfPageMatch[1]) {
        const pageNum = parseInt(pdfPageMatch[1], 10);
        dbQuestionId = null;
        notificationBody = `${req.user.name} "${testTitle}" PDF testinde ${pageNum}. soruda takıldı.`;
    }
    else {
        const question = await db_1.prisma.question.findUnique({ where: { id: questionId } });
        if (!question) {
            return res.status(404).json({ error: 'Soru bulunamadı' });
        }
        if (assignment.testId && question.testId !== assignment.testId) {
            return res.status(400).json({ error: 'Soru bu teste ait değil' });
        }
        dbQuestionId = questionId;
        const questionNumber = ((_g = question.orderIndex) !== null && _g !== void 0 ? _g : 0) + 1;
        notificationBody = `${req.user.name} "${testTitle}" testinde ${questionNumber}. soruda takıldı.`;
    }
    const created = await db_1.prisma.helpRequest.create({
        data: {
            studentId,
            teacherId,
            assignmentId: assignment.id,
            questionId: dbQuestionId,
            studentAnswer: (studentAnswer === null || studentAnswer === void 0 ? void 0 : studentAnswer.trim()) ? studentAnswer.trim().toUpperCase().slice(0, 1) : undefined,
            message: (message === null || message === void 0 ? void 0 : message.trim()) ? message.trim() : undefined,
            status: 'open',
        },
    });
    await db_1.prisma.notification.create({
        data: {
            userId: teacherId,
            type: 'help_request_created',
            title: 'Öğrenciden yardım isteği',
            body: notificationBody,
            read: false,
            relatedEntityType: 'help_request',
            relatedEntityId: created.id,
        },
    });
    return res.status(201).json({
        id: created.id,
        studentId: created.studentId,
        teacherId: created.teacherId,
        assignmentId: created.assignmentId,
        questionId: (_h = created.questionId) !== null && _h !== void 0 ? _h : undefined,
        message: (_j = created.message) !== null && _j !== void 0 ? _j : undefined,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
    });
});
// Öğrencinin yardım talepleri
router.get('/help-requests', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const status = req.query.status ? String(req.query.status) : undefined;
    const list = await db_1.prisma.helpRequest.findMany({
        where: {
            studentId,
            ...(status ? { status: status } : {}),
        },
        include: { response: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
    });
    return res.json(list.map((r) => {
        var _a, _b, _c, _d;
        return ({
            id: r.id,
            studentId: r.studentId,
            teacherId: r.teacherId,
            assignmentId: r.assignmentId,
            questionId: (_a = r.questionId) !== null && _a !== void 0 ? _a : undefined,
            message: (_b = r.message) !== null && _b !== void 0 ? _b : undefined,
            status: r.status,
            createdAt: r.createdAt.toISOString(),
            resolvedAt: (_c = r.resolvedAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
            response: r.response
                ? {
                    id: r.response.id,
                    mode: r.response.mode,
                    url: r.response.url,
                    mimeType: (_d = r.response.mimeType) !== null && _d !== void 0 ? _d : undefined,
                    createdAt: r.response.createdAt.toISOString(),
                }
                : undefined,
        });
    }));
});
router.get('/help-requests/:id', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d, _e;
    const studentId = req.user.id;
    const id = String(req.params.id);
    const r = await db_1.prisma.helpRequest.findFirst({
        where: { id, studentId },
        include: { response: true },
    });
    if (!r)
        return res.status(404).json({ error: 'Yardım talebi bulunamadı' });
    return res.json({
        id: r.id,
        studentId: r.studentId,
        teacherId: r.teacherId,
        assignmentId: r.assignmentId,
        questionId: (_a = r.questionId) !== null && _a !== void 0 ? _a : undefined,
        message: (_b = r.message) !== null && _b !== void 0 ? _b : undefined,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: (_c = r.resolvedAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
        response: r.response
            ? {
                id: r.response.id,
                mode: r.response.mode,
                url: r.response.url,
                mimeType: (_d = r.response.mimeType) !== null && _d !== void 0 ? _d : undefined,
                createdAt: r.response.createdAt.toISOString(),
                playedAt: (_e = r.response.playedAt) !== null && _e !== void 0 ? _e : undefined,
            }
            : undefined,
    });
});
// Öğrenci çözümü oynattığında (ilk oynatma) öğretmene bildirim gönder
router.post('/help-requests/:id/response-played', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const studentId = req.user.id;
    const helpRequestId = String(req.params.id);
    const helpRequest = await db_1.prisma.helpRequest.findFirst({
        where: { id: helpRequestId, studentId },
        include: {
            response: true,
            teacher: { select: { id: true, name: true } },
            assignment: { include: { test: { select: { title: true } } } },
            question: { select: { orderIndex: true } },
        },
    });
    if (!helpRequest) {
        return res.status(404).json({ error: 'Yardım talebi bulunamadı' });
    }
    if (!helpRequest.response) {
        return res.status(409).json({ error: 'Bu talep için henüz çözüm yok' });
    }
    // Zaten işaretlendiyse tekrar bildirim oluşturmayalım
    if (helpRequest.response.playedAt) {
        return res.json({
            success: true,
            alreadyPlayed: true,
            playedAt: helpRequest.response.playedAt,
        });
    }
    const updated = await db_1.prisma.helpResponse.update({
        where: { helpRequestId },
        data: { playedAt: new Date() },
    });
    const studentName = req.user.name;
    const teacherId = helpRequest.teacherId;
    const testTitle = (_e = (_c = (_b = (_a = helpRequest.assignment) === null || _a === void 0 ? void 0 : _a.test) === null || _b === void 0 ? void 0 : _b.title) !== null && _c !== void 0 ? _c : (_d = helpRequest.assignment) === null || _d === void 0 ? void 0 : _d.title) !== null && _e !== void 0 ? _e : 'Test';
    const questionNumber = ((_g = (_f = helpRequest.question) === null || _f === void 0 ? void 0 : _f.orderIndex) !== null && _g !== void 0 ? _g : 0) + 1;
    if (teacherId) {
        await db_1.prisma.notification.create({
            data: {
                userId: teacherId,
                type: 'help_response_played',
                title: 'Çözüm izlendi',
                body: `${studentName}, "${testTitle}" testindeki ${questionNumber}. soru çözümünüzü oynattı.`,
                read: false,
                relatedEntityType: 'help_response',
                relatedEntityId: updated.id,
            },
        });
    }
    return res.json({
        success: true,
        alreadyPlayed: false,
        playedAt: (_h = updated.playedAt) === null || _h === void 0 ? void 0 : _h.toISOString(),
    });
});
// Şikayet / öneri (admin'e)
router.post('/complaints', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a;
    const studentId = req.user.id;
    const { subject, body, aboutTeacherId } = req.body;
    if (!subject || !body) {
        return res.status(400).json({ error: 'subject ve body alanları zorunludur' });
    }
    if (aboutTeacherId) {
        const teacher = await db_1.prisma.user.findFirst({ where: { id: aboutTeacherId, role: 'teacher' } });
        if (!teacher) {
            return res.status(404).json({ error: 'Öğretmen bulunamadı' });
        }
    }
    const created = await db_1.prisma.complaint.create({
        data: {
            fromRole: 'student',
            fromUserId: studentId,
            aboutTeacherId: aboutTeacherId !== null && aboutTeacherId !== void 0 ? aboutTeacherId : undefined,
            subject: subject.trim(),
            body: body.trim(),
            status: 'open',
        },
    });
    // Admin bildirimleri
    const admins = await db_1.prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    if (admins.length > 0) {
        await db_1.prisma.notification.createMany({
            data: admins.map((a) => ({
                userId: a.id,
                type: 'complaint_created',
                title: 'Yeni şikayet/öneri',
                body: 'Öğrenciden yeni bir şikayet/öneri gönderildi.',
                read: false,
                relatedEntityType: 'complaint',
                relatedEntityId: created.id,
            })),
        });
    }
    return res.status(201).json({
        id: created.id,
        fromRole: created.fromRole,
        fromUserId: created.fromUserId,
        aboutTeacherId: (_a = created.aboutTeacherId) !== null && _a !== void 0 ? _a : undefined,
        subject: created.subject,
        body: created.body,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
    });
});
// Test çözümü gönderme (basitleştirilmiş)
router.post('/assignments/:id/submit', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d;
    const studentId = req.user.id;
    const id = String(req.params.id);
    const assignment = await db_1.prisma.assignment.findFirst({
        where: {
            id,
            testId: { not: null },
            students: { some: { studentId } },
        },
        include: { students: { select: { studentId: true } } },
    });
    if (!assignment || !assignment.testId) {
        return res.status(404).json({ error: 'Görev veya test bulunamadı' });
    }
    const test = await db_1.prisma.test.findUnique({
        where: { id: assignment.testId },
        include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!test) {
        return res.status(404).json({ error: 'Test bulunamadı' });
    }
    const rawAnswers = ((_a = req.body.answers) !== null && _a !== void 0 ? _a : []);
    const questionMap = new Map(test.questions.map((q) => [q.id, q]));
    const answers = rawAnswers.map((a) => {
        const question = questionMap.get(a.questionId);
        let isCorrect = false;
        if (question) {
            if (question.type === 'multiple_choice' || question.type === 'true_false') {
                isCorrect = a.answer === question.correctAnswer;
            }
        }
        return {
            questionId: a.questionId,
            answer: a.answer,
            isCorrect,
            ...(a.scratchpadImageData ? { scratchpadImageData: a.scratchpadImageData } : {}),
        };
    });
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const incorrectCount = answers.filter((a) => !a.isCorrect && a.answer !== '').length;
    const blankCount = test.questions.length - (correctCount + incorrectCount);
    const scorePercent = test.questions.length === 0
        ? 0
        : Math.round((correctCount / test.questions.length) * 100);
    const result = await db_1.prisma.testResult.create({
        data: {
            assignmentId: assignment.id,
            studentId,
            testId: test.id,
            correctCount,
            incorrectCount,
            blankCount,
            scorePercent,
            durationSeconds: (_b = req.body.durationSeconds) !== null && _b !== void 0 ? _b : 0,
            completedAt: new Date(),
            answers: {
                create: answers.map((a) => ({
                    questionId: a.questionId,
                    answer: a.answer,
                    isCorrect: a.isCorrect,
                    scratchpadImageData: a.scratchpadImageData,
                })),
            },
        },
        include: { answers: true },
    });
    // Ödevi tamamlandı olarak işaretle
    await db_1.prisma.assignmentStudent.updateMany({
        where: {
            assignmentId: assignment.id,
            studentId,
        },
        data: {
            status: 'completed',
            completedAt: new Date(),
        },
    });
    // Senaryo A: Sınav sonuç bildirimi – velilere otomatik bildirim
    const student = await db_1.prisma.user.findUnique({
        where: { id: studentId },
        select: { name: true },
    });
    const examTitle = assignment.title || test.title || 'Test';
    const bodyText = `Sayın Veli, öğrencimiz ${(_c = student === null || student === void 0 ? void 0 : student.name) !== null && _c !== void 0 ? _c : 'Öğrenci'}, ${examTitle} testini tamamlamıştır. Sonuç: ${result.correctCount} Doğru, ${result.incorrectCount} Yanlış, ${result.blankCount} Boş. Başarı Oranı: %${result.scorePercent}.`;
    (0, notificationService_1.notifyParentsOfStudent)(studentId, {
        type: 'exam_result_to_parent',
        title: 'Sınav Sonucu',
        body: bodyText,
        relatedEntityType: 'test',
        relatedEntityId: result.id,
    }).catch(() => { });
    const responseBody = {
        id: result.id,
        assignmentId: result.assignmentId,
        studentId: result.studentId,
        testId: result.testId,
        answers: result.answers.map((a) => {
            var _a;
            return ({
                questionId: a.questionId,
                answer: a.answer,
                isCorrect: a.isCorrect,
                scratchpadImageData: (_a = a.scratchpadImageData) !== null && _a !== void 0 ? _a : undefined,
            });
        }),
        correctCount: result.correctCount,
        incorrectCount: result.incorrectCount,
        blankCount: result.blankCount,
        scorePercent: result.scorePercent,
        durationSeconds: result.durationSeconds,
        completedAt: result.completedAt.toISOString(),
    };
    // Soru bankası kaynaklı testler için basit konu bazlı analiz ekle
    try {
        const [testWithMeta, assignment] = await Promise.all([
            db_1.prisma.test.findUnique({
                where: { id: result.testId },
                include: { questions: true },
            }),
            db_1.prisma.assignment.findUnique({
                where: { id: result.assignmentId },
                select: { title: true },
            }),
        ]);
        if (testWithMeta) {
            const byTopic = {};
            const questionMap = new Map(testWithMeta.questions.map((q) => [q.id, q]));
            result.answers.forEach((ans) => {
                const q = questionMap.get(ans.questionId);
                const topicKey = (q === null || q === void 0 ? void 0 : q.topic) || testWithMeta.topic || 'Genel';
                if (!byTopic[topicKey]) {
                    byTopic[topicKey] = { total: 0, correct: 0, incorrect: 0, blank: 0 };
                }
                const bucket = byTopic[topicKey];
                bucket.total += 1;
                if (!ans.answer) {
                    bucket.blank += 1;
                }
                else if (ans.isCorrect) {
                    bucket.correct += 1;
                }
                else {
                    bucket.incorrect += 1;
                }
            });
            const topicsAnalysis = Object.entries(byTopic).map(([topicName, stats]) => {
                const topicScore = stats.total === 0
                    ? 0
                    : Math.round((stats.correct / stats.total) * 100);
                let strength = 'average';
                if (topicScore < 50)
                    strength = 'weak';
                else if (topicScore >= 75)
                    strength = 'strong';
                return {
                    topic: topicName,
                    totalQuestions: stats.total,
                    correct: stats.correct,
                    incorrect: stats.incorrect,
                    blank: stats.blank,
                    scorePercent: topicScore,
                    strength,
                };
            });
            const weakTopics = topicsAnalysis
                .filter((t) => t.strength === 'weak')
                .map((t) => t.topic);
            const strongTopics = topicsAnalysis
                .filter((t) => t.strength === 'strong')
                .map((t) => t.topic);
            const overallLevel = result.scorePercent < 50
                ? 'weak'
                : result.scorePercent >= 75
                    ? 'strong'
                    : 'average';
            const recommendedNextActions = [];
            if (weakTopics.length) {
                recommendedNextActions.push(`${weakTopics.join(', ')} konularında ek soru çözerek tekrar yap.`);
            }
            if (overallLevel === 'weak') {
                recommendedNextActions.push('Temel kavram özetlerini tekrar oku ve daha kısa testlerle başlayarak ilerle.');
            }
            else if (overallLevel === 'average') {
                recommendedNextActions.push('Zayıf olduğun konulara odaklanarak 1-2 ek test çöz; güçlü olduğun konuları haftada bir kez tekrar et.');
            }
            else {
                recommendedNextActions.push('Bu konuda oldukça iyisin, farklı seviyelerde karışık deneme testleri çözebilirsin.');
            }
            responseBody.questionBankAnalysis = {
                testTitle: (_d = assignment === null || assignment === void 0 ? void 0 : assignment.title) !== null && _d !== void 0 ? _d : testWithMeta.title,
                overallScorePercent: result.scorePercent,
                overallLevel,
                topics: topicsAnalysis,
                weakTopics,
                strongTopics,
                recommendedNextActions,
            };
        }
    }
    catch {
        // Analiz isteğe bağlı; hata durumunda ana yanıtı etkilemesin
    }
    return res.status(201).json(responseBody);
});
// Konu bazlı ilerleme özeti
router.get('/progress/topics', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const [studentResults, testsData, subjectsData] = await Promise.all([
        db_1.prisma.testResult.findMany({
            where: { studentId },
            include: { answers: true },
        }),
        db_1.prisma.test.findMany({ include: { subject: true } }),
        db_1.prisma.subject.findMany(),
    ]);
    const subjectMap = new Map(subjectsData.map((s) => [s.id, s.name]));
    const topicMap = new Map();
    testsData.forEach((test) => {
        var _a;
        const key = test.topic;
        const subjectName = (_a = subjectMap.get(test.subjectId)) !== null && _a !== void 0 ? _a : 'Bilinmeyen';
        if (!topicMap.has(key)) {
            topicMap.set(key, {
                topic: key,
                subjectName,
                completionPercent: 0,
                testsCompleted: 0,
                testsTotal: 0,
                averageScorePercent: 0,
                strengthLevel: 'average',
            });
        }
        topicMap.get(key).testsTotal += 1;
    });
    const testMap = new Map(testsData.map((t) => [t.id, t]));
    studentResults.forEach((result) => {
        var _a;
        const test = testMap.get(result.testId);
        if (!test)
            return;
        const key = test.topic;
        const subjectName = (_a = subjectMap.get(test.subjectId)) !== null && _a !== void 0 ? _a : 'Bilinmeyen';
        if (!topicMap.has(key)) {
            topicMap.set(key, {
                topic: key,
                subjectName,
                completionPercent: 0,
                testsCompleted: 0,
                testsTotal: 0,
                averageScorePercent: 0,
                strengthLevel: 'average',
            });
        }
        const tp = topicMap.get(key);
        tp.testsCompleted += 1;
        const totalResultsForTopic = studentResults.filter((r) => {
            const t = testMap.get(r.testId);
            return (t === null || t === void 0 ? void 0 : t.topic) === key;
        });
        tp.averageScorePercent =
            totalResultsForTopic.length === 0
                ? 0
                : Math.round(totalResultsForTopic.reduce((sum, r) => sum + r.scorePercent, 0) /
                    totalResultsForTopic.length);
        const completedAtStr = result.completedAt.toISOString();
        if (!tp.lastActivityDate ||
            new Date(completedAtStr).getTime() > new Date(tp.lastActivityDate).getTime()) {
            tp.lastActivityDate = completedAtStr;
        }
    });
    const topics = Array.from(topicMap.values()).map((tp) => {
        const completionPercent = tp.testsTotal === 0
            ? 0
            : Math.min(100, Math.round((tp.testsCompleted / tp.testsTotal) * 100));
        let strengthLevel = 'average';
        if (tp.averageScorePercent < 50)
            strengthLevel = 'weak';
        else if (tp.averageScorePercent >= 75)
            strengthLevel = 'strong';
        return { ...tp, completionPercent, strengthLevel };
    });
    const totalTestsCompleted = topics.reduce((sum, t) => sum + t.testsCompleted, 0);
    const totalQuestionsSolved = studentResults.reduce((sum, r) => sum + r.answers.length, 0);
    const averageScorePercent = studentResults.length === 0
        ? 0
        : Math.round(studentResults.reduce((sum, r) => sum + r.scorePercent, 0) /
            studentResults.length);
    const overallCompletionPercent = topics.length === 0
        ? 0
        : Math.round(topics.reduce((sum, t) => sum + t.completionPercent, 0) / topics.length);
    return res.json({
        topics,
        overallCompletionPercent,
        totalTestsCompleted,
        totalQuestionsSolved,
        averageScorePercent,
    });
});
// Rozetler – tüm rozetler ve ilerleme durumu
router.get('/badges', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    try {
        const badges = await (0, badgeService_1.getStudentBadgeProgress)(studentId);
        return res.json({ badges });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('[STUDENT_BADGES]', error);
        return res.status(500).json({
            error: error instanceof Error
                ? error.message
                : 'Rozetler yüklenirken bir hata oluştu',
        });
    }
});
// Focus Zone – odak seansı tamamlandığında XP kaydet
router.post('/focus-session', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a;
    const studentId = req.user.id;
    const xp = typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.xp) === 'number' ? Math.min(9999, Math.max(0, Math.round(req.body.xp))) : 50;
    try {
        const client = db_1.prisma;
        if (client.studentFocusSession) {
            await client.studentFocusSession.create({
                data: { studentId, xpEarned: xp },
            });
        }
        return res.json({ success: true, xp });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('[STUDENT_FOCUS_SESSION]', error);
        return res.status(500).json({
            error: error instanceof Error ? error.message : 'Focus seansı kaydedilemedi',
        });
    }
});
// İçerik listesi (tüm içerikler) - öğrenci için watchRecord dahil
router.get('/contents', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const availableContents = await db_1.prisma.contentItem.findMany({
        include: {
            classGroups: { select: { classGroupId: true } },
            students: { select: { studentId: true } },
            watchRecords: {
                where: { studentId },
                take: 1,
            },
        },
    });
    return res.json(availableContents.map((c) => {
        var _a, _b;
        const watchRecord = c.watchRecords[0];
        return {
            id: c.id,
            title: c.title,
            description: (_a = c.description) !== null && _a !== void 0 ? _a : undefined,
            type: c.type,
            subjectId: c.subjectId,
            topic: c.topic,
            gradeLevel: c.gradeLevel,
            durationMinutes: (_b = c.durationMinutes) !== null && _b !== void 0 ? _b : undefined,
            tags: c.tags,
            url: c.url,
            assignedToClassIds: c.classGroups.map((g) => g.classGroupId),
            assignedToStudentIds: c.students.map((s) => s.studentId),
            watchRecord: watchRecord
                ? {
                    watchedSeconds: watchRecord.watchedSeconds,
                    completed: watchRecord.completed,
                    lastWatchedAt: watchRecord.lastWatchedAt.toISOString(),
                }
                : undefined,
        };
    }));
});
// İzlenme ilerleyişi güncelleme
router.post('/contents/:id/watch', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a;
    const studentId = req.user.id;
    const contentId = String(req.params.id);
    const content = await db_1.prisma.contentItem.findUnique({ where: { id: contentId } });
    if (!content) {
        return res.status(404).json({ error: 'İçerik bulunamadı' });
    }
    const watchedSeconds = (_a = req.body.watchedSeconds) !== null && _a !== void 0 ? _a : 0;
    const completed = !!req.body.completed;
    const record = await db_1.prisma.watchRecord.upsert({
        where: {
            contentId_studentId: { contentId, studentId },
        },
        create: {
            contentId,
            studentId,
            watchedSeconds,
            completed,
            lastWatchedAt: new Date(),
        },
        update: {
            watchedSeconds,
            completed: completed || undefined,
            lastWatchedAt: new Date(),
        },
    });
    return res.json({
        id: record.id,
        contentId: record.contentId,
        studentId: record.studentId,
        watchedSeconds: record.watchedSeconds,
        completed: record.completed,
        lastWatchedAt: record.lastWatchedAt.toISOString(),
    });
});
// Zaman serisi grafik verileri (basit günlük özet)
router.get('/progress/charts', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const now = new Date();
    const days = 7;
    const dailyMap = new Map();
    for (let i = 0; i < days; i += 1) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyMap.set(key, {
            date: key,
            questionsSolved: 0,
            testsCompleted: 0,
            averageScore: 0,
            studyMinutes: 0,
        });
    }
    const [studentResults, studentWatch] = await Promise.all([
        db_1.prisma.testResult.findMany({
            where: { studentId },
            include: { answers: true },
        }),
        db_1.prisma.watchRecord.findMany({ where: { studentId } }),
    ]);
    studentResults.forEach((r) => {
        const key = r.completedAt.toISOString().slice(0, 10);
        const entry = dailyMap.get(key);
        if (!entry)
            return;
        entry.testsCompleted += 1;
        entry.questionsSolved += r.answers.length;
        const sameDayResults = studentResults.filter((x) => x.completedAt.toISOString().slice(0, 10) === key);
        entry.averageScore =
            sameDayResults.length === 0
                ? 0
                : Math.round(sameDayResults.reduce((sum, x) => sum + x.scorePercent, 0) /
                    sameDayResults.length);
    });
    studentWatch.forEach((w) => {
        const key = w.lastWatchedAt.toISOString().slice(0, 10);
        const entry = dailyMap.get(key);
        if (!entry)
            return;
        entry.studyMinutes += Math.round(w.watchedSeconds / 60);
    });
    const dailyData = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    return res.json({ dailyData });
});
// Mesajlar (gönderen ve alıcı isimleriyle)
router.get('/messages', (0, auth_1.authenticate)('student'), async (req, res) => {
    const userId = req.user.id;
    const messagesData = await db_1.prisma.message.findMany({
        where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    });
    const userIds = [...new Set(messagesData.flatMap((m) => [m.fromUserId, m.toUserId]))];
    const users = await db_1.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    return res.json(messagesData.map((m) => {
        var _a, _b, _c, _d, _e, _f;
        return ({
            id: m.id,
            fromUserId: m.fromUserId,
            toUserId: m.toUserId,
            studentId: (_a = m.studentId) !== null && _a !== void 0 ? _a : undefined,
            subject: (_b = m.subject) !== null && _b !== void 0 ? _b : undefined,
            text: m.text,
            attachments: (_c = m.attachments) !== null && _c !== void 0 ? _c : undefined,
            read: m.read,
            readAt: (_d = m.readAt) === null || _d === void 0 ? void 0 : _d.toISOString(),
            createdAt: m.createdAt.toISOString(),
            fromUserName: (_e = userMap.get(m.fromUserId)) !== null && _e !== void 0 ? _e : m.fromUserId,
            toUserName: (_f = userMap.get(m.toUserId)) !== null && _f !== void 0 ? _f : m.toUserId,
        });
    }));
});
// Öğrencinin mesaj gönderebileceği öğretmen listesi
router.get('/teachers', (0, auth_1.authenticate)('student'), async (_req, res) => {
    const teachersData = await db_1.prisma.user.findMany({
        where: { role: 'teacher' },
        select: { id: true, name: true, email: true },
    });
    return res.json(teachersData);
});
// Yeni mesaj gönderme
router.post('/messages', (0, auth_1.authenticate)('student'), async (req, res) => {
    const fromUserId = req.user.id;
    const { toUserId, text } = req.body;
    if (!toUserId || !text) {
        return res.status(400).json({ error: 'toUserId ve text alanları zorunludur' });
    }
    const message = await db_1.prisma.message.create({
        data: { fromUserId, toUserId, text, read: false },
    });
    await db_1.prisma.notification.create({
        data: {
            userId: toUserId,
            type: 'message_received',
            title: 'Yeni mesajınız var',
            body: 'Öğrenciden yeni bir mesaj aldınız.',
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
});
// Toplantılar
router.get('/meetings', (0, auth_1.authenticate)('student'), async (req, res) => {
    const userId = req.user.id;
    const userMeetings = await db_1.prisma.meeting.findMany({
        where: {
            students: { some: { studentId: userId } },
            // Bu öğrenci için koçluk seansına bağlı toplantıları hariç tut
            coachingSessions: {
                none: {
                    studentId: userId,
                },
            },
        },
        include: {
            students: { select: { studentId: true } },
            parents: { select: { parentId: true } },
        },
    });
    return res.json(userMeetings.map((m) => ({
        id: m.id,
        type: m.type,
        title: m.title,
        teacherId: m.teacherId,
        studentIds: m.students.map((s) => s.studentId),
        parentIds: m.parents.map((p) => p.parentId),
        scheduledAt: m.scheduledAt.toISOString(),
        durationMinutes: m.durationMinutes,
        meetingUrl: m.meetingUrl,
    })));
});
// Canlı derse katıl (öğrenci)
router.post('/meetings/:id/join-live', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const meetingId = String(req.params.id);
    const meeting = await db_1.prisma.meeting.findUnique({
        where: { id: meetingId },
        include: { students: { select: { studentId: true } } },
    });
    if (!meeting) {
        return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }
    const isParticipant = meeting.students.some((s) => s.studentId === studentId);
    if (!isParticipant) {
        return res.status(403).json({ error: 'Bu toplantıya katılma yetkiniz yok' });
    }
    const now = Date.now();
    const scheduledAtMs = new Date(meeting.scheduledAt).getTime();
    const meetingEndMs = scheduledAtMs + meeting.durationMinutes * 60 * 1000;
    const windowStartMs = scheduledAtMs - 10 * 60 * 1000; // 10 dk önce katılıma izin
    if (now < windowStartMs) {
        return res.status(400).json({
            error: 'Bu seans henüz başlamadı. En erken seans saatinden 10 dakika önce katılabilirsiniz.',
        });
    }
    if (now > meetingEndMs) {
        return res.status(400).json({
            error: 'Bu seansın katılım süresi sona erdi.',
        });
    }
    // Canlı dersin açılması sadece öğretmen tarafından yapılabilsin.
    // Öğretmen yayını başlatmadıysa (roomId henüz yoksa) hata döndür.
    if (!meeting.roomId) {
        return res
            .status(409)
            .json({ error: 'Bu canlı ders henüz öğretmen tarafından başlatılmadı.' });
    }
    const roomId = meeting.roomId;
    const token = await (0, livekit_1.createLiveKitToken)({
        roomName: roomId,
        identity: studentId,
        name: req.user.name,
        isTeacher: false,
    });
    return res.json({
        mode: 'internal',
        provider: 'internal_webrtc',
        url: (0, livekit_1.getLiveKitUrl)(),
        roomId,
        token,
    });
});
// Bildirimler
router.get('/notifications', (0, auth_1.authenticate)('student'), async (req, res) => {
    const userId = req.user.id;
    const readFilter = req.query.read;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const where = { userId };
    if (readFilter === 'true')
        where.read = true;
    else if (readFilter === 'false')
        where.read = false;
    const userNotifications = await db_1.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit && limit > 0 ? limit : undefined,
    });
    return res.json(userNotifications.map((n) => {
        var _a, _b, _c;
        return ({
            id: n.id,
            userId: n.userId,
            type: n.type,
            title: n.title,
            body: n.body,
            read: n.read,
            relatedEntityType: (_a = n.relatedEntityType) !== null && _a !== void 0 ? _a : undefined,
            relatedEntityId: (_b = n.relatedEntityId) !== null && _b !== void 0 ? _b : undefined,
            readAt: (_c = n.readAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
            createdAt: n.createdAt.toISOString(),
        });
    }));
});
router.get('/notifications/unread-count', (0, auth_1.authenticate)('student'), async (req, res) => {
    const userId = req.user.id;
    const count = await db_1.prisma.notification.count({
        where: { userId, read: false },
    });
    return res.json({ count });
});
router.put('/notifications/:id/read', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c;
    const userId = req.user.id;
    const id = String(req.params.id);
    const notification = await db_1.prisma.notification.findFirst({
        where: { id, userId },
    });
    if (!notification) {
        return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }
    const updated = await db_1.prisma.notification.update({
        where: { id },
        data: { read: true, readAt: new Date() },
    });
    return res.json({
        id: updated.id,
        userId: updated.userId,
        type: updated.type,
        title: updated.title,
        body: updated.body,
        read: updated.read,
        relatedEntityType: (_a = updated.relatedEntityType) !== null && _a !== void 0 ? _a : undefined,
        relatedEntityId: (_b = updated.relatedEntityId) !== null && _b !== void 0 ? _b : undefined,
        readAt: (_c = updated.readAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
        createdAt: updated.createdAt.toISOString(),
    });
});
router.put('/notifications/read-all', (0, auth_1.authenticate)('student'), async (req, res) => {
    const userId = req.user.id;
    const result = await db_1.prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true, readAt: new Date() },
    });
    return res.json({ updated: result.count });
});
// Öğrenci To-Do listesi
router.get('/todos', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const studentTodos = await db_1.prisma.todoItem.findMany({
        where: { studentId },
    });
    return res.json(studentTodos.map((t) => {
        var _a, _b, _c, _d, _e;
        return ({
            id: t.id,
            studentId: t.studentId,
            title: t.title,
            description: (_a = t.description) !== null && _a !== void 0 ? _a : undefined,
            status: t.status,
            priority: t.priority,
            createdAt: t.createdAt.toISOString(),
            plannedDate: (_b = t.plannedDate) === null || _b === void 0 ? void 0 : _b.toISOString(),
            completedAt: (_c = t.completedAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
            relatedAssignmentId: (_d = t.relatedAssignmentId) !== null && _d !== void 0 ? _d : undefined,
            relatedContentId: (_e = t.relatedContentId) !== null && _e !== void 0 ? _e : undefined,
        });
    }));
});
// Hedefler
async function computeGoalProgressInternal(studentId, goal) {
    var _a;
    const start = new Date(goal.startDate).getTime();
    const end = new Date(goal.endDate).getTime();
    const [relevantResults, testsData] = await Promise.all([
        db_1.prisma.testResult.findMany({
            where: {
                studentId,
                completedAt: { gte: new Date(start), lte: new Date(end) },
            },
            include: { answers: true },
        }),
        db_1.prisma.test.findMany(),
    ]);
    const testMap = new Map(testsData.map((t) => [t.id, t]));
    const filtered = relevantResults.filter((r) => {
        const t = testMap.get(r.testId);
        if (!t)
            return false;
        if (goal.topic && t.topic !== goal.topic)
            return false;
        return true;
    });
    let currentValue = 0;
    if (goal.type === 'weekly_questions') {
        currentValue = filtered.reduce((sum, r) => sum + r.answers.length, 0);
    }
    else if (goal.type === 'weekly_tests') {
        currentValue = filtered.length;
    }
    else if (goal.type === 'score_percent') {
        currentValue =
            filtered.length > 0
                ? Math.round(filtered.reduce((sum, r) => sum + r.scorePercent, 0) / filtered.length)
                : 0;
    }
    else if (goal.type === 'topic_completion') {
        const topicTests = testsData.filter((t) => t.topic === goal.topic);
        const completedTests = new Set(filtered.map((r) => r.testId));
        currentValue =
            topicTests.length === 0
                ? 0
                : Math.round((completedTests.size / topicTests.length) * 100);
    }
    const progressPercent = goal.type === 'topic_completion'
        ? Math.max(0, Math.min(100, currentValue))
        : goal.targetValue === 0
            ? 0
            : Math.max(0, Math.min(100, Math.round((currentValue / goal.targetValue) * 100)));
    const now = Date.now();
    let status = goal.status;
    if (status !== 'cancelled') {
        if (progressPercent >= 100)
            status = 'completed';
        else if (now > end)
            status = 'failed';
        else
            status = 'active';
    }
    const daysTotal = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
    const daysPassed = Math.max(0, Math.min(daysTotal, Math.round((now - start) / (24 * 60 * 60 * 1000))));
    const expectedPercent = daysTotal === 0 ? 100 : Math.round((daysPassed / daysTotal) * 100);
    const onTrack = progressPercent >= expectedPercent;
    const dailyProgress = [];
    filtered.forEach((r) => {
        const key = r.completedAt.toISOString().slice(0, 10);
        const inc = goal.type === 'weekly_questions' ? r.answers.length : 1;
        const existing = dailyProgress.find((p) => p.date === key);
        if (existing)
            existing.value += inc;
        else
            dailyProgress.push({ date: key, value: inc });
    });
    dailyProgress.sort((a, b) => a.date.localeCompare(b.date));
    return {
        goal: {
            id: goal.id,
            studentId: goal.studentId,
            type: goal.type,
            targetValue: goal.targetValue,
            topic: (_a = goal.topic) !== null && _a !== void 0 ? _a : undefined,
            startDate: new Date(goal.startDate).toISOString(),
            endDate: new Date(goal.endDate).toISOString(),
            status,
            createdAt: '',
            currentValue,
            progressPercent,
        },
        dailyProgress,
        onTrack,
    };
}
router.get('/goals', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const studentGoals = await db_1.prisma.goal.findMany({ where: { studentId } });
    const withComputed = [];
    for (const g of studentGoals) {
        const progress = await computeGoalProgressInternal(studentId, g);
        withComputed.push(progress.goal);
    }
    return res.json(withComputed);
});
router.post('/goals', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const { type, targetValue, startDate, endDate, topic } = req.body;
    if (!type || targetValue == null || !startDate || !endDate) {
        return res.status(400).json({
            error: 'type, targetValue, startDate ve endDate alanları zorunludur',
        });
    }
    const goal = await db_1.prisma.goal.create({
        data: {
            studentId,
            type: type,
            targetValue,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            topic: topic !== null && topic !== void 0 ? topic : undefined,
        },
    });
    const progress = await computeGoalProgressInternal(studentId, goal);
    return res.status(201).json({
        ...progress.goal,
        createdAt: goal.createdAt.toISOString(),
    });
});
router.put('/goals/:id', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const id = String(req.params.id);
    const goal = await db_1.prisma.goal.findFirst({ where: { id, studentId } });
    if (!goal) {
        return res.status(404).json({ error: 'Hedef bulunamadı' });
    }
    const { targetValue, startDate, endDate, status } = req.body;
    const updated = await db_1.prisma.goal.update({
        where: { id },
        data: {
            ...(targetValue !== undefined && { targetValue }),
            ...(startDate !== undefined && { startDate: new Date(startDate) }),
            ...(endDate !== undefined && { endDate: new Date(endDate) }),
            ...(status !== undefined && { status: status }),
        },
    });
    const progress = await computeGoalProgressInternal(studentId, updated);
    return res.json({ ...progress.goal, createdAt: updated.createdAt.toISOString() });
});
router.delete('/goals/:id', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const id = String(req.params.id);
    const goal = await db_1.prisma.goal.findFirst({ where: { id, studentId } });
    if (!goal) {
        return res.status(404).json({ error: 'Hedef bulunamadı' });
    }
    const updated = await db_1.prisma.goal.update({
        where: { id },
        data: { status: 'cancelled' },
    });
    const progress = await computeGoalProgressInternal(studentId, updated);
    return res.json({ ...progress.goal, createdAt: updated.createdAt.toISOString() });
});
router.get('/goals/:id/progress', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const id = String(req.params.id);
    const goal = await db_1.prisma.goal.findFirst({ where: { id, studentId } });
    if (!goal) {
        return res.status(404).json({ error: 'Hedef bulunamadı' });
    }
    const progress = await computeGoalProgressInternal(studentId, goal);
    return res.json(progress);
});
router.post('/todos', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d, _e;
    const studentId = req.user.id;
    const { title, description, priority, plannedDate, relatedAssignmentId, relatedContentId, } = req.body;
    if (!title) {
        return res.status(400).json({ error: 'title alanı zorunludur' });
    }
    const todo = await db_1.prisma.todoItem.create({
        data: {
            studentId,
            title,
            description,
            priority: (priority !== null && priority !== void 0 ? priority : 'medium'),
            plannedDate: plannedDate ? new Date(plannedDate) : undefined,
            relatedAssignmentId,
            relatedContentId,
        },
    });
    return res.status(201).json({
        id: todo.id,
        studentId: todo.studentId,
        title: todo.title,
        description: (_a = todo.description) !== null && _a !== void 0 ? _a : undefined,
        status: todo.status,
        priority: todo.priority,
        createdAt: todo.createdAt.toISOString(),
        plannedDate: (_b = todo.plannedDate) === null || _b === void 0 ? void 0 : _b.toISOString(),
        completedAt: (_c = todo.completedAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
        relatedAssignmentId: (_d = todo.relatedAssignmentId) !== null && _d !== void 0 ? _d : undefined,
        relatedContentId: (_e = todo.relatedContentId) !== null && _e !== void 0 ? _e : undefined,
    });
});
router.put('/todos/:id', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d, _e;
    const studentId = req.user.id;
    const id = String(req.params.id);
    const todo = await db_1.prisma.todoItem.findFirst({ where: { id, studentId } });
    if (!todo) {
        return res.status(404).json({ error: 'To-Do bulunamadı' });
    }
    const { title, description, status, priority, plannedDate } = req.body;
    const updateData = {};
    if (title !== undefined)
        updateData.title = title;
    if (description !== undefined)
        updateData.description = description;
    if (priority !== undefined)
        updateData.priority = priority;
    if (plannedDate !== undefined)
        updateData.plannedDate = new Date(plannedDate);
    if (status !== undefined) {
        updateData.status = status;
        if (status === 'completed' && !todo.completedAt) {
            updateData.completedAt = new Date();
        }
    }
    const updated = await db_1.prisma.todoItem.update({
        where: { id },
        data: updateData,
    });
    return res.json({
        id: updated.id,
        studentId: updated.studentId,
        title: updated.title,
        description: (_a = updated.description) !== null && _a !== void 0 ? _a : undefined,
        status: updated.status,
        priority: updated.priority,
        createdAt: updated.createdAt.toISOString(),
        plannedDate: (_b = updated.plannedDate) === null || _b === void 0 ? void 0 : _b.toISOString(),
        completedAt: (_c = updated.completedAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
        relatedAssignmentId: (_d = updated.relatedAssignmentId) !== null && _d !== void 0 ? _d : undefined,
        relatedContentId: (_e = updated.relatedContentId) !== null && _e !== void 0 ? _e : undefined,
    });
});
router.put('/todos/:id/complete', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d, _e;
    const studentId = req.user.id;
    const id = String(req.params.id);
    const todo = await db_1.prisma.todoItem.findFirst({ where: { id, studentId } });
    if (!todo) {
        return res.status(404).json({ error: 'To-Do bulunamadı' });
    }
    const updated = await db_1.prisma.todoItem.update({
        where: { id },
        data: { status: 'completed', completedAt: new Date() },
    });
    return res.json({
        id: updated.id,
        studentId: updated.studentId,
        title: updated.title,
        description: (_a = updated.description) !== null && _a !== void 0 ? _a : undefined,
        status: updated.status,
        priority: updated.priority,
        createdAt: updated.createdAt.toISOString(),
        plannedDate: (_b = updated.plannedDate) === null || _b === void 0 ? void 0 : _b.toISOString(),
        completedAt: (_c = updated.completedAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
        relatedAssignmentId: (_d = updated.relatedAssignmentId) !== null && _d !== void 0 ? _d : undefined,
        relatedContentId: (_e = updated.relatedContentId) !== null && _e !== void 0 ? _e : undefined,
    });
});
router.delete('/todos/:id', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d, _e;
    const studentId = req.user.id;
    const id = String(req.params.id);
    const todo = await db_1.prisma.todoItem.findFirst({ where: { id, studentId } });
    if (!todo) {
        return res.status(404).json({ error: 'To-Do bulunamadı' });
    }
    await db_1.prisma.todoItem.delete({ where: { id } });
    return res.json({
        id: todo.id,
        studentId: todo.studentId,
        title: todo.title,
        description: (_a = todo.description) !== null && _a !== void 0 ? _a : undefined,
        status: todo.status,
        priority: todo.priority,
        createdAt: todo.createdAt.toISOString(),
        plannedDate: (_b = todo.plannedDate) === null || _b === void 0 ? void 0 : _b.toISOString(),
        completedAt: (_c = todo.completedAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
        relatedAssignmentId: (_d = todo.relatedAssignmentId) !== null && _d !== void 0 ? _d : undefined,
        relatedContentId: (_e = todo.relatedContentId) !== null && _e !== void 0 ? _e : undefined,
    });
});
// Takvim
router.get('/calendar', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const startDate = req.query.startDate
        ? new Date(String(req.query.startDate))
        : new Date();
    const endDate = req.query.endDate
        ? new Date(String(req.query.endDate))
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const events = [];
    const now = new Date();
    const [studentAssignments, studentResults, studentMeetings] = await Promise.all([
        db_1.prisma.assignment.findMany({
            where: {
                students: { some: { studentId } },
                dueDate: { gte: startDate, lte: endDate },
            },
        }),
        db_1.prisma.testResult.findMany({
            where: { studentId },
            select: { assignmentId: true },
        }),
        db_1.prisma.meeting.findMany({
            where: {
                students: { some: { studentId } },
                coachingSessions: {
                    none: {
                        studentId,
                    },
                },
            },
        }),
    ]);
    const completedAssignmentIds = new Set(studentResults.map((r) => r.assignmentId));
    studentAssignments.forEach((assignment) => {
        const dueDate = assignment.dueDate;
        let status = 'pending';
        if (dueDate < now)
            status = 'overdue';
        else if (completedAssignmentIds.has(assignment.id))
            status = 'completed';
        events.push({
            id: `assignment-${assignment.id}`,
            type: 'assignment',
            title: assignment.title,
            startDate: dueDate.toISOString(),
            status,
            color: status === 'overdue' ? '#e74c3c' : status === 'completed' ? '#27ae60' : '#3498db',
            relatedId: assignment.id,
            ...(assignment.description ? { description: assignment.description } : {}),
        });
    });
    studentMeetings.forEach((meeting) => {
        const meetingStart = meeting.scheduledAt;
        if (meetingStart >= startDate && meetingStart <= endDate) {
            const meetingEnd = new Date(meetingStart.getTime() + meeting.durationMinutes * 60 * 1000);
            events.push({
                id: `meeting-${meeting.id}`,
                type: 'meeting',
                title: meeting.title,
                startDate: meetingStart.toISOString(),
                endDate: meetingEnd.toISOString(),
                description: `${meeting.durationMinutes} dakika`,
                status: meetingStart < now ? 'completed' : 'pending',
                color: '#9b59b6',
                relatedId: meeting.id,
            });
        }
    });
    const typeFilter = req.query.type;
    const statusFilter = req.query.status;
    let filteredEvents = events;
    if (typeFilter) {
        filteredEvents = filteredEvents.filter((e) => e.type === typeFilter);
    }
    if (statusFilter) {
        filteredEvents = filteredEvents.filter((e) => e.status === statusFilter);
    }
    // Tarihe göre sıralama
    filteredEvents.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return res.json({
        events: filteredEvents,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        viewType: req.query.viewType || 'month',
    });
});
exports.default = router;
//# sourceMappingURL=routes.student.js.map
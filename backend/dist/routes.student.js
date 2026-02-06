"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const genai_1 = require("@google/genai");
const auth_1 = require("./auth");
const db_1 = require("./db");
const livekit_1 = require("./livekit");
const router = express_1.default.Router();
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
router.post('/ai/chat', (0, auth_1.authenticate)('student'), async (req, res) => {
    const { message, history, imageBase64, imageMimeType } = req.body;
    const trimmedMessage = message === null || message === void 0 ? void 0 : message.trim();
    if (!trimmedMessage && !(imageBase64 && imageBase64.trim())) {
        return res
            .status(400)
            .json({ error: 'Metin veya görsel içeren bir mesaj gönderilmelidir' });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res
            .status(500)
            .json({ error: 'GEMINI_API_KEY ayarlı değil' });
    }
    const messageWithImage = {
        role: 'user',
        content: trimmedMessage,
        imageBase64,
        imageMimeType,
    };
    const contents = toGeminiContents(history !== null && history !== void 0 ? history : [], messageWithImage);
    const hasImageAttachment = Boolean(messageWithImage.imageBase64);
    const modelCandidates = resolveModelCandidates(hasImageAttachment);
    const systemInstruction = [
        {
            role: 'user',
            parts: [{ text: SYSTEM_PROMPT }],
        },
    ];
    const fullContents = [...systemInstruction, ...contents];
    try {
        const genAi = new genai_1.GoogleGenAI({ apiKey });
        let lastError = null;
        for (const model of modelCandidates) {
            try {
                const response = await genAi.models.generateContent({
                    model,
                    contents: fullContents,
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 512,
                    },
                });
                const reply = extractResponseText(response);
                if (!reply) {
                    return res.status(502).json({ error: 'Yanıt alınamadı' });
                }
                return res.json({ reply, model });
            }
            catch (modelError) {
                lastError = { model, error: modelError };
                if (isModelNotFoundError(modelError)) {
                    continue;
                }
                // eslint-disable-next-line no-console
                console.error('[AI_CHAT] Gemini API error', { model, error: modelError });
                return res.status(502).json({
                    error: extractErrorMessage(modelError),
                });
            }
        }
        if (lastError) {
            // eslint-disable-next-line no-console
            console.error('[AI_CHAT] Gemini API error', lastError);
            return res.status(502).json({
                error: extractErrorMessage(lastError.error),
            });
        }
        return res.status(502).json({ error: 'Yapay zeka yanıt veremedi' });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AI_CHAT] Gemini API request failed', error);
        return res.status(500).json({
            error: 'Yapay zeka servisine bağlanılamadı',
        });
    }
});
// Görev listesi
router.get('/assignments', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const studentAssignments = await db_1.prisma.assignment.findMany({
        where: { students: { some: { studentId } } },
        include: { students: { select: { studentId: true } } },
    });
    return res.json(studentAssignments.map((a) => {
        var _a, _b, _c, _d;
        return ({
            id: a.id,
            title: a.title,
            description: (_a = a.description) !== null && _a !== void 0 ? _a : undefined,
            testId: (_b = a.testId) !== null && _b !== void 0 ? _b : undefined,
            contentId: (_c = a.contentId) !== null && _c !== void 0 ? _c : undefined,
            classId: (_d = a.classId) !== null && _d !== void 0 ? _d : undefined,
            assignedStudentIds: a.students.map((s) => s.studentId),
            dueDate: a.dueDate.toISOString(),
            points: a.points,
        });
    }));
});
// Bekleyen ödevler (canlı ders için)
router.get('/assignments/pending', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const now = new Date();
    const pendingAssignments = await db_1.prisma.assignmentStudent.findMany({
        where: {
            studentId,
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
        var _a, _b, _c;
        return ({
            id: as.assignment.id,
            title: as.assignment.title,
            description: (_a = as.assignment.description) !== null && _a !== void 0 ? _a : undefined,
            dueDate: as.assignment.dueDate.toISOString(),
            points: as.assignment.points,
            testId: (_b = as.assignment.testId) !== null && _b !== void 0 ? _b : undefined,
            contentId: (_c = as.assignment.contentId) !== null && _c !== void 0 ? _c : undefined,
        });
    }));
});
// Ödevi tamamla
router.post('/assignments/:id/complete', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a;
    const studentId = req.user.id;
    const assignmentId = String(req.params.id);
    const { submittedInLiveClass } = req.body;
    const assignmentStudent = await db_1.prisma.assignmentStudent.findUnique({
        where: {
            assignmentId_studentId: {
                assignmentId,
                studentId
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
            status: 'completed',
            completedAt: new Date(),
            submittedInLiveClass: submittedInLiveClass !== null && submittedInLiveClass !== void 0 ? submittedInLiveClass : false
        }
    });
    return res.json({
        success: true,
        assignmentId: updated.assignmentId,
        studentId: updated.studentId,
        status: updated.status,
        completedAt: (_a = updated.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString()
    });
});
// Görev detayı
router.get('/assignments/:id', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b, _c, _d;
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
            classId: (_d = assignment.classId) !== null && _d !== void 0 ? _d : undefined,
            assignedStudentIds: assignment.students.map((s) => s.studentId),
            dueDate: assignment.dueDate.toISOString(),
            points: assignment.points,
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
// Test çözümü gönderme (basitleştirilmiş)
router.post('/assignments/:id/submit', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a, _b;
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
    return res.status(201).json({
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
    });
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
            : Math.round((tp.testsCompleted / tp.testsTotal) * 100);
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
// İçerik listesi (öğrenciye atanmış)
router.get('/contents', (0, auth_1.authenticate)('student'), async (req, res) => {
    const studentId = req.user.id;
    const availableContents = await db_1.prisma.contentItem.findMany({
        where: {
            OR: [
                { students: { some: { studentId } } },
                { classGroups: { some: {} } },
            ],
        },
        include: {
            classGroups: { select: { classGroupId: true } },
            students: { select: { studentId: true } },
        },
    });
    return res.json(availableContents.map((c) => {
        var _a, _b;
        return ({
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
        });
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
        where: { students: { some: { studentId: userId } } },
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
            where: { students: { some: { studentId } } },
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
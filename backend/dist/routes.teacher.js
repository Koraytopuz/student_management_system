"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const genai_1 = require("@google/genai");
const pdfkit_1 = __importDefault(require("pdfkit"));
const exceljs_1 = __importDefault(require("exceljs"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("./auth");
const db_1 = require("./db");
const livekit_1 = require("./livekit");
const router = express_1.default.Router();
const USER_CONFIGURED_GEMINI_MODEL = (_a = process.env.GEMINI_MODEL) === null || _a === void 0 ? void 0 : _a.trim();
const DEFAULT_MODEL = 'gemini-3-flash-preview';
const TEACHER_SYSTEM_PROMPT = "Rolün: 20 yıllık deneyime sahip, soru bankası yazarlığı yapmış bir başöğretmen asistanı. Görevin: Kullanıcı (Öğretmen) sana 'Sınıf Seviyesi', 'Konu', 'Soru Sayısı' ve 'Zorluk Derecesi' (Kolay/Orta/Zor) verecek. Sen bu verilere göre hatasız bir test hazırlayacaksın.\n\n" +
    'Kurallar:\n\n' +
    '• Sorular Bloom Taksonomisi\'ne göre belirtilen zorluk seviyesine uygun tasarlanmalıdır (örneğin zor seviye analiz/sentez içermeli).\n' +
    '• Soru köklerini **kalın** yaz.\n' +
    '• Şıkları A), B), C), D) biçiminde alt alta yaz; lise seviyesi belirtildiyse E) şıkkını ekle.\n' +
    '• Tüm sorular tamamlandıktan sonra `---` çizgisi çek ve "Cevap Anahtarı ve Öğretmen Notları" başlığı altında hem doğru şıkları hem de soruların ölçtüğü kazanımları yaz.\n' +
    '• Daima Türkçe konuş.';
function resolveTeacherModelCandidates() {
    if (USER_CONFIGURED_GEMINI_MODEL) {
        return [USER_CONFIGURED_GEMINI_MODEL];
    }
    return [DEFAULT_MODEL];
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
function toGeminiContents(history, latest) {
    const sanitized = [...history, latest]
        .filter((item) => item.content && item.content.trim().length > 0)
        .slice(-8)
        .map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content.trim() }],
    }));
    return sanitized;
}
async function generatePdfFromText(text) {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({ margin: 50 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.fontSize(12).text(text, { align: 'left' });
        doc.end();
    });
}
async function generateExcelFromText(text) {
    const workbook = new exceljs_1.default.Workbook();
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
const projectRoot = path_1.default.join(__dirname, '..', '..');
const frontendPublicDir = path_1.default.join(projectRoot, 'frontend', 'public');
const publicVideosDir = path_1.default.join(frontendPublicDir, 'videos');
const publicPdfsDir = path_1.default.join(frontendPublicDir, 'pdfs');
const uploadsTempDir = path_1.default.join(__dirname, '..', 'uploads', 'tmp');
[publicVideosDir, publicPdfsDir, uploadsTempDir].forEach((dir) => {
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
});
const videoUpload = (0, multer_1.default)({
    dest: uploadsTempDir,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
    },
});
// Öğretmen dashboard özeti
router.get('/dashboard', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const teacherClasses = await db_1.prisma.classGroup.findMany({
        where: { teacherId },
        include: { students: { include: { student: true } } },
    });
    const teacherStudentIds = teacherClasses.flatMap((c) => c.students.map((s) => s.studentId));
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentResults = await db_1.prisma.testResult.findMany({
        where: {
            studentId: { in: teacherStudentIds },
            completedAt: { gte: last7Days },
        },
        orderBy: { completedAt: 'asc' },
    });
    const averageScoreLast7Days = recentResults.length === 0
        ? 0
        : Math.round(recentResults.reduce((sum, r) => sum + r.scorePercent, 0) / recentResults.length);
    const testsAssignedThisWeek = await db_1.prisma.assignment.count({
        where: {
            createdAt: { gte: last7Days },
            testId: { not: null },
        },
    });
    // Son aktivitelerde öğrenci id ve test id yerine insan okunur isimler göster
    const studentIdsForNames = [...new Set(recentResults.map((r) => r.studentId))];
    const testIdsForTitles = [...new Set(recentResults.map((r) => r.testId))];
    const [studentsForNames, testsForTitles] = await Promise.all([
        db_1.prisma.user.findMany({
            where: { id: { in: studentIdsForNames } },
            select: { id: true, name: true },
        }),
        db_1.prisma.test.findMany({
            where: { id: { in: testIdsForTitles } },
            select: { id: true, title: true },
        }),
    ]);
    const studentNameMap = new Map(studentsForNames.map((s) => [s.id, s.name]));
    const testTitleMap = new Map(testsForTitles.map((t) => [t.id, t.title]));
    const recentActivity = recentResults
        .slice(-5)
        .map((r) => {
        var _a, _b;
        const studentName = (_a = studentNameMap.get(r.studentId)) !== null && _a !== void 0 ? _a : 'Bilinmeyen Öğrenci';
        const testTitle = (_b = testTitleMap.get(r.testId)) !== null && _b !== void 0 ? _b : 'Bilinmeyen Test';
        return `Öğrenci ${studentName} ${r.scorePercent}% skorla "${testTitle}" testini tamamladı`;
    });
    const summary = {
        totalStudents: teacherStudentIds.length,
        testsAssignedThisWeek,
        averageScoreLast7Days,
        recentActivity,
    };
    return res.json(summary);
});
router.post('/ai/chat', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const { message, history, format } = req.body;
    const trimmed = message === null || message === void 0 ? void 0 : message.trim();
    if (!trimmed) {
        return res.status(400).json({ error: 'message alanı zorunludur' });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY ayarlı değil' });
    }
    const contents = toGeminiContents(history !== null && history !== void 0 ? history : [], { role: 'user', content: trimmed });
    const systemInstruction = [
        {
            role: 'user',
            parts: [{ text: TEACHER_SYSTEM_PROMPT }],
        },
    ];
    const requestedFormat = typeof format === 'string' ? format.toLowerCase() : undefined;
    const genAi = new genai_1.GoogleGenAI({ apiKey });
    const modelCandidates = resolveTeacherModelCandidates();
    try {
        let lastError = null;
        for (const model of modelCandidates) {
            try {
                const response = await genAi.models.generateContent({
                    model,
                    contents: [...systemInstruction, ...contents],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: 768,
                    },
                });
                const reply = extractResponseText(response);
                if (!reply) {
                    return res.status(502).json({ error: 'Yanıt alınamadı' });
                }
                let attachment = null;
                if (requestedFormat === 'pdf') {
                    const buffer = await generatePdfFromText(reply);
                    attachment = {
                        filename: `soru-paketi-${Date.now()}.pdf`,
                        mimeType: 'application/pdf',
                        buffer,
                    };
                }
                else if (requestedFormat === 'xlsx' || requestedFormat === 'xls' || requestedFormat === 'excel') {
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
            }
            catch (error) {
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
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.error('[TEACHER_AI] Gemini API request failed', error);
        return res.status(500).json({ error: 'Yapay zeka servisine bağlanılamadı' });
    }
});
router.get('/announcements', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const items = await db_1.prisma.teacherAnnouncement.findMany({
        where: { teacherId },
        orderBy: { createdAt: 'desc' },
    });
    return res.json(items.map((a) => {
        var _a;
        return ({
            id: a.id,
            teacherId: a.teacherId,
            title: a.title,
            message: a.message,
            status: a.status,
            createdAt: a.createdAt.toISOString(),
            scheduledDate: (_a = a.scheduledDate) === null || _a === void 0 ? void 0 : _a.toISOString(),
        });
    }));
});
router.post('/announcements', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    var _a;
    const teacherId = req.user.id;
    const { title, message, scheduledDate } = req.body;
    if (!title || !message) {
        return res.status(400).json({ error: 'title ve message alanları zorunludur' });
    }
    const announcement = await db_1.prisma.teacherAnnouncement.create({
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
        scheduledDate: (_a = announcement.scheduledDate) === null || _a === void 0 ? void 0 : _a.toISOString(),
    });
});
// Öğrenci listesi
router.get('/students', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const teacherClasses = await db_1.prisma.classGroup.findMany({
        where: { teacherId },
        include: { students: { include: { student: true } } },
    });
    const studentIds = new Set(teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)));
    const teacherStudents = await db_1.prisma.user.findMany({
        where: { id: { in: [...studentIds] }, role: 'student' },
        select: { id: true, name: true, email: true, gradeLevel: true, classId: true },
    });
    return res.json(teacherStudents.map((s) => {
        var _a, _b;
        return ({
            id: s.id,
            name: s.name,
            email: s.email,
            role: 'student',
            gradeLevel: (_a = s.gradeLevel) !== null && _a !== void 0 ? _a : '',
            classId: (_b = s.classId) !== null && _b !== void 0 ? _b : '',
        });
    }));
});
// Veli listesi (öğretmenin sınıflarındaki öğrencilerin velileri)
router.get('/parents', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const teacherClasses = await db_1.prisma.classGroup.findMany({
        where: { teacherId },
        include: { students: { select: { studentId: true } } },
    });
    const teacherStudentIds = new Set(teacherClasses.flatMap((c) => c.students.map((s) => s.studentId)));
    const parentStudents = await db_1.prisma.parentStudent.findMany({
        where: { studentId: { in: [...teacherStudentIds] } },
        include: { parent: { select: { id: true, name: true, email: true } } },
    });
    const parentIds = [...new Set(parentStudents.map((ps) => ps.parentId))];
    const parentsData = await db_1.prisma.user.findMany({
        where: { id: { in: parentIds }, role: 'parent' },
        include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(parentsData.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: 'parent',
        studentIds: p.parentStudents.map((ps) => ps.studentId),
    })));
});
// Bireysel öğrenci profili
router.get('/students/:id', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    var _a, _b;
    const id = String(req.params.id);
    const student = await db_1.prisma.user.findFirst({
        where: { id, role: 'student' },
        select: { id: true, name: true, email: true, gradeLevel: true, classId: true },
    });
    if (!student) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    const [assignmentsData, studentResults, studentWatch] = await Promise.all([
        db_1.prisma.assignment.findMany({
            where: { students: { some: { studentId: id } } },
            include: { students: { select: { studentId: true } } },
        }),
        db_1.prisma.testResult.findMany({ where: { studentId: id } }),
        db_1.prisma.watchRecord.findMany({ where: { studentId: id } }),
    ]);
    const assignmentsForApi = assignmentsData.map((a) => {
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
    });
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
        answers: [],
    }));
    return res.json({
        student: {
            id: student.id,
            name: student.name,
            email: student.email,
            role: 'student',
            gradeLevel: (_a = student.gradeLevel) !== null && _a !== void 0 ? _a : '',
            classId: (_b = student.classId) !== null && _b !== void 0 ? _b : '',
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
});
// İçerik listesi
router.get('/contents', (0, auth_1.authenticate)('teacher'), async (_req, res) => {
    const list = await db_1.prisma.contentItem.findMany({
        include: {
            classGroups: { select: { classGroupId: true } },
            students: { select: { studentId: true } },
        },
    });
    return res.json(list.map((c) => {
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
// Test listesi
router.get('/tests', (0, auth_1.authenticate)('teacher'), async (_req, res) => {
    const list = await db_1.prisma.test.findMany({
        include: { questions: { select: { id: true }, orderBy: { orderIndex: 'asc' } } },
    });
    return res.json(list.map((t) => ({
        id: t.id,
        title: t.title,
        subjectId: t.subjectId,
        topic: t.topic,
        questionIds: t.questions.map((q) => q.id),
        createdByTeacherId: t.createdByTeacherId,
    })));
});
// Soru bankası listesi
router.get('/questions', (0, auth_1.authenticate)('teacher'), async (_req, res) => {
    const list = await db_1.prisma.question.findMany({ orderBy: { orderIndex: 'asc' } });
    return res.json(list.map((q) => {
        var _a, _b, _c;
        return ({
            id: q.id,
            testId: q.testId,
            text: q.text,
            type: q.type,
            choices: (_a = q.choices) !== null && _a !== void 0 ? _a : undefined,
            correctAnswer: (_b = q.correctAnswer) !== null && _b !== void 0 ? _b : undefined,
            solutionExplanation: (_c = q.solutionExplanation) !== null && _c !== void 0 ? _c : undefined,
            topic: q.topic,
            difficulty: q.difficulty,
        });
    }));
});
// Yeni içerik oluşturma
router.post('/contents', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    var _a, _b;
    const { title, description, type, subjectId, topic, gradeLevel, durationMinutes, tags, url, } = req.body;
    if (!title || !type || !subjectId || !topic || !gradeLevel || !url) {
        return res.status(400).json({
            error: 'title, type, subjectId, topic, gradeLevel ve url alanları zorunludur',
        });
    }
    const tagArray = typeof tags === 'string'
        ? tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : tags !== null && tags !== void 0 ? tags : [];
    const content = await db_1.prisma.contentItem.create({
        data: {
            title,
            description,
            type: type,
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
        description: (_a = content.description) !== null && _a !== void 0 ? _a : undefined,
        type: content.type,
        subjectId: content.subjectId,
        topic: content.topic,
        gradeLevel: content.gradeLevel,
        durationMinutes: (_b = content.durationMinutes) !== null && _b !== void 0 ? _b : undefined,
        tags: content.tags,
        url: content.url,
        assignedToClassIds: [],
        assignedToStudentIds: [],
    });
});
// Video yükleme (öğretmen içerikleri için)
router.post('/contents/upload-video', (0, auth_1.authenticate)('teacher'), videoUpload.single('file'), (req, res) => {
    const uploadedFile = req.file;
    if (!uploadedFile) {
        return res.status(400).json({ error: 'Video dosyası gereklidir' });
    }
    // Dosyayı anlamlı bir isimle yeniden adlandır ve frontend/public/videos altına taşı
    const original = uploadedFile.originalname || 'video.mp4';
    const safeName = original.replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = path_1.default.join(publicVideosDir, `${Date.now()}-${safeName}`);
    fs_1.default.renameSync(uploadedFile.path, targetPath);
    const relativeUrl = `/videos/${path_1.default.basename(targetPath)}`;
    return res.status(201).json({ url: relativeUrl });
});
// Yeni test oluşturma
router.post('/tests', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const { title, subjectId, topic } = req.body;
    if (!title || !subjectId || !topic) {
        return res
            .status(400)
            .json({ error: 'title, subjectId ve topic zorunludur' });
    }
    const test = await db_1.prisma.test.create({
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
});
// Yeni görev / assignment oluşturma
router.post('/assignments', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    var _a, _b, _c, _d;
    const { title, description, testId, contentId, classId, dueDate, points } = req.body;
    if (!title || (!testId && !contentId) || !dueDate || points == null) {
        return res.status(400).json({
            error: 'title, (testId veya contentId), dueDate ve points alanları zorunludur',
        });
    }
    let studentIds = [];
    if (classId) {
        const classStudents = await db_1.prisma.classGroupStudent.findMany({
            where: { classGroupId: classId },
            select: { studentId: true },
        });
        studentIds = classStudents.map((s) => s.studentId);
    }
    else {
        const allStudents = await db_1.prisma.user.findMany({
            where: { role: 'student' },
            select: { id: true },
        });
        studentIds = allStudents.map((s) => s.id);
    }
    const assignment = await db_1.prisma.assignment.create({
        data: {
            title,
            description,
            testId: testId !== null && testId !== void 0 ? testId : undefined,
            contentId: contentId !== null && contentId !== void 0 ? contentId : undefined,
            classId: classId !== null && classId !== void 0 ? classId : undefined,
            dueDate: new Date(dueDate),
            points: points !== null && points !== void 0 ? points : 100,
            students: {
                create: studentIds.map((studentId) => ({ studentId })),
            },
        },
        include: { students: { select: { studentId: true } } },
    });
    return res.status(201).json({
        id: assignment.id,
        title: assignment.title,
        description: (_a = assignment.description) !== null && _a !== void 0 ? _a : undefined,
        testId: (_b = assignment.testId) !== null && _b !== void 0 ? _b : undefined,
        contentId: (_c = assignment.contentId) !== null && _c !== void 0 ? _c : undefined,
        classId: (_d = assignment.classId) !== null && _d !== void 0 ? _d : undefined,
        assignedStudentIds: assignment.students.map((s) => s.studentId),
        dueDate: assignment.dueDate.toISOString(),
        points: assignment.points,
    });
});
// Görev listesi
router.get('/assignments', (0, auth_1.authenticate)('teacher'), async (_req, res) => {
    const list = await db_1.prisma.assignment.findMany({
        include: { students: { select: { studentId: true } } },
    });
    return res.json(list.map((a) => {
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
// Mesajlar (gönderen ve alıcı isimleriyle)
router.get('/messages', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const userId = req.user.id;
    const messagesData = await db_1.prisma.message.findMany({
        where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    });
    const userIds = [
        ...new Set(messagesData.flatMap((m) => [m.fromUserId, m.toUserId])),
    ];
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
// Yeni mesaj gönderme
router.post('/messages', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const fromUserId = req.user.id;
    const { toUserId, text } = req.body;
    if (!toUserId || !text) {
        return res
            .status(400)
            .json({ error: 'toUserId ve text alanları zorunludur' });
    }
    const message = await db_1.prisma.message.create({
        data: { fromUserId, toUserId, text, read: false },
    });
    await db_1.prisma.notification.create({
        data: {
            userId: toUserId,
            type: 'message_received',
            title: 'Yeni mesajınız var',
            body: 'Öğretmenden yeni bir mesaj aldınız.',
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
router.get('/meetings', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const userId = req.user.id;
    const meetingsData = await db_1.prisma.meeting.findMany({
        where: { teacherId: userId },
        include: {
            students: { select: { studentId: true } },
            parents: { select: { parentId: true } },
        },
    });
    return res.json(meetingsData.map((m) => ({
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
// Toplantı güncelleme
router.put('/meetings/:id', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const meetingId = String(req.params.id);
    const existing = await db_1.prisma.meeting.findUnique({
        where: { id: meetingId },
    });
    if (!existing) {
        return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }
    if (existing.teacherId !== teacherId) {
        return res.status(403).json({ error: 'Bu toplantıyı düzenleme yetkiniz yok' });
    }
    const { title, scheduledAt, durationMinutes, } = req.body;
    if (!title && !scheduledAt && durationMinutes == null) {
        return res.status(400).json({ error: 'Güncellenecek en az bir alan gönderilmelidir' });
    }
    const updateData = {};
    if (title !== undefined)
        updateData.title = title;
    if (scheduledAt !== undefined)
        updateData.scheduledAt = new Date(scheduledAt);
    if (durationMinutes != null)
        updateData.durationMinutes = durationMinutes;
    const meeting = await db_1.prisma.meeting.update({
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
});
// Toplantı silme
router.delete('/meetings/:id', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const meetingId = String(req.params.id);
    const existing = await db_1.prisma.meeting.findUnique({
        where: { id: meetingId },
    });
    if (!existing) {
        return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }
    if (existing.teacherId !== teacherId) {
        return res.status(403).json({ error: 'Bu toplantıyı silme yetkiniz yok' });
    }
    await db_1.prisma.meeting.delete({ where: { id: meetingId } });
    // Frontend tarafında JSON bekleniyor, bu yüzden 200 + body döndürüyoruz
    return res.json({ success: true });
});
// Yeni toplantı planlama
router.post('/meetings', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const { type, title, studentIds, parentIds, scheduledAt, durationMinutes, meetingUrl, } = req.body;
    if (!type || !title || !scheduledAt || !durationMinutes) {
        return res.status(400).json({
            error: 'type, title, scheduledAt ve durationMinutes alanları zorunludur',
        });
    }
    const meeting = await db_1.prisma.meeting.create({
        data: {
            type: type,
            title,
            teacherId,
            scheduledAt: new Date(scheduledAt),
            durationMinutes,
            // Harici link desteği ileride tekrar eklenecekse meetingUrl kullanılabilir.
            meetingUrl: meetingUrl !== null && meetingUrl !== void 0 ? meetingUrl : '',
            students: {
                create: (studentIds !== null && studentIds !== void 0 ? studentIds : []).map((studentId) => ({ studentId })),
            },
            parents: {
                create: (parentIds !== null && parentIds !== void 0 ? parentIds : []).map((parentId) => ({ parentId })),
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
});
// Canlı dersi başlat (öğretmen)
router.post('/meetings/:id/start-live', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const meetingId = String(req.params.id);
    const meeting = await db_1.prisma.meeting.findUnique({
        where: { id: meetingId },
    });
    if (!meeting) {
        return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }
    if (meeting.teacherId !== teacherId) {
        return res.status(403).json({ error: 'Bu toplantıyı başlatma yetkiniz yok' });
    }
    const roomId = (0, livekit_1.buildRoomName)(meeting.id);
    // Öğretmenin başlattığı canlı ders için oda bilgisini kaydet
    // Not: Prisma Client tipleri henüz roomId alanını içermiyor olabilir,
    // bu nedenle tip hatasını önlemek için any ile daraltıyoruz.
    const existingRoomId = meeting.roomId;
    if (!existingRoomId) {
        await db_1.prisma.meeting.update({
            where: { id: meetingId },
            data: { roomId },
        });
    }
    const token = await (0, livekit_1.createLiveKitToken)({
        roomName: roomId,
        identity: teacherId,
        name: req.user.name,
        isTeacher: true,
    });
    // GEÇİCİ: LiveKit token inceleme
    // eslint-disable-next-line no-console
    console.log('[LIVEKIT_TOKEN]', token);
    return res.json({
        mode: 'internal',
        provider: 'internal_webrtc',
        url: (0, livekit_1.getLiveKitUrl)(),
        roomId,
        token,
    });
});
// Bildirimler
router.get('/notifications', (0, auth_1.authenticate)('teacher'), async (req, res) => {
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
// Okunmamış bildirim sayısı
router.get('/notifications/unread-count', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const userId = req.user.id;
    const count = await db_1.prisma.notification.count({
        where: { userId, read: false },
    });
    return res.json({ count });
});
// Bildirimi okundu olarak işaretle
router.put('/notifications/:id/read', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    var _a, _b, _c;
    const userId = req.user.id;
    const notificationId = String(req.params.id);
    const notification = await db_1.prisma.notification.findFirst({
        where: { id: notificationId, userId },
    });
    if (!notification) {
        return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }
    const updated = await db_1.prisma.notification.update({
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
        relatedEntityType: (_a = updated.relatedEntityType) !== null && _a !== void 0 ? _a : undefined,
        relatedEntityId: (_b = updated.relatedEntityId) !== null && _b !== void 0 ? _b : undefined,
        readAt: (_c = updated.readAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
        createdAt: updated.createdAt.toISOString(),
    });
});
// Tüm bildirimleri okundu olarak işaretle
router.put('/notifications/read-all', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const userId = req.user.id;
    const result = await db_1.prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true, readAt: new Date() },
    });
    return res.json({ updated: result.count, success: true });
});
// Bildirimi sil
router.delete('/notifications/:id', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const userId = req.user.id;
    const notificationId = String(req.params.id);
    const notification = await db_1.prisma.notification.findFirst({
        where: { id: notificationId, userId },
    });
    if (!notification) {
        return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }
    await db_1.prisma.notification.delete({ where: { id: notificationId } });
    return res.json({ success: true });
});
// Takvim
router.get('/calendar', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const startDate = req.query.startDate
        ? new Date(String(req.query.startDate))
        : new Date();
    const endDate = req.query.endDate
        ? new Date(String(req.query.endDate))
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const events = [];
    const [assignmentsData, meetingsData] = await Promise.all([
        db_1.prisma.assignment.findMany({
            where: { dueDate: { gte: startDate, lte: endDate } },
        }),
        db_1.prisma.meeting.findMany({
            where: {
                teacherId,
                scheduledAt: { gte: startDate, lte: endDate },
            },
        }),
    ]);
    const now = new Date();
    assignmentsData.forEach((assignment) => {
        var _a;
        const dueDate = assignment.dueDate;
        events.push({
            id: `assignment-${assignment.id}`,
            type: 'assignment',
            title: assignment.title,
            startDate: dueDate.toISOString(),
            description: (_a = assignment.description) !== null && _a !== void 0 ? _a : '',
            status: dueDate < now ? 'overdue' : 'pending',
            color: dueDate < now ? '#e74c3c' : '#3498db',
            relatedId: assignment.id,
        });
    });
    meetingsData.forEach((meeting) => {
        const meetingStart = meeting.scheduledAt;
        const meetingEnd = new Date(meetingStart.getTime() + meeting.durationMinutes * 60 * 1000);
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
    const typeFilter = req.query.type;
    const statusFilter = req.query.status;
    let filteredEvents = events;
    if (typeFilter) {
        filteredEvents = filteredEvents.filter((e) => e.type === typeFilter);
    }
    if (statusFilter) {
        filteredEvents = filteredEvents.filter((e) => e.status === statusFilter);
    }
    filteredEvents.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return res.json({
        events: filteredEvents,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        viewType: req.query.viewType || 'month',
    });
});
// Canlı ders için ödev durumları
router.get('/assignments/live-status', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    // Aktif ödevleri bul
    const assignments = await db_1.prisma.assignmentStudent.findMany({
        where: {
            assignment: {
                dueDate: { gte: new Date() }
            }
        },
        select: {
            assignmentId: true,
            studentId: true,
            status: true,
            completedAt: true,
            assignment: {
                select: { title: true, dueDate: true }
            }
        }
    });
    return res.json(assignments.map(a => ({
        assignmentId: a.assignmentId,
        studentId: a.studentId,
        status: a.status,
        completedAt: a.completedAt,
        title: a.assignment.title
    })));
});
exports.default = router;
//# sourceMappingURL=routes.teacher.js.map
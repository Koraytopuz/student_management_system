"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const auth_1 = require("./auth");
const db_1 = require("./db");
const router = express_1.default.Router();
const createHomeworkSchema = zod_1.z.object({
    studentId: zod_1.z.string().min(1),
    lessonId: zod_1.z.string().min(1),
    title: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
    dueDate: zod_1.z.string().datetime(),
});
// POST /assignments/create – Öğretmenin belirli bir öğrenciye ödev ataması
router.post('/create', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    var _a;
    const teacherId = req.user.id;
    const parseResult = createHomeworkSchema.safeParse(req.body);
    if (!parseResult.success) {
        return res.status(400).json({ error: 'Geçersiz ödev verisi', details: parseResult.error.flatten() });
    }
    const { studentId, lessonId, title, description, dueDate } = parseResult.data;
    const [student, subject] = await Promise.all([
        db_1.prisma.user.findFirst({ where: { id: studentId, role: 'student' } }),
        db_1.prisma.subject.findUnique({ where: { id: lessonId } }),
    ]);
    if (!student) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    if (!subject) {
        return res.status(404).json({ error: 'Ders (subject) bulunamadı' });
    }
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
        return res.status(400).json({ error: 'Geçersiz teslim tarihi' });
    }
    const homework = await db_1.prisma.homework.create({
        data: {
            title,
            description: description !== null && description !== void 0 ? description : null,
            dueDate: due,
            status: 'PENDING',
            studentId,
            teacherId,
            subjectId: lessonId,
        },
        include: {
            student: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true } },
        },
    });
    return res.status(201).json({
        id: homework.id,
        title: homework.title,
        description: (_a = homework.description) !== null && _a !== void 0 ? _a : undefined,
        dueDate: homework.dueDate.toISOString(),
        status: homework.status,
        studentId: homework.studentId,
        studentName: homework.student.name,
        teacherId: homework.teacherId,
        teacherName: homework.teacher.name,
        lessonId: homework.subjectId,
        lessonName: homework.subject.name,
        createdAt: homework.createdAt.toISOString(),
    });
});
// GET /assignments/student/:studentId – Öğrenci veya veli view
router.get('/student/:studentId', (0, auth_1.authenticateMultiple)(['student', 'parent']), async (req, res) => {
    const requestedStudentId = String(req.params.studentId);
    const user = req.user;
    if (user.role === 'student' && user.id !== requestedStudentId) {
        return res.status(403).json({ error: 'Kendi ödevlerinizi görebilirsiniz' });
    }
    if (user.role === 'parent') {
        const allowedIds = user.studentIds;
        if (!allowedIds || !allowedIds.includes(requestedStudentId)) {
            return res.status(403).json({ error: 'Bu öğrenci için yetkiniz yok' });
        }
    }
    const homeworks = await db_1.prisma.homework.findMany({
        where: { studentId: requestedStudentId },
        orderBy: { dueDate: 'asc' },
        include: {
            teacher: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true } },
        },
    });
    const now = Date.now();
    return res.json(homeworks.map((h) => {
        var _a;
        const isLate = h.status === 'PENDING' && h.dueDate.getTime() < now;
        const effectiveStatus = isLate ? 'LATE' : h.status;
        return {
            id: h.id,
            title: h.title,
            description: (_a = h.description) !== null && _a !== void 0 ? _a : undefined,
            dueDate: h.dueDate.toISOString(),
            status: effectiveStatus,
            studentId: h.studentId,
            teacherId: h.teacherId,
            teacherName: h.teacher.name,
            lessonId: h.subjectId,
            lessonName: h.subject.name,
            createdAt: h.createdAt.toISOString(),
        };
    }));
});
// PATCH /assignments/status/:id – Öğrencinin ödev durumunu güncellemesi
router.patch('/status/:id', (0, auth_1.authenticate)('student'), async (req, res) => {
    var _a;
    const studentId = req.user.id;
    const homeworkId = String(req.params.id);
    const homework = await db_1.prisma.homework.findFirst({
        where: { id: homeworkId, studentId },
    });
    if (!homework) {
        return res.status(404).json({ error: 'Ödev bulunamadı' });
    }
    const nextStatusRaw = (_a = req.body.status) !== null && _a !== void 0 ? _a : 'COMPLETED';
    const upper = String(nextStatusRaw).toUpperCase();
    if (!['PENDING', 'COMPLETED', 'LATE'].includes(upper)) {
        return res.status(400).json({ error: 'Geçersiz durum' });
    }
    const updated = await db_1.prisma.homework.update({
        where: { id: homeworkId },
        data: { status: upper },
    });
    return res.json({
        id: updated.id,
        status: updated.status,
        completed: updated.status === 'COMPLETED',
    });
});
// GET /assignments/teacher/my-assignments – Öğretmenin atadığı tüm bireysel ödevler
router.get('/teacher/my-assignments', (0, auth_1.authenticate)('teacher'), async (req, res) => {
    const teacherId = req.user.id;
    const homeworks = await db_1.prisma.homework.findMany({
        where: { teacherId },
        orderBy: { createdAt: 'desc' },
        include: {
            student: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true } },
        },
    });
    return res.json(homeworks.map((h) => {
        var _a;
        return ({
            id: h.id,
            title: h.title,
            description: (_a = h.description) !== null && _a !== void 0 ? _a : undefined,
            dueDate: h.dueDate.toISOString(),
            status: h.status,
            studentId: h.studentId,
            studentName: h.student.name,
            lessonId: h.subjectId,
            lessonName: h.subject.name,
            createdAt: h.createdAt.toISOString(),
        });
    }));
});
exports.default = router;
//# sourceMappingURL=routes.assignmentRoutes.js.map
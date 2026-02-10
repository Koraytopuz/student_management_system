"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const auth_1 = require("./auth");
const db_1 = require("./db");
const router = express_1.default.Router();
function toTeacher(u) {
    return { id: u.id, name: u.name, email: u.email, role: 'teacher', subjectAreas: u.subjectAreas };
}
function toStudent(u) {
    var _a, _b;
    return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: 'student',
        gradeLevel: (_a = u.gradeLevel) !== null && _a !== void 0 ? _a : '',
        classId: (_b = u.classId) !== null && _b !== void 0 ? _b : '',
    };
}
function toParent(u, studentIds) {
    return { id: u.id, name: u.name, email: u.email, role: 'parent', studentIds };
}
// Yönetici dashboard için özet
router.get('/summary', (0, auth_1.authenticate)('admin'), async (_req, res) => {
    const [teacherCount, studentCount, parentCount, assignmentCount] = await Promise.all([
        db_1.prisma.user.count({ where: { role: 'teacher' } }),
        db_1.prisma.user.count({ where: { role: 'student' } }),
        db_1.prisma.user.count({ where: { role: 'parent' } }),
        db_1.prisma.assignment.count(),
    ]);
    return res.json({
        teacherCount,
        studentCount,
        parentCount,
        assignmentCount,
    });
});
router.get('/teachers', (0, auth_1.authenticate)('admin'), async (_req, res) => {
    const list = await db_1.prisma.user.findMany({
        where: { role: 'teacher' },
        select: { id: true, name: true, email: true, subjectAreas: true },
    });
    res.json(list.map(toTeacher));
});
router.get('/students', (0, auth_1.authenticate)('admin'), async (_req, res) => {
    const list = await db_1.prisma.user.findMany({
        where: { role: 'student' },
        select: { id: true, name: true, email: true, gradeLevel: true, classId: true },
    });
    res.json(list.map(toStudent));
});
router.get('/parents', (0, auth_1.authenticate)('admin'), async (_req, res) => {
    const list = await db_1.prisma.user.findMany({
        where: { role: 'parent' },
        include: { parentStudents: { select: { studentId: true } } },
    });
    res.json(list.map((u) => toParent(u, u.parentStudents.map((ps) => ps.studentId))));
});
router.post('/teachers', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const { name, email, subjectAreas, password } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
    }
    const exists = await db_1.prisma.user.findFirst({ where: { email, role: 'teacher' } });
    if (exists) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğretmen var' });
    }
    const areasArray = typeof subjectAreas === 'string'
        ? subjectAreas.split(',').map((s) => s.trim()).filter(Boolean)
        : subjectAreas !== null && subjectAreas !== void 0 ? subjectAreas : [];
    const passwordHash = await bcrypt_1.default.hash(password, 10);
    const created = await db_1.prisma.user.create({
        data: {
            name,
            email,
            role: 'teacher',
            passwordHash,
            subjectAreas: areasArray,
        },
        select: { id: true, name: true, email: true, subjectAreas: true },
    });
    return res.status(201).json(toTeacher(created));
});
router.delete('/teachers/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const id = String(req.params.id);
    const existing = await db_1.prisma.user.findFirst({ where: { id, role: 'teacher' } });
    if (!existing) {
        return res.status(404).json({ error: 'Öğretmen bulunamadı' });
    }
    await db_1.prisma.user.delete({ where: { id } });
    return res.json(toTeacher(existing));
});
router.post('/students', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const { name, email, gradeLevel, classId, password } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
    }
    const exists = await db_1.prisma.user.findFirst({ where: { email, role: 'student' } });
    if (exists) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğrenci var' });
    }
    const passwordHash = await bcrypt_1.default.hash(password, 10);
    const created = await db_1.prisma.user.create({
        data: {
            name,
            email,
            role: 'student',
            passwordHash,
            gradeLevel: gradeLevel !== null && gradeLevel !== void 0 ? gradeLevel : '',
            classId: classId !== null && classId !== void 0 ? classId : '',
        },
        select: { id: true, name: true, email: true, gradeLevel: true, classId: true },
    });
    return res.status(201).json(toStudent(created));
});
router.delete('/students/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const id = String(req.params.id);
    const existing = await db_1.prisma.user.findFirst({ where: { id, role: 'student' } });
    if (!existing) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    await db_1.prisma.parentStudent.deleteMany({ where: { studentId: id } });
    await db_1.prisma.user.delete({ where: { id } });
    return res.json(toStudent(existing));
});
router.post('/parents', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
    }
    const exists = await db_1.prisma.user.findFirst({ where: { email, role: 'parent' } });
    if (exists) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı veli var' });
    }
    const passwordHash = await bcrypt_1.default.hash(password, 10);
    const created = await db_1.prisma.user.create({
        data: {
            name,
            email,
            role: 'parent',
            passwordHash,
        },
        select: { id: true, name: true, email: true },
    });
    return res.status(201).json(toParent(created, []));
});
router.delete('/parents/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const id = String(req.params.id);
    const existing = await db_1.prisma.user.findFirst({
        where: { id, role: 'parent' },
        include: { parentStudents: { select: { studentId: true } } },
    });
    if (!existing) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    await db_1.prisma.user.delete({ where: { id } });
    return res.json(toParent(existing, existing.parentStudents.map((ps) => ps.studentId)));
});
router.post('/parents/:id/assign-student', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const parentId = String(req.params.id);
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ error: 'studentId zorunludur' });
    }
    const parent = await db_1.prisma.user.findFirst({
        where: { id: parentId, role: 'parent' },
        include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    const studentExists = await db_1.prisma.user.findFirst({
        where: { id: studentId, role: 'student' },
    });
    if (!studentExists) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    await db_1.prisma.parentStudent.upsert({
        where: {
            parentId_studentId: { parentId, studentId },
        },
        create: { parentId, studentId },
        update: {},
    });
    const updated = await db_1.prisma.user.findFirst({
        where: { id: parentId },
        include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(toParent(updated, updated.parentStudents.map((ps) => ps.studentId)));
});
router.post('/parents/:id/unassign-student', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const parentId = String(req.params.id);
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ error: 'studentId zorunludur' });
    }
    const parent = await db_1.prisma.user.findFirst({
        where: { id: parentId, role: 'parent' },
        include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    await db_1.prisma.parentStudent.deleteMany({
        where: { parentId, studentId },
    });
    const updated = await db_1.prisma.user.findFirst({
        where: { id: parentId },
        include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(toParent(updated, updated.parentStudents.map((ps) => ps.studentId)));
});
// Şikayet / öneriler (öğrenci + veli)
router.get('/complaints', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const list = await db_1.prisma.complaint.findMany({
        where: status ? { status: status } : undefined,
        include: {
            fromUser: { select: { id: true, name: true, email: true, role: true } },
            aboutTeacher: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });
    return res.json(list.map((c) => {
        var _a, _b, _c;
        return ({
            id: c.id,
            fromRole: c.fromRole,
            fromUser: c.fromUser,
            aboutTeacher: (_a = c.aboutTeacher) !== null && _a !== void 0 ? _a : undefined,
            subject: c.subject,
            body: c.body,
            status: c.status,
            createdAt: c.createdAt.toISOString(),
            reviewedAt: (_b = c.reviewedAt) === null || _b === void 0 ? void 0 : _b.toISOString(),
            closedAt: (_c = c.closedAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
        });
    }));
});
// Bildirimler (şikayet/öneri vb.)
router.get('/notifications', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const userId = req.user.id;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const list = await db_1.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit > 0 ? limit : 50,
    });
    return res.json(list.map((n) => {
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
router.put('/notifications/:id/read', (0, auth_1.authenticate)('admin'), async (req, res) => {
    var _a;
    const userId = req.user.id;
    const id = String(req.params.id);
    const n = await db_1.prisma.notification.findFirst({ where: { id, userId } });
    if (!n)
        return res.status(404).json({ error: 'Bildirim bulunamadı' });
    const updated = await db_1.prisma.notification.update({
        where: { id },
        data: { read: true, readAt: new Date() },
    });
    return res.json({
        id: updated.id,
        read: updated.read,
        readAt: (_a = updated.readAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
    });
});
router.put('/complaints/:id', (0, auth_1.authenticate)('admin'), async (req, res) => {
    var _a, _b, _c, _d, _e;
    const id = String(req.params.id);
    const { status } = req.body;
    if (!status) {
        return res.status(400).json({ error: 'status zorunludur (open|reviewed|closed)' });
    }
    const existing = await db_1.prisma.complaint.findUnique({ where: { id } });
    if (!existing) {
        return res.status(404).json({ error: 'Kayıt bulunamadı' });
    }
    const now = new Date();
    const updated = await db_1.prisma.complaint.update({
        where: { id },
        data: {
            status: status,
            reviewedAt: status === 'reviewed' ? ((_a = existing.reviewedAt) !== null && _a !== void 0 ? _a : now) : existing.reviewedAt,
            closedAt: status === 'closed' ? ((_b = existing.closedAt) !== null && _b !== void 0 ? _b : now) : existing.closedAt,
        },
        include: {
            fromUser: { select: { id: true, name: true, email: true, role: true } },
            aboutTeacher: { select: { id: true, name: true, email: true, role: true } },
        },
    });
    return res.json({
        id: updated.id,
        fromRole: updated.fromRole,
        fromUser: updated.fromUser,
        aboutTeacher: (_c = updated.aboutTeacher) !== null && _c !== void 0 ? _c : undefined,
        subject: updated.subject,
        body: updated.body,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
        reviewedAt: (_d = updated.reviewedAt) === null || _d === void 0 ? void 0 : _d.toISOString(),
        closedAt: (_e = updated.closedAt) === null || _e === void 0 ? void 0 : _e.toISOString(),
    });
});
// Koçluk seansları - admin görünümü (sadece okuma)
router.get('/coaching', (0, auth_1.authenticate)('admin'), async (req, res) => {
    const { studentId, teacherId } = req.query;
    const where = {};
    if (studentId)
        where.studentId = String(studentId);
    if (teacherId)
        where.teacherId = String(teacherId);
    const sessions = await db_1.prisma.coachingSession.findMany({
        where,
        orderBy: { date: 'desc' },
    });
    return res.json(sessions.map((s) => {
        var _a;
        return ({
            id: s.id,
            studentId: s.studentId,
            teacherId: s.teacherId,
            date: s.date.toISOString(),
            durationMinutes: (_a = s.durationMinutes) !== null && _a !== void 0 ? _a : undefined,
            title: s.title,
            notes: s.notes,
            mode: s.mode,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
        });
    }));
});
exports.default = router;
//# sourceMappingURL=routes.admin.js.map
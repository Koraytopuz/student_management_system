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
exports.default = router;
//# sourceMappingURL=routes.admin.js.map
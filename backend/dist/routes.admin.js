"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const data_1 = require("./data");
const router = express_1.default.Router();
// Yönetici dashboard için özet (şimdilik sadece sayılar)
router.get('/summary', (0, auth_1.authenticate)('admin'), (req, res) => {
    return res.json({
        teacherCount: data_1.teachers.length,
        studentCount: data_1.students.length,
        parentCount: data_1.parents.length,
        assignmentCount: data_1.assignments.length,
    });
});
// --- Listeleme uçları ---
router.get('/teachers', (0, auth_1.authenticate)('admin'), (_req, res) => {
    res.json(data_1.teachers);
});
router.get('/students', (0, auth_1.authenticate)('admin'), (_req, res) => {
    res.json(data_1.students);
});
router.get('/parents', (0, auth_1.authenticate)('admin'), (_req, res) => {
    res.json(data_1.parents);
});
// --- Öğretmen ekleme / silme ---
router.post('/teachers', (0, auth_1.authenticate)('admin'), (req, res) => {
    const { name, email, subjectAreas } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }
    const exists = data_1.teachers.some((t) => t.email === email);
    if (exists) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğretmen var' });
    }
    const areasArray = typeof subjectAreas === 'string'
        ? subjectAreas.split(',').map((s) => s.trim()).filter(Boolean)
        : subjectAreas !== null && subjectAreas !== void 0 ? subjectAreas : [];
    const teacher = {
        id: `t${Date.now()}`,
        name,
        email,
        role: 'teacher',
        subjectAreas: areasArray,
    };
    data_1.teachers.push(teacher);
    return res.status(201).json(teacher);
});
router.delete('/teachers/:id', (0, auth_1.authenticate)('admin'), (req, res) => {
    const id = String(req.params.id);
    const index = data_1.teachers.findIndex((t) => t.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Öğretmen bulunamadı' });
    }
    const [removed] = data_1.teachers.splice(index, 1);
    return res.json(removed);
});
// --- Öğrenci ekleme / silme ---
router.post('/students', (0, auth_1.authenticate)('admin'), (req, res) => {
    const { name, email, gradeLevel, classId } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }
    const exists = data_1.students.some((s) => s.email === email);
    if (exists) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğrenci var' });
    }
    const student = {
        id: `s${Date.now()}`,
        name,
        email,
        role: 'student',
        gradeLevel: gradeLevel !== null && gradeLevel !== void 0 ? gradeLevel : '',
        classId: classId !== null && classId !== void 0 ? classId : '',
    };
    data_1.students.push(student);
    return res.status(201).json(student);
});
router.delete('/students/:id', (0, auth_1.authenticate)('admin'), (req, res) => {
    const id = String(req.params.id);
    const index = data_1.students.findIndex((s) => s.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    const [removed] = data_1.students.splice(index, 1);
    // Öğrenciyi velilerin listelerinden de çıkar
    data_1.parents.forEach((p) => {
        p.studentIds = p.studentIds.filter((sid) => sid !== id);
    });
    return res.json(removed);
});
// --- Veli ekleme / silme ---
router.post('/parents', (0, auth_1.authenticate)('admin'), (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }
    const exists = data_1.parents.some((p) => p.email === email);
    if (exists) {
        return res.status(400).json({ error: 'Bu e-posta ile kayıtlı veli var' });
    }
    const parent = {
        id: `p${Date.now()}`,
        name,
        email,
        role: 'parent',
        studentIds: [],
    };
    data_1.parents.push(parent);
    return res.status(201).json(parent);
});
router.delete('/parents/:id', (0, auth_1.authenticate)('admin'), (req, res) => {
    const id = String(req.params.id);
    const index = data_1.parents.findIndex((p) => p.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    const [removed] = data_1.parents.splice(index, 1);
    return res.json(removed);
});
// --- Veliye öğrenci atama / çıkarma ---
router.post('/parents/:id/assign-student', (0, auth_1.authenticate)('admin'), (req, res) => {
    const parentId = String(req.params.id);
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ error: 'studentId zorunludur' });
    }
    const parent = data_1.parents.find((p) => p.id === parentId);
    if (!parent) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    const studentExists = data_1.students.some((s) => s.id === studentId);
    if (!studentExists) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    if (!parent.studentIds.includes(studentId)) {
        parent.studentIds.push(studentId);
    }
    return res.json(parent);
});
router.post('/parents/:id/unassign-student', (0, auth_1.authenticate)('admin'), (req, res) => {
    const parentId = String(req.params.id);
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ error: 'studentId zorunludur' });
    }
    const parent = data_1.parents.find((p) => p.id === parentId);
    if (!parent) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    parent.studentIds = parent.studentIds.filter((sid) => sid !== studentId);
    return res.json(parent);
});
exports.default = router;
//# sourceMappingURL=routes.admin.js.map
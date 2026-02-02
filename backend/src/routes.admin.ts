import express from 'express';
import { authenticate, AuthenticatedRequest } from './auth';
import {
  admins,
  assignments,
  parents,
  students,
  teachers,
} from './data';
import type { Parent, Student, Teacher } from './types';

const router = express.Router();

// Yönetici dashboard için özet (şimdilik sadece sayılar)
router.get(
  '/summary',
  authenticate('admin'),
  (req: AuthenticatedRequest, res) => {
    return res.json({
      teacherCount: teachers.length,
      studentCount: students.length,
      parentCount: parents.length,
      assignmentCount: assignments.length,
    });
  },
);

// --- Listeleme uçları ---

router.get('/teachers', authenticate('admin'), (_req, res) => {
  res.json(teachers);
});

router.get('/students', authenticate('admin'), (_req, res) => {
  res.json(students);
});

router.get('/parents', authenticate('admin'), (_req, res) => {
  res.json(parents);
});

// --- Öğretmen ekleme / silme ---

router.post(
  '/teachers',
  authenticate('admin'),
  (req: AuthenticatedRequest, res) => {
    const { name, email, subjectAreas } = req.body as {
      name?: string;
      email?: string;
      subjectAreas?: string[] | string;
    };

    if (!name || !email) {
      return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }

    const exists = teachers.some((t) => t.email === email);
    if (exists) {
      return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğretmen var' });
    }

    const areasArray: string[] =
      typeof subjectAreas === 'string'
        ? subjectAreas.split(',').map((s) => s.trim()).filter(Boolean)
        : subjectAreas ?? [];

    const teacher: Teacher = {
      id: `t${Date.now()}`,
      name,
      email,
      role: 'teacher',
      subjectAreas: areasArray,
    };

    teachers.push(teacher);
    return res.status(201).json(teacher);
  },
);

router.delete(
  '/teachers/:id',
  authenticate('admin'),
  (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const index = teachers.findIndex((t) => t.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Öğretmen bulunamadı' });
    }
    const [removed] = teachers.splice(index, 1);
    return res.json(removed);
  },
);

// --- Öğrenci ekleme / silme ---

router.post(
  '/students',
  authenticate('admin'),
  (req: AuthenticatedRequest, res) => {
    const { name, email, gradeLevel, classId } = req.body as {
      name?: string;
      email?: string;
      gradeLevel?: string;
      classId?: string;
    };

    if (!name || !email) {
      return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }

    const exists = students.some((s) => s.email === email);
    if (exists) {
      return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğrenci var' });
    }

    const student: Student = {
      id: `s${Date.now()}`,
      name,
      email,
      role: 'student',
      gradeLevel: gradeLevel ?? '',
      classId: classId ?? '',
    };

    students.push(student);
    return res.status(201).json(student);
  },
);

router.delete(
  '/students/:id',
  authenticate('admin'),
  (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const index = students.findIndex((s) => s.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    const [removed] = students.splice(index, 1);

    // Öğrenciyi velilerin listelerinden de çıkar
    parents.forEach((p) => {
      p.studentIds = p.studentIds.filter((sid) => sid !== id);
    });

    return res.json(removed);
  },
);

// --- Veli ekleme / silme ---

router.post(
  '/parents',
  authenticate('admin'),
  (req: AuthenticatedRequest, res) => {
    const { name, email } = req.body as {
      name?: string;
      email?: string;
    };

    if (!name || !email) {
      return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
    }

    const exists = parents.some((p) => p.email === email);
    if (exists) {
      return res.status(400).json({ error: 'Bu e-posta ile kayıtlı veli var' });
    }

    const parent: Parent = {
      id: `p${Date.now()}`,
      name,
      email,
      role: 'parent',
      studentIds: [],
    };

    parents.push(parent);
    return res.status(201).json(parent);
  },
);

router.delete(
  '/parents/:id',
  authenticate('admin'),
  (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const index = parents.findIndex((p) => p.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    const [removed] = parents.splice(index, 1);
    return res.json(removed);
  },
);

// --- Veliye öğrenci atama / çıkarma ---

router.post(
  '/parents/:id/assign-student',
  authenticate('admin'),
  (req: AuthenticatedRequest, res) => {
    const parentId = String(req.params.id);
    const { studentId } = req.body as { studentId?: string };

    if (!studentId) {
      return res.status(400).json({ error: 'studentId zorunludur' });
    }

    const parent = parents.find((p) => p.id === parentId);
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    const studentExists = students.some((s) => s.id === studentId);
    if (!studentExists) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }

    if (!parent.studentIds.includes(studentId)) {
      parent.studentIds.push(studentId);
    }

    return res.json(parent);
  },
);

router.post(
  '/parents/:id/unassign-student',
  authenticate('admin'),
  (req: AuthenticatedRequest, res) => {
    const parentId = String(req.params.id);
    const { studentId } = req.body as { studentId?: string };

    if (!studentId) {
      return res.status(400).json({ error: 'studentId zorunludur' });
    }

    const parent = parents.find((p) => p.id === parentId);
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    parent.studentIds = parent.studentIds.filter((sid) => sid !== studentId);
    return res.json(parent);
  },
);

export default router;


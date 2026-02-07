import express from 'express';
import bcrypt from 'bcrypt';
import { authenticate, AuthenticatedRequest } from './auth';
import { prisma } from './db';
import type { Parent, Student, Teacher } from './types';
import { UserRole } from '@prisma/client';

const router = express.Router();

function toTeacher(u: { id: string; name: string; email: string; subjectAreas: string[] }): Teacher {
  return { id: u.id, name: u.name, email: u.email, role: 'teacher', subjectAreas: u.subjectAreas };
}

function toStudent(u: {
  id: string;
  name: string;
  email: string;
  gradeLevel: string | null;
  classId: string | null;
}): Student {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: 'student',
    gradeLevel: u.gradeLevel ?? '',
    classId: u.classId ?? '',
  };
}

function toParent(
  u: { id: string; name: string; email: string },
  studentIds: string[],
): Parent {
  return { id: u.id, name: u.name, email: u.email, role: 'parent', studentIds };
}

// Yönetici dashboard için özet
router.get('/summary', authenticate('admin'), async (_req, res) => {
  const [teacherCount, studentCount, parentCount, assignmentCount] = await Promise.all([
    prisma.user.count({ where: { role: 'teacher' } }),
    prisma.user.count({ where: { role: 'student' } }),
    prisma.user.count({ where: { role: 'parent' } }),
    prisma.assignment.count(),
  ]);
  return res.json({
    teacherCount,
    studentCount,
    parentCount,
    assignmentCount,
  });
});

router.get('/teachers', authenticate('admin'), async (_req, res) => {
  const list = await prisma.user.findMany({
    where: { role: 'teacher' },
    select: { id: true, name: true, email: true, subjectAreas: true },
  });
  res.json(list.map(toTeacher));
});

router.get('/students', authenticate('admin'), async (_req, res) => {
  const list = await prisma.user.findMany({
    where: { role: 'student' },
    select: { id: true, name: true, email: true, gradeLevel: true, classId: true },
  });
  res.json(list.map(toStudent));
});

router.get('/parents', authenticate('admin'), async (_req, res) => {
  const list = await prisma.user.findMany({
    where: { role: 'parent' },
    include: { parentStudents: { select: { studentId: true } } },
  });
  res.json(
    list.map((u) =>
      toParent(u, u.parentStudents.map((ps) => ps.studentId)),
    ),
  );
});

router.post('/teachers', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const { name, email, subjectAreas, password } = req.body as {
    name?: string;
    email?: string;
    subjectAreas?: string[] | string;
    password?: string;
  };

  if (!name || !email) {
    return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
  }

  const exists = await prisma.user.findFirst({ where: { email, role: 'teacher' } });
  if (exists) {
    return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğretmen var' });
  }

  const areasArray: string[] =
    typeof subjectAreas === 'string'
      ? subjectAreas.split(',').map((s) => s.trim()).filter(Boolean)
      : subjectAreas ?? [];

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      role: 'teacher' as UserRole,
      passwordHash,
      subjectAreas: areasArray,
    },
    select: { id: true, name: true, email: true, subjectAreas: true },
  });
  return res.status(201).json(toTeacher(created));
});

router.delete('/teachers/:id', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const existing = await prisma.user.findFirst({ where: { id, role: 'teacher' } });
  if (!existing) {
    return res.status(404).json({ error: 'Öğretmen bulunamadı' });
  }
  await prisma.user.delete({ where: { id } });
  return res.json(toTeacher(existing));
});

router.post('/students', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const { name, email, gradeLevel, classId, password } = req.body as {
    name?: string;
    email?: string;
    gradeLevel?: string;
    classId?: string;
    password?: string;
  };

  if (!name || !email) {
    return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
  }

  const exists = await prisma.user.findFirst({ where: { email, role: 'student' } });
  if (exists) {
    return res.status(400).json({ error: 'Bu e-posta ile kayıtlı öğrenci var' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      role: 'student' as UserRole,
      passwordHash,
      gradeLevel: gradeLevel ?? '',
      classId: classId ?? '',
    },
    select: { id: true, name: true, email: true, gradeLevel: true, classId: true },
  });
  return res.status(201).json(toStudent(created));
});

router.delete('/students/:id', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const existing = await prisma.user.findFirst({ where: { id, role: 'student' } });
  if (!existing) {
    return res.status(404).json({ error: 'Öğrenci bulunamadı' });
  }
  await prisma.parentStudent.deleteMany({ where: { studentId: id } });
  await prisma.user.delete({ where: { id } });
  return res.json(toStudent(existing));
});

router.post('/parents', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const { name, email, password } = req.body as {
    name?: string;
    email?: string;
    password?: string;
  };

  if (!name || !email) {
    return res.status(400).json({ error: 'İsim ve e-posta zorunludur' });
  }
  if (!password || password.length < 4) {
    return res.status(400).json({ error: 'Şifre en az 4 karakter olmalıdır' });
  }

  const exists = await prisma.user.findFirst({ where: { email, role: 'parent' } });
  if (exists) {
    return res.status(400).json({ error: 'Bu e-posta ile kayıtlı veli var' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      role: 'parent' as UserRole,
      passwordHash,
    },
    select: { id: true, name: true, email: true },
  });
  return res.status(201).json(toParent(created, []));
});

router.delete('/parents/:id', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const existing = await prisma.user.findFirst({
    where: { id, role: 'parent' },
    include: { parentStudents: { select: { studentId: true } } },
  });
  if (!existing) {
    return res.status(404).json({ error: 'Veli bulunamadı' });
  }
  await prisma.user.delete({ where: { id } });
  return res.json(
    toParent(existing, existing.parentStudents.map((ps) => ps.studentId)),
  );
});

router.post(
  '/parents/:id/assign-student',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = String(req.params.id);
    const { studentId } = req.body as { studentId?: string };

    if (!studentId) {
      return res.status(400).json({ error: 'studentId zorunludur' });
    }

    const parent = await prisma.user.findFirst({
      where: { id: parentId, role: 'parent' },
      include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    const studentExists = await prisma.user.findFirst({
      where: { id: studentId, role: 'student' },
    });
    if (!studentExists) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }

    await prisma.parentStudent.upsert({
      where: {
        parentId_studentId: { parentId, studentId },
      },
      create: { parentId, studentId },
      update: {},
    });

    const updated = await prisma.user.findFirst({
      where: { id: parentId },
      include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(
      toParent(updated!, updated!.parentStudents.map((ps) => ps.studentId)),
    );
  },
);

router.post(
  '/parents/:id/unassign-student',
  authenticate('admin'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = String(req.params.id);
    const { studentId } = req.body as { studentId?: string };

    if (!studentId) {
      return res.status(400).json({ error: 'studentId zorunludur' });
    }

    const parent = await prisma.user.findFirst({
      where: { id: parentId, role: 'parent' },
      include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    await prisma.parentStudent.deleteMany({
      where: { parentId, studentId },
    });

    const updated = await prisma.user.findFirst({
      where: { id: parentId },
      include: { parentStudents: { select: { studentId: true } } },
    });
    return res.json(
      toParent(updated!, updated!.parentStudents.map((ps) => ps.studentId)),
    );
  },
);

// Şikayet / öneriler (öğrenci + veli)
router.get('/complaints', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const list = await prisma.complaint.findMany({
    where: status ? { status: status as any } : undefined,
    include: {
      fromUser: { select: { id: true, name: true, email: true, role: true } },
      aboutTeacher: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return res.json(
    list.map((c) => ({
      id: c.id,
      fromRole: c.fromRole,
      fromUser: c.fromUser,
      aboutTeacher: c.aboutTeacher ?? undefined,
      subject: c.subject,
      body: c.body,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      reviewedAt: c.reviewedAt?.toISOString(),
      closedAt: c.closedAt?.toISOString(),
    })),
  );
});

// Bildirimler (şikayet/öneri vb.)
router.get('/notifications', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
  const list = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit > 0 ? limit : 50,
  });
  return res.json(
    list.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      relatedEntityType: n.relatedEntityType ?? undefined,
      relatedEntityId: n.relatedEntityId ?? undefined,
      readAt: n.readAt?.toISOString(),
      createdAt: n.createdAt.toISOString(),
    })),
  );
});

router.put('/notifications/:id/read', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = String(req.params.id);
  const n = await prisma.notification.findFirst({ where: { id, userId } });
  if (!n) return res.status(404).json({ error: 'Bildirim bulunamadı' });
  const updated = await prisma.notification.update({
    where: { id },
    data: { read: true, readAt: new Date() },
  });
  return res.json({
    id: updated.id,
    read: updated.read,
    readAt: updated.readAt?.toISOString(),
  });
});

router.put('/complaints/:id', authenticate('admin'), async (req: AuthenticatedRequest, res) => {
  const id = String(req.params.id);
  const { status } = req.body as { status?: 'open' | 'reviewed' | 'closed' };
  if (!status) {
    return res.status(400).json({ error: 'status zorunludur (open|reviewed|closed)' });
  }
  const existing = await prisma.complaint.findUnique({ where: { id } });
  if (!existing) {
    return res.status(404).json({ error: 'Kayıt bulunamadı' });
  }
  const now = new Date();
  const updated = await prisma.complaint.update({
    where: { id },
    data: {
      status: status as any,
      reviewedAt: status === 'reviewed' ? (existing.reviewedAt ?? now) : existing.reviewedAt,
      closedAt: status === 'closed' ? (existing.closedAt ?? now) : existing.closedAt,
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
    aboutTeacher: updated.aboutTeacher ?? undefined,
    subject: updated.subject,
    body: updated.body,
    status: updated.status,
    createdAt: updated.createdAt.toISOString(),
    reviewedAt: updated.reviewedAt?.toISOString(),
    closedAt: updated.closedAt?.toISOString(),
  });
});

export default router;

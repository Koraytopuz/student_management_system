import express from 'express';
import { z } from 'zod';
import { authenticate, authenticateMultiple, type AuthenticatedRequest } from './auth';
import { prisma } from './db';

const router = express.Router();

const createHomeworkSchema = z.object({
  studentId: z.string().min(1),
  lessonId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().datetime(),
});

// POST /assignments/create – Öğretmenin belirli bir öğrenciye ödev ataması
router.post(
  '/create',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const teacherId = req.user!.id;

    const parseResult = createHomeworkSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Geçersiz ödev verisi', details: parseResult.error.flatten() });
    }

    const { studentId, lessonId, title, description, dueDate } = parseResult.data;

    const [student, subject] = await Promise.all([
      prisma.user.findFirst({ where: { id: studentId, role: 'student' } }),
      prisma.subject.findUnique({ where: { id: lessonId } }),
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

    const homework = await prisma.homework.create({
      data: {
        title,
        description: description ?? null,
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
      description: homework.description ?? undefined,
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
  },
);

// GET /assignments/student/:studentId – Öğrenci veya veli view
router.get(
  '/student/:studentId',
  authenticateMultiple(['student', 'parent']),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const requestedStudentId = String(req.params.studentId);
    const user = req.user!;

    if (user.role === 'student' && user.id !== requestedStudentId) {
      return res.status(403).json({ error: 'Kendi ödevlerinizi görebilirsiniz' });
    }

    if (user.role === 'parent') {
      const allowedIds = (user as any).studentIds as string[] | undefined;
      if (!allowedIds || !allowedIds.includes(requestedStudentId)) {
        return res.status(403).json({ error: 'Bu öğrenci için yetkiniz yok' });
      }
    }

    const homeworks = await prisma.homework.findMany({
      where: { studentId: requestedStudentId },
      orderBy: { dueDate: 'asc' },
      include: {
        teacher: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
      },
    });

    const now = Date.now();

    return res.json(
      homeworks.map((h) => {
        const isLate = h.status === 'PENDING' && h.dueDate.getTime() < now;
        const effectiveStatus = isLate ? 'LATE' : h.status;
        return {
          id: h.id,
          title: h.title,
          description: h.description ?? undefined,
          dueDate: h.dueDate.toISOString(),
          status: effectiveStatus,
          studentId: h.studentId,
          teacherId: h.teacherId,
          teacherName: h.teacher.name,
          lessonId: h.subjectId,
          lessonName: h.subject.name,
          createdAt: h.createdAt.toISOString(),
        };
      }),
    );
  },
);

// PATCH /assignments/status/:id – Öğrencinin ödev durumunu güncellemesi
router.patch(
  '/status/:id',
  authenticate('student'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const studentId = req.user!.id;
    const homeworkId = String(req.params.id);

    const homework = await prisma.homework.findFirst({
      where: { id: homeworkId, studentId },
    });

    if (!homework) {
      return res.status(404).json({ error: 'Ödev bulunamadı' });
    }

    const nextStatusRaw = (req.body as { status?: string }).status ?? 'COMPLETED';
    const upper = String(nextStatusRaw).toUpperCase();
    if (!['PENDING', 'COMPLETED', 'LATE'].includes(upper)) {
      return res.status(400).json({ error: 'Geçersiz durum' });
    }

    const updated = await prisma.homework.update({
      where: { id: homeworkId },
      data: { status: upper as any },
    });

    return res.json({
      id: updated.id,
      status: updated.status,
      completed: updated.status === 'COMPLETED',
    });
  },
);

// GET /assignments/teacher/my-assignments – Öğretmenin atadığı tüm bireysel ödevler
router.get(
  '/teacher/my-assignments',
  authenticate('teacher'),
  async (req: AuthenticatedRequest, res: express.Response) => {
    const teacherId = req.user!.id;

    const homeworks = await prisma.homework.findMany({
      where: { teacherId },
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
      },
    });

    return res.json(
      homeworks.map((h) => ({
        id: h.id,
        title: h.title,
        description: h.description ?? undefined,
        dueDate: h.dueDate.toISOString(),
        status: h.status,
        studentId: h.studentId,
        studentName: h.student.name,
        lessonId: h.subjectId,
        lessonName: h.subject.name,
        createdAt: h.createdAt.toISOString(),
      })),
    );
  },
);

export default router;


import express from 'express';
import { authenticate, AuthenticatedRequest } from './auth';
import { prisma } from './db';
import {
  ActivitySummary,
  ActivityTimeSummary,
  Alert,
  AssignmentActivitySummary,
  CalendarEvent,
  CalendarEventType,
  ContentUsageSummary,
  CustomReport,
  CustomReportRequest,
  MonthlyReport,
  ParentDashboardSummary,
  ParentDashboardSummaryStudentCard,
  ParentGoal,
  PerformanceTrend,
  StudentDetailSummary,
  TeacherFeedback,
  WeeklyReport,
} from './types';

const router = express.Router();

async function checkParentAccess(
  parentId: string,
  studentId: string,
): Promise<{ allowed: boolean; error?: string }> {
  const parent = await prisma.user.findFirst({
    where: { id: parentId, role: 'parent' },
    include: { parentStudents: { select: { studentId: true } } },
  });
  if (!parent) return { allowed: false, error: 'Veli bulunamadı' };
  const studentIds = parent.parentStudents.map((ps) => ps.studentId);
  if (!studentIds.includes(studentId)) {
    return { allowed: false, error: 'Bu öğrencinin verilerine erişim izniniz yok' };
  }
  return { allowed: true };
}

async function getStudentClassName(studentId: string): Promise<string | undefined> {
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: 'student' },
    select: { classId: true },
  });
  if (!student?.classId) return undefined;
  const classGroup = await prisma.classGroup.findUnique({
    where: { id: student.classId },
  });
  return classGroup?.name;
}

async function getAssignmentStatus(
  assignment: { id: string; testId: string | null; contentId: string | null; dueDate: Date },
  studentId: string,
): Promise<'pending' | 'in_progress' | 'completed' | 'overdue'> {
  const now = new Date();
  const dueDate = assignment.dueDate;
  const [result, watchRecord] = await Promise.all([
    assignment.testId
      ? prisma.testResult.findFirst({
          where: { assignmentId: assignment.id, studentId },
        })
      : Promise.resolve(null),
    assignment.contentId
      ? prisma.watchRecord.findUnique({
          where: { contentId_studentId: { contentId: assignment.contentId, studentId } },
        })
      : Promise.resolve(null),
  ]);

  if (assignment.testId && result) return 'completed';
  if (assignment.contentId && watchRecord?.completed) return 'completed';
  if (assignment.contentId && watchRecord && !watchRecord.completed) return 'in_progress';
  if (dueDate < now) return 'overdue';
  return 'pending';
}

// Veli dashboard özeti
router.get(
  '/dashboard',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const parent = await prisma.user.findFirst({
      where: { id: parentId, role: 'parent' },
      include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    const studentIds = parent.parentStudents.map((ps) => ps.studentId);
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const cards: ParentDashboardSummaryStudentCard[] = [];

    for (const sid of studentIds) {
      const [student, studentResults, allResults, watchRecs, studentAssignments] =
        await Promise.all([
          prisma.user.findFirst({ where: { id: sid, role: 'student' } }),
          prisma.testResult.findMany({
            where: { studentId: sid, completedAt: { gte: sevenDaysAgo } },
          }),
          prisma.testResult.findMany({ where: { studentId: sid } }),
          prisma.watchRecord.findMany({ where: { studentId: sid } }),
          prisma.assignment.findMany({
            where: { students: { some: { studentId: sid } } },
          }),
        ]);

      let pendingCount = 0;
      let overdueCount = 0;
      for (const a of studentAssignments) {
        const status = await getAssignmentStatus(a, sid);
        if (status === 'pending') pendingCount++;
        else if (status === 'overdue') overdueCount++;
      }

      const studyMinutes = watchRecs.reduce((s, w) => s + w.watchedSeconds, 0) / 60;
      const lastResult = allResults[allResults.length - 1];
      const lastWatch = watchRecs.sort((a, b) => b.lastWatchedAt.getTime() - a.lastWatchedAt.getTime())[0];
      const lastActivity =
        lastResult?.completedAt.toISOString() ?? lastWatch?.lastWatchedAt.toISOString();

      const status: 'active' | 'inactive' =
        lastActivity && new Date(lastActivity) >= threeDaysAgo ? 'active' : 'inactive';

      cards.push({
        studentId: sid,
        studentName: student?.name ?? 'Bilinmeyen öğrenci',
        gradeLevel: student?.gradeLevel ?? '',
        classId: student?.classId ?? '',
        className: (await getStudentClassName(sid)) ?? undefined,
        testsSolvedLast7Days: studentResults.length,
        averageScorePercent:
          allResults.length === 0
            ? 0
            : Math.round(
                allResults.reduce((sum, r) => sum + r.scorePercent, 0) / allResults.length,
              ),
        totalStudyMinutes: Math.round(studyMinutes),
        lastActivityDate: lastActivity,
        status,
        pendingAssignmentsCount: pendingCount,
        overdueAssignmentsCount: overdueCount,
      });
    }

    const totalTestsSolved = cards.reduce((sum, c) => sum + c.testsSolvedLast7Days, 0);
    const avgScore =
      cards.length === 0
        ? 0
        : Math.round(
            cards.reduce((sum, c) => sum + c.averageScorePercent, 0) / cards.length,
          );

    return res.json({
      children: cards,
      overallStats: {
        totalChildren: cards.length,
        totalTestsSolved,
        averageScoreAcrossAll: avgScore,
      },
    });
  },
);

// Öğrenci detay özeti
router.get(
  '/children/:id/summary',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const [student, studentResults, allResults, watchRecs, studentAssignments, contentsData, testsData, subjectsData] =
      await Promise.all([
        prisma.user.findFirst({ where: { id: studentId, role: 'student' } }),
        prisma.testResult.findMany({
          where: {
            studentId,
            completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
        prisma.testResult.findMany({ where: { studentId } }),
        prisma.watchRecord.findMany({ where: { studentId } }),
        prisma.assignment.findMany({
          where: { students: { some: { studentId } } },
        }),
        prisma.contentItem.findMany(),
        prisma.test.findMany(),
        prisma.subject.findMany(),
      ]);

    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }

    const contentMap = new Map(contentsData.map((c) => [c.id, c]));
    const testMap = new Map(testsData.map((t) => [t.id, t]));
    const subjectMap = new Map(subjectsData.map((s) => [s.id, s]));

    let pendingCount = 0;
    let overdueCount = 0;
    const upcoming: Array<{
      assignmentId: string;
      title: string;
      description?: string;
      type: 'test' | 'content' | 'mixed';
      subjectName: string;
      topic: string;
      dueDate: string;
      status: 'pending' | 'in_progress' | 'completed' | 'overdue';
      testResult?: { testId: string; correctCount: number; incorrectCount: number; blankCount: number; scorePercent: number; durationSeconds: number };
      contentProgress?: { contentId: string; watchedPercent: number; completed: boolean };
    }> = [];

    for (const a of studentAssignments) {
      const status = await getAssignmentStatus(a, studentId);
      if (status === 'pending') pendingCount++;
      else if (status === 'overdue') overdueCount++;
      if (status === 'pending' || status === 'in_progress') {
        const test = a.testId ? testMap.get(a.testId) : null;
        const content = a.contentId ? contentMap.get(a.contentId) : null;
        const subjectId = test?.subjectId ?? content?.subjectId ?? '';
        const subjectName = subjectMap.get(subjectId)?.name ?? 'Bilinmeyen';
        const [result, watchRecord] = await Promise.all([
          a.testId ? prisma.testResult.findFirst({ where: { assignmentId: a.id, studentId } }) : null,
          a.contentId ? prisma.watchRecord.findUnique({ where: { contentId_studentId: { contentId: a.contentId, studentId } } }) : null,
        ]);
        const durMin = content?.durationMinutes ?? 1;
        upcoming.push({
          assignmentId: a.id,
          title: a.title,
          description: a.description ?? undefined,
          type: a.testId && a.contentId ? 'mixed' : a.testId ? 'test' : 'content',
          subjectName,
          topic: test?.topic ?? content?.topic ?? '',
          dueDate: a.dueDate.toISOString(),
          status,
          testResult: result
            ? { testId: result.testId, correctCount: result.correctCount, incorrectCount: result.incorrectCount, blankCount: result.blankCount, scorePercent: result.scorePercent, durationSeconds: result.durationSeconds }
            : undefined,
          contentProgress: watchRecord
            ? { contentId: watchRecord.contentId, watchedPercent: watchRecord.completed ? 100 : Math.round((watchRecord.watchedSeconds / (durMin * 60)) * 100), completed: watchRecord.completed }
            : undefined,
        });
      }
    }

    const recentActivities = [
      ...allResults.slice(-5).map((r) => ({ type: 'test' as const, title: `Test tamamlandı - ${r.scorePercent}%`, date: r.completedAt.toISOString() })),
      ...watchRecs
        .sort((a, b) => b.lastWatchedAt.getTime() - a.lastWatchedAt.getTime())
        .slice(0, 3)
        .map((w) => ({ type: 'content' as const, title: contentMap.get(w.contentId)?.title ?? 'İçerik izlendi', date: w.lastWatchedAt.toISOString() })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

    const studyMinutes = watchRecs.reduce((s, w) => s + w.watchedSeconds, 0) / 60;

    return res.json({
      studentId,
      studentName: student.name,
      gradeLevel: student.gradeLevel ?? '',
      className: await getStudentClassName(studentId),
      quickStats: {
        testsSolvedLast7Days: studentResults.length,
        averageScorePercent: allResults.length === 0 ? 0 : Math.round(allResults.reduce((sum, r) => sum + r.scorePercent, 0) / allResults.length),
        totalStudyMinutes: Math.round(studyMinutes),
        pendingAssignmentsCount: pendingCount,
        overdueAssignmentsCount: overdueCount,
      },
      recentActivities,
      upcomingAssignments: upcoming.slice(0, 5),
    });
  },
);

// Aktivite zaman takibi
router.get(
  '/children/:id/activity-time',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const period = (req.query.period as string) || 'last7days';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date = new Date(now);

    if (period === 'today') {
      periodStart = new Date(now);
      periodStart.setHours(0, 0, 0, 0);
    } else if (period === 'last7days') {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'last30days') {
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (period === 'custom' && startDate && endDate) {
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
    } else {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const [studentResults, studentWatchRecords] = await Promise.all([
      prisma.testResult.findMany({
        where: {
          studentId,
          completedAt: { gte: periodStart, lte: periodEnd },
        },
      }),
      prisma.watchRecord.findMany({
        where: {
          studentId,
          lastWatchedAt: { gte: periodStart, lte: periodEnd },
        },
      }),
    ]);

    // Günlük verileri oluştur
    const dailyData: ActivityTimeSummary['dailyData'] = [];
    const dateMap = new Map<string, ActivityTimeSummary['dailyData'][0]>();

    for (
      let d = new Date(periodStart);
      d <= periodEnd;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().slice(0, 10);
      dateMap.set(dateStr, {
        date: dateStr,
        totalMinutes: 0,
        testMinutes: 0,
        contentWatchingMinutes: 0,
        activeSessionMinutes: 0,
        breakCount: 0,
      });
    }

    // Test sürelerini ekle
    studentResults.forEach((result) => {
      const dateStr = result.completedAt.toISOString().slice(0, 10);
      const dayData = dateMap.get(dateStr);
      if (dayData) {
        dayData.testMinutes += Math.round(result.durationSeconds / 60);
        dayData.totalMinutes += Math.round(result.durationSeconds / 60);
      }
    });

    // İçerik izleme sürelerini ekle
    studentWatchRecords.forEach((watch) => {
      const dateStr = watch.lastWatchedAt.toISOString().slice(0, 10);
      const dayData = dateMap.get(dateStr);
      if (dayData) {
        const minutes = Math.round(watch.watchedSeconds / 60);
        dayData.contentWatchingMinutes += minutes;
        dayData.totalMinutes += minutes;
      }
    });

    dailyData.push(...Array.from(dateMap.values()));

    const totalMinutes = dailyData.reduce((sum, d) => sum + d.totalMinutes, 0);
    const averageMinutesPerDay =
      dailyData.length > 0 ? Math.round(totalMinutes / dailyData.length) : 0;
    const mostActiveDay =
      dailyData.length > 0
        ? dailyData.reduce((max, d) =>
            d.totalMinutes > max.totalMinutes ? d : max,
          ).date
        : '';

    // Saatlik aktivite dağılımı (basitleştirilmiş)
    const activityByHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      minutes: Math.round(Math.random() * 30), // Demo için rastgele
    }));

    const summary: ActivityTimeSummary = {
      period: period as any,
      startDate: periodStart.toISOString(),
      endDate: periodEnd.toISOString(),
      dailyData,
      totalMinutes,
      averageMinutesPerDay,
      mostActiveDay,
      activityByHour,
    };

    return res.json(summary);
  },
);

// Görev aktiviteleri
router.get(
  '/children/:id/assignments',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const status = req.query.status as string;

    let studentAssignments = await prisma.assignment.findMany({
      where: { students: { some: { studentId } } },
      include: { test: true, content: true },
    });

    if (status) {
      const filtered: typeof studentAssignments = [];
      for (const a of studentAssignments) {
        const s = await getAssignmentStatus(a, studentId);
        if (s === status) filtered.push(a);
      }
      studentAssignments = filtered;
    }

    const [testsData, subjectsData, allResults] = await Promise.all([
      prisma.test.findMany(),
      prisma.subject.findMany(),
      prisma.testResult.findMany({ where: { studentId } }),
    ]);
    const testMap = new Map(testsData.map((t) => [t.id, t]));
    const subjectMap = new Map(subjectsData.map((s) => [s.id, s]));

    const assignmentItems: Array<{
      assignmentId: string;
      title: string;
      description?: string;
      type: 'test' | 'content' | 'mixed';
      subjectName: string;
      topic: string;
      dueDate: string;
      status: 'pending' | 'in_progress' | 'completed' | 'overdue';
      completedAt?: string;
      testResult?: { testId: string; correctCount: number; incorrectCount: number; blankCount: number; scorePercent: number; durationSeconds: number };
      contentProgress?: { contentId: string; watchedPercent: number; completed: boolean };
    }> = [];

    for (const a of studentAssignments) {
      const stat = await getAssignmentStatus(a, studentId);
      const test = a.testId ? testMap.get(a.testId) : null;
      const content = a.content ?? null;
      const subjectName = (test ? subjectMap.get(test.subjectId) : content ? subjectMap.get(content.subjectId) : null)?.name ?? 'Bilinmeyen';
      const result = allResults.find((r) => r.assignmentId === a.id);
      const watchRecord = a.contentId
        ? await prisma.watchRecord.findUnique({
            where: { contentId_studentId: { contentId: a.contentId, studentId } },
          })
        : null;

      assignmentItems.push({
        assignmentId: a.id,
        title: a.title,
        description: a.description ?? undefined,
        type: a.testId && a.contentId ? 'mixed' : a.testId ? 'test' : 'content',
        subjectName,
        topic: test?.topic ?? content?.topic ?? '',
        dueDate: a.dueDate.toISOString(),
        status: stat,
        completedAt: result?.completedAt.toISOString() ?? watchRecord?.lastWatchedAt.toISOString(),
        testResult: result
          ? { testId: result.testId, correctCount: result.correctCount, incorrectCount: result.incorrectCount, blankCount: result.blankCount, scorePercent: result.scorePercent, durationSeconds: result.durationSeconds }
          : undefined,
        contentProgress: watchRecord
          ? { contentId: watchRecord.contentId, watchedPercent: watchRecord.completed ? 100 : Math.round((watchRecord.watchedSeconds / ((content?.durationMinutes ?? 1) * 60)) * 100), completed: watchRecord.completed }
          : undefined,
      });
    }

    const completedCount = assignmentItems.filter((x) => x.status === 'completed').length;
    const pendingCount = assignmentItems.filter((x) => x.status === 'pending').length;
    const overdueCount = assignmentItems.filter((x) => x.status === 'overdue').length;
    const completedResults = allResults.filter((r) =>
      assignmentItems.some((a) => a.assignmentId === r.assignmentId && a.status === 'completed'),
    );
    const averageScorePercent =
      completedResults.length === 0
        ? 0
        : Math.round(completedResults.reduce((sum, r) => sum + r.scorePercent, 0) / completedResults.length);

    return res.json({
      assignments: assignmentItems,
      statistics: { totalCount: assignmentItems.length, completedCount, pendingCount, overdueCount, averageScorePercent },
    });
  },
);

// İçerik kullanımı
router.get(
  '/children/:id/content-usage',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const status = req.query.status as string;
    const subjectId = req.query.subjectId as string;

    const student = await prisma.user.findFirst({
      where: { id: studentId, role: 'student' },
    });
    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }

    const orConditions: object[] = [{ students: { some: { studentId } } }];
    if (student.classId) {
      orConditions.push({ classGroups: { some: { classGroupId: student.classId } } });
    }
    let studentContents = await prisma.contentItem.findMany({
      where: { OR: orConditions },
      include: { subject: true },
    });

    if (subjectId) {
      studentContents = studentContents.filter((c) => c.subjectId === subjectId);
    }

    const contentItems: Array<{
      contentId: string;
      title: string;
      description?: string;
      type: string;
      subjectName: string;
      topic: string;
      totalDurationMinutes: number;
      watchedDurationMinutes: number;
      watchedPercent: number;
      watchCount: number;
      lastWatchedAt?: string;
      completed: boolean;
      assignedDate: string;
    }> = [];

    for (const content of studentContents) {
      const watchRecs = await prisma.watchRecord.findMany({
        where: { contentId: content.id, studentId },
      });
      const totalWatchedSeconds = watchRecs.reduce((s, w) => s + w.watchedSeconds, 0);
      const totalDurationSeconds = (content.durationMinutes ?? 0) * 60;
      const watchedPercent = totalDurationSeconds > 0 ? Math.round((totalWatchedSeconds / totalDurationSeconds) * 100) : 0;
      const completed = watchRecs.some((w) => w.completed);
      const lastWatched = watchRecs.sort((a, b) => b.lastWatchedAt.getTime() - a.lastWatchedAt.getTime())[0];

      if (status === 'completed' && !completed) continue;
      if (status === 'in_progress' && (completed || watchedPercent === 0)) continue;
      if (status === 'not_started' && watchedPercent > 0) continue;

      contentItems.push({
        contentId: content.id,
        title: content.title,
        description: content.description ?? undefined,
        type: content.type,
        subjectName: content.subject?.name ?? 'Bilinmeyen',
        topic: content.topic,
        totalDurationMinutes: content.durationMinutes ?? 0,
        watchedDurationMinutes: Math.round(totalWatchedSeconds / 60),
        watchedPercent,
        watchCount: watchRecs.length,
        lastWatchedAt: lastWatched?.lastWatchedAt.toISOString(),
        completed,
        assignedDate: new Date().toISOString(),
      });
    }

    const completedCount = contentItems.filter((c) => c.completed).length;
    const inProgressCount = contentItems.filter((c) => !c.completed && c.watchedPercent > 0).length;
    const notStartedCount = contentItems.filter((c) => c.watchedPercent === 0).length;
    const totalWatchTimeMinutes = contentItems.reduce((s, c) => s + c.watchedDurationMinutes, 0);
    const averageCompletionPercent =
      contentItems.length === 0 ? 0 : Math.round(contentItems.reduce((s, c) => s + c.watchedPercent, 0) / contentItems.length);

    return res.json({
      contents: contentItems,
      statistics: {
        totalContents: contentItems.length,
        completedCount,
        inProgressCount,
        notStartedCount,
        totalWatchTimeMinutes,
        averageCompletionPercent,
      },
    });
  },
);

// Mesajlar (gönderen ve alıcı isimleriyle)
router.get(
  '/messages',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const messagesData = await prisma.message.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    });
    const userIds = [...new Set(messagesData.flatMap((m) => [m.fromUserId, m.toUserId]))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    return res.json(
      messagesData.map((m) => ({
        id: m.id,
        fromUserId: m.fromUserId,
        toUserId: m.toUserId,
        studentId: m.studentId ?? undefined,
        subject: m.subject ?? undefined,
        text: m.text,
        attachments: m.attachments ?? undefined,
        read: m.read,
        readAt: m.readAt?.toISOString(),
        createdAt: m.createdAt.toISOString(),
        fromUserName: userMap.get(m.fromUserId) ?? m.fromUserId,
        toUserName: userMap.get(m.toUserId) ?? m.toUserId,
      })),
    );
  },
);

// Konuşmalar listesi
router.get(
  '/messages/conversations',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const userMessages = await prisma.message.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    });
    const otherUserIds = [...new Set(userMessages.map((m) => (m.fromUserId === userId ? m.toUserId : m.fromUserId)))];
    const users = await prisma.user.findMany({
      where: { id: { in: otherUserIds } },
      select: { id: true, name: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const studentsData = await prisma.user.findMany({
      where: { id: { in: userMessages.map((m) => m.studentId).filter(Boolean) as string[] }, role: 'student' },
      select: { id: true, name: true },
    });
    const studentMap = new Map(studentsData.map((s) => [s.id, s.name]));

    const conversationMap = new Map<string, {
      userId: string;
      userName: string;
      userRole: string;
      studentId?: string;
      studentName?: string;
      lastMessage?: { id: string; fromUserId: string; toUserId: string; text: string; createdAt: string; read: boolean };
      unreadCount: number;
    }>();

    for (const msg of userMessages) {
      const otherUserId = msg.fromUserId === userId ? msg.toUserId : msg.fromUserId;
      const otherUser = userMap.get(otherUserId);
      if (!otherUser) continue;

      if (!conversationMap.has(otherUserId)) {
        conversationMap.set(otherUserId, {
          userId: otherUserId,
          userName: otherUser.name,
          userRole: otherUser.role,
          studentId: msg.studentId ?? undefined,
          studentName: msg.studentId ? studentMap.get(msg.studentId) : undefined,
          unreadCount: 0,
        });
      }
      const conv = conversationMap.get(otherUserId)!;
      if (!conv.lastMessage || msg.createdAt > new Date(conv.lastMessage.createdAt)) {
        conv.lastMessage = { id: msg.id, fromUserId: msg.fromUserId, toUserId: msg.toUserId, text: msg.text, createdAt: msg.createdAt.toISOString(), read: msg.read };
      }
      if (!msg.read && msg.toUserId === userId) conv.unreadCount++;
    }

    return res.json(Array.from(conversationMap.values()));
  },
);

// Belirli bir kullanıcıyla konuşma
router.get(
  '/messages/conversation/:userId',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const otherUserId = String(req.params.userId);
    const studentId = req.query.studentId as string | undefined;

    const conversationMessages = await prisma.message.findMany({
      where: {
        OR: [
          { fromUserId: parentId, toUserId: otherUserId },
          { fromUserId: otherUserId, toUserId: parentId },
        ],
        ...(studentId && { studentId }),
      },
      orderBy: { createdAt: 'asc' },
    });

    return res.json(
      conversationMessages.map((m) => ({
        id: m.id,
        fromUserId: m.fromUserId,
        toUserId: m.toUserId,
        studentId: m.studentId ?? undefined,
        subject: m.subject ?? undefined,
        text: m.text,
        attachments: m.attachments ?? undefined,
        read: m.read,
        readAt: m.readAt?.toISOString(),
        createdAt: m.createdAt.toISOString(),
      })),
    );
  },
);

// Mesaj gönder
router.post('/messages', authenticate('parent'), async (req, res) => {
  const parentId = (req as AuthenticatedRequest).user!.id;
  const { toUserId, text, studentId, subject } = req.body;

  if (!toUserId || !text) {
    return res.status(400).json({ error: 'toUserId ve text gereklidir' });
  }

  const newMessage = await prisma.message.create({
    data: { fromUserId: parentId, toUserId, studentId, subject, text, read: false },
  });

  await prisma.notification.create({
    data: {
      userId: toUserId,
      type: 'message_received',
      title: 'Yeni mesaj',
      body: `${(req as AuthenticatedRequest).user!.name} size mesaj gönderdi`,
      read: false,
      relatedEntityType: 'message',
      relatedEntityId: newMessage.id,
    },
  });

  return res.status(201).json({
    id: newMessage.id,
    fromUserId: newMessage.fromUserId,
    toUserId: newMessage.toUserId,
    studentId: newMessage.studentId ?? undefined,
    subject: newMessage.subject ?? undefined,
    text: newMessage.text,
    createdAt: newMessage.createdAt.toISOString(),
    read: newMessage.read,
  });
});

// Mesajı okundu olarak işaretle
router.put(
  '/messages/:id/read',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const messageId = String(req.params.id);
    const message = await prisma.message.findUnique({ where: { id: messageId } });

    if (!message) {
      return res.status(404).json({ error: 'Mesaj bulunamadı' });
    }

    if (message.toUserId !== req.user!.id) {
      return res.status(403).json({ error: 'Bu mesajı okuma yetkiniz yok' });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { read: true, readAt: new Date() },
    });

    return res.json({
      id: updated.id,
      fromUserId: updated.fromUserId,
      toUserId: updated.toUserId,
      studentId: updated.studentId ?? undefined,
      subject: updated.subject ?? undefined,
      text: updated.text,
      read: updated.read,
      readAt: updated.readAt?.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

// Toplantılar
router.get(
  '/meetings',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const userMeetings = await prisma.meeting.findMany({
      where: { parents: { some: { parentId: userId } } },
      include: {
        students: { select: { studentId: true } },
        parents: { select: { parentId: true } },
      },
    });
    const teacherIds = [...new Set(userMeetings.map((m) => m.teacherId))];
    const studentIds = [...new Set(userMeetings.flatMap((m) => m.students.map((s) => s.studentId)))];
    const [teachersData, studentsData, parentData] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } }),
      prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } }),
      prisma.user.findFirst({ where: { id: userId, role: 'parent' }, include: { parentStudents: { select: { studentId: true } } } }),
    ]);
    const teacherMap = new Map(teachersData.map((t) => [t.id, t.name]));
    const studentMap = new Map(studentsData.map((s) => [s.id, s.name]));
    const parentStudentIds = new Set(parentData?.parentStudents.map((ps) => ps.studentId) ?? []);

    return res.json(
      userMeetings.map((m) => ({
        id: m.id,
        type: m.type,
        title: m.title,
        teacherId: m.teacherId,
        teacherName: teacherMap.get(m.teacherId) ?? 'Bilinmeyen',
        studentIds: m.students.map((s) => s.studentId),
        studentNames: m.students.map((s) => studentMap.get(s.studentId) ?? 'Bilinmeyen'),
        parentIds: m.parents.map((p) => p.parentId),
        scheduledAt: m.scheduledAt.toISOString(),
        durationMinutes: m.durationMinutes,
        meetingUrl: m.meetingUrl,
        relatedStudentId: m.students.find((s) => parentStudentIds.has(s.studentId))?.studentId,
      })),
    );
  },
);

// Toplantı detayı
router.get(
  '/meetings/:id',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const meetingId = String(req.params.id);
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        students: { select: { studentId: true } },
        parents: { select: { parentId: true } },
      },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    const isParent = meeting.parents.some((p) => p.parentId === userId);
    if (!isParent) {
      return res.status(403).json({ error: 'Bu toplantıya erişim izniniz yok' });
    }

    const [teacher, studentsData, parentData] = await Promise.all([
      prisma.user.findUnique({ where: { id: meeting.teacherId }, select: { name: true } }),
      prisma.user.findMany({ where: { id: { in: meeting.students.map((s) => s.studentId) } }, select: { id: true, name: true } }),
      prisma.user.findFirst({ where: { id: userId }, include: { parentStudents: { select: { studentId: true } } } }),
    ]);
    const studentMap = new Map(studentsData.map((s) => [s.id, s.name]));
    const parentStudentIds = new Set(parentData?.parentStudents.map((ps) => ps.studentId) ?? []);

    return res.json({
      id: meeting.id,
      type: meeting.type,
      title: meeting.title,
      teacherId: meeting.teacherId,
      teacherName: teacher?.name ?? 'Bilinmeyen',
      studentIds: meeting.students.map((s) => s.studentId),
      studentNames: meeting.students.map((s) => studentMap.get(s.studentId) ?? 'Bilinmeyen'),
      parentIds: meeting.parents.map((p) => p.parentId),
      scheduledAt: meeting.scheduledAt.toISOString(),
      durationMinutes: meeting.durationMinutes,
      meetingUrl: meeting.meetingUrl,
      relatedStudentId: meeting.students.find((s) => parentStudentIds.has(s.studentId))?.studentId,
    });
  },
);

// Toplantıya katıl (log)
router.post(
  '/meetings/:id/join',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const meetingId = String(req.params.id);
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { parents: { select: { parentId: true } } },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    if (!meeting.parents.some((p) => p.parentId === userId)) {
      return res.status(403).json({ error: 'Bu toplantıya erişim izniniz yok' });
    }

    return res.json({ success: true, meetingUrl: meeting.meetingUrl });
  },
);

// Bildirimler
router.get(
  '/notifications',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const readFilter = req.query.read;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const where: { userId: string; read?: boolean } = { userId };
    if (readFilter === 'true') where.read = true;
    else if (readFilter === 'false') where.read = false;

    const userNotifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit && limit > 0 ? limit : undefined,
    });
    return res.json(
      userNotifications.map((n) => ({
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
  },
);

router.get(
  '/notifications/unread-count',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const count = await prisma.notification.count({
      where: { userId, read: false },
    });
    return res.json({ count });
  },
);

router.put(
  '/notifications/:id/read',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const notificationId = String(req.params.id);
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) {
      return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }
    if (notification.userId !== userId) {
      return res.status(403).json({ error: 'Bu bildirimi okuma yetkiniz yok' });
    }
    const updated = await prisma.notification.update({
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
      readAt: updated.readAt?.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

router.put(
  '/notifications/read-all',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return res.json({ success: true });
  },
);

router.delete(
  '/notifications/:id',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const notificationId = String(req.params.id);
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) {
      return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }
    await prisma.notification.delete({ where: { id: notificationId } });
    return res.json({ success: true });
  },
);

// Öğretmen geri bildirimleri
router.get(
  '/children/:id/feedback',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const feedbacks = await prisma.teacherFeedback.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(
      feedbacks.map((f) => ({
        id: f.id,
        studentId: f.studentId,
        teacherId: f.teacherId,
        teacherName: f.teacherName,
        type: f.type,
        relatedTestId: f.relatedTestId ?? undefined,
        relatedAssignmentId: f.relatedAssignmentId ?? undefined,
        title: f.title,
        content: f.content,
        read: f.read,
        readAt: f.readAt?.toISOString(),
        createdAt: f.createdAt.toISOString(),
      })),
    );
  },
);

router.get(
  '/feedback',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const parent = await prisma.user.findFirst({
      where: { id: parentId, role: 'parent' },
      include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    const studentIds = parent.parentStudents.map((ps) => ps.studentId);
    const feedbacks = await prisma.teacherFeedback.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(
      feedbacks.map((f) => ({
        id: f.id,
        studentId: f.studentId,
        teacherId: f.teacherId,
        teacherName: f.teacherName,
        type: f.type,
        relatedTestId: f.relatedTestId ?? undefined,
        relatedAssignmentId: f.relatedAssignmentId ?? undefined,
        title: f.title,
        content: f.content,
        read: f.read,
        readAt: f.readAt?.toISOString(),
        createdAt: f.createdAt.toISOString(),
      })),
    );
  },
);

// Geri bildirimi okundu olarak işaretle
router.put(
  '/feedback/:id/read',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const feedbackId = String(req.params.id);
    const feedback = await prisma.teacherFeedback.findUnique({
      where: { id: feedbackId },
    });

    if (!feedback) {
      return res.status(404).json({ error: 'Geri bildirim bulunamadı' });
    }

    const access = await checkParentAccess(parentId, feedback.studentId);
    if (!access.allowed) {
      return res.status(403).json({ error: 'Bu geri bildirime erişim izniniz yok' });
    }

    const updated = await prisma.teacherFeedback.update({
      where: { id: feedbackId },
      data: { read: true, readAt: new Date() },
    });
    return res.json({
      id: updated.id,
      studentId: updated.studentId,
      teacherId: updated.teacherId,
      teacherName: updated.teacherName,
      type: updated.type,
      title: updated.title,
      content: updated.content,
      read: updated.read,
      readAt: updated.readAt?.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

// Uyarılar
router.get(
  '/children/:id/alerts',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const studentAlerts = await prisma.alert.findMany({
      where: { studentId },
      orderBy: { detectedAt: 'desc' },
    });
    return res.json(
      studentAlerts.map((a) => ({
        id: a.id,
        studentId: a.studentId,
        type: a.type,
        severity: a.severity,
        title: a.title,
        description: a.description,
        status: a.status,
        relatedData: a.relatedData ?? undefined,
        resolvedAt: a.resolvedAt?.toISOString(),
        detectedAt: a.detectedAt.toISOString(),
      })),
    );
  },
);

router.put(
  '/alerts/:id/resolve',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const alertId = String(req.params.id);
    const alert = await prisma.alert.findUnique({ where: { id: alertId } });

    if (!alert) {
      return res.status(404).json({ error: 'Uyarı bulunamadı' });
    }

    const access = await checkParentAccess(parentId, alert.studentId);
    if (!access.allowed) {
      return res.status(403).json({ error: 'Bu uyarıya erişim izniniz yok' });
    }

    const updated = await prisma.alert.update({
      where: { id: alertId },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
    return res.json({
      id: updated.id,
      studentId: updated.studentId,
      type: updated.type,
      severity: updated.severity,
      title: updated.title,
      description: updated.description,
      status: updated.status,
      resolvedAt: updated.resolvedAt?.toISOString(),
      detectedAt: updated.detectedAt.toISOString(),
    });
  },
);

router.put(
  '/alerts/:id/dismiss',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const alertId = String(req.params.id);
    const alert = await prisma.alert.findUnique({ where: { id: alertId } });

    if (!alert) {
      return res.status(404).json({ error: 'Uyarı bulunamadı' });
    }

    const access = await checkParentAccess(parentId, alert.studentId);
    if (!access.allowed) {
      return res.status(403).json({ error: 'Bu uyarıya erişim izniniz yok' });
    }

    const updated = await prisma.alert.update({
      where: { id: alertId },
      data: { status: 'dismissed' },
    });
    return res.json({
      id: updated.id,
      studentId: updated.studentId,
      type: updated.type,
      severity: updated.severity,
      title: updated.title,
      description: updated.description,
      status: updated.status,
      detectedAt: updated.detectedAt.toISOString(),
    });
  },
);

// Aktivite özeti
router.get(
  '/children/:id/activity-summary',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const period = (req.query.period as string) || 'weekly';
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date = new Date(now);

    if (period === 'daily') {
      periodStart = new Date(now);
      periodStart.setHours(0, 0, 0, 0);
    } else if (period === 'weekly') {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'monthly') {
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (startDate && endDate) {
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
    } else {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    const [studentResults, studentWatchRecords, studentAssignments] = await Promise.all([
      prisma.testResult.findMany({
        where: {
          studentId,
          completedAt: { gte: periodStart, lte: periodEnd },
        },
      }),
      prisma.watchRecord.findMany({
        where: {
          studentId,
          lastWatchedAt: { gte: periodStart, lte: periodEnd },
        },
      }),
      prisma.assignment.findMany({
        where: {
          students: { some: { studentId } },
          dueDate: { gte: periodStart, lte: periodEnd },
        },
      }),
    ]);

    let assignmentsCompleted = 0;
    let assignmentsOverdue = 0;
    for (const a of studentAssignments) {
      const s = await getAssignmentStatus(a, studentId);
      if (s === 'completed') assignmentsCompleted++;
      else if (s === 'overdue') assignmentsOverdue++;
    }

    const testsSolved = studentResults.length;
    const questionsSolved = studentResults.reduce(
      (sum, r) => sum + r.correctCount + r.incorrectCount + r.blankCount,
      0,
    );
    const averageScorePercent =
      studentResults.length === 0
        ? 0
        : Math.round(studentResults.reduce((sum, r) => sum + r.scorePercent, 0) / studentResults.length);
    const totalStudyMinutes = Math.round(
      (studentResults.reduce((sum, r) => sum + r.durationSeconds, 0) +
        studentWatchRecords.reduce((sum, w) => sum + w.watchedSeconds, 0)) /
        60,
    );
    const contentsWatched = new Set(studentWatchRecords.map((w) => w.contentId)).size;
    const contentsWatchTimeMinutes = Math.round(
      studentWatchRecords.reduce((sum, w) => sum + w.watchedSeconds, 0) / 60,
    );

    const dailyBreakdownMap = new Map<string, { testsSolved: number; questionsSolved: number; studyMinutes: number }>();
    for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
      dailyBreakdownMap.set(d.toISOString().slice(0, 10), { testsSolved: 0, questionsSolved: 0, studyMinutes: 0 });
    }

    studentResults.forEach((r) => {
      const dateStr = r.completedAt.toISOString().slice(0, 10);
      const day = dailyBreakdownMap.get(dateStr);
      if (day) {
        day.testsSolved++;
        day.questionsSolved += r.correctCount + r.incorrectCount + r.blankCount;
        day.studyMinutes += Math.round(r.durationSeconds / 60);
      }
    });

    const dailyBreakdown = Array.from(dailyBreakdownMap.entries()).map(([date, data]) => ({ date, ...data }));

    return res.json({
      period,
      startDate: periodStart.toISOString(),
      endDate: periodEnd.toISOString(),
      testsSolved,
      questionsSolved,
      averageScorePercent,
      totalStudyMinutes,
      contentsWatched,
      contentsWatchTimeMinutes,
      assignmentsCompleted,
      assignmentsOverdue,
      topSubjects: [] as { subjectName: string; studyMinutes: number }[],
      topTopics: [] as { topic: string; studyMinutes: number }[],
      dailyBreakdown,
    });
  },
);

// Haftalık raporlar
router.get(
  '/children/:id/weekly-reports',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const reports = await prisma.weeklyReport.findMany({
      where: { studentId },
      orderBy: { weekStartDate: 'desc' },
    });
    return res.json({
      reports: reports.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        weekStartDate: r.weekStartDate.toISOString(),
        weekEndDate: r.weekEndDate.toISOString(),
        generatedAt: r.generatedAt.toISOString(),
        summary: r.summary,
        comparison: r.comparison,
        topicPerformance: r.topicPerformance,
        teacherFeedback: r.teacherFeedback,
        recommendations: r.recommendations,
      })),
      hasMore: false,
    });
  },
);

// Hedefler
router.get(
  '/children/:id/goals',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const studentGoals = await prisma.parentGoal.findMany({
      where: { studentId, createdByParentId: parentId },
    });

    const testResultsData = await prisma.testResult.findMany({
      where: { studentId },
    });

    const withProgress = studentGoals.map((g) => {
      let currentValue = 0;
      if (g.type === 'weekly_tests') {
        const weekStart = new Date(g.startDate);
        const weekEnd = new Date(g.endDate);
        currentValue = testResultsData.filter(
          (r) => r.completedAt >= weekStart && r.completedAt <= weekEnd,
        ).length;
      }
      const progressPercent = Math.min(Math.round((currentValue / g.targetValue) * 100), 100);
      return {
        id: g.id,
        studentId: g.studentId,
        createdByParentId: g.createdByParentId,
        type: g.type,
        targetValue: g.targetValue,
        topic: g.topic ?? undefined,
        startDate: g.startDate.toISOString(),
        endDate: g.endDate.toISOString(),
        status: g.status,
        reward: g.reward ?? undefined,
        completedAt: g.completedAt?.toISOString(),
        createdAt: g.createdAt.toISOString(),
        currentValue,
        progressPercent,
      };
    });

    return res.json(withProgress);
  },
);

// Yeni hedef oluştur
router.post(
  '/children/:id/goals',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const { type, targetValue, startDate, endDate, reward } = req.body;

    if (!type || !targetValue || !startDate || !endDate) {
      return res.status(400).json({ error: 'type, targetValue, startDate ve endDate gereklidir' });
    }

    const newGoal = await prisma.parentGoal.create({
      data: {
        studentId,
        createdByParentId: parentId,
        type: type as 'weekly_questions' | 'weekly_tests' | 'topic_completion' | 'score_percent',
        targetValue,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        reward: reward ?? undefined,
      },
    });

    return res.status(201).json({
      id: newGoal.id,
      studentId: newGoal.studentId,
      createdByParentId: newGoal.createdByParentId,
      type: newGoal.type,
      targetValue: newGoal.targetValue,
      startDate: newGoal.startDate.toISOString(),
      endDate: newGoal.endDate.toISOString(),
      status: newGoal.status,
      createdAt: newGoal.createdAt.toISOString(),
      reward: newGoal.reward ?? undefined,
    });
  },
);

// Takvim
router.get(
  '/calendar',
  authenticate('parent'),
  async (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const parent = await prisma.user.findFirst({
      where: { id: parentId, role: 'parent' },
      include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    const studentIds = parent.parentStudents.map((ps) => ps.studentId);
    const startDate = req.query.startDate
      ? new Date(String(req.query.startDate))
      : new Date();
    const endDate = req.query.endDate
      ? new Date(String(req.query.endDate))
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const events: CalendarEvent[] = [];
    const now = new Date();

    const [assignmentsData, testResultsData, meetingsData, studentsData] = await Promise.all([
      prisma.assignment.findMany({
        where: {
          students: { some: { studentId: { in: studentIds } } },
          dueDate: { gte: startDate, lte: endDate },
        },
        include: { students: { select: { studentId: true } } },
      }),
      prisma.testResult.findMany({ where: { studentId: { in: studentIds } } }),
      prisma.meeting.findMany({
        where: {
          OR: [
            { students: { some: { studentId: { in: studentIds } } } },
            { parents: { some: { parentId } } },
          ],
        },
        include: {
          students: { select: { studentId: true } },
          parents: { select: { parentId: true } },
        },
      }),
      prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } }),
    ]);

    const studentMap = new Map(studentsData.map((s) => [s.id, s.name]));
    const completedIds = new Set(
      testResultsData.map((r) => `${r.assignmentId}-${r.studentId}`),
    );

    for (const studentId of studentIds) {
      const studentAssignments = assignmentsData.filter((a) =>
        a.students.some((s) => s.studentId === studentId),
      );
      for (const assignment of studentAssignments) {
        const dueDate = assignment.dueDate;
        if (dueDate >= startDate && dueDate <= endDate) {
          let status: 'pending' | 'completed' | 'overdue' = 'pending';
          if (dueDate < now) status = 'overdue';
          else if (completedIds.has(`${assignment.id}-${studentId}`)) status = 'completed';

          events.push({
            id: `assignment-${assignment.id}-${studentId}`,
            type: 'assignment',
            title: `${studentMap.get(studentId) || 'Öğrenci'}: ${assignment.title}`,
            startDate: dueDate.toISOString(),
            description: assignment.description ?? undefined,
            status,
            color: status === 'overdue' ? '#e74c3c' : status === 'completed' ? '#27ae60' : '#3498db',
            relatedId: assignment.id,
          });
        }
      }

      for (const meeting of meetingsData) {
        const meetingStart = meeting.scheduledAt;
        if (meetingStart >= startDate && meetingStart <= endDate) {
          const meetingEnd = new Date(
            meetingStart.getTime() + meeting.durationMinutes * 60 * 1000,
          );
          const isRelevant =
            meeting.students.some((s) => s.studentId === studentId) ||
            meeting.parents.some((p) => p.parentId === parentId);
          if (isRelevant) {
            events.push({
              id: `meeting-${meeting.id}-${studentId}`,
              type: 'meeting',
              title: `${studentMap.get(studentId) || 'Öğrenci'}: ${meeting.title}`,
              startDate: meetingStart.toISOString(),
              endDate: meetingEnd.toISOString(),
              description: `${meeting.durationMinutes} dakika`,
              status: meetingStart < now ? 'completed' : 'pending',
              color: '#9b59b6',
              relatedId: meeting.id,
            });
          }
        }
      }
    }

    const typeFilter = req.query.type as CalendarEventType | undefined;
    const statusFilter = req.query.status as string | undefined;
    let filteredEvents = events;
    if (typeFilter) filteredEvents = filteredEvents.filter((e) => e.type === typeFilter);
    if (statusFilter) filteredEvents = filteredEvents.filter((e) => e.status === statusFilter);
    filteredEvents.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    return res.json({
      events: filteredEvents,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      viewType: req.query.viewType || 'month',
    });
  },
);

export default router;


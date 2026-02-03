import express from 'express';
import { authenticate, AuthenticatedRequest } from './auth';
import {
  allUsers,
  alerts,
  assignments,
  classGroups,
  contents,
  customReports,
  meetings,
  messages,
  monthlyReports,
  notifications,
  parentGoals,
  parents,
  students,
  subjects,
  teacherFeedbacks,
  teachers,
  testResults,
  tests,
  watchRecords,
  weeklyReports,
} from './data';
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

// Helper function: Check if parent has access to student
function checkParentAccess(
  parentId: string,
  studentId: string,
): { allowed: boolean; error?: string } {
  const parent = parents.find((p) => p.id === parentId);
  if (!parent) {
    return { allowed: false, error: 'Veli bulunamadı' };
  }
  if (!parent.studentIds.includes(studentId)) {
    return {
      allowed: false,
      error: 'Bu öğrencinin verilerine erişim izniniz yok',
    };
  }
  return { allowed: true };
}

// Helper function: Get student's class name
function getStudentClassName(studentId: string): string | undefined {
  const student = students.find((s) => s.id === studentId);
  if (!student) return undefined;
  const classGroup = classGroups.find((c) => c.id === student.classId);
  return classGroup?.name;
}

// Helper function: Calculate assignment status
function getAssignmentStatus(
  assignment: typeof assignments[0],
  studentId: string,
): 'pending' | 'in_progress' | 'completed' | 'overdue' {
  const now = new Date();
  const dueDate = new Date(assignment.dueDate);
  const result = testResults.find(
    (r) => r.assignmentId === assignment.id && r.studentId === studentId,
  );
  const watchRecord = watchRecords.find(
    (w) => w.contentId === assignment.contentId && w.studentId === studentId,
  );

  if (assignment.testId && result) {
    return 'completed';
  }
  if (assignment.contentId && watchRecord?.completed) {
    return 'completed';
  }
  if (assignment.testId && result) {
    return 'in_progress';
  }
  if (assignment.contentId && watchRecord && !watchRecord.completed) {
    return 'in_progress';
  }
  if (dueDate < now) {
    return 'overdue';
  }
  return 'pending';
}

// Veli dashboard özeti
router.get(
  '/dashboard',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const parent = parents.find((p) => p.id === parentId);
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const cards: ParentDashboardSummaryStudentCard[] = parent.studentIds.map(
      (sid) => {
        const student = students.find((s) => s.id === sid);
        const studentResults = testResults.filter(
          (r) => r.studentId === sid && new Date(r.completedAt) >= sevenDaysAgo,
        );
        const allResults = testResults.filter((r) => r.studentId === sid);
        const testsSolvedLast7Days = studentResults.length;
        const averageScorePercent =
          allResults.length === 0
            ? 0
            : Math.round(
                allResults.reduce((sum, r) => sum + r.scorePercent, 0) /
                  allResults.length,
              );
        const studyMinutes =
          watchRecords
            .filter((w) => w.studentId === sid)
            .reduce((sum, w) => sum + w.watchedSeconds, 0) / 60;

        const studentAssignments = assignments.filter((a) =>
          a.assignedStudentIds.includes(sid),
        );
        const pendingCount = studentAssignments.filter(
          (a) => getAssignmentStatus(a, sid) === 'pending',
        ).length;
        const overdueCount = studentAssignments.filter(
          (a) => getAssignmentStatus(a, sid) === 'overdue',
        ).length;

        const lastActivity =
          allResults.length > 0
            ? allResults[allResults.length - 1].completedAt
            : watchRecords
                .filter((w) => w.studentId === sid)
                .sort(
                  (a, b) =>
                    new Date(b.lastWatchedAt).getTime() -
                    new Date(a.lastWatchedAt).getTime(),
                )[0]?.lastWatchedAt;

        const status: 'active' | 'inactive' =
          lastActivity && new Date(lastActivity) >= threeDaysAgo
            ? 'active'
            : 'inactive';

        return {
          studentId: sid,
          studentName: student?.name ?? 'Bilinmeyen öğrenci',
          gradeLevel: student?.gradeLevel ?? '',
          classId: student?.classId ?? '',
          className: getStudentClassName(sid),
          testsSolvedLast7Days,
          averageScorePercent,
          totalStudyMinutes: Math.round(studyMinutes),
          lastActivityDate: lastActivity,
          status,
          pendingAssignmentsCount: pendingCount,
          overdueAssignmentsCount: overdueCount,
        };
      },
    );

    const totalTestsSolved = cards.reduce(
      (sum, c) => sum + c.testsSolvedLast7Days,
      0,
    );
    const avgScore =
      cards.length === 0
        ? 0
        : Math.round(
            cards.reduce((sum, c) => sum + c.averageScorePercent, 0) /
              cards.length,
          );

    const summary: ParentDashboardSummary = {
      children: cards,
      overallStats: {
        totalChildren: cards.length,
        totalTestsSolved,
        averageScoreAcrossAll: avgScore,
      },
    };

    return res.json(summary);
  },
);

// Öğrenci detay özeti
router.get(
  '/children/:id/summary',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const student = students.find((s) => s.id === studentId);
    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const studentResults = testResults.filter(
      (r) => r.studentId === studentId && new Date(r.completedAt) >= sevenDaysAgo,
    );
    const allResults = testResults.filter((r) => r.studentId === studentId);
    const studentAssignments = assignments.filter((a) =>
      a.assignedStudentIds.includes(studentId),
    );

    const summary: StudentDetailSummary = {
      studentId,
      studentName: student.name,
      gradeLevel: student.gradeLevel,
      className: getStudentClassName(studentId),
      quickStats: {
        testsSolvedLast7Days: studentResults.length,
        averageScorePercent:
          allResults.length === 0
            ? 0
            : Math.round(
                allResults.reduce((sum, r) => sum + r.scorePercent, 0) /
                  allResults.length,
              ),
        totalStudyMinutes: Math.round(
          watchRecords
            .filter((w) => w.studentId === studentId)
            .reduce((sum, w) => sum + w.watchedSeconds, 0) / 60,
        ),
        pendingAssignmentsCount: studentAssignments.filter(
          (a) => getAssignmentStatus(a, studentId) === 'pending',
        ).length,
        overdueAssignmentsCount: studentAssignments.filter(
          (a) => getAssignmentStatus(a, studentId) === 'overdue',
        ).length,
      },
      recentActivities: [
        ...allResults
          .slice(-5)
          .map((r) => ({
            type: 'test' as const,
            title: `Test tamamlandı - ${r.scorePercent}%`,
            date: r.completedAt,
          })),
        ...watchRecords
          .filter((w) => w.studentId === studentId)
          .sort(
            (a, b) =>
              new Date(b.lastWatchedAt).getTime() -
              new Date(a.lastWatchedAt).getTime(),
          )
          .slice(0, 3)
          .map((w) => {
            const content = contents.find((c) => c.id === w.contentId);
            return {
              type: 'content' as const,
              title: content?.title ?? 'İçerik izlendi',
              date: w.lastWatchedAt,
            };
          }),
      ]
        .sort(
          (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime(),
        )
        .slice(0, 10),
      upcomingAssignments: studentAssignments
        .filter((a) => {
          const status = getAssignmentStatus(a, studentId);
          return status === 'pending' || status === 'in_progress';
        })
        .map((a) => {
          const subject = subjects.find((s) => s.id === a.testId ? tests.find((t) => t.id === a.testId)?.subjectId : contents.find((c) => c.id === a.contentId)?.subjectId);
          const result = testResults.find(
            (r) => r.assignmentId === a.id && r.studentId === studentId,
          );
          const watchRecord = watchRecords.find(
            (w) => w.contentId === a.contentId && w.studentId === studentId,
          );
          return {
            assignmentId: a.id,
            title: a.title,
            description: a.description,
            type: a.testId && a.contentId ? 'mixed' : a.testId ? 'test' : 'content',
            subjectName: subject?.name ?? 'Bilinmeyen',
            topic: a.testId ? tests.find((t) => t.id === a.testId)?.topic ?? '' : contents.find((c) => c.id === a.contentId)?.topic ?? '',
            dueDate: a.dueDate,
            status: getAssignmentStatus(a, studentId),
            testResult: result
              ? {
                  testId: result.testId,
                  correctCount: result.correctCount,
                  incorrectCount: result.incorrectCount,
                  blankCount: result.blankCount,
                  scorePercent: result.scorePercent,
                  durationSeconds: result.durationSeconds,
                }
              : undefined,
            contentProgress: watchRecord
              ? {
                  contentId: watchRecord.contentId,
                  watchedPercent: watchRecord.completed
                    ? 100
                    : Math.round(
                        (watchRecord.watchedSeconds /
                          ((contents.find((c) => c.id === watchRecord.contentId)
                            ?.durationMinutes ?? 1) *
                            60)) *
                          100,
                      ),
                  completed: watchRecord.completed,
                }
              : undefined,
          };
        })
        .slice(0, 5),
    };

    return res.json(summary);
  },
);

// Aktivite zaman takibi
router.get(
  '/children/:id/activity-time',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = checkParentAccess(parentId, studentId);
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
    let periodEnd: Date = now;

    if (period === 'today') {
      periodStart = new Date(now.setHours(0, 0, 0, 0));
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

    const studentResults = testResults.filter(
      (r) =>
        r.studentId === studentId &&
        new Date(r.completedAt) >= periodStart &&
        new Date(r.completedAt) <= periodEnd,
    );
    const studentWatchRecords = watchRecords.filter(
      (w) =>
        w.studentId === studentId &&
        new Date(w.lastWatchedAt) >= periodStart &&
        new Date(w.lastWatchedAt) <= periodEnd,
    );

    // Günlük verileri oluştur
    const dailyData: ActivityTimeSummary['dailyData'] = [];
    const dateMap = new Map<string, ActivityTimeSummary['dailyData'][0]>();

    for (
      let d = new Date(periodStart);
      d <= periodEnd;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().split('T')[0];
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
      const dateStr = new Date(result.completedAt).toISOString().split('T')[0];
      const dayData = dateMap.get(dateStr);
      if (dayData) {
        dayData.testMinutes += Math.round(result.durationSeconds / 60);
        dayData.totalMinutes += Math.round(result.durationSeconds / 60);
      }
    });

    // İçerik izleme sürelerini ekle
    studentWatchRecords.forEach((watch) => {
      const dateStr = new Date(watch.lastWatchedAt).toISOString().split('T')[0];
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
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const status = req.query.status as string;
    const dateRange = req.query.dateRange as string;
    const subjectId = req.query.subjectId as string;

    let studentAssignments = assignments.filter((a) =>
      a.assignedStudentIds.includes(studentId),
    );

    // Filtreleme
    if (status) {
      studentAssignments = studentAssignments.filter(
        (a) => getAssignmentStatus(a, studentId) === status,
      );
    }

    const assignmentItems = studentAssignments.map((a) => {
      const test = a.testId ? tests.find((t) => t.id === a.testId) : null;
      const content = a.contentId
        ? contents.find((c) => c.id === a.contentId)
        : null;
      const subject = test
        ? subjects.find((s) => s.id === test.subjectId)
        : content
          ? subjects.find((s) => s.id === content.subjectId)
          : null;
      const result = testResults.find(
        (r) => r.assignmentId === a.id && r.studentId === studentId,
      );
      const watchRecord = watchRecords.find(
        (w) => w.contentId === a.contentId && w.studentId === studentId,
      );

      return {
        assignmentId: a.id,
        title: a.title,
        description: a.description,
        type: a.testId && a.contentId ? 'mixed' : a.testId ? 'test' : 'content',
        subjectName: subject?.name ?? 'Bilinmeyen',
        topic: test?.topic ?? content?.topic ?? '',
        dueDate: a.dueDate,
        status: getAssignmentStatus(a, studentId),
        completedAt: result?.completedAt ?? watchRecord?.lastWatchedAt,
        testResult: result
          ? {
              testId: result.testId,
              correctCount: result.correctCount,
              incorrectCount: result.incorrectCount,
              blankCount: result.blankCount,
              scorePercent: result.scorePercent,
              durationSeconds: result.durationSeconds,
            }
          : undefined,
        contentProgress: watchRecord
          ? {
              contentId: watchRecord.contentId,
              watchedPercent: watchRecord.completed
                ? 100
                : Math.round(
                    (watchRecord.watchedSeconds /
                      ((content?.durationMinutes ?? 1) * 60)) *
                      100,
                  ),
              completed: watchRecord.completed,
            }
          : undefined,
      };
    });

    const completedCount = assignmentItems.filter(
      (a) => a.status === 'completed',
    ).length;
    const pendingCount = assignmentItems.filter(
      (a) => a.status === 'pending',
    ).length;
    const overdueCount = assignmentItems.filter(
      (a) => a.status === 'overdue',
    ).length;

    const completedResults = testResults.filter(
      (r) =>
        r.studentId === studentId &&
        assignmentItems.some((a) => a.assignmentId === r.assignmentId),
    );
    const averageScorePercent =
      completedResults.length === 0
        ? 0
        : Math.round(
            completedResults.reduce((sum, r) => sum + r.scorePercent, 0) /
              completedResults.length,
          );

    const summary: AssignmentActivitySummary = {
      assignments: assignmentItems,
      statistics: {
        totalCount: assignmentItems.length,
        completedCount,
        pendingCount,
        overdueCount,
        averageScorePercent,
      },
    };

    return res.json(summary);
  },
);

// İçerik kullanımı
router.get(
  '/children/:id/content-usage',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const status = req.query.status as string;
    const subjectId = req.query.subjectId as string;

    const student = students.find((s) => s.id === studentId);
    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }

    // Öğrenciye atanmış içerikleri bul
    let studentContents = contents.filter(
      (c) =>
        c.assignedToStudentIds.includes(studentId) ||
        (student.classId &&
          c.assignedToClassIds.includes(student.classId)),
    );

    if (subjectId) {
      studentContents = studentContents.filter((c) => c.subjectId === subjectId);
    }

    const contentItems = studentContents.map((content) => {
      const subject = subjects.find((s) => s.id === content.subjectId);
      const watchRecordsForContent = watchRecords.filter(
        (w) => w.contentId === content.id && w.studentId === studentId,
      );
      const totalWatchedSeconds = watchRecordsForContent.reduce(
        (sum, w) => sum + w.watchedSeconds,
        0,
      );
      const totalDurationSeconds = (content.durationMinutes ?? 0) * 60;
      const watchedPercent =
        totalDurationSeconds > 0
          ? Math.round((totalWatchedSeconds / totalDurationSeconds) * 100)
          : 0;
      const completed = watchRecordsForContent.some((w) => w.completed);
      const lastWatched = watchRecordsForContent.sort(
        (a, b) =>
          new Date(b.lastWatchedAt).getTime() -
          new Date(a.lastWatchedAt).getTime(),
      )[0];

      if (status === 'completed' && !completed) return null;
      if (status === 'in_progress' && (completed || watchedPercent === 0))
        return null;
      if (status === 'not_started' && watchedPercent > 0) return null;

      return {
        contentId: content.id,
        title: content.title,
        description: content.description,
        type: content.type,
        subjectName: subject?.name ?? 'Bilinmeyen',
        topic: content.topic,
        totalDurationMinutes: content.durationMinutes ?? 0,
        watchedDurationMinutes: Math.round(totalWatchedSeconds / 60),
        watchedPercent,
        watchCount: watchRecordsForContent.length,
        lastWatchedAt: lastWatched?.lastWatchedAt,
        completed,
        assignedDate: content.assignedToStudentIds.includes(studentId)
          ? new Date().toISOString() // Demo için
          : new Date().toISOString(),
      };
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    const completedCount = contentItems.filter((c) => c.completed).length;
    const inProgressCount = contentItems.filter(
      (c) => !c.completed && c.watchedPercent > 0,
    ).length;
    const notStartedCount = contentItems.filter(
      (c) => c.watchedPercent === 0,
    ).length;
    const totalWatchTimeMinutes = contentItems.reduce(
      (sum, c) => sum + c.watchedDurationMinutes,
      0,
    );
    const averageCompletionPercent =
      contentItems.length === 0
        ? 0
        : Math.round(
            contentItems.reduce((sum, c) => sum + c.watchedPercent, 0) /
              contentItems.length,
          );

    const summary: ContentUsageSummary = {
      contents: contentItems,
      statistics: {
        totalContents: contentItems.length,
        completedCount,
        inProgressCount,
        notStartedCount,
        totalWatchTimeMinutes,
        averageCompletionPercent,
      },
    };

    return res.json(summary);
  },
);

// Mesajlar (gönderen ve alıcı isimleriyle)
router.get(
  '/messages',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const users = allUsers();
    const userMessages = messages
      .filter((m) => m.fromUserId === userId || m.toUserId === userId)
      .map((m) => {
        const fromUser = users.find((u) => u.id === m.fromUserId);
        const toUser = users.find((u) => u.id === m.toUserId);
        return {
          ...m,
          fromUserName: fromUser?.name ?? m.fromUserId,
          toUserName: toUser?.name ?? m.toUserId,
        };
      });
    return res.json(userMessages);
  },
);

// Konuşmalar listesi
router.get(
  '/messages/conversations',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const userMessages = messages.filter(
      (m) => m.fromUserId === userId || m.toUserId === userId,
    );

    const conversationMap = new Map<
      string,
      {
        userId: string;
        userName: string;
        userRole: string;
        studentId?: string;
        studentName?: string;
        lastMessage?: Message;
        unreadCount: number;
      }
    >();

    userMessages.forEach((msg) => {
      const otherUserId =
        msg.fromUserId === userId ? msg.toUserId : msg.fromUserId;
      const otherUser = teachers.find((t) => t.id === otherUserId) ||
        students.find((s) => s.id === otherUserId) ||
        parents.find((p) => p.id === otherUserId);

      if (!otherUser) return;

      if (!conversationMap.has(otherUserId)) {
        conversationMap.set(otherUserId, {
          userId: otherUserId,
          userName: otherUser.name,
          userRole: otherUser.role,
          studentId: msg.studentId,
          studentName: msg.studentId
            ? students.find((s) => s.id === msg.studentId)?.name
            : undefined,
          unreadCount: 0,
        });
      }

      const conv = conversationMap.get(otherUserId)!;
      if (
        !conv.lastMessage ||
        new Date(msg.createdAt) > new Date(conv.lastMessage.createdAt)
      ) {
        conv.lastMessage = msg;
      }
      if (!msg.read && msg.toUserId === userId) {
        conv.unreadCount++;
      }
    });

    return res.json(Array.from(conversationMap.values()));
  },
);

// Belirli bir kullanıcıyla konuşma
router.get(
  '/messages/conversation/:userId',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const otherUserId = String(req.params.userId);
    const studentId = req.query.studentId as string | undefined;

    const conversationMessages = messages
      .filter(
        (m) =>
          ((m.fromUserId === parentId && m.toUserId === otherUserId) ||
            (m.fromUserId === otherUserId && m.toUserId === parentId)) &&
          (!studentId || m.studentId === studentId),
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

    return res.json(conversationMessages);
  },
);

// Mesaj gönder
router.post('/messages', authenticate('parent'), (req, res) => {
  const parentId = (req as AuthenticatedRequest).user!.id;
  const { toUserId, text, studentId, subject } = req.body;

  if (!toUserId || !text) {
    return res.status(400).json({ error: 'toUserId ve text gereklidir' });
  }

  const newMessage: Message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    fromUserId: parentId,
    toUserId,
    studentId,
    subject,
    text,
    createdAt: new Date().toISOString(),
    read: false,
  };

  messages.push(newMessage);

  // Alıcıya bildirim gönder
  const notification: Notification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: toUserId,
    type: 'message_received',
    title: 'Yeni mesaj',
    body: `${(req as AuthenticatedRequest).user!.name} size mesaj gönderdi`,
    createdAt: new Date().toISOString(),
    read: false,
    relatedEntityType: 'message',
    relatedEntityId: newMessage.id,
  };
  notifications.push(notification);

  return res.json(newMessage);
});

// Mesajı okundu olarak işaretle
router.put(
  '/messages/:id/read',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const messageId = String(req.params.id);
    const message = messages.find((m) => m.id === messageId);

    if (!message) {
      return res.status(404).json({ error: 'Mesaj bulunamadı' });
    }

    if (message.toUserId !== req.user!.id) {
      return res.status(403).json({ error: 'Bu mesajı okuma yetkiniz yok' });
    }

    message.read = true;
    message.readAt = new Date().toISOString();

    return res.json(message);
  },
);

// Toplantılar
router.get(
  '/meetings',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const userMeetings = meetings
      .filter((m) => m.parentIds.includes(userId))
      .map((m) => {
        const teacher = teachers.find((t) => t.id === m.teacherId);
        const studentNames = m.studentIds.map(
          (sid) => students.find((s) => s.id === sid)?.name ?? 'Bilinmeyen',
        );
        return {
          ...m,
          teacherName: teacher?.name ?? 'Bilinmeyen',
          studentNames,
          relatedStudentId: m.studentIds.find((sid) => {
            const student = students.find((s) => s.id === sid);
            return student && parents.find((p) => p.id === userId)?.studentIds.includes(sid);
          }),
        };
      });
    return res.json(userMeetings);
  },
);

// Toplantı detayı
router.get(
  '/meetings/:id',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const meetingId = String(req.params.id);
    const meeting = meetings.find((m) => m.id === meetingId);

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    if (!meeting.parentIds.includes(userId)) {
      return res
        .status(403)
        .json({ error: 'Bu toplantıya erişim izniniz yok' });
    }

    const teacher = teachers.find((t) => t.id === meeting.teacherId);
    const studentNames = meeting.studentIds.map(
      (sid) => students.find((s) => s.id === sid)?.name ?? 'Bilinmeyen',
    );

    return res.json({
      ...meeting,
      teacherName: teacher?.name ?? 'Bilinmeyen',
      studentNames,
      relatedStudentId: meeting.studentIds.find((sid) => {
        const student = students.find((s) => s.id === sid);
        return student && parents.find((p) => p.id === userId)?.studentIds.includes(sid);
      }),
    });
  },
);

// Toplantıya katıl (log)
router.post(
  '/meetings/:id/join',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const meetingId = String(req.params.id);
    const meeting = meetings.find((m) => m.id === meetingId);

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    if (!meeting.parentIds.includes(userId)) {
      return res
        .status(403)
        .json({ error: 'Bu toplantıya erişim izniniz yok' });
    }

    // Log kaydı burada yapılabilir
    return res.json({ success: true, meetingUrl: meeting.meetingUrl });
  },
);

// Bildirimler
router.get(
  '/notifications',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    let userNotifications = notifications.filter((n) => n.userId === userId);

    // Query parametreleri ile filtreleme
    const read = req.query.read;
    if (read === 'true') {
      userNotifications = userNotifications.filter((n) => n.read);
    } else if (read === 'false') {
      userNotifications = userNotifications.filter((n) => !n.read);
    }

    // Limit parametresi
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    if (limit && limit > 0) {
      userNotifications = userNotifications.slice(0, limit);
    }

    // Tarihe göre sıralama (en yeni üstte)
    userNotifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return res.json(userNotifications);
  },
);

// Okunmamış bildirim sayısı
router.get(
  '/notifications/unread-count',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const unreadCount = notifications.filter(
      (n) => n.userId === userId && !n.read,
    ).length;
    return res.json({ count: unreadCount });
  },
);

// Bildirimi okundu olarak işaretle
router.put(
  '/notifications/:id/read',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const notificationId = String(req.params.id);
    const notification = notifications.find((n) => n.id === notificationId);

    if (!notification) {
      return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }

    if (notification.userId !== userId) {
      return res
        .status(403)
        .json({ error: 'Bu bildirimi okuma yetkiniz yok' });
    }

    notification.read = true;
    notification.readAt = new Date().toISOString();

    return res.json(notification);
  },
);

// Tüm bildirimleri okundu olarak işaretle
router.put(
  '/notifications/read-all',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const now = new Date().toISOString();
    notifications
      .filter((n) => n.userId === userId && !n.read)
      .forEach((n) => {
        n.read = true;
        n.readAt = now;
      });

    return res.json({ success: true });
  },
);

// Bildirimi sil
router.delete(
  '/notifications/:id',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const notificationId = String(req.params.id);
    const index = notifications.findIndex(
      (n) => n.id === notificationId && n.userId === userId,
    );

    if (index === -1) {
      return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }

    notifications.splice(index, 1);
    return res.json({ success: true });
  },
);

// Öğretmen geri bildirimleri
router.get(
  '/children/:id/feedback',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const feedbacks = teacherFeedbacks
      .filter((f) => f.studentId === studentId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return res.json(feedbacks);
  },
);

// Tüm çocuklar için geri bildirimler
router.get(
  '/feedback',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const parent = parents.find((p) => p.id === parentId);
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    const feedbacks = teacherFeedbacks
      .filter((f) => parent.studentIds.includes(f.studentId))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return res.json(feedbacks);
  },
);

// Geri bildirimi okundu olarak işaretle
router.put(
  '/feedback/:id/read',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const feedbackId = String(req.params.id);
    const feedback = teacherFeedbacks.find((f) => f.id === feedbackId);

    if (!feedback) {
      return res.status(404).json({ error: 'Geri bildirim bulunamadı' });
    }

    const parent = parents.find((p) => p.id === parentId);
    if (!parent || !parent.studentIds.includes(feedback.studentId)) {
      return res
        .status(403)
        .json({ error: 'Bu geri bildirime erişim izniniz yok' });
    }

    feedback.read = true;
    feedback.readAt = new Date().toISOString();

    return res.json(feedback);
  },
);

// Uyarılar
router.get(
  '/children/:id/alerts',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const studentAlerts = alerts
      .filter((a) => a.studentId === studentId)
      .sort(
        (a, b) =>
          new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
      );

    return res.json(studentAlerts);
  },
);

// Uyarıyı çözüldü olarak işaretle
router.put(
  '/alerts/:id/resolve',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const alertId = String(req.params.id);
    const alert = alerts.find((a) => a.id === alertId);

    if (!alert) {
      return res.status(404).json({ error: 'Uyarı bulunamadı' });
    }

    const parent = parents.find((p) => p.id === parentId);
    if (!parent || !parent.studentIds.includes(alert.studentId)) {
      return res.status(403).json({ error: 'Bu uyarıya erişim izniniz yok' });
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();

    return res.json(alert);
  },
);

// Uyarıyı reddet
router.put(
  '/alerts/:id/dismiss',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const alertId = String(req.params.id);
    const alert = alerts.find((a) => a.id === alertId);

    if (!alert) {
      return res.status(404).json({ error: 'Uyarı bulunamadı' });
    }

    const parent = parents.find((p) => p.id === parentId);
    if (!parent || !parent.studentIds.includes(alert.studentId)) {
      return res.status(403).json({ error: 'Bu uyarıya erişim izniniz yok' });
    }

    alert.status = 'dismissed';

    return res.json(alert);
  },
);

// Aktivite özeti
router.get(
  '/children/:id/activity-summary',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = checkParentAccess(parentId, studentId);
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
    let periodEnd: Date = now;

    if (period === 'daily') {
      periodStart = new Date(now.setHours(0, 0, 0, 0));
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

    const studentResults = testResults.filter(
      (r) =>
        r.studentId === studentId &&
        new Date(r.completedAt) >= periodStart &&
        new Date(r.completedAt) <= periodEnd,
    );
    const studentWatchRecords = watchRecords.filter(
      (w) =>
        w.studentId === studentId &&
        new Date(w.lastWatchedAt) >= periodStart &&
        new Date(w.lastWatchedAt) <= periodEnd,
    );
    const studentAssignments = assignments.filter(
      (a) =>
        a.assignedStudentIds.includes(studentId) &&
        new Date(a.dueDate) >= periodStart &&
        new Date(a.dueDate) <= periodEnd,
    );

    const testsSolved = studentResults.length;
    const questionsSolved = studentResults.reduce(
      (sum, r) => sum + r.correctCount + r.incorrectCount + r.blankCount,
      0,
    );
    const averageScorePercent =
      studentResults.length === 0
        ? 0
        : Math.round(
            studentResults.reduce((sum, r) => sum + r.scorePercent, 0) /
              studentResults.length,
          );
    const totalStudyMinutes = Math.round(
      (studentResults.reduce((sum, r) => sum + r.durationSeconds, 0) +
        studentWatchRecords.reduce((sum, w) => sum + w.watchedSeconds, 0)) /
        60,
    );
    const contentsWatched = new Set(
      studentWatchRecords.map((w) => w.contentId),
    ).size;
    const contentsWatchTimeMinutes = Math.round(
      studentWatchRecords.reduce((sum, w) => sum + w.watchedSeconds, 0) / 60,
    );
    const assignmentsCompleted = studentAssignments.filter((a) =>
      getAssignmentStatus(a, studentId) === 'completed',
    ).length;
    const assignmentsOverdue = studentAssignments.filter(
      (a) => getAssignmentStatus(a, studentId) === 'overdue',
    ).length;

    // Günlük breakdown
    const dailyBreakdownMap = new Map<string, { testsSolved: number; questionsSolved: number; studyMinutes: number }>();
    for (
      let d = new Date(periodStart);
      d <= periodEnd;
      d.setDate(d.getDate() + 1)
    ) {
      const dateStr = d.toISOString().split('T')[0];
      dailyBreakdownMap.set(dateStr, {
        testsSolved: 0,
        questionsSolved: 0,
        studyMinutes: 0,
      });
    }

    studentResults.forEach((r) => {
      const dateStr = new Date(r.completedAt).toISOString().split('T')[0];
      const day = dailyBreakdownMap.get(dateStr);
      if (day) {
        day.testsSolved++;
        day.questionsSolved +=
          r.correctCount + r.incorrectCount + r.blankCount;
        day.studyMinutes += Math.round(r.durationSeconds / 60);
      }
    });

    const dailyBreakdown = Array.from(dailyBreakdownMap.entries()).map(
      ([date, data]) => ({ date, ...data }),
    );

    // Top subjects ve topics (basitleştirilmiş)
    const topSubjects: { subjectName: string; studyMinutes: number }[] = [];
    const topTopics: { topic: string; studyMinutes: number }[] = [];

    const summary: ActivitySummary = {
      period: period as any,
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
      topSubjects,
      topTopics,
      dailyBreakdown,
    };

    return res.json(summary);
  },
);

// Haftalık raporlar (basitleştirilmiş - gerçekte otomatik oluşturulmalı)
router.get(
  '/children/:id/weekly-reports',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const reports = weeklyReports
      .filter((r) => r.studentId === studentId)
      .sort(
        (a, b) =>
          new Date(b.weekStartDate).getTime() -
          new Date(a.weekStartDate).getTime(),
      );

    return res.json({ reports, hasMore: false });
  },
);

// Hedefler
router.get(
  '/children/:id/goals',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const studentGoals = parentGoals
      .filter((g) => g.studentId === studentId)
      .map((g) => {
        // Basit ilerleme hesaplama (gerçekte daha karmaşık olmalı)
        let currentValue = 0;
        if (g.type === 'weekly_tests') {
          const weekStart = new Date(g.startDate);
          const now = new Date();
          currentValue = testResults.filter(
            (r) =>
              r.studentId === studentId &&
              new Date(r.completedAt) >= weekStart &&
              new Date(r.completedAt) <= now,
          ).length;
        }

        const progressPercent = Math.min(
          Math.round((currentValue / g.targetValue) * 100),
          100,
        );

        return {
          ...g,
          currentValue,
          progressPercent,
        };
      });

    return res.json(studentGoals);
  },
);

// Yeni hedef oluştur
router.post(
  '/children/:id/goals',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const studentId = String(req.params.id);
    const access = checkParentAccess(parentId, studentId);
    if (!access.allowed) {
      return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
        error: access.error,
      });
    }

    const { type, targetValue, startDate, endDate, reward } = req.body;

    if (!type || !targetValue || !startDate || !endDate) {
      return res
        .status(400)
        .json({ error: 'type, targetValue, startDate ve endDate gereklidir' });
    }

    const newGoal: ParentGoal = {
      id: `goal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      studentId,
      createdByParentId: parentId,
      type,
      targetValue,
      startDate,
      endDate,
      status: 'active',
      createdAt: new Date().toISOString(),
      reward,
    };

    parentGoals.push(newGoal);

    return res.json(newGoal);
  },
);

// Takvim
router.get(
  '/calendar',
  authenticate('parent'),
  (req: AuthenticatedRequest, res) => {
    const parentId = req.user!.id;
    const parent = parents.find((p) => p.id === parentId);
    if (!parent) {
      return res.status(404).json({ error: 'Veli bulunamadı' });
    }

    const startDate = req.query.startDate
      ? new Date(String(req.query.startDate))
      : new Date();
    const endDate = req.query.endDate
      ? new Date(String(req.query.endDate))
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Varsayılan: 30 gün sonrası

    const events: CalendarEvent[] = [];

    // Veli'nin çocuklarının görevleri
    parent.studentIds.forEach((studentId) => {
      const studentAssignments = assignments.filter((a) =>
        a.assignedStudentIds.includes(studentId),
      );

      studentAssignments.forEach((assignment) => {
        const dueDate = new Date(assignment.dueDate);
        if (dueDate >= startDate && dueDate <= endDate) {
          const now = new Date();
          let status: 'pending' | 'completed' | 'overdue' = 'pending';
          if (dueDate < now) {
            status = 'overdue';
          } else {
            const hasResult = testResults.some(
              (r) => r.assignmentId === assignment.id && r.studentId === studentId,
            );
            if (hasResult) {
              status = 'completed';
            }
          }

          const student = students.find((s) => s.id === studentId);
          events.push({
            id: `assignment-${assignment.id}-${studentId}`,
            type: 'assignment',
            title: `${student?.name || 'Öğrenci'}: ${assignment.title}`,
            startDate: assignment.dueDate,
            description: assignment.description,
            status,
            color: status === 'overdue' ? '#e74c3c' : status === 'completed' ? '#27ae60' : '#3498db',
            relatedId: assignment.id,
          });
        }
      });

      // Çocuğun toplantıları
      const studentMeetings = meetings.filter((m) =>
        m.studentIds.includes(studentId) || m.parentIds.includes(parentId),
      );
      studentMeetings.forEach((meeting) => {
        const meetingStart = new Date(meeting.scheduledAt);
        if (meetingStart >= startDate && meetingStart <= endDate) {
          const meetingEnd = new Date(
            meetingStart.getTime() + meeting.durationMinutes * 60 * 1000,
          );

          const student = students.find((s) => s.id === studentId);
          events.push({
            id: `meeting-${meeting.id}-${studentId}`,
            type: 'meeting',
            title: `${student?.name || 'Öğrenci'}: ${meeting.title}`,
            startDate: meeting.scheduledAt,
            endDate: meetingEnd.toISOString(),
            description: `${meeting.durationMinutes} dakika`,
            status: meetingStart < new Date() ? 'completed' : 'pending',
            color: '#9b59b6',
            relatedId: meeting.id,
          });
        }
      });
    });

    // Tip ve durum filtreleme
    const typeFilter = req.query.type as CalendarEventType | undefined;
    const statusFilter = req.query.status as string | undefined;

    let filteredEvents = events;
    if (typeFilter) {
      filteredEvents = filteredEvents.filter((e) => e.type === typeFilter);
    }
    if (statusFilter) {
      filteredEvents = filteredEvents.filter((e) => e.status === statusFilter);
    }

    // Tarihe göre sıralama
    filteredEvents.sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    return res.json({
      events: filteredEvents,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      viewType: req.query.viewType || 'month',
    });
  },
);

export default router;


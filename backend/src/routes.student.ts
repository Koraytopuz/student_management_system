import express from 'express';
import { authenticate, AuthenticatedRequest } from './auth';
import {
  allUsers,
  assignments,
  contents,
  goals,
  meetings,
  messages,
  notifications,
  subjects,
  questions,
  tests,
  testResults,
  todos,
  watchRecords,
} from './data';
import {
  CalendarEvent,
  CalendarEventType,
  Goal,
  GoalProgress,
  GoalStatus,
  GoalWithComputed,
  Notification,
  ProgressCharts,
  ProgressOverview,
  StudentDashboardSummary,
  TestAnswer,
  TestResult,
  TimeSeriesPoint,
  TodoItem,
  TodoStatus,
  TopicProgress,
  WatchRecord,
} from './types';

const router = express.Router();

// Öğrenci dashboard özeti
router.get(
  '/dashboard',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;

    const pendingAssignments = assignments.filter((a) =>
      a.assignedStudentIds.includes(studentId),
    );

    const now = Date.now();
    const last7Days = now - 7 * 24 * 60 * 60 * 1000;
    const studentResults: TestResult[] = testResults.filter(
      (r) =>
        r.studentId === studentId &&
        new Date(r.completedAt).getTime() >= last7Days,
    );

    const testsSolvedThisWeek = studentResults.length;
    const totalQuestionsThisWeek = studentResults.reduce(
      (sum, r) => sum + r.answers.length,
      0,
    );
    const averageScorePercent =
      studentResults.length === 0
        ? 0
        : Math.round(
            studentResults.reduce((sum, r) => sum + r.scorePercent, 0) /
              studentResults.length,
          );

    const lastWatched: WatchRecord[] = watchRecords
      .filter((w) => w.studentId === studentId)
      .slice(-5);

    const lastWatchedContents = lastWatched.map((w) => {
      const content = contents.find((c) => c.id === w.contentId);
      return {
        contentId: w.contentId,
        title: content?.title ?? 'Bilinmeyen içerik',
        lastPositionSeconds: w.watchedSeconds,
      };
    });

    const summary: StudentDashboardSummary = {
      pendingAssignmentsCount: pendingAssignments.length,
      testsSolvedThisWeek,
      totalQuestionsThisWeek,
      averageScorePercent,
      lastWatchedContents,
    };

    return res.json(summary);
  },
);

// Görev listesi
router.get(
  '/assignments',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const studentAssignments = assignments.filter((a) =>
      a.assignedStudentIds.includes(studentId),
    );
    return res.json(studentAssignments);
  },
);

// Görev detayı
router.get(
  '/assignments/:id',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const assignment = assignments.find((a) => a.id === id);
    if (!assignment) {
      return res.status(404).json({ error: 'Görev bulunamadı' });
    }
    if (!assignment.assignedStudentIds.includes(studentId)) {
      return res
        .status(403)
        .json({ error: 'Bu göreve erişim izniniz yok' });
    }
    const test = assignment.testId
      ? tests.find((t) => t.id === assignment.testId)
      : undefined;
    const testQuestions =
      test && test.questionIds.length > 0
        ? questions.filter((q) => test.questionIds.includes(q.id))
        : [];
    return res.json({ assignment, test, questions: testQuestions });
  },
);

// Test çözümü gönderme (basitleştirilmiş)
router.post(
  '/assignments/:id/submit',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const assignment = assignments.find((a) => a.id === id);
    if (!assignment || !assignment.testId) {
      return res.status(404).json({ error: 'Görev veya test bulunamadı' });
    }
    if (!assignment.assignedStudentIds.includes(studentId)) {
      return res
        .status(403)
        .json({ error: 'Bu göreve erişim izniniz yok' });
    }

    const test = tests.find((t) => t.id === assignment.testId);
    if (!test) {
      return res.status(404).json({ error: 'Test bulunamadı' });
    }

    const rawAnswers = (req.body.answers ?? []) as Array<{
      questionId: string;
      answer: string;
      isCorrect?: boolean;
    }>;

    // Cevapları doğru/yanlış kontrolü ile işle
    const answers: TestAnswer[] = rawAnswers.map((a) => {
      const question = questions.find((q) => q.id === a.questionId);
      let isCorrect = false;

      if (question) {
        if (
          question.type === 'multiple_choice' ||
          question.type === 'true_false'
        ) {
          isCorrect = a.answer === question.correctAnswer;
        } else if (question.type === 'open_ended') {
          // Açık uçlu sorular için şimdilik false (manuel kontrol gerekir)
          isCorrect = false;
        }
      }

      return {
        questionId: a.questionId,
        answer: a.answer,
        isCorrect,
      };
    });

    const correctCount = answers.filter((a) => a.isCorrect).length;
    const incorrectCount = answers.filter(
      (a) => !a.isCorrect && a.answer !== '',
    ).length;
    const blankCount = test.questionIds.length - (correctCount + incorrectCount);
    const scorePercent =
      test.questionIds.length === 0
        ? 0
        : Math.round(
            (correctCount / test.questionIds.length) * 100,
          );

    const result: TestResult = {
      id: `res-${Date.now()}`,
      assignmentId: assignment.id,
      studentId,
      testId: test.id,
      answers,
      correctCount,
      incorrectCount,
      blankCount,
      scorePercent,
      durationSeconds: req.body.durationSeconds ?? 0,
      completedAt: new Date().toISOString(),
    };

    testResults.push(result);

    return res.status(201).json(result);
  },
);

// Konu bazlı ilerleme özeti
router.get(
  '/progress/topics',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;

    const studentResults = testResults.filter(
      (r) => r.studentId === studentId,
    );

    const topicMap = new Map<string, TopicProgress>();

    tests.forEach((test) => {
      const key = test.topic;
      const subjectName =
        subjects.find((s) => s.id === test.subjectId)?.name ?? 'Bilinmeyen';

      if (!topicMap.has(key)) {
        topicMap.set(key, {
          topic: key,
          subjectName,
          completionPercent: 0,
          testsCompleted: 0,
          testsTotal: 0,
          averageScorePercent: 0,
          lastActivityDate: undefined,
          strengthLevel: 'average',
        });
      }

      const tp = topicMap.get(key)!;
      tp.testsTotal += 1;
    });

    studentResults.forEach((result) => {
      const test = tests.find((t) => t.id === result.testId);
      if (!test) return;
      const key = test.topic;
      const subjectName =
        subjects.find((s) => s.id === test.subjectId)?.name ?? 'Bilinmeyen';
      if (!topicMap.has(key)) {
        topicMap.set(key, {
          topic: key,
          subjectName,
          completionPercent: 0,
          testsCompleted: 0,
          testsTotal: 0,
          averageScorePercent: 0,
          lastActivityDate: undefined,
          strengthLevel: 'average',
        });
      }
      const tp = topicMap.get(key)!;
      tp.testsCompleted += 1;
      // Ortalama skor için geçici sum yerine basit yeniden hesaplama yapıyoruz
      const totalResultsForTopic = studentResults.filter((r) => {
        const t = tests.find((tt) => tt.id === r.testId);
        return t?.topic === key;
      });
      const avg =
        totalResultsForTopic.length === 0
          ? 0
          : Math.round(
              totalResultsForTopic.reduce(
                (sum, r) => sum + r.scorePercent,
                0,
              ) / totalResultsForTopic.length,
            );
      tp.averageScorePercent = avg;
      if (
        !tp.lastActivityDate ||
        new Date(result.completedAt).getTime() >
          new Date(tp.lastActivityDate).getTime()
      ) {
        tp.lastActivityDate = result.completedAt;
      }
    });

    const topics: TopicProgress[] = Array.from(topicMap.values()).map((tp) => {
      const completionPercent =
        tp.testsTotal === 0
          ? 0
          : Math.round((tp.testsCompleted / tp.testsTotal) * 100);
      let strengthLevel: TopicProgress['strengthLevel'] = 'average';
      if (tp.averageScorePercent < 50) {
        strengthLevel = 'weak';
      } else if (tp.averageScorePercent >= 75) {
        strengthLevel = 'strong';
      }
      return {
        ...tp,
        completionPercent,
        strengthLevel,
      };
    });

    const totalTestsCompleted = topics.reduce(
      (sum, t) => sum + t.testsCompleted,
      0,
    );
    const totalQuestionsSolved = studentResults.reduce(
      (sum, r) => sum + r.answers.length,
      0,
    );
    const averageScorePercent =
      studentResults.length === 0
        ? 0
        : Math.round(
            studentResults.reduce((sum, r) => sum + r.scorePercent, 0) /
              studentResults.length,
          );
    const overallCompletionPercent =
      topics.length === 0
        ? 0
        : Math.round(
            topics.reduce((sum, t) => sum + t.completionPercent, 0) /
              topics.length,
          );

    const overview: ProgressOverview = {
      topics,
      overallCompletionPercent,
      totalTestsCompleted,
      totalQuestionsSolved,
      averageScorePercent,
    };

    return res.json(overview);
  },
);

// İçerik listesi (öğrenciye atanmış)
router.get(
  '/contents',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const availableContents = contents.filter(
      (c) =>
        c.assignedToStudentIds.includes(studentId) ||
        c.assignedToClassIds.length > 0,
    );
    return res.json(availableContents);
  },
);

// İzlenme ilerleyişi güncelleme
router.post(
  '/contents/:id/watch',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const contentId = String(req.params.id);
    const content = contents.find((c) => c.id === contentId);
    if (!content) {
      return res.status(404).json({ error: 'İçerik bulunamadı' });
    }

    const watchedSeconds: number = req.body.watchedSeconds ?? 0;
    const completed: boolean = !!req.body.completed;

    let record = watchRecords.find(
      (w) => w.contentId === contentId && w.studentId === studentId,
    );

    if (!record) {
      const newRecord: WatchRecord = {
        id: `watch-${Date.now()}`,
        contentId,
        studentId,
        watchedSeconds,
        completed,
        lastWatchedAt: new Date().toISOString(),
      };
      watchRecords.push(newRecord);
      record = newRecord;
    } else {
      record.watchedSeconds = watchedSeconds;
      record.completed = completed || record.completed;
      record.lastWatchedAt = new Date().toISOString();
    }

    return res.json(record);
  },
);

// Zaman serisi grafik verileri (basit günlük özet)
router.get(
  '/progress/charts',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const now = new Date();
    const days = 7;

    const dailyMap = new Map<string, TimeSeriesPoint>();

    for (let i = 0; i < days; i += 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, {
        date: key,
        questionsSolved: 0,
        testsCompleted: 0,
        averageScore: 0,
        studyMinutes: 0,
      });
    }

    const studentResults = testResults.filter(
      (r) => r.studentId === studentId,
    );
    studentResults.forEach((r) => {
      const key = r.completedAt.slice(0, 10);
      const entry = dailyMap.get(key);
      if (!entry) return;
      entry.testsCompleted += 1;
      entry.questionsSolved += r.answers.length;
      // averageScore'ı güncelle
      const sameDayResults = studentResults.filter(
        (x) => x.completedAt.slice(0, 10) === key,
      );
      entry.averageScore =
        sameDayResults.length === 0
          ? 0
          : Math.round(
              sameDayResults.reduce(
                (sum, x) => sum + x.scorePercent,
                0,
              ) / sameDayResults.length,
            );
    });

    const studentWatch = watchRecords.filter(
      (w) => w.studentId === studentId,
    );
    studentWatch.forEach((w) => {
      const key = w.lastWatchedAt.slice(0, 10);
      const entry = dailyMap.get(key);
      if (!entry) return;
      entry.studyMinutes += Math.round(w.watchedSeconds / 60);
    });

    const dailyData = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const charts: ProgressCharts = {
      dailyData,
    };

    return res.json(charts);
  },
);

// Mesajlar (gönderen ve alıcı isimleriyle)
router.get(
  '/messages',
  authenticate('student'),
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

// Öğrencinin mesaj gönderebileceği öğretmen listesi
router.get(
  '/teachers',
  authenticate('student'),
  (_req: AuthenticatedRequest, res) => {
    // Şimdilik tüm öğretmenleri basit bilgileriyle döndür
    const teacherList = teachers.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
    }));
    return res.json(teacherList);
  },
);

// Yeni mesaj gönderme
router.post(
  '/messages',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const fromUserId = req.user!.id;
    const { toUserId, text } = req.body as {
      toUserId?: string;
      text?: string;
    };

    if (!toUserId || !text) {
      return res
        .status(400)
        .json({ error: 'toUserId ve text alanları zorunludur' });
    }

    const message = {
      id: `msg-${Date.now()}`,
      fromUserId,
      toUserId,
      text,
      createdAt: new Date().toISOString(),
      read: false,
    };

    messages.push(message);

    const notification: Notification = {
      id: `notif-${Date.now()}`,
      userId: toUserId,
      type: 'message_received',
      title: 'Yeni mesajınız var',
      body: 'Öğrenciden yeni bir mesaj aldınız.',
      createdAt: new Date().toISOString(),
      read: false,
      relatedEntityType: 'message',
      relatedEntityId: message.id,
    };

    notifications.push(notification);

    return res.status(201).json(message);
  },
);

// Toplantılar
router.get(
  '/meetings',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const userMeetings = meetings.filter((m) =>
      m.studentIds.includes(userId),
    );
    return res.json(userMeetings);
  },
);

// Bildirimler
router.get(
  '/notifications',
  authenticate('student'),
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

// Bildirim - okunmamış sayısı
router.get(
  '/notifications/unread-count',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const count = notifications.filter(
      (n) => n.userId === userId && !n.read,
    ).length;
    return res.json({ count });
  },
);

// Bildirim - tekil okundu işaretleme
router.put(
  '/notifications/:id/read',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = String(req.params.id);
    const notification = notifications.find(
      (n) => n.id === id && n.userId === userId,
    );
    if (!notification) {
      return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }
    notification.read = true;
    notification.readAt = new Date().toISOString();
    return res.json(notification);
  },
);

// Bildirim - tümünü okundu işaretleme
router.put(
  '/notifications/read-all',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    let updated = 0;
    notifications.forEach((n) => {
      if (n.userId === userId && !n.read) {
        n.read = true;
        n.readAt = new Date().toISOString();
        updated += 1;
      }
    });
    return res.json({ updated });
  },
);

// Öğrenci To-Do listesi
router.get(
  '/todos',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const studentTodos = todos.filter((t) => t.studentId === studentId);
    return res.json(studentTodos);
  },
);

// Hedefler
router.get(
  '/goals',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const studentGoals = goals.filter((g) => g.studentId === studentId);

    const withComputed: GoalWithComputed[] = studentGoals.map((g) => {
      const progressInfo = computeGoalProgressInternal(studentId, g);
      return progressInfo.goal;
    });

    return res.json(withComputed);
  },
);

router.post(
  '/goals',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const { type, targetValue, startDate, endDate, topic } = req.body as {
      type?: Goal['type'];
      targetValue?: number;
      startDate?: string;
      endDate?: string;
      topic?: string;
    };

    if (!type || targetValue == null || !startDate || !endDate) {
      return res.status(400).json({
        error: 'type, targetValue, startDate ve endDate alanları zorunludur',
      });
    }

    const goal: Goal = {
      id: `goal-${Date.now()}`,
      studentId,
      type,
      targetValue,
      startDate,
      endDate,
      topic,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    goals.push(goal);
    const progress = computeGoalProgressInternal(studentId, goal);
    return res.status(201).json(progress.goal);
  },
);

router.put(
  '/goals/:id',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const goal = goals.find((g) => g.id === id && g.studentId === studentId);
    if (!goal) {
      return res.status(404).json({ error: 'Hedef bulunamadı' });
    }

    const { targetValue, startDate, endDate, status } = req.body as Partial<
      Pick<Goal, 'targetValue' | 'startDate' | 'endDate' | 'status'>
    >;

    if (targetValue !== undefined) goal.targetValue = targetValue;
    if (startDate !== undefined) goal.startDate = startDate;
    if (endDate !== undefined) goal.endDate = endDate;
    if (status !== undefined) goal.status = status as GoalStatus;

    const progress = computeGoalProgressInternal(studentId, goal);
    return res.json(progress.goal);
  },
);

router.delete(
  '/goals/:id',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const goal = goals.find((g) => g.id === id && g.studentId === studentId);
    if (!goal) {
      return res.status(404).json({ error: 'Hedef bulunamadı' });
    }
    goal.status = 'cancelled';
    const progress = computeGoalProgressInternal(studentId, goal);
    return res.json(progress.goal);
  },
);

router.get(
  '/goals/:id/progress',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const goal = goals.find((g) => g.id === id && g.studentId === studentId);
    if (!goal) {
      return res.status(404).json({ error: 'Hedef bulunamadı' });
    }

    const progress = computeGoalProgressInternal(studentId, goal);
    return res.json(progress);
  },
);

function computeGoalProgressInternal(
  studentId: string,
  goal: Goal,
): GoalProgress {
  const start = new Date(goal.startDate).getTime();
  const end = new Date(goal.endDate).getTime();

  const relevantResults = testResults.filter((r) => {
    const t = tests.find((tt) => tt.id === r.testId);
    if (!t) return false;
    if (goal.topic && t.topic !== goal.topic) return false;
    const ts = new Date(r.completedAt).getTime();
    return (
      r.studentId === studentId &&
      ts >= start &&
      ts <= end
    );
  });

  let currentValue = 0;
  if (goal.type === 'weekly_questions') {
    currentValue = relevantResults.reduce(
      (sum, r) => sum + r.answers.length,
      0,
    );
  } else if (goal.type === 'weekly_tests') {
    currentValue = relevantResults.length;
  } else if (goal.type === 'score_percent') {
    if (relevantResults.length > 0) {
      currentValue = Math.round(
        relevantResults.reduce(
          (sum, r) => sum + r.scorePercent,
          0,
        ) / relevantResults.length,
      );
    } else {
      currentValue = 0;
    }
  } else if (goal.type === 'topic_completion') {
    // Basitçe tests sayısına göre ilerleme
    const topicTests = tests.filter((t) => t.topic === goal.topic);
    const completedTests = new Set(
      relevantResults.map((r) => r.testId),
    );
    currentValue =
      topicTests.length === 0
        ? 0
        : Math.round(
            (completedTests.size / topicTests.length) * 100,
          );
  }

  const progressPercent =
    goal.type === 'topic_completion'
      ? Math.max(0, Math.min(100, currentValue))
      : goal.targetValue === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            100,
            Math.round((currentValue / goal.targetValue) * 100),
          ),
        );

  const now = Date.now();
  let status: GoalStatus = goal.status;
  if (status !== 'cancelled') {
    if (progressPercent >= 100) {
      status = 'completed';
    } else if (now > end) {
      status = 'failed';
    } else {
      status = 'active';
    }
  }

  const daysTotal = Math.max(
    1,
    Math.round((end - start) / (24 * 60 * 60 * 1000)),
  );
  const daysPassed = Math.max(
    0,
    Math.min(
      daysTotal,
      Math.round((now - start) / (24 * 60 * 60 * 1000)),
    ),
  );
  const expectedPercent =
    daysTotal === 0 ? 100 : Math.round((daysPassed / daysTotal) * 100);
  const onTrack = progressPercent >= expectedPercent;

  const dailyProgress: { date: string; value: number }[] = [];
  relevantResults.forEach((r) => {
    const key = r.completedAt.slice(0, 10);
    const existing = dailyProgress.find((p) => p.date === key);
    const inc =
      goal.type === 'weekly_questions'
        ? r.answers.length
        : 1;
    if (existing) {
      existing.value += inc;
    } else {
      dailyProgress.push({ date: key, value: inc });
    }
  });
  dailyProgress.sort((a, b) => a.date.localeCompare(b.date));

  const goalWithComputed: GoalWithComputed = {
    ...goal,
    status,
    currentValue,
    progressPercent,
  };

  return {
    goal: goalWithComputed,
    dailyProgress,
    estimatedCompletionDate: undefined,
    onTrack,
  };
}

router.post(
  '/todos',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const {
      title,
      description,
      priority,
      plannedDate,
      relatedAssignmentId,
      relatedContentId,
    } = req.body as {
      title?: string;
      description?: string;
      priority?: 'low' | 'medium' | 'high';
      plannedDate?: string;
      relatedAssignmentId?: string;
      relatedContentId?: string;
    };

    if (!title) {
      return res.status(400).json({ error: 'title alanı zorunludur' });
    }

    const todo: TodoItem = {
      id: `todo-${Date.now()}`,
      studentId,
      title,
      description,
      status: 'pending',
      priority: priority ?? 'medium',
      createdAt: new Date().toISOString(),
      plannedDate,
      completedAt: undefined,
      relatedAssignmentId,
      relatedContentId,
    };

    todos.push(todo);
    return res.status(201).json(todo);
  },
);

router.put(
  '/todos/:id',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const todo = todos.find((t) => t.id === id && t.studentId === studentId);
    if (!todo) {
      return res.status(404).json({ error: 'To-Do bulunamadı' });
    }

    const {
      title,
      description,
      status,
      priority,
      plannedDate,
    } = req.body as Partial<
      Pick<
        TodoItem,
        'title' | 'description' | 'status' | 'priority' | 'plannedDate'
      >
    >;

    if (title !== undefined) todo.title = title;
    if (description !== undefined) todo.description = description;
    if (priority !== undefined) todo.priority = priority;
    if (plannedDate !== undefined) todo.plannedDate = plannedDate;

    if (status !== undefined) {
      todo.status = status as TodoStatus;
      if (status === 'completed' && !todo.completedAt) {
        todo.completedAt = new Date().toISOString();
      }
    }

    return res.json(todo);
  },
);

router.put(
  '/todos/:id/complete',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const todo = todos.find((t) => t.id === id && t.studentId === studentId);
    if (!todo) {
      return res.status(404).json({ error: 'To-Do bulunamadı' });
    }

    todo.status = 'completed';
    todo.completedAt = new Date().toISOString();
    return res.json(todo);
  },
);

router.delete(
  '/todos/:id',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const index = todos.findIndex(
      (t) => t.id === id && t.studentId === studentId,
    );
    if (index === -1) {
      return res.status(404).json({ error: 'To-Do bulunamadı' });
    }
    const [removed] = todos.splice(index, 1);
    return res.json(removed);
  },
);

// Takvim
router.get(
  '/calendar',
  authenticate('student'),
  (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const startDate = req.query.startDate
      ? new Date(String(req.query.startDate))
      : new Date();
    const endDate = req.query.endDate
      ? new Date(String(req.query.endDate))
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Varsayılan: 30 gün sonrası

    const events: CalendarEvent[] = [];

    // Görevler (assignments)
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
          // Görevin tamamlanıp tamamlanmadığını kontrol et
          const hasResult = testResults.some(
            (r) => r.assignmentId === assignment.id && r.studentId === studentId,
          );
          if (hasResult) {
            status = 'completed';
          }
        }

        events.push({
          id: `assignment-${assignment.id}`,
          type: 'assignment',
          title: assignment.title,
          startDate: assignment.dueDate,
          description: assignment.description,
          status,
          color: status === 'overdue' ? '#e74c3c' : status === 'completed' ? '#27ae60' : '#3498db',
          relatedId: assignment.id,
        });
      }
    });

    // Toplantılar
    const studentMeetings = meetings.filter((m) =>
      m.studentIds.includes(studentId),
    );
    studentMeetings.forEach((meeting) => {
      const meetingStart = new Date(meeting.scheduledAt);
      if (meetingStart >= startDate && meetingStart <= endDate) {
        const meetingEnd = new Date(
          meetingStart.getTime() + meeting.durationMinutes * 60 * 1000,
        );

        events.push({
          id: `meeting-${meeting.id}`,
          type: 'meeting',
          title: meeting.title,
          startDate: meeting.scheduledAt,
          endDate: meetingEnd.toISOString(),
          description: `${meeting.durationMinutes} dakika`,
          status: meetingStart < new Date() ? 'completed' : 'pending',
          color: '#9b59b6',
          relatedId: meeting.id,
        });
      }
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


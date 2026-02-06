import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { authenticate, AuthenticatedRequest } from './auth';
import { prisma } from './db';
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
  Teacher,
} from './types';
import { createLiveKitToken, getLiveKitUrl } from './livekit';

const router = express.Router();

const USER_CONFIGURED_GEMINI_MODEL = process.env.GEMINI_MODEL?.trim();
const DEFAULT_MODEL = 'gemini-3-flash-preview';

function resolveModelCandidates(_hasImage: boolean) {
  if (USER_CONFIGURED_GEMINI_MODEL) {
    return [USER_CONFIGURED_GEMINI_MODEL];
  }
  // Tek ve modern bir varsayılan model kullanıyoruz
  return [DEFAULT_MODEL];
}
const SYSTEM_PROMPT =
  'Sen nazik ve net bir ogrenci asistanisin. Sorulara kisa, uygulanabilir ve adim adim yanit ver. ' +
  'Konu net degilse kisa bir netlestirme sorusu sor. Odevleri dogrudan cozmeyip yol goster. ' +
  'Cevaplarini Turkce ver.';

type AiChatMessage = {
  role: 'user' | 'assistant';
  content?: string | undefined;
  imageBase64?: string | undefined;
  imageMimeType?: string | undefined;
};

function extractBase64Payload(
  raw?: string,
  fallbackMime?: string,
): { data: string; mimeType: string } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const dataUrlMatch = trimmed.match(/^data:(.+);base64,(.+)$/);
  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1] ?? fallbackMime ?? 'image/png';
    const data = dataUrlMatch[2] ?? '';
    if (!data) return null;
    return {
      mimeType,
      data,
    };
  }

  const sanitizedData = trimmed.replace(/\s+/g, '');
  if (!sanitizedData) return null;

  return {
    data: sanitizedData,
    mimeType: fallbackMime ?? 'image/png',
  };
}

function sanitizeMessages(messages: AiChatMessage[]): AiChatMessage[] {
  return messages
    .filter((item) => {
      const hasText = item.content && item.content.trim().length > 0;
      const hasImage = item.imageBase64 && item.imageBase64.trim().length > 0;
      return hasText || hasImage;
    })
    .slice(-8)
    .map((item) => ({
      ...item,
      content: item.content?.trim(),
    }));
}

function toGeminiParts(message: AiChatMessage) {
  const parts: Array<
    | { text: string }
    | {
      inlineData: {
        data: string;
        mimeType: string;
      };
    }
  > = [];

  if (message.content) {
    parts.push({ text: message.content });
  }

  const imagePayload = extractBase64Payload(message.imageBase64, message.imageMimeType);
  if (imagePayload) {
    parts.push({
      inlineData: {
        data: imagePayload.data,
        mimeType: imagePayload.mimeType,
      },
    });
  }

  if (parts.length === 0) {
    parts.push({ text: ' ' });
  }

  return parts;
}

function toGeminiContents(
  history: AiChatMessage[],
  latest: AiChatMessage,
): Array<{
  role: 'user' | 'model';
  parts: ReturnType<typeof toGeminiParts>;
}> {
  const combined = [...sanitizeMessages(history), latest];
  return combined.map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user',
    parts: toGeminiParts(item),
  }));
}

function extractResponseText(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const maybeText = (response as { text?: string | (() => string) }).text;
  if (typeof maybeText === 'function') {
    try {
      const value = maybeText();
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    } catch {
      // ignore
    }
  } else if (typeof maybeText === 'string' && maybeText.trim()) {
    return maybeText.trim();
  }

  const candidates = (response as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const parts = candidates[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const joined = parts
        .map((part) => (part?.text ?? '').trim())
        .filter(Boolean)
        .join('\n');
      if (joined.trim()) {
        return joined.trim();
      }
    }
  }

  return null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error && typeof (error as any).message === 'string') {
    return (error as any).message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Bilinmeyen hata';
  }
}

function isModelNotFoundError(error: unknown) {
  const message = extractErrorMessage(error).toLowerCase();
  return message.includes('not found') || message.includes('unknown model');
}

// Öğrenci dashboard özeti
router.get(
  '/dashboard',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;

    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [pendingAssignmentsCount, studentResults, lastWatched] = await Promise.all([
      prisma.assignment.count({
        where: { students: { some: { studentId } } },
      }),
      prisma.testResult.findMany({
        where: { studentId, completedAt: { gte: last7Days } },
        include: { answers: true },
      }),
      prisma.watchRecord.findMany({
        where: { studentId },
        orderBy: { lastWatchedAt: 'desc' },
        take: 5,
        include: { content: { select: { title: true } } },
      }),
    ]);

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

    const lastWatchedContents = lastWatched.map((w) => ({
      contentId: w.contentId,
      title: w.content?.title ?? 'Bilinmeyen içerik',
      lastPositionSeconds: w.watchedSeconds,
    }));

    const summary: StudentDashboardSummary = {
      pendingAssignmentsCount,
      testsSolvedThisWeek,
      totalQuestionsThisWeek,
      averageScorePercent,
      lastWatchedContents,
    };

    return res.json(summary);
  },
);

router.post(
  '/ai/chat',
  // authenticate('student'), // Chatbot temporarily disabled for students
  async (req: AuthenticatedRequest, res) => {
    return res.status(404).json({ error: 'Chatbot service not available for students' });
    /*
    const { message, history, imageBase64, imageMimeType } = req.body as {
      message?: string;
      history?: AiChatMessage[];
      imageBase64?: string;
      imageMimeType?: string;
    };

    // ... (code omitted) ...

    return res.status(502).json({ error: 'Yapay zeka yanıt veremedi' });
  } catch (error) {
    console.error('[AI_CHAT] Gemini API request failed', error);
    return res.status(500).json({
      error: 'Yapay zeka servisine bağlanılamadı',
    });
  }
  */
  },
);

// Görev listesi (sadece bekleyen)
router.get(
  '/assignments',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;

    // Sadece pending durumundaki assignmentları getir
    const assignmentStudents = await prisma.assignmentStudent.findMany({
      where: {
        studentId,
        // @ts-ignore: Prisma types sync issue
        status: 'pending',
      },
      include: {
        assignment: {
          include: {
            students: { select: { studentId: true } },
          },
        },
      },
    });

    return res.json(
      // @ts-ignore: Prisma types sync issue - assignment relation exists at runtime
      assignmentStudents.map((as) => ({
        id: as.assignment.id,
        title: as.assignment.title,
        description: as.assignment.description ?? undefined,
        testId: as.assignment.testId ?? undefined,
        contentId: as.assignment.contentId ?? undefined,
        classId: as.assignment.classId ?? undefined,
        assignedStudentIds: as.assignment.students.map((s) => s.studentId),
        dueDate: as.assignment.dueDate.toISOString(),
        points: as.assignment.points,
      })),
    );
  },
);

// Bekleyen ödevler (canlı ders için) - Types verified via tsc
router.get(
  '/assignments/pending',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const now = new Date();

    const pendingAssignments = await prisma.assignmentStudent.findMany({
      where: {
        studentId,
        // @ts-ignore: Prisma types sync issue
        status: 'pending',
        assignment: {
          dueDate: { gte: now }
        }
      },
      include: {
        assignment: {
          select: {
            id: true,
            title: true,
            description: true,
            dueDate: true,
            points: true,
            testId: true,
            contentId: true
          }
        }
      },
      orderBy: {
        assignment: {
          dueDate: 'asc'
        }
      }
    });

    return res.json(
      pendingAssignments.map((as) => ({
        // @ts-ignore: Prisma types sync issue
        id: as.assignment.id,
        // @ts-ignore: Prisma types sync issue
        title: as.assignment.title,
        // @ts-ignore: Prisma types sync issue
        description: as.assignment.description ?? undefined,
        // @ts-ignore: Prisma types sync issue
        dueDate: as.assignment.dueDate.toISOString(),
        // @ts-ignore: Prisma types sync issue
        points: as.assignment.points,
        // @ts-ignore: Prisma types sync issue
        testId: as.assignment.testId ?? undefined,
        // @ts-ignore: Prisma types sync issue
        contentId: as.assignment.contentId ?? undefined,
      })),
    );
  },
);

// Ödevi tamamla
router.post(
  '/assignments/:id/complete',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const assignmentId = String(req.params.id);
    const { submittedInLiveClass } = req.body as { submittedInLiveClass?: boolean };

    const assignmentStudent = await prisma.assignmentStudent.findUnique({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId
        }
      }
    });

    if (!assignmentStudent) {
      return res.status(404).json({ error: 'Ödev bulunamadı' });
    }

    const updated = await prisma.assignmentStudent.update({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId
        }
      },
      data: {
        // @ts-ignore: Prisma types sync issue
        status: 'completed',
        // @ts-ignore: Prisma types sync issue
        completedAt: new Date(),
        // @ts-ignore: Prisma types sync issue
        submittedInLiveClass: submittedInLiveClass ?? false
      }
    });

    return res.json({
      success: true,
      assignmentId: updated.assignmentId,
      studentId: updated.studentId,
      // @ts-ignore: Prisma types sync issue
      status: updated.status,
      // @ts-ignore: Prisma types sync issue
      completedAt: updated.completedAt?.toISOString()
    });
  },
);

// Görev detayı
router.get(
  '/assignments/:id',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const assignment = await prisma.assignment.findFirst({
      where: {
        id,
        students: { some: { studentId } },
      },
      include: { students: { select: { studentId: true } } },
    });
    if (!assignment) {
      return res.status(404).json({ error: 'Görev bulunamadı' });
    }
    let test = null;
    let testQuestions: { id: string; text: string; type: string; choices?: string[]; correctAnswer?: string; solutionExplanation?: string; topic: string; difficulty: string }[] = [];
    if (assignment.testId) {
      test = await prisma.test.findUnique({
        where: { id: assignment.testId },
        include: { questions: { orderBy: { orderIndex: 'asc' } } },
      });
      if (test) {
        testQuestions = test.questions.map((q) => ({
          id: q.id,
          text: q.text,
          type: q.type,
          choices: (q.choices as string[]) ?? undefined,
          correctAnswer: q.correctAnswer ?? undefined,
          solutionExplanation: q.solutionExplanation ?? undefined,
          topic: q.topic,
          difficulty: q.difficulty,
        }));
      }
    }
    return res.json({
      assignment: {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description ?? undefined,
        testId: assignment.testId ?? undefined,
        contentId: assignment.contentId ?? undefined,
        classId: assignment.classId ?? undefined,
        assignedStudentIds: assignment.students.map((s) => s.studentId),
        dueDate: assignment.dueDate.toISOString(),
        points: assignment.points,
      },
      test: test
        ? {
          id: test.id,
          title: test.title,
          subjectId: test.subjectId,
          topic: test.topic,
          questionIds: test.questions.map((q) => q.id),
          createdByTeacherId: test.createdByTeacherId,
        }
        : undefined,
      questions: testQuestions,
    });
  },
);

// Test çözümü gönderme (basitleştirilmiş)
router.post(
  '/assignments/:id/submit',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const assignment = await prisma.assignment.findFirst({
      where: {
        id,
        testId: { not: null },
        students: { some: { studentId } },
      },
      include: { students: { select: { studentId: true } } },
    });
    if (!assignment || !assignment.testId) {
      return res.status(404).json({ error: 'Görev veya test bulunamadı' });
    }

    const test = await prisma.test.findUnique({
      where: { id: assignment.testId },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!test) {
      return res.status(404).json({ error: 'Test bulunamadı' });
    }

    const rawAnswers = (req.body.answers ?? []) as Array<{
      questionId: string;
      answer: string;
      isCorrect?: boolean;
      scratchpadImageData?: string;
    }>;

    const questionMap = new Map(test.questions.map((q) => [q.id, q]));
    const answers: TestAnswer[] = rawAnswers.map((a) => {
      const question = questionMap.get(a.questionId);
      let isCorrect = false;
      if (question) {
        if (question.type === 'multiple_choice' || question.type === 'true_false') {
          isCorrect = a.answer === question.correctAnswer;
        }
      }
      return {
        questionId: a.questionId,
        answer: a.answer,
        isCorrect,
        ...(a.scratchpadImageData ? { scratchpadImageData: a.scratchpadImageData } : {}),
      };
    });

    const correctCount = answers.filter((a) => a.isCorrect).length;
    const incorrectCount = answers.filter((a) => !a.isCorrect && a.answer !== '').length;
    const blankCount = test.questions.length - (correctCount + incorrectCount);
    const scorePercent =
      test.questions.length === 0
        ? 0
        : Math.round((correctCount / test.questions.length) * 100);

    const result = await prisma.testResult.create({
      data: {
        assignmentId: assignment.id,
        studentId,
        testId: test.id,
        correctCount,
        incorrectCount,
        blankCount,
        scorePercent,
        durationSeconds: req.body.durationSeconds ?? 0,
        completedAt: new Date(),
        answers: {
          create: answers.map((a) => ({
            questionId: a.questionId,
            answer: a.answer,
            isCorrect: a.isCorrect,
            scratchpadImageData: a.scratchpadImageData,
          })),
        },
      },
      include: { answers: true },
    });

    // Ödevi tamamlandı olarak işaretle
    await prisma.assignmentStudent.updateMany({
      where: {
        assignmentId: assignment.id,
        studentId,
      },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    return res.status(201).json({
      id: result.id,
      assignmentId: result.assignmentId,
      studentId: result.studentId,
      testId: result.testId,
      answers: result.answers.map((a) => ({
        questionId: a.questionId,
        answer: a.answer,
        isCorrect: a.isCorrect,
        scratchpadImageData: a.scratchpadImageData ?? undefined,
      })),
      correctCount: result.correctCount,
      incorrectCount: result.incorrectCount,
      blankCount: result.blankCount,
      scorePercent: result.scorePercent,
      durationSeconds: result.durationSeconds,
      completedAt: result.completedAt.toISOString(),
    });
  },
);

// Konu bazlı ilerleme özeti
router.get(
  '/progress/topics',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;

    const [studentResults, testsData, subjectsData] = await Promise.all([
      prisma.testResult.findMany({
        where: { studentId },
        include: { answers: true },
      }),
      prisma.test.findMany({ include: { subject: true } }),
      prisma.subject.findMany(),
    ]);
    const subjectMap = new Map(subjectsData.map((s) => [s.id, s.name]));

    const topicMap = new Map<string, TopicProgress>();

    testsData.forEach((test) => {
      const key = test.topic;
      const subjectName = subjectMap.get(test.subjectId) ?? 'Bilinmeyen';
      if (!topicMap.has(key)) {
        topicMap.set(key, {
          topic: key,
          subjectName,
          completionPercent: 0,
          testsCompleted: 0,
          testsTotal: 0,
          averageScorePercent: 0,
          strengthLevel: 'average',
        });
      }
      topicMap.get(key)!.testsTotal += 1;
    });

    const testMap = new Map(testsData.map((t) => [t.id, t]));
    studentResults.forEach((result) => {
      const test = testMap.get(result.testId);
      if (!test) return;
      const key = test.topic;
      const subjectName = subjectMap.get(test.subjectId) ?? 'Bilinmeyen';
      if (!topicMap.has(key)) {
        topicMap.set(key, {
          topic: key,
          subjectName,
          completionPercent: 0,
          testsCompleted: 0,
          testsTotal: 0,
          averageScorePercent: 0,
          strengthLevel: 'average',
        });
      }
      const tp = topicMap.get(key)!;
      tp.testsCompleted += 1;
      const totalResultsForTopic = studentResults.filter((r) => {
        const t = testMap.get(r.testId);
        return t?.topic === key;
      });
      tp.averageScorePercent =
        totalResultsForTopic.length === 0
          ? 0
          : Math.round(
            totalResultsForTopic.reduce((sum, r) => sum + r.scorePercent, 0) /
            totalResultsForTopic.length,
          );
      const completedAtStr = result.completedAt.toISOString();
      if (
        !tp.lastActivityDate ||
        new Date(completedAtStr).getTime() > new Date(tp.lastActivityDate!).getTime()
      ) {
        tp.lastActivityDate = completedAtStr;
      }
    });

    const topics: TopicProgress[] = Array.from(topicMap.values()).map((tp) => {
      const completionPercent =
        tp.testsTotal === 0
          ? 0
          : Math.round((tp.testsCompleted / tp.testsTotal) * 100);
      let strengthLevel: TopicProgress['strengthLevel'] = 'average';
      if (tp.averageScorePercent < 50) strengthLevel = 'weak';
      else if (tp.averageScorePercent >= 75) strengthLevel = 'strong';
      return { ...tp, completionPercent, strengthLevel };
    });

    const totalTestsCompleted = topics.reduce((sum, t) => sum + t.testsCompleted, 0);
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
          topics.reduce((sum, t) => sum + t.completionPercent, 0) / topics.length,
        );

    return res.json({
      topics,
      overallCompletionPercent,
      totalTestsCompleted,
      totalQuestionsSolved,
      averageScorePercent,
    });
  },
);

// İçerik listesi (tüm içerikler)
router.get(
  '/contents',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    // Tüm içerikleri göster - öğretmenler yüklediği videolar otomatik olarak görünsün
    const availableContents = await prisma.contentItem.findMany({
      include: {
        classGroups: { select: { classGroupId: true } },
        students: { select: { studentId: true } },
      },
    });
    return res.json(
      availableContents.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description ?? undefined,
        type: c.type,
        subjectId: c.subjectId,
        topic: c.topic,
        gradeLevel: c.gradeLevel,
        durationMinutes: c.durationMinutes ?? undefined,
        tags: c.tags,
        url: c.url,
        assignedToClassIds: c.classGroups.map((g) => g.classGroupId),
        assignedToStudentIds: c.students.map((s) => s.studentId),
      })),
    );
  },
);

// İzlenme ilerleyişi güncelleme
router.post(
  '/contents/:id/watch',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const contentId = String(req.params.id);
    const content = await prisma.contentItem.findUnique({ where: { id: contentId } });
    if (!content) {
      return res.status(404).json({ error: 'İçerik bulunamadı' });
    }

    const watchedSeconds: number = req.body.watchedSeconds ?? 0;
    const completed: boolean = !!req.body.completed;

    const record = await prisma.watchRecord.upsert({
      where: {
        contentId_studentId: { contentId, studentId },
      },
      create: {
        contentId,
        studentId,
        watchedSeconds,
        completed,
        lastWatchedAt: new Date(),
      },
      update: {
        watchedSeconds,
        completed: completed || undefined,
        lastWatchedAt: new Date(),
      },
    });

    return res.json({
      id: record.id,
      contentId: record.contentId,
      studentId: record.studentId,
      watchedSeconds: record.watchedSeconds,
      completed: record.completed,
      lastWatchedAt: record.lastWatchedAt.toISOString(),
    });
  },
);

// Zaman serisi grafik verileri (basit günlük özet)
router.get(
  '/progress/charts',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
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

    const [studentResults, studentWatch] = await Promise.all([
      prisma.testResult.findMany({
        where: { studentId },
        include: { answers: true },
      }),
      prisma.watchRecord.findMany({ where: { studentId } }),
    ]);

    studentResults.forEach((r) => {
      const key = r.completedAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(key);
      if (!entry) return;
      entry.testsCompleted += 1;
      entry.questionsSolved += r.answers.length;
      const sameDayResults = studentResults.filter(
        (x) => x.completedAt.toISOString().slice(0, 10) === key,
      );
      entry.averageScore =
        sameDayResults.length === 0
          ? 0
          : Math.round(
            sameDayResults.reduce((sum, x) => sum + x.scorePercent, 0) /
            sameDayResults.length,
          );
    });

    studentWatch.forEach((w) => {
      const key = w.lastWatchedAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(key);
      if (!entry) return;
      entry.studyMinutes += Math.round(w.watchedSeconds / 60);
    });

    const dailyData = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    return res.json({ dailyData });
  },
);

// Mesajlar (gönderen ve alıcı isimleriyle)
router.get(
  '/messages',
  authenticate('student'),
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

// Öğrencinin mesaj gönderebileceği öğretmen listesi
router.get(
  '/teachers',
  authenticate('student'),
  async (_req: AuthenticatedRequest, res) => {
    const teachersData = await prisma.user.findMany({
      where: { role: 'teacher' },
      select: { id: true, name: true, email: true },
    });
    return res.json(teachersData);
  },
);

// Yeni mesaj gönderme
router.post(
  '/messages',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const fromUserId = req.user!.id;
    const { toUserId, text } = req.body as { toUserId?: string; text?: string };

    if (!toUserId || !text) {
      return res.status(400).json({ error: 'toUserId ve text alanları zorunludur' });
    }

    const message = await prisma.message.create({
      data: { fromUserId, toUserId, text, read: false },
    });

    await prisma.notification.create({
      data: {
        userId: toUserId,
        type: 'message_received',
        title: 'Yeni mesajınız var',
        body: 'Öğrenciden yeni bir mesaj aldınız.',
        read: false,
        relatedEntityType: 'message',
        relatedEntityId: message.id,
      },
    });

    return res.status(201).json({
      id: message.id,
      fromUserId: message.fromUserId,
      toUserId: message.toUserId,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
      read: message.read,
    });
  },
);

// Toplantılar
router.get(
  '/meetings',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const userMeetings = await prisma.meeting.findMany({
      where: { students: { some: { studentId: userId } } },
      include: {
        students: { select: { studentId: true } },
        parents: { select: { parentId: true } },
      },
    });
    return res.json(
      userMeetings.map((m) => ({
        id: m.id,
        type: m.type,
        title: m.title,
        teacherId: m.teacherId,
        studentIds: m.students.map((s) => s.studentId),
        parentIds: m.parents.map((p) => p.parentId),
        scheduledAt: m.scheduledAt.toISOString(),
        durationMinutes: m.durationMinutes,
        meetingUrl: m.meetingUrl,
      })),
    );
  },
);

// Canlı derse katıl (öğrenci)
router.post(
  '/meetings/:id/join-live',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const meetingId = String(req.params.id);

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { students: { select: { studentId: true } } },
    });

    if (!meeting) {
      return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }

    const isParticipant = meeting.students.some((s) => s.studentId === studentId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Bu toplantıya katılma yetkiniz yok' });
    }

    // Canlı dersin açılması sadece öğretmen tarafından yapılabilsin.
    // Öğretmen yayını başlatmadıysa (roomId henüz yoksa) hata döndür.
    if (!meeting.roomId) {
      return res
        .status(409)
        .json({ error: 'Bu canlı ders henüz öğretmen tarafından başlatılmadı.' });
    }

    const roomId = meeting.roomId;

    const token = await createLiveKitToken({
      roomName: roomId,
      identity: studentId,
      name: req.user!.name,
      isTeacher: false,
    });

    return res.json({
      mode: 'internal',
      provider: 'internal_webrtc',
      url: getLiveKitUrl(),
      roomId,
      token,
    });
  },
);

// Bildirimler
router.get(
  '/notifications',
  authenticate('student'),
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
  authenticate('student'),
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
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const id = String(req.params.id);
    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) {
      return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }
    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true, readAt: new Date() },
    });
    return res.json({
      id: updated.id,
      userId: updated.userId,
      type: updated.type,
      title: updated.title,
      body: updated.body,
      read: updated.read,
      relatedEntityType: updated.relatedEntityType ?? undefined,
      relatedEntityId: updated.relatedEntityId ?? undefined,
      readAt: updated.readAt?.toISOString(),
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

router.put(
  '/notifications/read-all',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const result = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true, readAt: new Date() },
    });
    return res.json({ updated: result.count });
  },
);

// Öğrenci To-Do listesi
router.get(
  '/todos',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const studentTodos = await prisma.todoItem.findMany({
      where: { studentId },
    });
    return res.json(
      studentTodos.map((t) => ({
        id: t.id,
        studentId: t.studentId,
        title: t.title,
        description: t.description ?? undefined,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt.toISOString(),
        plannedDate: t.plannedDate?.toISOString(),
        completedAt: t.completedAt?.toISOString(),
        relatedAssignmentId: t.relatedAssignmentId ?? undefined,
        relatedContentId: t.relatedContentId ?? undefined,
      })),
    );
  },
);

// Hedefler
async function computeGoalProgressInternal(
  studentId: string,
  goal: { id: string; studentId: string; type: string; targetValue: number; topic?: string | null; startDate: Date; endDate: Date; status: string },
): Promise<GoalProgress> {
  const start = new Date(goal.startDate).getTime();
  const end = new Date(goal.endDate).getTime();

  const [relevantResults, testsData] = await Promise.all([
    prisma.testResult.findMany({
      where: {
        studentId,
        completedAt: { gte: new Date(start), lte: new Date(end) },
      },
      include: { answers: true },
    }),
    prisma.test.findMany(),
  ]);
  const testMap = new Map(testsData.map((t) => [t.id, t]));

  const filtered = relevantResults.filter((r) => {
    const t = testMap.get(r.testId);
    if (!t) return false;
    if (goal.topic && t.topic !== goal.topic) return false;
    return true;
  });

  let currentValue = 0;
  if (goal.type === 'weekly_questions') {
    currentValue = filtered.reduce((sum, r) => sum + r.answers.length, 0);
  } else if (goal.type === 'weekly_tests') {
    currentValue = filtered.length;
  } else if (goal.type === 'score_percent') {
    currentValue =
      filtered.length > 0
        ? Math.round(filtered.reduce((sum, r) => sum + r.scorePercent, 0) / filtered.length)
        : 0;
  } else if (goal.type === 'topic_completion') {
    const topicTests = testsData.filter((t) => t.topic === goal.topic);
    const completedTests = new Set(filtered.map((r) => r.testId));
    currentValue =
      topicTests.length === 0
        ? 0
        : Math.round((completedTests.size / topicTests.length) * 100);
  }

  const progressPercent =
    goal.type === 'topic_completion'
      ? Math.max(0, Math.min(100, currentValue))
      : goal.targetValue === 0
        ? 0
        : Math.max(0, Math.min(100, Math.round((currentValue / goal.targetValue) * 100)));

  const now = Date.now();
  let status: GoalStatus = goal.status as GoalStatus;
  if (status !== 'cancelled') {
    if (progressPercent >= 100) status = 'completed';
    else if (now > end) status = 'failed';
    else status = 'active';
  }

  const daysTotal = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
  const daysPassed = Math.max(0, Math.min(daysTotal, Math.round((now - start) / (24 * 60 * 60 * 1000))));
  const expectedPercent = daysTotal === 0 ? 100 : Math.round((daysPassed / daysTotal) * 100);
  const onTrack = progressPercent >= expectedPercent;

  const dailyProgress: { date: string; value: number }[] = [];
  filtered.forEach((r) => {
    const key = r.completedAt.toISOString().slice(0, 10);
    const inc = goal.type === 'weekly_questions' ? r.answers.length : 1;
    const existing = dailyProgress.find((p) => p.date === key);
    if (existing) existing.value += inc;
    else dailyProgress.push({ date: key, value: inc });
  });
  dailyProgress.sort((a, b) => a.date.localeCompare(b.date));

  return {
    goal: {
      id: goal.id,
      studentId: goal.studentId,
      type: goal.type as Goal['type'],
      targetValue: goal.targetValue,
      topic: goal.topic ?? undefined,
      startDate: new Date(goal.startDate).toISOString(),
      endDate: new Date(goal.endDate).toISOString(),
      status,
      createdAt: '',
      currentValue,
      progressPercent,
    },
    dailyProgress,
    onTrack,
  };
}

router.get(
  '/goals',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const studentGoals = await prisma.goal.findMany({ where: { studentId } });
    const withComputed: GoalWithComputed[] = [];
    for (const g of studentGoals) {
      const progress = await computeGoalProgressInternal(studentId, g);
      withComputed.push(progress.goal);
    }
    return res.json(withComputed);
  },
);

router.post(
  '/goals',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
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

    const goal = await prisma.goal.create({
      data: {
        studentId,
        type: type as 'weekly_questions' | 'weekly_tests' | 'topic_completion' | 'score_percent',
        targetValue,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        topic: topic ?? undefined,
      },
    });
    const progress = await computeGoalProgressInternal(studentId, goal);
    return res.status(201).json({
      ...progress.goal,
      createdAt: goal.createdAt.toISOString(),
    });
  },
);

router.put(
  '/goals/:id',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const goal = await prisma.goal.findFirst({ where: { id, studentId } });
    if (!goal) {
      return res.status(404).json({ error: 'Hedef bulunamadı' });
    }

    const { targetValue, startDate, endDate, status } = req.body as Partial<{
      targetValue: number;
      startDate: string;
      endDate: string;
      status: string;
    }>;

    const updated = await prisma.goal.update({
      where: { id },
      data: {
        ...(targetValue !== undefined && { targetValue }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
        ...(endDate !== undefined && { endDate: new Date(endDate) }),
        ...(status !== undefined && { status: status as 'active' | 'completed' | 'failed' | 'cancelled' }),
      },
    });
    const progress = await computeGoalProgressInternal(studentId, updated);
    return res.json({ ...progress.goal, createdAt: updated.createdAt.toISOString() });
  },
);

router.delete(
  '/goals/:id',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const goal = await prisma.goal.findFirst({ where: { id, studentId } });
    if (!goal) {
      return res.status(404).json({ error: 'Hedef bulunamadı' });
    }
    const updated = await prisma.goal.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    const progress = await computeGoalProgressInternal(studentId, updated);
    return res.json({ ...progress.goal, createdAt: updated.createdAt.toISOString() });
  },
);

router.get(
  '/goals/:id/progress',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const goal = await prisma.goal.findFirst({ where: { id, studentId } });
    if (!goal) {
      return res.status(404).json({ error: 'Hedef bulunamadı' });
    }
    const progress = await computeGoalProgressInternal(studentId, goal);
    return res.json(progress);
  },
);

router.post(
  '/todos',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
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

    const todo = await prisma.todoItem.create({
      data: {
        studentId,
        title,
        description,
        priority: (priority ?? 'medium') as 'low' | 'medium' | 'high',
        plannedDate: plannedDate ? new Date(plannedDate) : undefined,
        relatedAssignmentId,
        relatedContentId,
      },
    });
    return res.status(201).json({
      id: todo.id,
      studentId: todo.studentId,
      title: todo.title,
      description: todo.description ?? undefined,
      status: todo.status,
      priority: todo.priority,
      createdAt: todo.createdAt.toISOString(),
      plannedDate: todo.plannedDate?.toISOString(),
      completedAt: todo.completedAt?.toISOString(),
      relatedAssignmentId: todo.relatedAssignmentId ?? undefined,
      relatedContentId: todo.relatedContentId ?? undefined,
    });
  },
);

router.put(
  '/todos/:id',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const todo = await prisma.todoItem.findFirst({ where: { id, studentId } });
    if (!todo) {
      return res.status(404).json({ error: 'To-Do bulunamadı' });
    }

    const { title, description, status, priority, plannedDate } = req.body as Partial<{
      title: string;
      description: string;
      status: string;
      priority: string;
      plannedDate: string;
    }>;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (plannedDate !== undefined) updateData.plannedDate = new Date(plannedDate);
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'completed' && !todo.completedAt) {
        updateData.completedAt = new Date();
      }
    }

    const updated = await prisma.todoItem.update({
      where: { id },
      data: updateData,
    });
    return res.json({
      id: updated.id,
      studentId: updated.studentId,
      title: updated.title,
      description: updated.description ?? undefined,
      status: updated.status,
      priority: updated.priority,
      createdAt: updated.createdAt.toISOString(),
      plannedDate: updated.plannedDate?.toISOString(),
      completedAt: updated.completedAt?.toISOString(),
      relatedAssignmentId: updated.relatedAssignmentId ?? undefined,
      relatedContentId: updated.relatedContentId ?? undefined,
    });
  },
);

router.put(
  '/todos/:id/complete',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const todo = await prisma.todoItem.findFirst({ where: { id, studentId } });
    if (!todo) {
      return res.status(404).json({ error: 'To-Do bulunamadı' });
    }
    const updated = await prisma.todoItem.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date() },
    });
    return res.json({
      id: updated.id,
      studentId: updated.studentId,
      title: updated.title,
      description: updated.description ?? undefined,
      status: updated.status,
      priority: updated.priority,
      createdAt: updated.createdAt.toISOString(),
      plannedDate: updated.plannedDate?.toISOString(),
      completedAt: updated.completedAt?.toISOString(),
      relatedAssignmentId: updated.relatedAssignmentId ?? undefined,
      relatedContentId: updated.relatedContentId ?? undefined,
    });
  },
);

router.delete(
  '/todos/:id',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const id = String(req.params.id);
    const todo = await prisma.todoItem.findFirst({ where: { id, studentId } });
    if (!todo) {
      return res.status(404).json({ error: 'To-Do bulunamadı' });
    }
    await prisma.todoItem.delete({ where: { id } });
    return res.json({
      id: todo.id,
      studentId: todo.studentId,
      title: todo.title,
      description: todo.description ?? undefined,
      status: todo.status,
      priority: todo.priority,
      createdAt: todo.createdAt.toISOString(),
      plannedDate: todo.plannedDate?.toISOString(),
      completedAt: todo.completedAt?.toISOString(),
      relatedAssignmentId: todo.relatedAssignmentId ?? undefined,
      relatedContentId: todo.relatedContentId ?? undefined,
    });
  },
);

// Takvim
router.get(
  '/calendar',
  authenticate('student'),
  async (req: AuthenticatedRequest, res) => {
    const studentId = req.user!.id;
    const startDate = req.query.startDate
      ? new Date(String(req.query.startDate))
      : new Date();
    const endDate = req.query.endDate
      ? new Date(String(req.query.endDate))
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const events: CalendarEvent[] = [];
    const now = new Date();

    const [studentAssignments, studentResults, studentMeetings] = await Promise.all([
      prisma.assignment.findMany({
        where: {
          students: { some: { studentId } },
          dueDate: { gte: startDate, lte: endDate },
        },
      }),
      prisma.testResult.findMany({
        where: { studentId },
        select: { assignmentId: true },
      }),
      prisma.meeting.findMany({
        where: { students: { some: { studentId } } },
      }),
    ]);

    const completedAssignmentIds = new Set(
      studentResults.map((r) => r.assignmentId),
    );

    studentAssignments.forEach((assignment) => {
      const dueDate = assignment.dueDate;
      let status: 'pending' | 'completed' | 'overdue' = 'pending';
      if (dueDate < now) status = 'overdue';
      else if (completedAssignmentIds.has(assignment.id)) status = 'completed';

      events.push({
        id: `assignment-${assignment.id}`,
        type: 'assignment',
        title: assignment.title,
        startDate: dueDate.toISOString(),
        status,
        color: status === 'overdue' ? '#e74c3c' : status === 'completed' ? '#27ae60' : '#3498db',
        relatedId: assignment.id,
        ...(assignment.description ? { description: assignment.description } : {}),
      });
    });

    studentMeetings.forEach((meeting) => {
      const meetingStart = meeting.scheduledAt;
      if (meetingStart >= startDate && meetingStart <= endDate) {
        const meetingEnd = new Date(
          meetingStart.getTime() + meeting.durationMinutes * 60 * 1000,
        );
        events.push({
          id: `meeting-${meeting.id}`,
          type: 'meeting',
          title: meeting.title,
          startDate: meetingStart.toISOString(),
          endDate: meetingEnd.toISOString(),
          description: `${meeting.durationMinutes} dakika`,
          status: meetingStart < now ? 'completed' : 'pending',
          color: '#9b59b6',
          relatedId: meeting.id,
        });
      }
    });

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


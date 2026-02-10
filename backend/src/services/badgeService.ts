import { prisma } from '../db';
import type { BadgeCategory, StudentBadgeProgress } from '../types';

export type BadgeMetricKey =
  | 'total_questions_all_time'
  | 'tests_completed_all_time'
  | 'assignments_completed_all_time'
  | 'content_completed_all_time'
  | 'longest_active_streak_days'
  | 'focus_xp_total';

type MetricsMap = Record<BadgeMetricKey, number>;

async function computeStudentMetrics(studentId: string): Promise<MetricsMap> {
  const [questionsAgg, testsCompleted, assignmentsCompleted, contentsCompleted, resultDates, watchDates, focusXpResult] =
    await Promise.all([
    prisma.testResult.aggregate({
      where: { studentId },
      _sum: {
        correctCount: true,
        incorrectCount: true,
        blankCount: true,
      },
    }),
    prisma.testResult.count({
      where: { studentId },
    }),
    prisma.assignmentStudent.count({
      where: {
        studentId,
        // Prisma enum tip eşleşmesi için string literal kullanıyoruz
        // @ts-ignore - runtime'da geçerli
        status: 'completed',
      },
    }),
    prisma.watchRecord.count({
      where: {
        studentId,
        completed: true,
      },
      }),
      prisma.testResult.findMany({
        where: { studentId },
        select: { completedAt: true },
      }),
      prisma.watchRecord.findMany({
        where: { studentId },
        select: { lastWatchedAt: true },
    }),
      (prisma as any).studentFocusSession?.aggregate?.({ where: { studentId }, _sum: { xpEarned: true } })
        .catch(() => ({ _sum: { xpEarned: null } })),
  ]);

  const totalQuestions =
    (questionsAgg._sum.correctCount ?? 0) +
    (questionsAgg._sum.incorrectCount ?? 0) +
    (questionsAgg._sum.blankCount ?? 0);

  // Aktif günler: test sonucu veya içerik izleme yapılan günler
  const activeDays = new Set<string>();
  resultDates.forEach((r) => {
    if (r.completedAt) {
      activeDays.add(r.completedAt.toISOString().slice(0, 10));
    }
  });
  watchDates.forEach((w) => {
    if (w.lastWatchedAt) {
      activeDays.add(w.lastWatchedAt.toISOString().slice(0, 10));
    }
  });

  let longestStreak = 0;
  if (activeDays.size > 0) {
    const sortedDays = Array.from(activeDays.values())
      .map((d) => new Date(d).getTime())
      .sort((a, b) => a - b);

    let currentStreak = 1;
    longestStreak = 1;
    const oneDayMs = 24 * 60 * 60 * 1000;
    for (let i = 1; i < sortedDays.length; i += 1) {
      const curr = sortedDays[i];
      const prev = sortedDays[i - 1];
      if (curr != null && prev != null) {
        if (curr - prev === oneDayMs) {
          currentStreak += 1;
        } else if (curr !== prev) {
          currentStreak = 1;
        }
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak;
        }
      }
    }
  }

  const focusXpTotal =
    typeof focusXpResult === 'object' && focusXpResult?._sum?.xpEarned != null
      ? Number(focusXpResult._sum.xpEarned)
      : 0;

  return {
    total_questions_all_time: totalQuestions,
    tests_completed_all_time: testsCompleted,
    assignments_completed_all_time: assignmentsCompleted,
    content_completed_all_time: contentsCompleted,
    longest_active_streak_days: longestStreak,
    focus_xp_total: focusXpTotal,
  };
}

export async function getStudentBadgeProgress(studentId: string): Promise<StudentBadgeProgress[]> {
  // Eski Prisma client versiyonlarında model henüz generate edilmemiş olabilir.
  // Bu durumda hataya düşmek yerine boş liste döneriz.
  const client = prisma as any;
  if (!client.badgeDefinition || !client.studentBadge) {
    return [];
  }

  // Tüm badge tanımlarını ve öğrencinin kazandığı rozetleri çek
  const [definitions, earnedBadges, metrics] = await Promise.all([
    client.badgeDefinition.findMany({
      orderBy: [
        { orderIndex: 'asc' },
        { createdAt: 'asc' },
      ],
    }),
    client.studentBadge.findMany({
      where: { studentId },
    }),
    computeStudentMetrics(studentId),
  ]);

  if (definitions.length === 0) {
    return [];
  }

  type EarnedBadgeRow = { badgeId: string; earnedAt?: Date; id?: string; studentId?: string };
  const earnedByBadgeId = new Map<string, EarnedBadgeRow>(
    (earnedBadges as EarnedBadgeRow[]).map((b) => [b.badgeId, b]),
  );

  type BadgeDefRow = {
    id: string;
    metricKey: string;
    targetValue: number;
    code: string;
    title: string;
    description: string;
    category: string;
    icon?: string | null;
    color?: string | null;
  };
  const defs = definitions as BadgeDefRow[];

  // Eşiği geçmiş ama henüz kaydedilmemiş rozetleri oluştur
  const now = new Date();
  const toCreate = defs.filter((def) => {
    const currentValue = metrics[def.metricKey as BadgeMetricKey] ?? 0;
    return !earnedByBadgeId.has(def.id) && currentValue >= def.targetValue;
  });

  if (toCreate.length > 0) {
    await prisma.studentBadge.createMany({
      data: toCreate.map((def) => ({
        studentId,
        badgeId: def.id,
        earnedAt: now,
      })),
      skipDuplicates: true,
    });

    toCreate.forEach((def) => {
      if (!earnedByBadgeId.has(def.id)) {
        earnedByBadgeId.set(def.id, {
          id: 'virtual',
          studentId,
          badgeId: def.id,
          earnedAt: now,
        });
      }
    });
  }

  const result: StudentBadgeProgress[] = defs.map((def) => {
    const currentValue = metrics[def.metricKey as BadgeMetricKey] ?? 0;
    const target = def.targetValue || 0;
    const progressPercent =
      target <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((currentValue / target) * 100)));

    const earnedRow = earnedByBadgeId.get(def.id);
    const earned = !!earnedRow;

    return {
      badgeId: def.id,
      code: def.code,
      title: def.title,
      description: def.description,
      category: def.category as BadgeCategory,
      icon: def.icon ?? undefined,
      color: def.color ?? undefined,
      targetValue: def.targetValue,
      metricKey: def.metricKey,
      currentValue,
      progressPercent,
      earned,
      earnedAt: earnedRow?.earnedAt?.toISOString(),
    };
  });

  return result;
}


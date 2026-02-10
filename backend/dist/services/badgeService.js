"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudentBadgeProgress = getStudentBadgeProgress;
const db_1 = require("../db");
async function computeStudentMetrics(studentId) {
    var _a, _b, _c, _d, _e, _f;
    const [questionsAgg, testsCompleted, assignmentsCompleted, contentsCompleted, resultDates, watchDates, focusXpResult] = await Promise.all([
        db_1.prisma.testResult.aggregate({
            where: { studentId },
            _sum: {
                correctCount: true,
                incorrectCount: true,
                blankCount: true,
            },
        }),
        db_1.prisma.testResult.count({
            where: { studentId },
        }),
        db_1.prisma.assignmentStudent.count({
            where: {
                studentId,
                // Prisma enum tip eşleşmesi için string literal kullanıyoruz
                // @ts-ignore - runtime'da geçerli
                status: 'completed',
            },
        }),
        db_1.prisma.watchRecord.count({
            where: {
                studentId,
                completed: true,
            },
        }),
        db_1.prisma.testResult.findMany({
            where: { studentId },
            select: { completedAt: true },
        }),
        db_1.prisma.watchRecord.findMany({
            where: { studentId },
            select: { lastWatchedAt: true },
        }),
        (_b = (_a = db_1.prisma.studentFocusSession) === null || _a === void 0 ? void 0 : _a.aggregate) === null || _b === void 0 ? void 0 : _b.call(_a, { where: { studentId }, _sum: { xpEarned: true } }).catch(() => ({ _sum: { xpEarned: null } })),
    ]);
    const totalQuestions = ((_c = questionsAgg._sum.correctCount) !== null && _c !== void 0 ? _c : 0) +
        ((_d = questionsAgg._sum.incorrectCount) !== null && _d !== void 0 ? _d : 0) +
        ((_e = questionsAgg._sum.blankCount) !== null && _e !== void 0 ? _e : 0);
    // Aktif günler: test sonucu veya içerik izleme yapılan günler
    const activeDays = new Set();
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
                }
                else if (curr !== prev) {
                    currentStreak = 1;
                }
                if (currentStreak > longestStreak) {
                    longestStreak = currentStreak;
                }
            }
        }
    }
    const focusXpTotal = typeof focusXpResult === 'object' && ((_f = focusXpResult === null || focusXpResult === void 0 ? void 0 : focusXpResult._sum) === null || _f === void 0 ? void 0 : _f.xpEarned) != null
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
async function getStudentBadgeProgress(studentId) {
    // Eski Prisma client versiyonlarında model henüz generate edilmemiş olabilir.
    // Bu durumda hataya düşmek yerine boş liste döneriz.
    const client = db_1.prisma;
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
    const earnedByBadgeId = new Map(earnedBadges.map((b) => [b.badgeId, b]));
    const defs = definitions;
    // Eşiği geçmiş ama henüz kaydedilmemiş rozetleri oluştur
    const now = new Date();
    const toCreate = defs.filter((def) => {
        var _a;
        const currentValue = (_a = metrics[def.metricKey]) !== null && _a !== void 0 ? _a : 0;
        return !earnedByBadgeId.has(def.id) && currentValue >= def.targetValue;
    });
    if (toCreate.length > 0) {
        await db_1.prisma.studentBadge.createMany({
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
    const result = defs.map((def) => {
        var _a, _b, _c, _d;
        const currentValue = (_a = metrics[def.metricKey]) !== null && _a !== void 0 ? _a : 0;
        const target = def.targetValue || 0;
        const progressPercent = target <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((currentValue / target) * 100)));
        const earnedRow = earnedByBadgeId.get(def.id);
        const earned = !!earnedRow;
        return {
            badgeId: def.id,
            code: def.code,
            title: def.title,
            description: def.description,
            category: def.category,
            icon: (_b = def.icon) !== null && _b !== void 0 ? _b : undefined,
            color: (_c = def.color) !== null && _c !== void 0 ? _c : undefined,
            targetValue: def.targetValue,
            metricKey: def.metricKey,
            currentValue,
            progressPercent,
            earned,
            earnedAt: (_d = earnedRow === null || earnedRow === void 0 ? void 0 : earnedRow.earnedAt) === null || _d === void 0 ? void 0 : _d.toISOString(),
        };
    });
    return result;
}
//# sourceMappingURL=badgeService.js.map
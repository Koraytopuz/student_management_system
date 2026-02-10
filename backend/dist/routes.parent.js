"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const db_1 = require("./db");
const router = express_1.default.Router();
async function checkParentAccess(parentId, studentId) {
    const parent = await db_1.prisma.user.findFirst({
        where: { id: parentId, role: 'parent' },
        include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent)
        return { allowed: false, error: 'Veli bulunamadı' };
    const studentIds = parent.parentStudents.map((ps) => ps.studentId);
    if (!studentIds.includes(studentId)) {
        return { allowed: false, error: 'Bu öğrencinin verilerine erişim izniniz yok' };
    }
    return { allowed: true };
}
async function getStudentClassName(studentId) {
    const student = await db_1.prisma.user.findFirst({
        where: { id: studentId, role: 'student' },
        select: { classId: true },
    });
    if (!(student === null || student === void 0 ? void 0 : student.classId))
        return undefined;
    const classGroup = await db_1.prisma.classGroup.findUnique({
        where: { id: student.classId },
    });
    return classGroup === null || classGroup === void 0 ? void 0 : classGroup.name;
}
async function getAssignmentStatus(assignment, studentId) {
    const now = new Date();
    const dueDate = assignment.dueDate;
    const [result, watchRecord] = await Promise.all([
        assignment.testId
            ? db_1.prisma.testResult.findFirst({
                where: { assignmentId: assignment.id, studentId },
            })
            : Promise.resolve(null),
        assignment.contentId
            ? db_1.prisma.watchRecord.findUnique({
                where: { contentId_studentId: { contentId: assignment.contentId, studentId } },
            })
            : Promise.resolve(null),
    ]);
    if (assignment.testId && result)
        return 'completed';
    if (assignment.contentId && (watchRecord === null || watchRecord === void 0 ? void 0 : watchRecord.completed))
        return 'completed';
    if (assignment.contentId && watchRecord && !watchRecord.completed)
        return 'in_progress';
    if (dueDate < now)
        return 'overdue';
    return 'pending';
}
// Veli dashboard özeti
router.get('/dashboard', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a, _b, _c, _d, _e;
    const parentId = req.user.id;
    const parent = await db_1.prisma.user.findFirst({
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
    const cards = [];
    for (const sid of studentIds) {
        const [student, studentResults, allResults, watchRecs, studentAssignments] = await Promise.all([
            db_1.prisma.user.findFirst({ where: { id: sid, role: 'student' } }),
            db_1.prisma.testResult.findMany({
                where: { studentId: sid, completedAt: { gte: sevenDaysAgo } },
            }),
            db_1.prisma.testResult.findMany({ where: { studentId: sid } }),
            db_1.prisma.watchRecord.findMany({ where: { studentId: sid } }),
            db_1.prisma.assignment.findMany({
                where: { students: { some: { studentId: sid } } },
            }),
        ]);
        let pendingCount = 0;
        let overdueCount = 0;
        for (const a of studentAssignments) {
            const status = await getAssignmentStatus(a, sid);
            if (status === 'pending')
                pendingCount++;
            else if (status === 'overdue')
                overdueCount++;
        }
        const studyMinutes = watchRecs.reduce((s, w) => s + w.watchedSeconds, 0) / 60;
        const lastResult = allResults[allResults.length - 1];
        const lastWatch = watchRecs.sort((a, b) => b.lastWatchedAt.getTime() - a.lastWatchedAt.getTime())[0];
        const lastActivity = (_a = lastResult === null || lastResult === void 0 ? void 0 : lastResult.completedAt.toISOString()) !== null && _a !== void 0 ? _a : lastWatch === null || lastWatch === void 0 ? void 0 : lastWatch.lastWatchedAt.toISOString();
        const status = lastActivity && new Date(lastActivity) >= threeDaysAgo ? 'active' : 'inactive';
        cards.push({
            studentId: sid,
            studentName: (_b = student === null || student === void 0 ? void 0 : student.name) !== null && _b !== void 0 ? _b : 'Bilinmeyen öğrenci',
            gradeLevel: (_c = student === null || student === void 0 ? void 0 : student.gradeLevel) !== null && _c !== void 0 ? _c : '',
            classId: (_d = student === null || student === void 0 ? void 0 : student.classId) !== null && _d !== void 0 ? _d : '',
            className: (_e = (await getStudentClassName(sid))) !== null && _e !== void 0 ? _e : undefined,
            testsSolvedLast7Days: studentResults.length,
            averageScorePercent: allResults.length === 0
                ? 0
                : Math.round(allResults.reduce((sum, r) => sum + r.scorePercent, 0) / allResults.length),
            totalStudyMinutes: Math.round(studyMinutes),
            lastActivityDate: lastActivity,
            status,
            pendingAssignmentsCount: pendingCount,
            overdueAssignmentsCount: overdueCount,
        });
    }
    const totalTestsSolved = cards.reduce((sum, c) => sum + c.testsSolvedLast7Days, 0);
    const avgScore = cards.length === 0
        ? 0
        : Math.round(cards.reduce((sum, c) => sum + c.averageScorePercent, 0) / cards.length);
    return res.json({
        children: cards,
        overallStats: {
            totalChildren: cards.length,
            totalTestsSolved,
            averageScoreAcrossAll: avgScore,
        },
    });
});
// Öğrenci detay özeti
router.get('/children/:id/summary', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const parentId = req.user.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
        return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
            error: access.error,
        });
    }
    const [student, studentResults, allResults, watchRecs, studentAssignments, contentsData, testsData, subjectsData] = await Promise.all([
        db_1.prisma.user.findFirst({ where: { id: studentId, role: 'student' } }),
        db_1.prisma.testResult.findMany({
            where: {
                studentId,
                completedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            },
        }),
        db_1.prisma.testResult.findMany({ where: { studentId } }),
        db_1.prisma.watchRecord.findMany({ where: { studentId } }),
        db_1.prisma.assignment.findMany({
            where: { students: { some: { studentId } } },
        }),
        db_1.prisma.contentItem.findMany(),
        db_1.prisma.test.findMany(),
        db_1.prisma.subject.findMany(),
    ]);
    if (!student) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    const contentMap = new Map(contentsData.map((c) => [c.id, c]));
    const testMap = new Map(testsData.map((t) => [t.id, t]));
    const subjectMap = new Map(subjectsData.map((s) => [s.id, s]));
    let pendingCount = 0;
    let overdueCount = 0;
    const upcoming = [];
    for (const a of studentAssignments) {
        const status = await getAssignmentStatus(a, studentId);
        if (status === 'pending')
            pendingCount++;
        else if (status === 'overdue')
            overdueCount++;
        if (status === 'pending' || status === 'in_progress') {
            const test = a.testId ? testMap.get(a.testId) : null;
            const content = a.contentId ? contentMap.get(a.contentId) : null;
            const subjectId = (_b = (_a = test === null || test === void 0 ? void 0 : test.subjectId) !== null && _a !== void 0 ? _a : content === null || content === void 0 ? void 0 : content.subjectId) !== null && _b !== void 0 ? _b : '';
            const subjectName = (_d = (_c = subjectMap.get(subjectId)) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : 'Bilinmeyen';
            const [result, watchRecord] = await Promise.all([
                a.testId ? db_1.prisma.testResult.findFirst({ where: { assignmentId: a.id, studentId } }) : null,
                a.contentId ? db_1.prisma.watchRecord.findUnique({ where: { contentId_studentId: { contentId: a.contentId, studentId } } }) : null,
            ]);
            const durMin = (_e = content === null || content === void 0 ? void 0 : content.durationMinutes) !== null && _e !== void 0 ? _e : 1;
            upcoming.push({
                assignmentId: a.id,
                title: a.title,
                description: (_f = a.description) !== null && _f !== void 0 ? _f : undefined,
                type: a.testId && a.contentId ? 'mixed' : a.testId ? 'test' : 'content',
                subjectName,
                topic: (_h = (_g = test === null || test === void 0 ? void 0 : test.topic) !== null && _g !== void 0 ? _g : content === null || content === void 0 ? void 0 : content.topic) !== null && _h !== void 0 ? _h : '',
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
        ...allResults.slice(-5).map((r) => ({ type: 'test', title: `Test tamamlandı - ${r.scorePercent}%`, date: r.completedAt.toISOString() })),
        ...watchRecs
            .sort((a, b) => b.lastWatchedAt.getTime() - a.lastWatchedAt.getTime())
            .slice(0, 3)
            .map((w) => { var _a, _b; return ({ type: 'content', title: (_b = (_a = contentMap.get(w.contentId)) === null || _a === void 0 ? void 0 : _a.title) !== null && _b !== void 0 ? _b : 'İçerik izlendi', date: w.lastWatchedAt.toISOString() }); }),
    ]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10);
    const studyMinutes = watchRecs.reduce((s, w) => s + w.watchedSeconds, 0) / 60;
    return res.json({
        studentId,
        studentName: student.name,
        gradeLevel: (_j = student.gradeLevel) !== null && _j !== void 0 ? _j : '',
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
});
// Aktivite zaman takibi
router.get('/children/:id/activity-time', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const parentId = req.user.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
        return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
            error: access.error,
        });
    }
    const period = req.query.period || 'last7days';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const now = new Date();
    let periodStart;
    let periodEnd = new Date(now);
    if (period === 'today') {
        periodStart = new Date(now);
        periodStart.setHours(0, 0, 0, 0);
    }
    else if (period === 'last7days') {
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    else if (period === 'last30days') {
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    else if (period === 'custom' && startDate && endDate) {
        periodStart = new Date(startDate);
        periodEnd = new Date(endDate);
    }
    else {
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    const [studentResults, studentWatchRecords] = await Promise.all([
        db_1.prisma.testResult.findMany({
            where: {
                studentId,
                completedAt: { gte: periodStart, lte: periodEnd },
            },
        }),
        db_1.prisma.watchRecord.findMany({
            where: {
                studentId,
                lastWatchedAt: { gte: periodStart, lte: periodEnd },
            },
        }),
    ]);
    // Günlük verileri oluştur
    const dailyData = [];
    const dateMap = new Map();
    for (let d = new Date(periodStart); d <= periodEnd; d.setDate(d.getDate() + 1)) {
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
    const averageMinutesPerDay = dailyData.length > 0 ? Math.round(totalMinutes / dailyData.length) : 0;
    const mostActiveDay = dailyData.length > 0
        ? dailyData.reduce((max, d) => d.totalMinutes > max.totalMinutes ? d : max).date
        : '';
    // Saatlik aktivite dağılımı (basitleştirilmiş)
    const activityByHour = Array.from({ length: 24 }, (_, hour) => ({
        hour,
        minutes: Math.round(Math.random() * 30), // Demo için rastgele
    }));
    const summary = {
        period: period,
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
        dailyData,
        totalMinutes,
        averageMinutesPerDay,
        mostActiveDay,
        activityByHour,
    };
    return res.json(summary);
});
// Görev aktiviteleri
router.get('/children/:id/assignments', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const parentId = req.user.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
        return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
            error: access.error,
        });
    }
    const status = req.query.status;
    let studentAssignments = await db_1.prisma.assignment.findMany({
        where: { students: { some: { studentId } } },
        include: { test: true, content: true },
    });
    if (status) {
        const filtered = [];
        for (const a of studentAssignments) {
            const s = await getAssignmentStatus(a, studentId);
            if (s === status)
                filtered.push(a);
        }
        studentAssignments = filtered;
    }
    const [testsData, subjectsData, allResults] = await Promise.all([
        db_1.prisma.test.findMany(),
        db_1.prisma.subject.findMany(),
        db_1.prisma.testResult.findMany({ where: { studentId } }),
    ]);
    const testMap = new Map(testsData.map((t) => [t.id, t]));
    const subjectMap = new Map(subjectsData.map((s) => [s.id, s]));
    const assignmentItems = [];
    for (const a of studentAssignments) {
        const stat = await getAssignmentStatus(a, studentId);
        const test = a.testId ? testMap.get(a.testId) : null;
        const content = (_a = a.content) !== null && _a !== void 0 ? _a : null;
        const subjectName = (_c = (_b = (test ? subjectMap.get(test.subjectId) : content ? subjectMap.get(content.subjectId) : null)) === null || _b === void 0 ? void 0 : _b.name) !== null && _c !== void 0 ? _c : 'Bilinmeyen';
        const result = allResults.find((r) => r.assignmentId === a.id);
        const watchRecord = a.contentId
            ? await db_1.prisma.watchRecord.findUnique({
                where: { contentId_studentId: { contentId: a.contentId, studentId } },
            })
            : null;
        assignmentItems.push({
            assignmentId: a.id,
            title: a.title,
            description: (_d = a.description) !== null && _d !== void 0 ? _d : undefined,
            type: a.testId && a.contentId ? 'mixed' : a.testId ? 'test' : 'content',
            subjectName,
            topic: (_f = (_e = test === null || test === void 0 ? void 0 : test.topic) !== null && _e !== void 0 ? _e : content === null || content === void 0 ? void 0 : content.topic) !== null && _f !== void 0 ? _f : '',
            dueDate: a.dueDate.toISOString(),
            status: stat,
            completedAt: (_g = result === null || result === void 0 ? void 0 : result.completedAt.toISOString()) !== null && _g !== void 0 ? _g : watchRecord === null || watchRecord === void 0 ? void 0 : watchRecord.lastWatchedAt.toISOString(),
            testResult: result
                ? { testId: result.testId, correctCount: result.correctCount, incorrectCount: result.incorrectCount, blankCount: result.blankCount, scorePercent: result.scorePercent, durationSeconds: result.durationSeconds }
                : undefined,
            contentProgress: watchRecord
                ? { contentId: watchRecord.contentId, watchedPercent: watchRecord.completed ? 100 : Math.round((watchRecord.watchedSeconds / (((_h = content === null || content === void 0 ? void 0 : content.durationMinutes) !== null && _h !== void 0 ? _h : 1) * 60)) * 100), completed: watchRecord.completed }
                : undefined,
        });
    }
    const completedCount = assignmentItems.filter((x) => x.status === 'completed').length;
    const pendingCount = assignmentItems.filter((x) => x.status === 'pending').length;
    const overdueCount = assignmentItems.filter((x) => x.status === 'overdue').length;
    const completedResults = allResults.filter((r) => assignmentItems.some((a) => a.assignmentId === r.assignmentId && a.status === 'completed'));
    const averageScorePercent = completedResults.length === 0
        ? 0
        : Math.round(completedResults.reduce((sum, r) => sum + r.scorePercent, 0) / completedResults.length);
    return res.json({
        assignments: assignmentItems,
        statistics: { totalCount: assignmentItems.length, completedCount, pendingCount, overdueCount, averageScorePercent },
    });
});
// İçerik kullanımı
router.get('/children/:id/content-usage', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a, _b, _c, _d, _e;
    const parentId = req.user.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
        return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
            error: access.error,
        });
    }
    const status = req.query.status;
    const subjectId = req.query.subjectId;
    const student = await db_1.prisma.user.findFirst({
        where: { id: studentId, role: 'student' },
    });
    if (!student) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    const orConditions = [{ students: { some: { studentId } } }];
    if (student.classId) {
        orConditions.push({ classGroups: { some: { classGroupId: student.classId } } });
    }
    let studentContents = await db_1.prisma.contentItem.findMany({
        where: { OR: orConditions },
        include: { subject: true },
    });
    if (subjectId) {
        studentContents = studentContents.filter((c) => c.subjectId === subjectId);
    }
    const contentItems = [];
    for (const content of studentContents) {
        const watchRecs = await db_1.prisma.watchRecord.findMany({
            where: { contentId: content.id, studentId },
        });
        const totalWatchedSeconds = watchRecs.reduce((s, w) => s + w.watchedSeconds, 0);
        const totalDurationSeconds = ((_a = content.durationMinutes) !== null && _a !== void 0 ? _a : 0) * 60;
        const watchedPercent = totalDurationSeconds > 0 ? Math.round((totalWatchedSeconds / totalDurationSeconds) * 100) : 0;
        const completed = watchRecs.some((w) => w.completed);
        const lastWatched = watchRecs.sort((a, b) => b.lastWatchedAt.getTime() - a.lastWatchedAt.getTime())[0];
        if (status === 'completed' && !completed)
            continue;
        if (status === 'in_progress' && (completed || watchedPercent === 0))
            continue;
        if (status === 'not_started' && watchedPercent > 0)
            continue;
        contentItems.push({
            contentId: content.id,
            title: content.title,
            description: (_b = content.description) !== null && _b !== void 0 ? _b : undefined,
            type: content.type,
            subjectName: (_d = (_c = content.subject) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : 'Bilinmeyen',
            topic: content.topic,
            totalDurationMinutes: (_e = content.durationMinutes) !== null && _e !== void 0 ? _e : 0,
            watchedDurationMinutes: Math.round(totalWatchedSeconds / 60),
            watchedPercent,
            watchCount: watchRecs.length,
            lastWatchedAt: lastWatched === null || lastWatched === void 0 ? void 0 : lastWatched.lastWatchedAt.toISOString(),
            completed,
            assignedDate: new Date().toISOString(),
        });
    }
    const completedCount = contentItems.filter((c) => c.completed).length;
    const inProgressCount = contentItems.filter((c) => !c.completed && c.watchedPercent > 0).length;
    const notStartedCount = contentItems.filter((c) => c.watchedPercent === 0).length;
    const totalWatchTimeMinutes = contentItems.reduce((s, c) => s + c.watchedDurationMinutes, 0);
    const averageCompletionPercent = contentItems.length === 0 ? 0 : Math.round(contentItems.reduce((s, c) => s + c.watchedPercent, 0) / contentItems.length);
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
});
// Mesajlar (gönderen ve alıcı isimleriyle)
router.get('/messages', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const userId = req.user.id;
    const messagesData = await db_1.prisma.message.findMany({
        where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    });
    const userIds = [...new Set(messagesData.flatMap((m) => [m.fromUserId, m.toUserId]))];
    const users = await db_1.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));
    return res.json(messagesData.map((m) => {
        var _a, _b, _c, _d, _e, _f;
        return ({
            id: m.id,
            fromUserId: m.fromUserId,
            toUserId: m.toUserId,
            studentId: (_a = m.studentId) !== null && _a !== void 0 ? _a : undefined,
            subject: (_b = m.subject) !== null && _b !== void 0 ? _b : undefined,
            text: m.text,
            attachments: (_c = m.attachments) !== null && _c !== void 0 ? _c : undefined,
            read: m.read,
            readAt: (_d = m.readAt) === null || _d === void 0 ? void 0 : _d.toISOString(),
            createdAt: m.createdAt.toISOString(),
            fromUserName: (_e = userMap.get(m.fromUserId)) !== null && _e !== void 0 ? _e : m.fromUserId,
            toUserName: (_f = userMap.get(m.toUserId)) !== null && _f !== void 0 ? _f : m.toUserId,
        });
    }));
});
// Konuşmalar listesi
router.get('/messages/conversations', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a;
    const userId = req.user.id;
    const userMessages = await db_1.prisma.message.findMany({
        where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    });
    const otherUserIds = [...new Set(userMessages.map((m) => (m.fromUserId === userId ? m.toUserId : m.fromUserId)))];
    const users = await db_1.prisma.user.findMany({
        where: { id: { in: otherUserIds } },
        select: { id: true, name: true, role: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const studentsData = await db_1.prisma.user.findMany({
        where: { id: { in: userMessages.map((m) => m.studentId).filter(Boolean) }, role: 'student' },
        select: { id: true, name: true },
    });
    const studentMap = new Map(studentsData.map((s) => [s.id, s.name]));
    const conversationMap = new Map();
    for (const msg of userMessages) {
        const otherUserId = msg.fromUserId === userId ? msg.toUserId : msg.fromUserId;
        const otherUser = userMap.get(otherUserId);
        if (!otherUser)
            continue;
        if (!conversationMap.has(otherUserId)) {
            conversationMap.set(otherUserId, {
                userId: otherUserId,
                userName: otherUser.name,
                userRole: otherUser.role,
                studentId: (_a = msg.studentId) !== null && _a !== void 0 ? _a : undefined,
                studentName: msg.studentId ? studentMap.get(msg.studentId) : undefined,
                unreadCount: 0,
            });
        }
        const conv = conversationMap.get(otherUserId);
        if (!conv.lastMessage || msg.createdAt > new Date(conv.lastMessage.createdAt)) {
            conv.lastMessage = { id: msg.id, fromUserId: msg.fromUserId, toUserId: msg.toUserId, text: msg.text, createdAt: msg.createdAt.toISOString(), read: msg.read };
        }
        if (!msg.read && msg.toUserId === userId)
            conv.unreadCount++;
    }
    return res.json(Array.from(conversationMap.values()));
});
// Belirli bir kullanıcıyla konuşma
router.get('/messages/conversation/:userId', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const parentId = req.user.id;
    const otherUserId = String(req.params.userId);
    const studentId = req.query.studentId;
    const conversationMessages = await db_1.prisma.message.findMany({
        where: {
            OR: [
                { fromUserId: parentId, toUserId: otherUserId },
                { fromUserId: otherUserId, toUserId: parentId },
            ],
            ...(studentId && { studentId }),
        },
        orderBy: { createdAt: 'asc' },
    });
    return res.json(conversationMessages.map((m) => {
        var _a, _b, _c, _d;
        return ({
            id: m.id,
            fromUserId: m.fromUserId,
            toUserId: m.toUserId,
            studentId: (_a = m.studentId) !== null && _a !== void 0 ? _a : undefined,
            subject: (_b = m.subject) !== null && _b !== void 0 ? _b : undefined,
            text: m.text,
            attachments: (_c = m.attachments) !== null && _c !== void 0 ? _c : undefined,
            read: m.read,
            readAt: (_d = m.readAt) === null || _d === void 0 ? void 0 : _d.toISOString(),
            createdAt: m.createdAt.toISOString(),
        });
    }));
});
// Velinin iletişim kurabileceği öğretmen listesi (şikayet/öneri seçimi için de kullanılabilir)
router.get('/teachers', (0, auth_1.authenticate)('parent'), async (_req, res) => {
    const teachersData = await db_1.prisma.user.findMany({
        where: { role: 'teacher' },
        select: { id: true, name: true, email: true },
    });
    return res.json(teachersData);
});
// Mesaj gönder
router.post('/messages', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a, _b;
    const parentId = req.user.id;
    const { toUserId, text, studentId, subject } = req.body;
    if (!toUserId || !text) {
        return res.status(400).json({ error: 'toUserId ve text gereklidir' });
    }
    const newMessage = await db_1.prisma.message.create({
        data: { fromUserId: parentId, toUserId, studentId, subject, text, read: false },
    });
    await db_1.prisma.notification.create({
        data: {
            userId: toUserId,
            type: 'message_received',
            title: 'Yeni mesaj',
            body: `${req.user.name} size mesaj gönderdi`,
            read: false,
            relatedEntityType: 'message',
            relatedEntityId: newMessage.id,
        },
    });
    return res.status(201).json({
        id: newMessage.id,
        fromUserId: newMessage.fromUserId,
        toUserId: newMessage.toUserId,
        studentId: (_a = newMessage.studentId) !== null && _a !== void 0 ? _a : undefined,
        subject: (_b = newMessage.subject) !== null && _b !== void 0 ? _b : undefined,
        text: newMessage.text,
        createdAt: newMessage.createdAt.toISOString(),
        read: newMessage.read,
    });
});
// Mesajı okundu olarak işaretle
router.put('/messages/:id/read', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a, _b, _c;
    const messageId = String(req.params.id);
    const message = await db_1.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
        return res.status(404).json({ error: 'Mesaj bulunamadı' });
    }
    if (message.toUserId !== req.user.id) {
        return res.status(403).json({ error: 'Bu mesajı okuma yetkiniz yok' });
    }
    const updated = await db_1.prisma.message.update({
        where: { id: messageId },
        data: { read: true, readAt: new Date() },
    });
    return res.json({
        id: updated.id,
        fromUserId: updated.fromUserId,
        toUserId: updated.toUserId,
        studentId: (_a = updated.studentId) !== null && _a !== void 0 ? _a : undefined,
        subject: (_b = updated.subject) !== null && _b !== void 0 ? _b : undefined,
        text: updated.text,
        read: updated.read,
        readAt: (_c = updated.readAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
        createdAt: updated.createdAt.toISOString(),
    });
});
// Toplantılar
router.get('/meetings', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a;
    const userId = req.user.id;
    const userMeetings = await db_1.prisma.meeting.findMany({
        where: { parents: { some: { parentId: userId } } },
        include: {
            students: { select: { studentId: true } },
            parents: { select: { parentId: true } },
        },
    });
    const teacherIds = [...new Set(userMeetings.map((m) => m.teacherId))];
    const studentIds = [...new Set(userMeetings.flatMap((m) => m.students.map((s) => s.studentId)))];
    const [teachersData, studentsData, parentData] = await Promise.all([
        db_1.prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } }),
        db_1.prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } }),
        db_1.prisma.user.findFirst({ where: { id: userId, role: 'parent' }, include: { parentStudents: { select: { studentId: true } } } }),
    ]);
    const teacherMap = new Map(teachersData.map((t) => [t.id, t.name]));
    const studentMap = new Map(studentsData.map((s) => [s.id, s.name]));
    const parentStudentIds = new Set((_a = parentData === null || parentData === void 0 ? void 0 : parentData.parentStudents.map((ps) => ps.studentId)) !== null && _a !== void 0 ? _a : []);
    return res.json(userMeetings.map((m) => {
        var _a, _b;
        return ({
            id: m.id,
            type: m.type,
            title: m.title,
            teacherId: m.teacherId,
            teacherName: (_a = teacherMap.get(m.teacherId)) !== null && _a !== void 0 ? _a : 'Bilinmeyen',
            studentIds: m.students.map((s) => s.studentId),
            studentNames: m.students.map((s) => { var _a; return (_a = studentMap.get(s.studentId)) !== null && _a !== void 0 ? _a : 'Bilinmeyen'; }),
            parentIds: m.parents.map((p) => p.parentId),
            scheduledAt: m.scheduledAt.toISOString(),
            durationMinutes: m.durationMinutes,
            meetingUrl: m.meetingUrl,
            relatedStudentId: (_b = m.students.find((s) => parentStudentIds.has(s.studentId))) === null || _b === void 0 ? void 0 : _b.studentId,
        });
    }));
});
// Toplantı detayı
router.get('/meetings/:id', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a, _b, _c;
    const userId = req.user.id;
    const meetingId = String(req.params.id);
    const meeting = await db_1.prisma.meeting.findUnique({
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
        db_1.prisma.user.findUnique({ where: { id: meeting.teacherId }, select: { name: true } }),
        db_1.prisma.user.findMany({ where: { id: { in: meeting.students.map((s) => s.studentId) } }, select: { id: true, name: true } }),
        db_1.prisma.user.findFirst({ where: { id: userId }, include: { parentStudents: { select: { studentId: true } } } }),
    ]);
    const studentMap = new Map(studentsData.map((s) => [s.id, s.name]));
    const parentStudentIds = new Set((_a = parentData === null || parentData === void 0 ? void 0 : parentData.parentStudents.map((ps) => ps.studentId)) !== null && _a !== void 0 ? _a : []);
    return res.json({
        id: meeting.id,
        type: meeting.type,
        title: meeting.title,
        teacherId: meeting.teacherId,
        teacherName: (_b = teacher === null || teacher === void 0 ? void 0 : teacher.name) !== null && _b !== void 0 ? _b : 'Bilinmeyen',
        studentIds: meeting.students.map((s) => s.studentId),
        studentNames: meeting.students.map((s) => { var _a; return (_a = studentMap.get(s.studentId)) !== null && _a !== void 0 ? _a : 'Bilinmeyen'; }),
        parentIds: meeting.parents.map((p) => p.parentId),
        scheduledAt: meeting.scheduledAt.toISOString(),
        durationMinutes: meeting.durationMinutes,
        meetingUrl: meeting.meetingUrl,
        relatedStudentId: (_c = meeting.students.find((s) => parentStudentIds.has(s.studentId))) === null || _c === void 0 ? void 0 : _c.studentId,
    });
});
// Toplantıya katıl (log)
router.post('/meetings/:id/join', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const userId = req.user.id;
    const meetingId = String(req.params.id);
    const meeting = await db_1.prisma.meeting.findUnique({
        where: { id: meetingId },
        include: { parents: { select: { parentId: true } } },
    });
    if (!meeting) {
        return res.status(404).json({ error: 'Toplantı bulunamadı' });
    }
    if (!meeting.parents.some((p) => p.parentId === userId)) {
        return res.status(403).json({ error: 'Bu toplantıya erişim izniniz yok' });
    }
    const now = Date.now();
    const scheduledAtMs = new Date(meeting.scheduledAt).getTime();
    const meetingEndMs = scheduledAtMs + meeting.durationMinutes * 60 * 1000;
    const windowStartMs = scheduledAtMs - 10 * 60 * 1000;
    if (now < windowStartMs) {
        return res.status(400).json({
            error: 'Bu toplantı henüz başlamadı. En erken toplantı saatinden 10 dakika önce katılabilirsiniz.',
        });
    }
    if (now > meetingEndMs) {
        return res.status(400).json({
            error: 'Bu toplantının katılım süresi sona erdi.',
        });
    }
    return res.json({ success: true, meetingUrl: meeting.meetingUrl });
});
// Bildirimler
router.get('/notifications', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const userId = req.user.id;
    const readFilter = req.query.read;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const where = { userId };
    if (readFilter === 'true')
        where.read = true;
    else if (readFilter === 'false')
        where.read = false;
    const userNotifications = await db_1.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit && limit > 0 ? limit : undefined,
    });
    return res.json(userNotifications.map((n) => {
        var _a, _b, _c;
        return ({
            id: n.id,
            userId: n.userId,
            type: n.type,
            title: n.title,
            body: n.body,
            read: n.read,
            relatedEntityType: (_a = n.relatedEntityType) !== null && _a !== void 0 ? _a : undefined,
            relatedEntityId: (_b = n.relatedEntityId) !== null && _b !== void 0 ? _b : undefined,
            readAt: (_c = n.readAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
            createdAt: n.createdAt.toISOString(),
        });
    }));
});
router.get('/notifications/unread-count', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const userId = req.user.id;
    const count = await db_1.prisma.notification.count({
        where: { userId, read: false },
    });
    return res.json({ count });
});
router.put('/notifications/:id/read', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a;
    const userId = req.user.id;
    const notificationId = String(req.params.id);
    const notification = await db_1.prisma.notification.findFirst({
        where: { id: notificationId, userId },
    });
    if (!notification) {
        return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }
    if (notification.userId !== userId) {
        return res.status(403).json({ error: 'Bu bildirimi okuma yetkiniz yok' });
    }
    const updated = await db_1.prisma.notification.update({
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
        readAt: (_a = updated.readAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
        createdAt: updated.createdAt.toISOString(),
    });
});
router.put('/notifications/read-all', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const userId = req.user.id;
    await db_1.prisma.notification.updateMany({
        where: { userId, read: false },
        data: { read: true, readAt: new Date() },
    });
    return res.json({ success: true });
});
router.delete('/notifications/:id', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const userId = req.user.id;
    const notificationId = String(req.params.id);
    const notification = await db_1.prisma.notification.findFirst({
        where: { id: notificationId, userId },
    });
    if (!notification) {
        return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }
    await db_1.prisma.notification.delete({ where: { id: notificationId } });
    return res.json({ success: true });
});
// Öğretmen geri bildirimleri
router.get('/children/:id/feedback', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const parentId = req.user.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
        return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
            error: access.error,
        });
    }
    const feedbacks = await db_1.prisma.teacherFeedback.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
    });
    return res.json(feedbacks.map((f) => {
        var _a, _b, _c;
        return ({
            id: f.id,
            studentId: f.studentId,
            teacherId: f.teacherId,
            teacherName: f.teacherName,
            type: f.type,
            relatedTestId: (_a = f.relatedTestId) !== null && _a !== void 0 ? _a : undefined,
            relatedAssignmentId: (_b = f.relatedAssignmentId) !== null && _b !== void 0 ? _b : undefined,
            title: f.title,
            content: f.content,
            read: f.read,
            readAt: (_c = f.readAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
            createdAt: f.createdAt.toISOString(),
        });
    }));
});
router.get('/feedback', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const parentId = req.user.id;
    const parent = await db_1.prisma.user.findFirst({
        where: { id: parentId, role: 'parent' },
        include: { parentStudents: { select: { studentId: true } } },
    });
    if (!parent) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    const studentIds = parent.parentStudents.map((ps) => ps.studentId);
    const feedbacks = await db_1.prisma.teacherFeedback.findMany({
        where: { studentId: { in: studentIds } },
        orderBy: { createdAt: 'desc' },
    });
    return res.json(feedbacks.map((f) => {
        var _a, _b, _c;
        return ({
            id: f.id,
            studentId: f.studentId,
            teacherId: f.teacherId,
            teacherName: f.teacherName,
            type: f.type,
            relatedTestId: (_a = f.relatedTestId) !== null && _a !== void 0 ? _a : undefined,
            relatedAssignmentId: (_b = f.relatedAssignmentId) !== null && _b !== void 0 ? _b : undefined,
            title: f.title,
            content: f.content,
            read: f.read,
            readAt: (_c = f.readAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
            createdAt: f.createdAt.toISOString(),
        });
    }));
});
// Geri bildirimi okundu olarak işaretle
router.put('/feedback/:id/read', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a;
    const parentId = req.user.id;
    const feedbackId = String(req.params.id);
    const feedback = await db_1.prisma.teacherFeedback.findUnique({
        where: { id: feedbackId },
    });
    if (!feedback) {
        return res.status(404).json({ error: 'Geri bildirim bulunamadı' });
    }
    const access = await checkParentAccess(parentId, feedback.studentId);
    if (!access.allowed) {
        return res.status(403).json({ error: 'Bu geri bildirime erişim izniniz yok' });
    }
    const updated = await db_1.prisma.teacherFeedback.update({
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
        readAt: (_a = updated.readAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
        createdAt: updated.createdAt.toISOString(),
    });
});
// Uyarılar
router.get('/children/:id/alerts', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const parentId = req.user.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
        return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
            error: access.error,
        });
    }
    const studentAlerts = await db_1.prisma.alert.findMany({
        where: { studentId },
        orderBy: { detectedAt: 'desc' },
    });
    return res.json(studentAlerts.map((a) => {
        var _a, _b;
        return ({
            id: a.id,
            studentId: a.studentId,
            type: a.type,
            severity: a.severity,
            title: a.title,
            description: a.description,
            status: a.status,
            relatedData: (_a = a.relatedData) !== null && _a !== void 0 ? _a : undefined,
            resolvedAt: (_b = a.resolvedAt) === null || _b === void 0 ? void 0 : _b.toISOString(),
            detectedAt: a.detectedAt.toISOString(),
        });
    }));
});
router.put('/alerts/:id/resolve', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a;
    const parentId = req.user.id;
    const alertId = String(req.params.id);
    const alert = await db_1.prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) {
        return res.status(404).json({ error: 'Uyarı bulunamadı' });
    }
    const access = await checkParentAccess(parentId, alert.studentId);
    if (!access.allowed) {
        return res.status(403).json({ error: 'Bu uyarıya erişim izniniz yok' });
    }
    const updated = await db_1.prisma.alert.update({
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
        resolvedAt: (_a = updated.resolvedAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
        detectedAt: updated.detectedAt.toISOString(),
    });
});
router.put('/alerts/:id/dismiss', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const parentId = req.user.id;
    const alertId = String(req.params.id);
    const alert = await db_1.prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) {
        return res.status(404).json({ error: 'Uyarı bulunamadı' });
    }
    const access = await checkParentAccess(parentId, alert.studentId);
    if (!access.allowed) {
        return res.status(403).json({ error: 'Bu uyarıya erişim izniniz yok' });
    }
    const updated = await db_1.prisma.alert.update({
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
});
// Aktivite özeti
router.get('/children/:id/activity-summary', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const parentId = req.user.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
        return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
            error: access.error,
        });
    }
    const period = req.query.period || 'weekly';
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const now = new Date();
    let periodStart;
    let periodEnd = new Date(now);
    if (period === 'daily') {
        periodStart = new Date(now);
        periodStart.setHours(0, 0, 0, 0);
    }
    else if (period === 'weekly') {
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    else if (period === 'monthly') {
        periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    else if (startDate && endDate) {
        periodStart = new Date(startDate);
        periodEnd = new Date(endDate);
    }
    else {
        periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
    const [studentResults, studentWatchRecords, studentAssignments] = await Promise.all([
        db_1.prisma.testResult.findMany({
            where: {
                studentId,
                completedAt: { gte: periodStart, lte: periodEnd },
            },
        }),
        db_1.prisma.watchRecord.findMany({
            where: {
                studentId,
                lastWatchedAt: { gte: periodStart, lte: periodEnd },
            },
        }),
        db_1.prisma.assignment.findMany({
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
        if (s === 'completed')
            assignmentsCompleted++;
        else if (s === 'overdue')
            assignmentsOverdue++;
    }
    const testsSolved = studentResults.length;
    const questionsSolved = studentResults.reduce((sum, r) => sum + r.correctCount + r.incorrectCount + r.blankCount, 0);
    const averageScorePercent = studentResults.length === 0
        ? 0
        : Math.round(studentResults.reduce((sum, r) => sum + r.scorePercent, 0) / studentResults.length);
    const totalStudyMinutes = Math.round((studentResults.reduce((sum, r) => sum + r.durationSeconds, 0) +
        studentWatchRecords.reduce((sum, w) => sum + w.watchedSeconds, 0)) /
        60);
    const contentsWatched = new Set(studentWatchRecords.map((w) => w.contentId)).size;
    const contentsWatchTimeMinutes = Math.round(studentWatchRecords.reduce((sum, w) => sum + w.watchedSeconds, 0) / 60);
    const dailyBreakdownMap = new Map();
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
        topSubjects: [],
        topTopics: [],
        dailyBreakdown,
    });
});
// Haftalık raporlar
router.get('/children/:id/weekly-reports', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const parentId = req.user.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
        return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
            error: access.error,
        });
    }
    const reports = await db_1.prisma.weeklyReport.findMany({
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
});
// Hedefler
router.get('/children/:id/goals', (0, auth_1.authenticate)('parent'), async (req, res) => {
    const parentId = req.user.id;
    const studentId = String(req.params.id);
    const access = await checkParentAccess(parentId, studentId);
    if (!access.allowed) {
        return res.status(access.error === 'Veli bulunamadı' ? 404 : 403).json({
            error: access.error,
        });
    }
    const studentGoals = await db_1.prisma.parentGoal.findMany({
        where: { studentId, createdByParentId: parentId },
    });
    const testResultsData = await db_1.prisma.testResult.findMany({
        where: { studentId },
    });
    const withProgress = studentGoals.map((g) => {
        var _a, _b, _c;
        let currentValue = 0;
        if (g.type === 'weekly_tests') {
            const weekStart = new Date(g.startDate);
            const weekEnd = new Date(g.endDate);
            currentValue = testResultsData.filter((r) => r.completedAt >= weekStart && r.completedAt <= weekEnd).length;
        }
        const progressPercent = Math.min(Math.round((currentValue / g.targetValue) * 100), 100);
        return {
            id: g.id,
            studentId: g.studentId,
            createdByParentId: g.createdByParentId,
            type: g.type,
            targetValue: g.targetValue,
            topic: (_a = g.topic) !== null && _a !== void 0 ? _a : undefined,
            startDate: g.startDate.toISOString(),
            endDate: g.endDate.toISOString(),
            status: g.status,
            reward: (_b = g.reward) !== null && _b !== void 0 ? _b : undefined,
            completedAt: (_c = g.completedAt) === null || _c === void 0 ? void 0 : _c.toISOString(),
            createdAt: g.createdAt.toISOString(),
            currentValue,
            progressPercent,
        };
    });
    return res.json(withProgress);
});
// Yeni hedef oluştur
router.post('/children/:id/goals', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a;
    const parentId = req.user.id;
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
    const newGoal = await db_1.prisma.parentGoal.create({
        data: {
            studentId,
            createdByParentId: parentId,
            type: type,
            targetValue,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            reward: reward !== null && reward !== void 0 ? reward : undefined,
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
        reward: (_a = newGoal.reward) !== null && _a !== void 0 ? _a : undefined,
    });
});
// Takvim
router.get('/calendar', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a;
    const parentId = req.user.id;
    const parent = await db_1.prisma.user.findFirst({
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
    const events = [];
    const now = new Date();
    const [assignmentsData, testResultsData, meetingsData, studentsData] = await Promise.all([
        db_1.prisma.assignment.findMany({
            where: {
                students: { some: { studentId: { in: studentIds } } },
                dueDate: { gte: startDate, lte: endDate },
            },
            include: { students: { select: { studentId: true } } },
        }),
        db_1.prisma.testResult.findMany({ where: { studentId: { in: studentIds } } }),
        db_1.prisma.meeting.findMany({
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
        db_1.prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true } }),
    ]);
    const studentMap = new Map(studentsData.map((s) => [s.id, s.name]));
    const completedIds = new Set(testResultsData.map((r) => `${r.assignmentId}-${r.studentId}`));
    for (const studentId of studentIds) {
        const studentAssignments = assignmentsData.filter((a) => a.students.some((s) => s.studentId === studentId));
        for (const assignment of studentAssignments) {
            const dueDate = assignment.dueDate;
            if (dueDate >= startDate && dueDate <= endDate) {
                let status = 'pending';
                if (dueDate < now)
                    status = 'overdue';
                else if (completedIds.has(`${assignment.id}-${studentId}`))
                    status = 'completed';
                events.push({
                    id: `assignment-${assignment.id}-${studentId}`,
                    type: 'assignment',
                    title: `${studentMap.get(studentId) || 'Öğrenci'}: ${assignment.title}`,
                    startDate: dueDate.toISOString(),
                    description: (_a = assignment.description) !== null && _a !== void 0 ? _a : undefined,
                    status,
                    color: status === 'overdue' ? '#e74c3c' : status === 'completed' ? '#27ae60' : '#3498db',
                    relatedId: assignment.id,
                });
            }
        }
        for (const meeting of meetingsData) {
            const meetingStart = meeting.scheduledAt;
            if (meetingStart >= startDate && meetingStart <= endDate) {
                const meetingEnd = new Date(meetingStart.getTime() + meeting.durationMinutes * 60 * 1000);
                const isRelevant = meeting.students.some((s) => s.studentId === studentId) ||
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
    const typeFilter = req.query.type;
    const statusFilter = req.query.status;
    let filteredEvents = events;
    if (typeFilter)
        filteredEvents = filteredEvents.filter((e) => e.type === typeFilter);
    if (statusFilter)
        filteredEvents = filteredEvents.filter((e) => e.status === statusFilter);
    filteredEvents.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    return res.json({
        events: filteredEvents,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        viewType: req.query.viewType || 'month',
    });
});
// Şikayet / öneri (admin'e)
router.post('/complaints', (0, auth_1.authenticate)('parent'), async (req, res) => {
    var _a;
    const parentId = req.user.id;
    const { subject, body, aboutTeacherId } = req.body;
    if (!subject || !body) {
        return res.status(400).json({ error: 'subject ve body alanları zorunludur' });
    }
    if (aboutTeacherId) {
        const teacher = await db_1.prisma.user.findFirst({ where: { id: aboutTeacherId, role: 'teacher' } });
        if (!teacher) {
            return res.status(404).json({ error: 'Öğretmen bulunamadı' });
        }
    }
    const created = await db_1.prisma.complaint.create({
        data: {
            fromRole: 'parent',
            fromUserId: parentId,
            aboutTeacherId: aboutTeacherId !== null && aboutTeacherId !== void 0 ? aboutTeacherId : undefined,
            subject: subject.trim(),
            body: body.trim(),
            status: 'open',
        },
    });
    const admins = await db_1.prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    if (admins.length > 0) {
        await db_1.prisma.notification.createMany({
            data: admins.map((a) => ({
                userId: a.id,
                type: 'complaint_created',
                title: 'Yeni şikayet/öneri',
                body: 'Veliden yeni bir şikayet/öneri gönderildi.',
                read: false,
                relatedEntityType: 'complaint',
                relatedEntityId: created.id,
            })),
        });
    }
    return res.status(201).json({
        id: created.id,
        fromRole: created.fromRole,
        fromUserId: created.fromUserId,
        aboutTeacherId: (_a = created.aboutTeacherId) !== null && _a !== void 0 ? _a : undefined,
        subject: created.subject,
        body: created.body,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
    });
});
exports.default = router;
//# sourceMappingURL=routes.parent.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const data_1 = require("./data");
const router = express_1.default.Router();
// Öğrenci dashboard özeti
router.get('/dashboard', (0, auth_1.authenticate)('student'), (req, res) => {
    const studentId = req.user.id;
    const pendingAssignments = data_1.assignments.filter((a) => a.assignedStudentIds.includes(studentId));
    const now = Date.now();
    const last7Days = now - 7 * 24 * 60 * 60 * 1000;
    const studentResults = data_1.testResults.filter((r) => r.studentId === studentId &&
        new Date(r.completedAt).getTime() >= last7Days);
    const testsSolvedThisWeek = studentResults.length;
    const totalQuestionsThisWeek = studentResults.reduce((sum, r) => sum + r.answers.length, 0);
    const averageScorePercent = studentResults.length === 0
        ? 0
        : Math.round(studentResults.reduce((sum, r) => sum + r.scorePercent, 0) /
            studentResults.length);
    const lastWatched = data_1.watchRecords
        .filter((w) => w.studentId === studentId)
        .slice(-5);
    const lastWatchedContents = lastWatched.map((w) => {
        var _a;
        const content = data_1.contents.find((c) => c.id === w.contentId);
        return {
            contentId: w.contentId,
            title: (_a = content === null || content === void 0 ? void 0 : content.title) !== null && _a !== void 0 ? _a : 'Bilinmeyen içerik',
            lastPositionSeconds: w.watchedSeconds,
        };
    });
    const summary = {
        pendingAssignmentsCount: pendingAssignments.length,
        testsSolvedThisWeek,
        totalQuestionsThisWeek,
        averageScorePercent,
        lastWatchedContents,
    };
    return res.json(summary);
});
// Görev listesi
router.get('/assignments', (0, auth_1.authenticate)('student'), (req, res) => {
    const studentId = req.user.id;
    const studentAssignments = data_1.assignments.filter((a) => a.assignedStudentIds.includes(studentId));
    return res.json(studentAssignments);
});
// Görev detayı
router.get('/assignments/:id', (0, auth_1.authenticate)('student'), (req, res) => {
    const studentId = req.user.id;
    const id = String(req.params.id);
    const assignment = data_1.assignments.find((a) => a.id === id);
    if (!assignment) {
        return res.status(404).json({ error: 'Görev bulunamadı' });
    }
    if (!assignment.assignedStudentIds.includes(studentId)) {
        return res
            .status(403)
            .json({ error: 'Bu göreve erişim izniniz yok' });
    }
    const test = assignment.testId
        ? data_1.tests.find((t) => t.id === assignment.testId)
        : undefined;
    return res.json({ assignment, test });
});
// Test çözümü gönderme (basitleştirilmiş)
router.post('/assignments/:id/submit', (0, auth_1.authenticate)('student'), (req, res) => {
    var _a, _b;
    const studentId = req.user.id;
    const id = String(req.params.id);
    const assignment = data_1.assignments.find((a) => a.id === id);
    if (!assignment || !assignment.testId) {
        return res.status(404).json({ error: 'Görev veya test bulunamadı' });
    }
    if (!assignment.assignedStudentIds.includes(studentId)) {
        return res
            .status(403)
            .json({ error: 'Bu göreve erişim izniniz yok' });
    }
    const test = data_1.tests.find((t) => t.id === assignment.testId);
    if (!test) {
        return res.status(404).json({ error: 'Test bulunamadı' });
    }
    const answers = ((_a = req.body.answers) !== null && _a !== void 0 ? _a : []);
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const incorrectCount = answers.filter((a) => !a.isCorrect && a.answer !== '').length;
    const blankCount = test.questionIds.length - (correctCount + incorrectCount);
    const scorePercent = test.questionIds.length === 0
        ? 0
        : Math.round((correctCount / test.questionIds.length) * 100);
    const result = {
        id: `res-${Date.now()}`,
        assignmentId: assignment.id,
        studentId,
        testId: test.id,
        answers,
        correctCount,
        incorrectCount,
        blankCount,
        scorePercent,
        durationSeconds: (_b = req.body.durationSeconds) !== null && _b !== void 0 ? _b : 0,
        completedAt: new Date().toISOString(),
    };
    data_1.testResults.push(result);
    return res.status(201).json(result);
});
// İçerik listesi (öğrenciye atanmış)
router.get('/contents', (0, auth_1.authenticate)('student'), (req, res) => {
    const studentId = req.user.id;
    const availableContents = data_1.contents.filter((c) => c.assignedToStudentIds.includes(studentId) ||
        c.assignedToClassIds.length > 0);
    return res.json(availableContents);
});
// İzlenme ilerleyişi güncelleme
router.post('/contents/:id/watch', (0, auth_1.authenticate)('student'), (req, res) => {
    var _a;
    const studentId = req.user.id;
    const contentId = String(req.params.id);
    const content = data_1.contents.find((c) => c.id === contentId);
    if (!content) {
        return res.status(404).json({ error: 'İçerik bulunamadı' });
    }
    const watchedSeconds = (_a = req.body.watchedSeconds) !== null && _a !== void 0 ? _a : 0;
    const completed = !!req.body.completed;
    let record = data_1.watchRecords.find((w) => w.contentId === contentId && w.studentId === studentId);
    if (!record) {
        const newRecord = {
            id: `watch-${Date.now()}`,
            contentId,
            studentId,
            watchedSeconds,
            completed,
            lastWatchedAt: new Date().toISOString(),
        };
        data_1.watchRecords.push(newRecord);
        record = newRecord;
    }
    else {
        record.watchedSeconds = watchedSeconds;
        record.completed = completed || record.completed;
        record.lastWatchedAt = new Date().toISOString();
    }
    return res.json(record);
});
// Mesajlar
router.get('/messages', (0, auth_1.authenticate)('student'), (req, res) => {
    const userId = req.user.id;
    const userMessages = data_1.messages.filter((m) => m.fromUserId === userId || m.toUserId === userId);
    return res.json(userMessages);
});
// Toplantılar
router.get('/meetings', (0, auth_1.authenticate)('student'), (req, res) => {
    const userId = req.user.id;
    const userMeetings = data_1.meetings.filter((m) => m.studentIds.includes(userId));
    return res.json(userMeetings);
});
// Bildirimler
router.get('/notifications', (0, auth_1.authenticate)('student'), (req, res) => {
    const userId = req.user.id;
    const userNotifications = data_1.notifications.filter((n) => n.userId === userId);
    return res.json(userNotifications);
});
exports.default = router;
//# sourceMappingURL=routes.student.js.map
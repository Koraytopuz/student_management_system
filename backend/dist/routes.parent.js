"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const data_1 = require("./data");
const router = express_1.default.Router();
// Veli dashboard özeti
router.get('/dashboard', (0, auth_1.authenticate)('parent'), (req, res) => {
    const parentId = req.user.id;
    const parent = data_1.parents.find((p) => p.id === parentId);
    if (!parent) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    const cards = parent.studentIds.map((sid) => {
        var _a;
        const student = data_1.students.find((s) => s.id === sid);
        const studentResults = data_1.testResults.filter((r) => r.studentId === sid);
        const testsSolvedLast7Days = studentResults.length;
        const averageScorePercent = studentResults.length === 0
            ? 0
            : Math.round(studentResults.reduce((sum, r) => sum + r.scorePercent, 0) /
                studentResults.length);
        const studyMinutes = data_1.watchRecords
            .filter((w) => w.studentId === sid)
            .reduce((sum, w) => sum + w.watchedSeconds, 0) / 60;
        return {
            studentId: sid,
            studentName: (_a = student === null || student === void 0 ? void 0 : student.name) !== null && _a !== void 0 ? _a : 'Bilinmeyen öğrenci',
            testsSolvedLast7Days,
            averageScorePercent,
            totalStudyMinutes: Math.round(studyMinutes),
        };
    });
    const summary = {
        children: cards,
    };
    return res.json(summary);
});
// Çocuk aktivite detayı
router.get('/children/:id/activity', (0, auth_1.authenticate)('parent'), (req, res) => {
    const parentId = req.user.id;
    const parent = data_1.parents.find((p) => p.id === parentId);
    if (!parent) {
        return res.status(404).json({ error: 'Veli bulunamadı' });
    }
    const id = String(req.params.id);
    if (!parent.studentIds.includes(id)) {
        return res
            .status(403)
            .json({ error: 'Bu öğrencinin verilerine erişim izniniz yok' });
    }
    const student = data_1.students.find((s) => s.id === id);
    if (!student) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    const studentResults = data_1.testResults.filter((r) => r.studentId === id);
    const studentAssignments = data_1.assignments.filter((a) => a.assignedStudentIds.includes(id));
    const studentWatch = data_1.watchRecords.filter((w) => w.studentId === id);
    return res.json({
        student,
        results: studentResults,
        assignments: studentAssignments,
        watchRecords: studentWatch,
    });
});
// Mesajlar
router.get('/messages', (0, auth_1.authenticate)('parent'), (req, res) => {
    const userId = req.user.id;
    const userMessages = data_1.messages.filter((m) => m.fromUserId === userId || m.toUserId === userId);
    return res.json(userMessages);
});
// Toplantılar
router.get('/meetings', (0, auth_1.authenticate)('parent'), (req, res) => {
    const userId = req.user.id;
    const userMeetings = data_1.meetings.filter((m) => m.parentIds.includes(userId));
    return res.json(userMeetings);
});
// Bildirimler
router.get('/notifications', (0, auth_1.authenticate)('parent'), (req, res) => {
    const userId = req.user.id;
    const userNotifications = data_1.notifications.filter((n) => n.userId === userId);
    return res.json(userNotifications);
});
exports.default = router;
//# sourceMappingURL=routes.parent.js.map
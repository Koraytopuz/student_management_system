"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("./auth");
const data_1 = require("./data");
const router = express_1.default.Router();
// Öğretmen dashboard özeti
router.get('/dashboard', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const teacherId = req.user.id;
    const teacherClasses = data_1.classGroups.filter((c) => c.teacherId === teacherId);
    const teacherStudents = data_1.students.filter((s) => teacherClasses.some((c) => c.id === s.classId));
    const now = Date.now();
    const last7Days = now - 7 * 24 * 60 * 60 * 1000;
    const recentResults = data_1.testResults.filter((r) => new Date(r.completedAt).getTime() >= last7Days);
    const averageScoreLast7Days = recentResults.length === 0
        ? 0
        : Math.round(recentResults.reduce((sum, r) => sum + r.scorePercent, 0) / recentResults.length);
    const testsAssignedThisWeek = data_1.assignments.filter((a) => {
        if (!a.testId)
            return false;
        const createdTime = new Date(a.dueDate).getTime() - 3 * 24 * 60 * 60 * 1000;
        return createdTime >= last7Days;
    }).length;
    const recentActivity = recentResults
        .slice(-5)
        .map((r) => `Öğrenci ${r.studentId} ${r.scorePercent}% skorla ${r.testId} testini tamamladı`);
    const summary = {
        totalStudents: teacherStudents.length,
        testsAssignedThisWeek,
        averageScoreLast7Days,
        recentActivity,
    };
    return res.json(summary);
});
// Öğrenci listesi
router.get('/students', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const teacherId = req.user.id;
    const teacherClasses = data_1.classGroups.filter((c) => c.teacherId === teacherId);
    const teacherStudents = data_1.students.map((s) => {
        const classInfo = teacherClasses.find((c) => c.id === s.classId);
        return classInfo ? s : null;
    }).filter((s) => s !== null);
    return res.json(teacherStudents);
});
// Bireysel öğrenci profili
router.get('/students/:id', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const id = String(req.params.id);
    const student = data_1.students.find((s) => s.id === id);
    if (!student) {
        return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }
    const studentAssignments = data_1.assignments.filter((a) => a.assignedStudentIds.includes(id));
    const studentResults = data_1.testResults.filter((r) => r.studentId === id);
    const studentWatch = data_1.watchRecords.filter((w) => w.studentId === id);
    return res.json({
        student,
        assignments: studentAssignments,
        results: studentResults,
        watchRecords: studentWatch,
    });
});
// İçerik listesi
router.get('/contents', (0, auth_1.authenticate)('teacher'), (req, res) => {
    return res.json(data_1.contents);
});
// Test listesi
router.get('/tests', (0, auth_1.authenticate)('teacher'), (req, res) => {
    return res.json(data_1.tests);
});
// Soru bankası listesi
router.get('/questions', (0, auth_1.authenticate)('teacher'), (_req, res) => {
    return res.json(data_1.questions);
});
// Yeni içerik oluşturma
router.post('/contents', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const teacherId = req.user.id;
    const { title, description, type, subjectId, topic, gradeLevel, durationMinutes, tags, url, } = req.body;
    if (!title || !type || !subjectId || !topic || !gradeLevel || !url) {
        return res.status(400).json({
            error: 'title, type, subjectId, topic, gradeLevel ve url alanları zorunludur',
        });
    }
    const tagArray = typeof tags === 'string'
        ? tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : tags !== null && tags !== void 0 ? tags : [];
    const content = {
        id: `cnt-${Date.now()}`,
        title,
        description,
        type,
        subjectId,
        topic,
        gradeLevel,
        durationMinutes,
        tags: tagArray,
        url,
        // Varsayılan olarak öğretmenin tüm sınıflarına atanabilir; şimdilik boş bırakıyoruz
        assignedToClassIds: [],
        assignedToStudentIds: [],
        createdByTeacherId: teacherId,
    };
    // contents tipi ContentItem olduğu için type assert kullanıyoruz
    data_1.contents.push(content);
    return res.status(201).json(content);
});
// Yeni test oluşturma
router.post('/tests', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const teacherId = req.user.id;
    const { title, subjectId, topic } = req.body;
    if (!title || !subjectId || !topic) {
        return res
            .status(400)
            .json({ error: 'title, subjectId ve topic zorunludur' });
    }
    const testId = `test-${Date.now()}`;
    const test = {
        id: testId,
        title,
        subjectId,
        topic,
        questionIds: [],
        createdByTeacherId: teacherId,
    };
    data_1.tests.push(test);
    return res.status(201).json(test);
});
// Yeni görev / assignment oluşturma
router.post('/assignments', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const { title, description, testId, contentId, classId, dueDate, points } = req.body;
    if (!title || (!testId && !contentId) || !dueDate || points == null) {
        return res.status(400).json({
            error: 'title, (testId veya contentId), dueDate ve points alanları zorunludur',
        });
    }
    let assignedStudentIds = [];
    if (classId) {
        assignedStudentIds = data_1.students
            .filter((s) => s.classId === classId)
            .map((s) => s.id);
    }
    else {
        // sınıf belirtilmediyse tüm öğrenciler
        assignedStudentIds = data_1.students.map((s) => s.id);
    }
    const assignment = {
        id: `a-${Date.now()}`,
        title,
        description: description !== null && description !== void 0 ? description : '',
        testId: testId !== null && testId !== void 0 ? testId : '',
        contentId: contentId !== null && contentId !== void 0 ? contentId : '',
        classId: classId !== null && classId !== void 0 ? classId : '',
        assignedStudentIds,
        dueDate,
        points,
    };
    data_1.assignments.push(assignment);
    return res.status(201).json(assignment);
});
// Görev listesi
router.get('/assignments', (0, auth_1.authenticate)('teacher'), (req, res) => {
    return res.json(data_1.assignments);
});
// Mesajlar
router.get('/messages', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const userId = req.user.id;
    const userMessages = data_1.messages.filter((m) => m.fromUserId === userId || m.toUserId === userId);
    return res.json(userMessages);
});
// Yeni mesaj gönderme
router.post('/messages', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const fromUserId = req.user.id;
    const { toUserId, text } = req.body;
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
    data_1.messages.push(message);
    return res.status(201).json(message);
});
// Toplantılar
router.get('/meetings', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const userId = req.user.id;
    const userMeetings = data_1.meetings.filter((m) => m.teacherId === userId);
    return res.json(userMeetings);
});
// Yeni toplantı planlama
router.post('/meetings', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const teacherId = req.user.id;
    const { type, title, studentIds, parentIds, scheduledAt, durationMinutes, meetingUrl, } = req.body;
    if (!type || !title || !scheduledAt || !durationMinutes || !meetingUrl) {
        return res.status(400).json({
            error: 'type, title, scheduledAt, durationMinutes ve meetingUrl alanları zorunludur',
        });
    }
    const meeting = {
        id: `m-${Date.now()}`,
        type,
        title,
        teacherId,
        studentIds: studentIds !== null && studentIds !== void 0 ? studentIds : [],
        parentIds: parentIds !== null && parentIds !== void 0 ? parentIds : [],
        scheduledAt,
        durationMinutes,
        meetingUrl,
    };
    data_1.meetings.push(meeting);
    return res.status(201).json(meeting);
});
// Bildirimler
router.get('/notifications', (0, auth_1.authenticate)('teacher'), (req, res) => {
    const userId = req.user.id;
    const userNotifications = data_1.notifications.filter((n) => n.userId === userId);
    return res.json(userNotifications);
});
exports.default = router;
//# sourceMappingURL=routes.teacher.js.map
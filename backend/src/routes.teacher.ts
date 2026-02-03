import express from 'express';
import { authenticate, AuthenticatedRequest } from './auth';
import {
  allUsers,
  assignments,
  classGroups,
  contents,
  meetings,
  messages,
  notifications,
  parents,
  questions,
  students,
  tests,
  testResults,
  watchRecords,
} from './data';
import {
  CalendarEvent,
  CalendarEventType,
  TeacherDashboardSummary,
  TestResult,
} from './types';

const router = express.Router();

// Öğretmen dashboard özeti
router.get(
  '/dashboard',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const teacherClasses = classGroups.filter((c) => c.teacherId === teacherId);
    const teacherStudents = students.filter((s) => teacherClasses.some((c) => c.id === s.classId));

    const now = Date.now();
    const last7Days = now - 7 * 24 * 60 * 60 * 1000;
    const recentResults: TestResult[] = testResults.filter(
      (r) => new Date(r.completedAt).getTime() >= last7Days,
    );

    const averageScoreLast7Days =
      recentResults.length === 0
        ? 0
        : Math.round(
            recentResults.reduce((sum, r) => sum + r.scorePercent, 0) / recentResults.length,
          );

    const testsAssignedThisWeek = assignments.filter((a) => {
      if (!a.testId) return false;
      const createdTime = new Date(a.dueDate).getTime() - 3 * 24 * 60 * 60 * 1000;
      return createdTime >= last7Days;
    }).length;

    const recentActivity: string[] = recentResults
      .slice(-5)
      .map(
        (r) =>
          `Öğrenci ${r.studentId} ${r.scorePercent}% skorla ${r.testId} testini tamamladı`,
      );

    const summary: TeacherDashboardSummary = {
      totalStudents: teacherStudents.length,
      testsAssignedThisWeek,
      averageScoreLast7Days,
      recentActivity,
    };

    return res.json(summary);
  },
);

// Öğrenci listesi
router.get(
  '/students',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const teacherClasses = classGroups.filter((c) => c.teacherId === teacherId);
    const teacherStudents = students.map((s) => {
      const classInfo = teacherClasses.find((c) => c.id === s.classId);
      return classInfo ? s : null;
    }).filter((s): s is typeof students[number] => s !== null);

    return res.json(teacherStudents);
  },
);

// Veli listesi (öğretmenin sınıflarındaki öğrencilerin velileri)
router.get(
  '/parents',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const teacherClasses = classGroups.filter((c) => c.teacherId === teacherId);
    const teacherStudentIds = students
      .filter((s) => teacherClasses.some((c) => c.id === s.classId))
      .map((s) => s.id);

    // Bu öğrencilerin velilerini bul
    const teacherParents = parents.filter((p) =>
      p.studentIds.some((sid) => teacherStudentIds.includes(sid)),
    );

    return res.json(teacherParents);
  },
);

// Bireysel öğrenci profili
router.get(
  '/students/:id',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const id = String(req.params.id);
    const student = students.find((s) => s.id === id);
    if (!student) {
      return res.status(404).json({ error: 'Öğrenci bulunamadı' });
    }

    const studentAssignments = assignments.filter((a) =>
      a.assignedStudentIds.includes(id),
    );
    const studentResults = testResults.filter((r) => r.studentId === id);
    const studentWatch = watchRecords.filter((w) => w.studentId === id);

    return res.json({
      student,
      assignments: studentAssignments,
      results: studentResults,
      watchRecords: studentWatch,
    });
  },
);

// İçerik listesi
router.get(
  '/contents',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    return res.json(contents);
  },
);

// Test listesi
router.get(
  '/tests',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    return res.json(tests);
  },
);

// Soru bankası listesi
router.get(
  '/questions',
  authenticate('teacher'),
  (_req: AuthenticatedRequest, res) => {
    return res.json(questions);
  },
);

// Yeni içerik oluşturma
router.post(
  '/contents',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const {
      title,
      description,
      type,
      subjectId,
      topic,
      gradeLevel,
      durationMinutes,
      tags,
      url,
    } = req.body as {
      title?: string;
      description?: string;
      type?: string;
      subjectId?: string;
      topic?: string;
      gradeLevel?: string;
      durationMinutes?: number;
      tags?: string[] | string;
      url?: string;
    };

    if (!title || !type || !subjectId || !topic || !gradeLevel || !url) {
      return res.status(400).json({
        error:
          'title, type, subjectId, topic, gradeLevel ve url alanları zorunludur',
      });
    }

    const tagArray: string[] =
      typeof tags === 'string'
        ? tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : tags ?? [];

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
    } as any;

    // contents tipi ContentItem olduğu için type assert kullanıyoruz
    (contents as any).push(content);
    return res.status(201).json(content);
  },
);

// Yeni test oluşturma
router.post(
  '/tests',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const { title, subjectId, topic } = req.body as {
      title?: string;
      subjectId?: string;
      topic?: string;
    };

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
    tests.push(test);
    return res.status(201).json(test);
  },
);

// Yeni görev / assignment oluşturma
router.post(
  '/assignments',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const { title, description, testId, contentId, classId, dueDate, points } =
      req.body as {
        title?: string;
        description?: string;
        testId?: string;
        contentId?: string;
        classId?: string;
        dueDate?: string;
        points?: number;
      };

    if (!title || (!testId && !contentId) || !dueDate || points == null) {
      return res.status(400).json({
        error:
          'title, (testId veya contentId), dueDate ve points alanları zorunludur',
      });
    }

    let assignedStudentIds: string[] = [];
    if (classId) {
      assignedStudentIds = students
        .filter((s) => s.classId === classId)
        .map((s) => s.id);
    } else {
      // sınıf belirtilmediyse tüm öğrenciler
      assignedStudentIds = students.map((s) => s.id);
    }

    const assignment: (typeof assignments)[number] = {
      id: `a-${Date.now()}`,
      title,
      description: description ?? '',
      testId: testId ?? '',
      contentId: contentId ?? '',
      classId: classId ?? '',
      assignedStudentIds,
      dueDate,
      points,
    };

    assignments.push(assignment);
    return res.status(201).json(assignment);
  },
);

// Görev listesi
router.get(
  '/assignments',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    return res.json(assignments);
  },
);

// Mesajlar (gönderen ve alıcı isimleriyle)
router.get(
  '/messages',
  authenticate('teacher'),
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

// Yeni mesaj gönderme
router.post(
  '/messages',
  authenticate('teacher'),
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
      body: 'Öğretmenden yeni bir mesaj aldınız.',
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
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const userMeetings = meetings.filter((m) => m.teacherId === userId);
    return res.json(userMeetings);
  },
);

// Yeni toplantı planlama
router.post(
  '/meetings',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const {
      type,
      title,
      studentIds,
      parentIds,
      scheduledAt,
      durationMinutes,
      meetingUrl,
    } = req.body as {
      type?: 'teacher_student' | 'teacher_student_parent' | 'class';
      title?: string;
      studentIds?: string[];
      parentIds?: string[];
      scheduledAt?: string;
      durationMinutes?: number;
      meetingUrl?: string;
    };

    if (!type || !title || !scheduledAt || !durationMinutes || !meetingUrl) {
      return res.status(400).json({
        error:
          'type, title, scheduledAt, durationMinutes ve meetingUrl alanları zorunludur',
      });
    }

    const meeting = {
      id: `m-${Date.now()}`,
      type,
      title,
      teacherId,
      studentIds: studentIds ?? [],
      parentIds: parentIds ?? [],
      scheduledAt,
      durationMinutes,
      meetingUrl,
    };

    meetings.push(meeting);
    return res.status(201).json(meeting);
  },
);

// Bildirimler
router.get(
  '/notifications',
  authenticate('teacher'),
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
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const count = notifications.filter(
      (n) => n.userId === userId && !n.read,
    ).length;
    return res.json({ count });
  },
);

// Bildirimi okundu olarak işaretle
router.put(
  '/notifications/:id/read',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const notificationId = String(req.params.id);
    const notification = notifications.find(
      (n) => n.id === notificationId && n.userId === userId,
    );

    if (!notification) {
      return res.status(404).json({ error: 'Bildirim bulunamadı' });
    }

    notification.read = true;
    notification.readAt = new Date().toISOString();
    return res.json(notification);
  },
);

// Tüm bildirimleri okundu olarak işaretle
router.put(
  '/notifications/read-all',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const now = new Date().toISOString();
    let updated = 0;
    notifications.forEach((n) => {
      if (n.userId === userId && !n.read) {
        n.read = true;
        n.readAt = now;
        updated += 1;
      }
    });
    return res.json({ updated, success: true });
  },
);

// Bildirimi sil
router.delete(
  '/notifications/:id',
  authenticate('teacher'),
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

// Takvim
router.get(
  '/calendar',
  authenticate('teacher'),
  (req: AuthenticatedRequest, res) => {
    const teacherId = req.user!.id;
    const startDate = req.query.startDate
      ? new Date(String(req.query.startDate))
      : new Date();
    const endDate = req.query.endDate
      ? new Date(String(req.query.endDate))
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Varsayılan: 30 gün sonrası

    const events: CalendarEvent[] = [];

    // Öğretmenin oluşturduğu görevler
    const teacherAssignments = assignments.filter((a) => {
      // Öğretmenin sınıflarına atanan görevler veya öğretmenin oluşturduğu görevler
      // Not: Assignment'da teacherId yok, bu yüzden tüm görevleri gösteriyoruz
      // İleride teacherId eklenebilir
      return true; // Şimdilik tüm görevleri göster
    });

    teacherAssignments.forEach((assignment) => {
      const dueDate = new Date(assignment.dueDate);
      if (dueDate >= startDate && dueDate <= endDate) {
        events.push({
          id: `assignment-${assignment.id}`,
          type: 'assignment',
          title: assignment.title,
          startDate: assignment.dueDate,
          description: assignment.description,
          status: dueDate < new Date() ? 'overdue' : 'pending',
          color: dueDate < new Date() ? '#e74c3c' : '#3498db',
          relatedId: assignment.id,
        });
      }
    });

    // Öğretmenin planladığı toplantılar
    const teacherMeetings = meetings.filter((m) => m.teacherId === teacherId);
    teacherMeetings.forEach((meeting) => {
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
          description: `${meeting.durationMinutes} dakika - ${meeting.type}`,
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


import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Book,
  BookOpen,
  Bot,
  CalendarCheck,
  ClipboardList,
  FileText,
  FileSpreadsheet,
  FileDown,
  Layers,
  MessageCircle,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { useSearchParams } from 'react-router-dom';
import {
  createTeacherContent,
  createTeacherAssignment,
  createTeacherMeeting,
  updateTeacherMeeting,
  deleteTeacherMeeting,
  startTeacherLiveMeeting,
  getTeacherAssignments,
  getTeacherCalendar,
  getTeacherContents,
  getTeacherDashboard,
  getTeacherMeetings,
  getTeacherAnnouncements,
  getTeacherMessages,
  getTeacherStudents,
  getTeacherStudentProfile,
  getTeacherHelpRequests,
  respondTeacherHelpRequest,
  sendTeacherMessage,
  uploadTeacherVideo,
  getTeacherTests,
  uploadTeacherTestAssetFile,
  getTeacherTestAssets,
  createTeacherTestAsset,
  deleteTeacherTestAsset,
  deleteTeacherHelpResponse,
  type CalendarEvent,
  type TeacherContent,
  type TeacherDashboardSummary,
  type TeacherMeeting,
  type TeacherStudent,
  type TeacherStudentProfile,
  type TeacherHelpRequestItem,
  type Message,
  sendTeacherAiMessage,
  generateQuestionBankItems,
  type AIQuestionGeneratePayload,
  type TeacherAnnouncement,
  createTeacherAnnouncement,
  updateTeacherAssignment,
  type TeacherTest,
  type TeacherTestAsset,
  type TeacherNotification,
  getTeacherNotifications,
  getTeacherUnreadNotificationCount,
  markTeacherNotificationRead,
  markAllTeacherNotificationsRead,
  deleteTeacherNotification,
  markTeacherMessageRead,
  type CurriculumTopic,
  getCurriculumTopics,
  getCurriculumSubjects,

  resolveContentUrl,
  getApiBaseUrl,
} from './api';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { DashboardLayout, GlassCard, MetricCard, TagChip } from './components/DashboardPrimitives';


if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}
import type { BreadcrumbItem, SidebarItem, SidebarSubItem } from './components/DashboardPrimitives';
import { useApiState } from './hooks/useApiState';
import { LiveClassOverlay } from './LiveClassOverlay';
import { CoachingTab } from './CoachingTab';
import { ParentOperationsTab } from './ParentOperationsTab';
import { QuestionBankTab } from './QuestionBankTab';
import { LessonScheduleTab } from './LessonScheduleTab';

type TeacherTab =
  | 'overview'
  | 'content'
  | 'live'
  | 'calendar'
  | 'students'
  | 'parents'
  | 'tests'
  | 'support'
  | 'questionbank'
  | 'schedule'
  | 'notifications'
  | 'coaching';

type ParsedPdfQuestion = {
  question_text: string;
  options: string[];
  correct_option?: string | null;
  difficulty: string;
  topic: string;
};

type AiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  attachment?: {
    filename: string;
    mimeType: string;
    data: string;
  };
};

type TeacherMeetingType = 'class' | 'teacher_student' | 'teacher_student_parent';
type MeetingAudience = 'all' | 'selected';

type TeacherMeetingDraft = {
  title: string;
  description: string;
  scheduledAt: string;
  durationMinutes: number;
  type: TeacherMeetingType;
  audience: MeetingAudience;
  selectedStudentIds: string[];
  /** Canlı dersin hedef sınıf seviyesi ("4"–"12" veya "Mezun") */
  targetGrade: string;
  /** Seçilen ders (branş) – başlıkta ve UI'da kullanılır */
  subjectName?: string;
};

const ALL_GRADES: string[] = ['4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mezun'];

type AiGeneratedQuestion = {
  index: number;
  text: string;
  choices?: string[];
  correctAnswer?: string;
  explanation?: string;
};

const parseAiGeneratedQuestions = (raw: string | null): AiGeneratedQuestion[] | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const cleaned = trimmed.replace(/```json|```/gi, '').trim();
    const data: any = JSON.parse(cleaned);
    const items: any[] = Array.isArray(data)
      ? data
      : Array.isArray((data as any).questions)
        ? (data as any).questions
        : [];
    if (!items.length) return null;
    const result: AiGeneratedQuestion[] = [];
    items.forEach((item, idx) => {
      if (!item) return;
      const text = String(item.text ?? item.question ?? item.prompt ?? '').trim();
      if (!text) return;
      const rawChoices: any =
        Array.isArray(item.choices) && item.choices.length
          ? item.choices
          : Array.isArray(item.options) && item.options.length
            ? item.options
            : null;
      const choices = rawChoices ? rawChoices.map((c: any) => String(c)) : undefined;
      const correctAnswer: string | undefined =
        typeof item.correctAnswer === 'string'
          ? item.correctAnswer
          : typeof item.answer === 'string'
            ? item.answer
            : typeof item.correctOption === 'string'
              ? item.correctOption
              : undefined;
      const explanation: string | undefined = String(
        item.solutionExplanation ?? item.explanation ?? item.reason ?? '',
      ).trim() || undefined;
      result.push({
        index: idx + 1,
        text,
        choices,
        correctAnswer,
        explanation,
      });
    });
    return result.length ? result : null;
  } catch {
    return null;
  }
};

const sortMeetingsByDate = (items: TeacherMeeting[]): TeacherMeeting[] =>
  [...items].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

const getWeekRange = () => {
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setDate(now.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const formatShortDate = (iso?: string) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
};

const formatTime = (iso?: string) => {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

const TEACHER_START_DEADLINE_MS = 10 * 60 * 1000;

const canTeacherStartMeeting = (scheduledAt: string, now = Date.now()): boolean => {
  const start = new Date(scheduledAt).getTime();
  if (Number.isNaN(start)) return false;
  return now <= start + TEACHER_START_DEADLINE_MS;
};

const getEventIcon = (event: CalendarEvent) => {
  const t = (event.type || '').toLowerCase();
  const title = (event.title || '').toLowerCase();
  if (t.includes('test') || title.includes('test')) return <ClipboardList size={14} />;
  if (t.includes('meeting') || t.includes('live') || title.includes('canlı')) return <Video size={14} />;
  if (t.includes('lesson') || t.includes('ders')) return <BookOpen size={14} />;
  return <CalendarCheck size={14} />;
};

export const TeacherDashboard: React.FC = () => {
  const { token, user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TeacherTab>('overview');

  const [contents, setContents] = useState<TeacherContent[]>([]);
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [tests, setTests] = useState<TeacherTest[]>([]);
  const [testAssets, setTestAssets] = useState<TeacherTestAsset[]>([]);
  const [meetings, setMeetings] = useState<TeacherMeeting[]>([]);
  const [studentMessages, setStudentMessages] = useState<Message[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentProfile, setSelectedStudentProfile] = useState<TeacherStudentProfile | null>(null);
  const [studentProfileLoading, setStudentProfileLoading] = useState(false);

  const [contentDraft, setContentDraft] = useState({
    title: '',
    type: 'video',
    topic: '',
    subjectId: 'sub_matematik',
    gradeLevel: '',
    url: '',
    description: '',
  });

  const [contentVideoFile, setContentVideoFile] = useState<File | null>(null);
  const [contentUploading, setContentUploading] = useState(false);
  const [curriculumTopics, setCurriculumTopics] = useState<CurriculumTopic[]>([]);
  const [curriculumTopicsLoading, setCurriculumTopicsLoading] = useState(false);
  const [curriculumSubjects, setCurriculumSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [curriculumSubjectsLoading, setCurriculumSubjectsLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<TeacherAnnouncement[]>([]);
  const [announcementDraft, setAnnouncementDraft] = useState({
    gradeLevel: '',
    studentId: '',
    title: '',
    message: '',
    scheduledDate: '',
  });
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementCreating, setAnnouncementCreating] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);

  const [assignmentEditOpen, setAssignmentEditOpen] = useState(false);
  const [assignmentEditId, setAssignmentEditId] = useState<string | null>(null);
  const [assignmentEditDraft, setAssignmentEditDraft] = useState({ title: '', description: '', dueDate: '' });
  const [assignmentEditSaving, setAssignmentEditSaving] = useState(false);
  const [assignmentEditError, setAssignmentEditError] = useState<string | null>(null);

  const [aiOpen, _setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>(() => [
    {
      id: 'ai-welcome',
      role: 'assistant',
      content:
        'Merhaba öğretmenim! Bana konu başlıklarını ve seviye bilgisini vererek öğrencilere uygun test soruları hazırlamamı isteyebilirsin.',
      createdAt: new Date().toISOString(),
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [_aiError, setAiError] = useState<string | null>(null);
  const aiScrollRef = useRef<HTMLDivElement | null>(null);
  const aiTestCardRef = useRef<HTMLDivElement | null>(null);
  const [aiFormat, _setAiFormat] = useState<'text' | 'pdf' | 'xlsx'>('text');
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [meetingDraft, setMeetingDraft] = useState<TeacherMeetingDraft>({
    title: '',
    description: '',
    scheduledAt: '',
    durationMinutes: 40,
    type: 'class',
    audience: 'all',
    selectedStudentIds: [],
    targetGrade: '',
    subjectName: '',
  });
  const [liveClass, setLiveClass] = useState<{
    url: string;
    token: string;
    title?: string;
    meetingId?: string;
  } | null>(null);

  // Öğretmenin atanmış sınıf seviyeleri ve branşları (login yanıtından)
  const teacherAssignedGrades: string[] = useMemo(() => {
    if (!user || user.role !== 'teacher') return ALL_GRADES;

    const fromUser = (user as any).assignedGrades as string[] | undefined;
    const fromStudents = Array.from(
      new Set(
        students
          .map((s) => s.gradeLevel)
          .filter((g): g is string => !!g),
      ),
    );

    const combined = [...(fromUser ?? []), ...fromStudents];
    const normalized = Array.from(
      new Set(
        combined.filter((g) => ALL_GRADES.includes(g)),
      ),
    );

    return normalized.length > 0 ? normalized : ALL_GRADES;
  }, [user, students]);

  const teacherSubjects: string[] = useMemo(() => {
    if (!user || user.role !== 'teacher') return [];
    const areas = (user as any).subjectAreas as string[] | undefined;
    return areas ?? [];
  }, [user]);

  // Bildirimler (öğretmen)
  const [notifications, setNotifications] = useState<TeacherNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [activeNotificationId, setActiveNotificationId] = useState<string | null>(null);
  const [focusHelpRequestId, setFocusHelpRequestId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Öğrenci listesi için genel loading durumu (özellikle ilk yükleme sırasında kullanılacak)
  const [studentsLoading, setStudentsLoading] = useState(false);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const notificationId = searchParams.get('notificationId');
    if (tab === 'notifications') {
      setActiveTab('notifications');
      if (notificationId) setActiveNotificationId(notificationId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);


  const handleReloadUnreadCount = async () => {
    if (!token) return;
    try {
      const { count } = await getTeacherUnreadNotificationCount(token);
      setUnreadNotificationCount(count);
    } catch {
      // sessizce yut
    }
  };

  const handleNotificationClick = (notification: TeacherNotification) => {
    // Sadece seçili bildirimi değiştir, sekme yönlendirmesi yapma
    setActiveNotificationId(notification.id);
  };

  // Bildirim listesi değiştiğinde seçili bildirimi doğrula
  useEffect(() => {
    if (!activeNotificationId) return;
    const exists = notifications.some((n) => n.id === activeNotificationId);
    if (!exists) {
      setActiveNotificationId(notifications[0]?.id ?? null);
    }
  }, [notifications, activeNotificationId]);

  const handleMarkNotificationRead = async (id: string) => {
    if (!token) return;
    try {
      await markTeacherNotificationRead(token, id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n)),
      );
      handleReloadUnreadCount().catch(() => {});
    } catch (e) {
      setNotificationsError((e as Error).message);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!token) return;
    try {
      await markAllTeacherNotificationsRead(token);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() })),
      );
      setUnreadNotificationCount(0);
    } catch (e) {
      setNotificationsError((e as Error).message);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!token) return;
    try {
      await deleteTeacherNotification(token, id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      handleReloadUnreadCount().catch(() => {});
    } catch (e) {
      setNotificationsError((e as Error).message);
    }
  };

  const dashboardState = useApiState<TeacherDashboardSummary>(null);
  const assignmentsState = useApiState<Array<{ id: string; title?: string; dueDate?: string }>>([]);
  const calendarState = useApiState<CalendarEvent[]>([]);

  useEffect(() => {
    if (!token) return;
    dashboardState.run(() => getTeacherDashboard(token)).catch(() => {});
    getTeacherContents(token).then(setContents).catch(() => {});
    getTeacherTests(token).then(setTests).catch(() => {});
    getTeacherTestAssets(token).then(setTestAssets).catch(() => {});
    getTeacherMessages(token)
      .then(setStudentMessages)
      .catch(() => {});
    getTeacherMeetings(token)
      .then((data) => setMeetings(sortMeetingsByDate(data)))
      .catch(() => {});
    getTeacherAnnouncements(token).then(setAnnouncements).catch(() => {});
    assignmentsState.run(() => getTeacherAssignments(token)).catch(() => {});
    const { start, end } = getWeekRange();
    calendarState
      .run(async () => {
        const payload = await getTeacherCalendar(token, start.toISOString(), end.toISOString());
        return payload.events;
      })
      .catch(() => {});

    // Öğretmen bildirimlerini ve okunmamış sayısını yükle
    const loadNotifications = async () => {
      try {
        setNotificationsLoading(true);
        setNotificationsError(null);
        const data = await getTeacherNotifications(token, 10);
        setNotifications(data);
      } catch (e) {
        setNotificationsError((e as Error).message);
      } finally {
        setNotificationsLoading(false);
      }
    };

    const loadUnreadCount = async () => {
      try {
        const { count } = await getTeacherUnreadNotificationCount(token);
        setUnreadNotificationCount(count);
      } catch {
        // sessizce yut
      }
    };

    loadNotifications().catch(() => {});
    loadUnreadCount().catch(() => {});

    const interval = window.setInterval(() => {
      loadUnreadCount().catch(() => {});
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [token]);

  // Öğrenci listesini ve online/offline durumunu periyodik olarak güncelle
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const loadStudents = async () => {
      try {
        if (!students.length) {
          setStudentsLoading(true);
        }
        const data = await getTeacherStudents(token);
        if (cancelled) return;
        setStudents(data);
        if (!selectedStudentId && data[0] && activeTab !== 'coaching') {
          setSelectedStudentId(data[0].id);
        }
      } catch {
        // sessizce yut
      } finally {
        setStudentsLoading(false);
      }
    };

    loadStudents().catch(() => {});
    const id = window.setInterval(() => {
      loadStudents().catch(() => {});
    }, 30000); // 30 saniyede bir güncelle

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token, selectedStudentId, students.length, activeTab]);

  // Kişisel Takip sekmesine ilk geçişte seçili öğrenciyi temizle; liste kapalı ve boş başlasın
  const prevActiveTabRef = useRef<TeacherTab>(activeTab);
  useEffect(() => {
    if (prevActiveTabRef.current !== 'coaching' && activeTab === 'coaching') {
      setSelectedStudentId('');
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (!token || !selectedStudentId) {
      setSelectedStudentProfile(null);
      return;
    }
    setStudentProfileLoading(true);
    getTeacherStudentProfile(token, selectedStudentId)
      .then((profile) => setSelectedStudentProfile(profile))
      .catch(() => setSelectedStudentProfile(null))
      .finally(() => setStudentProfileLoading(false));
  }, [token, selectedStudentId]);



  useEffect(() => {
    if (!aiOpen) return;
    aiScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, aiOpen]);

  const metrics = useMemo(() => {
    const summary = dashboardState.data;
    return [
      {
        label: 'Toplam Öğrenci',
        value: `${summary?.totalStudents ?? 0}`,
        helper: 'Sınıflar',
        trendLabel: 'Aktif',
        trendTone: 'positive' as const,
      },
      {
        label: 'Haftalık Ödev',
        value: `${summary?.testsAssignedThisWeek ?? 0}`,
        helper: 'Test & görev',
        trendLabel: 'Bu hafta',
        trendTone: 'neutral' as const,
      },
      {
        label: 'Aktivite',
        value: `${summary?.recentActivity?.length ?? 0}`,
        helper: 'Kayıt',
        trendLabel: 'Gerçek zaman',
        trendTone: 'neutral' as const,
      },
    ];
  }, [dashboardState.data]);

  const openMeetingModal = (meeting?: TeacherMeeting) => {
    setMeetingError(null);
    setMeetingModalOpen(true);
    if (meeting) {
      // Düzenleme modu
      setEditingMeetingId(meeting.id);
      const scheduled = new Date(meeting.scheduledAt);
      let scheduledValue = '';
      if (!Number.isNaN(scheduled.getTime())) {
        const local = new Date(scheduled.getTime() - scheduled.getTimezoneOffset() * 60 * 1000);
        if (!Number.isNaN(local.getTime())) {
          scheduledValue = local.toISOString().slice(0, 16);
        }
      }
      // Tarih parse edilemezse (bozuk veri vb.), varsayılan değer öner
      if (!scheduledValue) {
        const base = new Date(Date.now() + 15 * 60 * 1000);
        const localFallback = new Date(base.getTime() - base.getTimezoneOffset() * 60 * 1000);
        scheduledValue = localFallback.toISOString().slice(0, 16);
      }
      setMeetingDraft((prev) => ({
        ...prev,
        title: meeting.title,
        description: '',
        scheduledAt: scheduledValue,
        durationMinutes: meeting.durationMinutes ?? prev.durationMinutes,
      }));
    } else if (!meetingDraft.scheduledAt) {
      // Varsayılan olarak 15 dakika sonrasına tarih/saat öner (yeni toplantı)
      const base = new Date(Date.now() + 15 * 60 * 1000);
      const local = new Date(base.getTime() - base.getTimezoneOffset() * 60 * 1000);
      const value = local.toISOString().slice(0, 16);
      setMeetingDraft((prev) => ({
        ...prev,
        scheduledAt: value,
      }));
    }
  };

  const handleMarkMessageRead = async (messageId: string) => {
    if (!token) return;
    try {
      await markTeacherMessageRead(token, messageId);
      setStudentMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, read: true, readAt: new Date().toISOString() } : m,
        ),
      );
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e instanceof Error ? e.message : 'Mesaj okundu olarak işaretlenemedi.');
    }
  };

  const handleSaveMeeting = async () => {
    if (!token) return;

    const title = meetingDraft.title.trim();

    if (!title || !meetingDraft.scheduledAt) {
      setMeetingError('Lütfen ders başlığı ve tarih/saat alanlarını doldurun.');
      return;
    }

    if (!meetingDraft.targetGrade) {
      setMeetingError('Lütfen önce hedef sınıfı seçin.');
      return;
    }

    const scheduledDate = new Date(meetingDraft.scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      setMeetingError('Geçerli bir tarih/saat girin.');
      return;
    }

    const now = new Date();
    if (scheduledDate.getTime() < now.getTime() - 5 * 60 * 1000) {
      setMeetingError('Tarih/saat geçmiş bir zaman olamaz.');
      return;
    }

    if (meetingDraft.durationMinutes < 15 || meetingDraft.durationMinutes > 180) {
      setMeetingError('Süre 15 ile 180 dakika arasında olmalıdır.');
      return;
    }

    // Hedef sınıftaki öğrencileri filtrele
    const eligibleStudents = students.filter(
      (s) => s.gradeLevel === meetingDraft.targetGrade,
    );

    if (eligibleStudents.length === 0) {
      setMeetingError('Seçilen sınıfa ait kayıtlı öğrenci bulunamadı.');
      return;
    }

    let targetStudentIds: string[] = [];
    if (meetingDraft.audience === 'selected') {
      targetStudentIds = meetingDraft.selectedStudentIds.filter((id) =>
        eligibleStudents.some((s) => s.id === id),
      );
      if (targetStudentIds.length === 0) {
        setMeetingError('Lütfen bu sınıftan en az bir öğrenci seçin.');
        return;
      }
    } else {
      targetStudentIds = eligibleStudents.map((s) => s.id);
    }

    const prefixParts: string[] = [];
    if (meetingDraft.targetGrade) {
      prefixParts.push(
        meetingDraft.targetGrade === 'Mezun'
          ? 'Mezun'
          : `${meetingDraft.targetGrade}. Sınıf`,
      );
    }
    if (meetingDraft.subjectName) {
      prefixParts.push(meetingDraft.subjectName);
    }
    const prefix = prefixParts.length ? `[${prefixParts.join(' · ')}] ` : '';

    const baseTitle = `${prefix}${title}`;

    const composedTitle =
      meetingDraft.description.trim().length > 0
        ? `${baseTitle} – ${meetingDraft.description.trim()}`
        : baseTitle;

    setMeetingSaving(true);
    setMeetingError(null);
    try {
      if (editingMeetingId) {
        await updateTeacherMeeting(token, editingMeetingId, {
          title: composedTitle,
          scheduledAt: scheduledDate.toISOString(),
          durationMinutes: meetingDraft.durationMinutes,
        });
      } else {
        const created = await createTeacherMeeting(token, {
          type: meetingDraft.type,
          title: composedTitle,
          studentIds: targetStudentIds,
          parentIds: undefined,
          scheduledAt: scheduledDate.toISOString(),
          durationMinutes: meetingDraft.durationMinutes,
          // Artık harici link kullanmıyoruz; dahili canlı ders altyapısı (LiveKit) kullanılacak.
          meetingUrl: '',
          targetGrade: meetingDraft.targetGrade,
        });
        // Yeni oluşturulan toplantı için isteğe bağlı otomatik canlı ders başlatma
        try {
          await handleStartLiveMeeting(created.id);
        } catch {
          // otomatik başlatma başarısız olursa sessizce yut
        }
      }
      const updatedMeetings = await getTeacherMeetings(token);
      setMeetings(sortMeetingsByDate(updatedMeetings));
      const { start, end } = getWeekRange();
      calendarState
        .run(async () => {
          const payload = await getTeacherCalendar(token, start.toISOString(), end.toISOString());
          return payload.events;
        })
        .catch(() => {});
      setMeetingModalOpen(false);
      setMeetingDraft({
        title: '',
        description: '',
        scheduledAt: '',
        durationMinutes: 40,
        type: 'class',
        audience: 'all',
        selectedStudentIds: [],
        targetGrade: '',
        subjectName: '',
      });
      setEditingMeetingId(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Toplantı kaydedilemedi. Lütfen tekrar deneyin.';
      setMeetingError(message);
    } finally {
      setMeetingSaving(false);
    }
  };

  const handleEditMeeting = (meetingId: string) => {
    const meeting = meetings.find((m) => m.id === meetingId);
    if (!meeting) return;
    openMeetingModal(meeting);
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!token) return;
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm('Bu canlı dersi silmek istediğinize emin misiniz?');
    if (!confirmed) return;
    try {
      await deleteTeacherMeeting(token, meetingId);
      const updated = await getTeacherMeetings(token);
      setMeetings(sortMeetingsByDate(updated));
      const { start, end } = getWeekRange();
      calendarState
        .run(async () => {
          const payload = await getTeacherCalendar(token, start.toISOString(), end.toISOString());
          return payload.events;
        })
        .catch(() => {});
    } catch (error) {
      // eslint-disable-next-line no-alert
      alert(
        error instanceof Error ? `Toplantı silinemedi: ${error.message}` : 'Toplantı silinemedi.',
      );
    }
  };

  const handleCreateContent = async () => {
    if (!token) return;
    // subjectId is now in contentDraft
    const subjectId = contentDraft.subjectId;
    let url = contentDraft.url;
    if (contentVideoFile) {
      try {
        setContentUploading(true);
        const uploaded = await uploadTeacherVideo(token, contentVideoFile);
        url = uploaded.url;
      } finally {
        setContentUploading(false);
      }
    }
    const created = await createTeacherContent(token, {
      title: contentDraft.title,
      type: contentDraft.type,
      subjectId,
      topic: contentDraft.topic,
      gradeLevel: contentDraft.gradeLevel,
      url,
      description: contentDraft.description || '',
      durationMinutes: 0,
    });
    setContents((prev) => [created, ...prev]);
    setContentDraft({ title: '', type: 'video', topic: '', subjectId: 'sub_matematik', gradeLevel: '', url: '', description: '' });
    setContentVideoFile(null);
  };

  // İçerik oluştururken seçilen ders + sınıfa göre MEB müfredat konularını getir
  useEffect(() => {
    if (!token) return;

    // TYT/AYT gibi özel kategoriler için şu an müfredat tablosu kullanılmıyor
    // ARTIK KULLANILIYOR: contentDraft.subjectId var
    if (!contentDraft.subjectId || !contentDraft.gradeLevel) {
      setCurriculumTopics([]);
      return;
    }

    setCurriculumTopicsLoading(true);
    getCurriculumTopics(token, {
      subjectId: contentDraft.subjectId,
      gradeLevel: contentDraft.gradeLevel,
    })
      .then((topics) => {
        setCurriculumTopics(topics);
      })
      .catch(() => {
        setCurriculumTopics([]);
      })
      .finally(() => {
        setCurriculumTopicsLoading(false);
      });
  }, [token, contentDraft.subjectId, contentDraft.gradeLevel]);

  // Sınıf seviyesi değiştiğinde o sınıfa ait dersleri getir
  useEffect(() => {
    if (!token || !contentDraft.gradeLevel) {
      setCurriculumSubjects([]);
      return;
    }

    setCurriculumSubjectsLoading(true);
    getCurriculumSubjects(token, contentDraft.gradeLevel)
      .then((subjects) => {
        setCurriculumSubjects(subjects);
        // Eğer seçili ders listede yoksa ilkini seç veya boşalt
        if (subjects.length > 0) {
           // Mevcut seçim listede var mı?
           const exists = subjects.some(s => s.id === contentDraft.subjectId);
           if (!exists) {
             setContentDraft(prev => ({ ...prev, subjectId: subjects[0].id }));
           }
        } else {
           setContentDraft(prev => ({ ...prev, subjectId: '' }));
        }
      })
      .catch(() => {
        setCurriculumSubjects([]);
      })
      .finally(() => {
        setCurriculumSubjectsLoading(false);
      });
  }, [token, contentDraft.gradeLevel]);

  const handleCreateAnnouncement = async () => {
    if (!token || announcementCreating) return;
    const { gradeLevel, title, message } = announcementDraft;
    const titleTrim = title.trim();
    const messageTrim = message.trim();
    if (!gradeLevel) {
      setAnnouncementError('Lütfen sınıf seçin.');
      return;
    }
    if (!titleTrim || !messageTrim) {
      setAnnouncementError('Lütfen duyuru başlığı ve mesajı girin.');
      return;
    }
    setAnnouncementCreating(true);
    setAnnouncementError(null);
    try {
      const created = await createTeacherAnnouncement(token, {
        title: titleTrim,
        message: messageTrim,
        scheduledDate: announcementDraft.scheduledDate || undefined,
      });
      setAnnouncements((prev) => [created, ...prev]);
      setAnnouncementDraft({ gradeLevel: '', studentId: '', title: '', message: '', scheduledDate: '' });
      setAnnouncementOpen(false);
    } catch (error) {
      setAnnouncementError(error instanceof Error ? error.message : 'Duyuru kaydedilemedi.');
    } finally {
      setAnnouncementCreating(false);
    }
  };

  const handleStartLiveMeeting = async (meetingId: string) => {
    if (!token) return;
    try {
      const session = await startTeacherLiveMeeting(token, meetingId);
      if (session.mode === 'external' && session.meetingUrl) {
        window.open(session.meetingUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      if (session.mode === 'internal' && session.url && session.token) {
        const title = meetings.find((m) => m.id === meetingId)?.title;
        setLiveClass({
          url: session.url,
          token: session.token,
          title,
          meetingId,
        });
      }
    } catch (error) {
      // eslint-disable-next-line no-alert
      alert(
        error instanceof Error
          ? `Canlı ders başlatılamadı: ${error.message}`
          : 'Canlı ders başlatılamadı.',
      );
    }
  };

  // Koçluk panelinden gelen özel event ile canlı koçluk başlatma
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ meetingId: string; title?: string }>;
      const { meetingId, title } = custom.detail;
      handleStartLiveMeeting(meetingId);
      if (title) {
        setLiveClass((prev) =>
          prev ? { ...prev, title } : prev,
        );
      }
    };
    window.addEventListener('teacher-start-live-meeting', handler as EventListener);
    return () => {
      window.removeEventListener('teacher-start-live-meeting', handler as EventListener);
    };
  }, [handleStartLiveMeeting]);

  const _handleAiSend = async () => {
    if (!token || aiLoading) return;
    const trimmed = aiInput.trim();
    if (!trimmed) return;

    const userMessage: AiMessage = {
      id: `ai-user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const historyPayload = [...aiMessages, userMessage].map((item) => ({
      role: item.role,
      content: item.content,
    }));

    setAiMessages((prev) => [...prev, userMessage]);
    setAiInput('');
    setAiError(null);

    try {
      setAiLoading(true);
      const response = await sendTeacherAiMessage(token, {
        message: trimmed,
        history: historyPayload,
        format: aiFormat === 'text' ? undefined : aiFormat,
      });
      const assistantMessage: AiMessage = {
        id: `ai-assistant-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        createdAt: new Date().toISOString(),
        attachment: response.attachment,
      };
      setAiMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Yanıt alınamadı. Lütfen tekrar deneyin.';
      setAiError(message);
    } finally {
      setAiLoading(false);
    }
  };

  const _handleDownloadAttachment = (attachment: NonNullable<AiMessage['attachment']>) => {
    try {
      const byteCharacters = atob(attachment.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i += 1) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: attachment.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[TeacherDashboard] attachment download failed', err);
      setAiError('Dosya indirilirken hata oluştu.');
    }
  };
  void _handleAiSend;
  void _handleDownloadAttachment;

  const derslerSubItems: SidebarSubItem[] = useMemo(
    () => [
      { id: 'content', label: 'Ders İçeriği', icon: <BookOpen size={18} />, description: 'Kaynaklar', active: activeTab === 'content', onClick: () => setActiveTab('content') },
      { id: 'schedule', label: 'Ders Programı', icon: <CalendarCheck size={18} />, description: 'Program oluştur', active: activeTab === 'schedule', onClick: () => setActiveTab('schedule') },
      { id: 'live', label: 'Canlı Ders', icon: <Video size={18} />, description: 'Ders yayınları', active: activeTab === 'live', onClick: () => setActiveTab('live') },
      { id: 'tests', label: 'Test & Sorular', icon: <ClipboardList size={18} />, description: 'Test ve soru yönetimi', active: activeTab === 'tests', onClick: () => setActiveTab('tests') },
      { id: 'support', label: 'Yardım Talepleri', icon: <MessageCircle size={18} />, description: 'Soru çöz', active: activeTab === 'support', onClick: () => setActiveTab('support') },
    ],
    [activeTab],
  );

  const sidebarItems = useMemo<SidebarItem[]>(
    () => [
      {
        id: 'overview',
        label: 'Genel Bakış',
        icon: <TrendingUp size={18} />,
        description: 'Özet',
        active: activeTab === 'overview',
        onClick: () => setActiveTab('overview'),
      },
      {
        id: 'dersler',
        label: 'Dersler',
        icon: <Book size={18} />,
        description: 'Ders kaynakları',
        active: derslerSubItems.some((s) => s.active),
        children: derslerSubItems,
      },
      {
        id: 'coaching',
        label: 'Kişisel Takip',
        icon: <TrendingUp size={18} />,
        description: 'Kişisel gelişim',
        active: activeTab === 'coaching',
        onClick: () => setActiveTab('coaching'),
      },
      {
        id: 'calendar',
        label: 'Takvim & Etüt',
        icon: <CalendarCheck size={18} />,
        description: 'Program',
        active: activeTab === 'calendar',
        onClick: () => setActiveTab('calendar'),
      },
      {
        id: 'students',
        label: 'Öğrenciler',
        icon: <Users size={18} />,
        description: 'Analiz',
        active: activeTab === 'students',
        onClick: () => setActiveTab('students'),
      },
      {
        id: 'parents',
        label: 'Veli İşlemleri',
        icon: <Users size={18} />,
        description: 'Veli not & mesaj',
        active: activeTab === 'parents',
        onClick: () => setActiveTab('parents'),
      },

    ],
    [activeTab, derslerSubItems],
  );

  const teacherBreadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const tabLabels: Record<string, string> = {
      overview: 'Genel Bakış',
      content: 'Ders İçeriği',
      schedule: 'Ders Programı',
      live: 'Canlı Ders',
      tests: 'Test & Sorular',
      support: 'Yardım Talepleri',
      notifications: 'Bildirimler',
      calendar: 'Takvim & Etüt',
      students: 'Öğrenciler',
      parents: 'Veli İşlemleri',
      coaching: 'Kişisel Takip',
    };
    const items: BreadcrumbItem[] = [
      { label: 'Ana Sayfa', onClick: activeTab !== 'overview' ? () => setActiveTab('overview') : undefined },
    ];
    if (tabLabels[activeTab]) items.push({ label: tabLabels[activeTab] });
    return items;
  }, [activeTab]);

  return (
    <DashboardLayout
      accent="slate"
      brand="SKY"
      brandSuffix="ANALİZ"
      tagline={user?.name ?? 'Öğretmen'}
      title="Öğretmen Yönetim Paneli"
      subtitle="Gerçek zamanlı içerik, takvim ve öğrenci verileri."
      breadcrumbs={teacherBreadcrumbs}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'ÖĞ',
        name: user?.name ?? 'Öğretmen',
        subtitle: 'Öğretmen',
      }}
      onLogout={logout}
    >
      {activeTab === 'notifications' && (
        <GlassCard
          title="Bildirimler"
          subtitle="Mesaj ve sistem uyarıları"
          actions={
            unreadNotificationCount > 0 ? (
              <button
                type="button"
                className="ghost-btn"
                onClick={handleMarkAllNotificationsRead}
                style={{ fontSize: '0.8rem' }}
              >
                Tümünü okundu işaretle
              </button>
            ) : undefined
          }
        >
          {notificationsLoading && <div className="empty-state">Yükleniyor...</div>}
          {notificationsError && (
            <div className="error" style={{ marginBottom: '0.75rem' }}>
              {notificationsError}
            </div>
          )}
          {!notificationsLoading && notifications.length === 0 && (
            <div className="empty-state">Henüz bildirim yok.</div>
          )}

          {notifications.length > 0 && (
            <div
              className="dual-grid"
              style={{ gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)' }}
            >
              <div className="list-stack" style={{ maxHeight: 420, overflowY: 'auto' }}>
                {notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="list-row"
                    onClick={() => handleNotificationClick(n)}
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      background:
                        activeNotificationId === n.id
                          ? 'var(--color-surface-strong, rgba(248,250,252,0.98))'
                          : undefined,
                      borderColor:
                        !n.read && activeNotificationId === n.id
                          ? 'rgba(37,99,235,0.65)'
                          : undefined,
                    }}
                  >
                    <div>
                      <strong>{n.title}</strong>
                      <small style={{ display: 'block', marginTop: '0.15rem' }}>{n.body}</small>
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-text-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {new Date(n.createdAt).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: 'short',
                      })}
                      {!n.read && ' • Yeni'}
                    </span>
                  </button>
                ))}
              </div>

              <div className="card" style={{ margin: 0 }}>
                <h3>Detaylı Bildirim</h3>
                {(() => {
                  const current =
                    notifications.find((n) => n.id === activeNotificationId) ??
                    notifications[0] ??
                    null;
                  if (!current) {
                    return (
                      <div style={{ color: 'var(--color-text-muted)' }}>
                        Soldan bir bildirim seçin.
                      </div>
                    );
                  }

                  const relatedMessage =
                    current.relatedEntityType === 'message' && current.relatedEntityId
                      ? studentMessages.find((m) => m.id === current.relatedEntityId)
                      : null;

                  const isCallRequest =
                    current.type === 'message_received' &&
                    current.body.toLowerCase().includes('canlı görüşme talep ediyor');

                  return (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700 }}>{current.title}</div>
                        <div
                          style={{
                            fontSize: '0.85rem',
                            color: 'var(--color-text-muted)',
                            marginTop: '0.25rem',
                          }}
                        >
                          Tür: {current.type}
                          {' · '}
                          {new Date(current.createdAt).toLocaleString('tr-TR')}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '0.75rem 0.85rem',
                          borderRadius: 10,
                          border: '1px solid var(--color-border-subtle)',
                          background: 'var(--color-surface-soft)',
                          whiteSpace: 'pre-wrap',
                          fontSize: '0.9rem',
                        }}
                      >
                        {current.body}
                      </div>

                      {relatedMessage && (
                        <div
                          style={{
                            padding: '0.75rem 0.85rem',
                            borderRadius: 10,
                            border: '1px solid var(--color-border-subtle)',
                            background: 'var(--color-surface)',
                            fontSize: '0.85rem',
                          }}
                        >
                          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                            Mesaj Detayı
                          </div>
                          <div>
                            {relatedMessage.fromUserName ?? relatedMessage.fromUserId} →{' '}
                            {relatedMessage.toUserName ?? relatedMessage.toUserId}
                          </div>
                          {relatedMessage.subject && (
                            <div style={{ marginTop: '0.15rem' }}>
                              Konu: {relatedMessage.subject}
                            </div>
                          )}
                          <div style={{ marginTop: '0.35rem' }}>{relatedMessage.text}</div>
                        </div>
                      )}

                      {current.type === 'help_request_created' &&
                        current.relatedEntityType === 'help_request' &&
                        current.relatedEntityId && (
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => {
                            setFocusHelpRequestId(current.relatedEntityId!);
                            setActiveTab('support');
                          }}
                          style={{ alignSelf: 'flex-start' }}
                        >
                          Soruyu gör ve çöz
                        </button>
                      )}

                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5rem',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--color-text-muted)',
                            marginRight: '0.25rem',
                          }}
                        >
                          Durum: {current.read ? 'Okundu' : 'Yeni'}
                        </span>
                        {!current.read && (
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => handleMarkNotificationRead(current.id).catch(() => {})}
                          >
                            Okundu
                          </button>
                        )}
                        <button
                          type="button"
                          className="ghost-btn"
                          onClick={() => handleDeleteNotification(current.id).catch(() => {})}
                        >
                          Sil
                        </button>
                      </div>

                      {isCallRequest && relatedMessage && (
                        <div
                          style={{
                            display: 'flex',
                            gap: '0.5rem',
                            justifyContent: 'flex-end',
                            marginTop: '0.25rem',
                          }}
                        >
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={async () => {
                              if (!token) return;
                              try {
                                await sendTeacherMessage(token, {
                                  toUserId: relatedMessage.fromUserId,
                                  text:
                                    'Canlı görüşme talebinizi aldım. Kısa süre içinde sizinle görüşme planlayacağım.',
                                  studentId: relatedMessage.studentId,
                                  subject: 'Canlı görüşme talebi – Kabul',
                                });
                                await handleMarkNotificationRead(current.id);
                                // eslint-disable-next-line no-alert
                                alert('Görüşme talebi kabul edildi ve veliye bilgi verildi.');
                              } catch (e) {
                                // eslint-disable-next-line no-alert
                                alert(
                                  e instanceof Error
                                    ? e.message
                                    : 'Talep yanıtı gönderilemedi.',
                                );
                              }
                            }}
                          >
                            Görüşmeyi Kabul Et
                          </button>
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={async () => {
                              if (!token) return;
                              try {
                                await sendTeacherMessage(token, {
                                  toUserId: relatedMessage.fromUserId,
                                  text:
                                    'Canlı görüşme talebinizi şu an için gerçekleştiremiyorum. Mesaj üzerinden iletişim kurabiliriz.',
                                  studentId: relatedMessage.studentId,
                                  subject: 'Canlı görüşme talebi – Reddedildi',
                                });
                                await handleMarkNotificationRead(current.id);
                                // eslint-disable-next-line no-alert
                                alert('Görüşme talebi reddedildi ve veliye bilgi verildi.');
                              } catch (e) {
                                // eslint-disable-next-line no-alert
                                alert(
                                  e instanceof Error
                                    ? e.message
                                    : 'Talep yanıtı gönderilemedi.',
                                );
                              }
                            }}
                          >
                            Görüşmeyi Reddet
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </GlassCard>
      )}
      {activeTab === 'overview' && (
        <TeacherOverview
          metrics={metrics}
          onNavigate={(tab) => setActiveTab(tab)}
        />
      )}
      {activeTab === 'content' && (
        <TeacherContent
          contents={contents}
          draft={contentDraft}
          onDraftChange={setContentDraft}
          onCreateContent={handleCreateContent}
          onSelectVideoFile={setContentVideoFile}
          selectedVideoFileName={contentVideoFile?.name}
          uploadingVideo={contentUploading}
          curriculumTopics={curriculumTopics}
          loadingCurriculumTopics={curriculumTopicsLoading}
          curriculumSubjects={curriculumSubjects}
          loadingCurriculumSubjects={curriculumSubjectsLoading}
          allowedGrades={teacherAssignedGrades}
          allowedSubjectNames={teacherSubjects}
        />
      )}
      {activeTab === 'live' && (
        <GlassCard
          title="Canlı Dersler"
          subtitle="Öğrencilerle anlık canlı yayın oturumlarını buradan başlatın ve yönetin."
          actions={
            <button
              type="button"
              className="primary-btn"
              onClick={() => openMeetingModal()}
            >
              Yeni Canlı Ders Planla
            </button>
          }
        >
          <div className="list-stack">
            {meetings.length === 0 && (
              <div className="empty-state">Planlanmış canlı ders bulunmuyor.</div>
            )}
            {meetings.map((meeting) => (
              <div key={meeting.id} className="list-row">
                <div>
                  <strong>{meeting.title}</strong>
                  <small>
                    {formatShortDate(meeting.scheduledAt)} · {formatTime(meeting.scheduledAt)}
                  </small>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.4rem',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                  }}
                >
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => handleStartLiveMeeting(meeting.id)}
                    disabled={!canTeacherStartMeeting(meeting.scheduledAt)}
                    title={
                      !canTeacherStartMeeting(meeting.scheduledAt)
                        ? 'Seans başlatma süresi geçti. Yeni seans oluşturun.'
                        : undefined
                    }
                  >
                    Canlı Dersi Başlat
                  </button>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => handleEditMeeting(meeting.id)}
                  >
                    Düzenle
                  </button>
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={() => handleDeleteMeeting(meeting.id)}
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
      {activeTab === 'calendar' && (
        <TeacherCalendar
          events={calendarState.data ?? []}
          students={students}
          onCreateMeeting={openMeetingModal}
          onEditMeeting={handleEditMeeting}
          onDeleteMeeting={handleDeleteMeeting}
          onEditAssignment={(assignmentId, event) => {
            setAssignmentEditId(assignmentId);
            setAssignmentEditDraft({
              title: event.title ?? '',
              description: event.description ?? '',
              dueDate: event.startDate ? new Date(event.startDate).toISOString().slice(0, 16) : '',
            });
            setAssignmentEditError(null);
            setAssignmentEditOpen(true);
          }}
          announcements={announcements}
          announcementDraft={announcementDraft}
          onAnnouncementDraftChange={setAnnouncementDraft}
          onCreateAnnouncement={handleCreateAnnouncement}
          announcementOpen={announcementOpen}
          onToggleAnnouncement={setAnnouncementOpen}
          creatingAnnouncement={announcementCreating}
          announcementError={announcementError}
        />
      )}
      {activeTab === 'tests' && (
        <TeacherTests
          aiTestCardRef={aiTestCardRef}
          token={token}
          students={students}
          tests={tests}
          testAssets={testAssets}
          allowedGrades={teacherAssignedGrades}
          allowedSubjectNames={teacherSubjects}
          onTestsChanged={() => {
            if (!token) return;
            getTeacherTests(token).then(setTests).catch(() => {});
          }}
          onTestAssetsChanged={() => {
            if (!token) return;
            getTeacherTestAssets(token).then(setTestAssets).catch(() => {});
          }}
          onAssignmentCreated={() => {
            if (!token) return;
            assignmentsState.run(() => getTeacherAssignments(token)).catch(() => {});
          }}
        />
      )}
      {activeTab === 'schedule' && (
        <LessonScheduleTab
          token={token}
          students={students}
          allowedGrades={teacherAssignedGrades}
        />
      )}
      {activeTab === 'support' && (
        <TeacherSupport
          token={token}
          focusHelpRequestId={focusHelpRequestId}
          onFocusHandled={() => setFocusHelpRequestId(null)}
        />
      )}
      {activeTab === 'coaching' && (
        <CoachingTab
          token={token}
          students={students}
          selectedStudentId={selectedStudentId}
          onSelectStudent={setSelectedStudentId}
          studentProfile={selectedStudentProfile}
          profileLoading={studentProfileLoading}
          tests={tests}
        />
      )}
      {activeTab === 'parents' && (
        <ParentOperationsTab
          token={token}
          students={students}
          allowedGrades={teacherAssignedGrades}
        />
      )}
      {activeTab === 'students' && (
        <TeacherStudents
          token={token}
          students={students}
          studentsLoading={studentsLoading}
          selectedStudentId={selectedStudentId}
          onSelectStudent={setSelectedStudentId}
          messages={studentMessages}
          studentProfile={selectedStudentProfile}
          profileLoading={studentProfileLoading}
          onMarkMessageRead={handleMarkMessageRead}
        />
      )}

      <TeacherMeetingModal
        open={meetingModalOpen}
        onClose={() => {
          setMeetingModalOpen(false);
          setEditingMeetingId(null);
          setMeetingDraft({
            title: '',
            description: '',
            scheduledAt: '',
            durationMinutes: 40,
            type: 'class',
            audience: 'all',
            selectedStudentIds: [],
            targetGrade: '',
            subjectName: '',
          });
        }}
        draft={meetingDraft}
        onDraftChange={setMeetingDraft}
        onSubmit={handleSaveMeeting}
        saving={meetingSaving}
        error={meetingError}
        students={students}
        allowedGrades={teacherAssignedGrades}
        teacherSubjects={teacherSubjects}
      />
      {assignmentEditOpen && assignmentEditId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15,23,42,0.6)',
            padding: '1rem',
          }}
          onClick={() => {
            if (!assignmentEditSaving) {
              setAssignmentEditOpen(false);
              setAssignmentEditId(null);
              setAssignmentEditError(null);
            }
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-surface)',
              borderRadius: 16,
              padding: '1.5rem',
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <h3 style={{ margin: '0 0 1rem', fontSize: '1.1rem' }}>Görevi Düzenle</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                Başlık
                <input
                  type="text"
                  value={assignmentEditDraft.title}
                  onChange={(e) => setAssignmentEditDraft((p) => ({ ...p, title: e.target.value }))}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '0.35rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    fontSize: '0.95rem',
                  }}
                />
              </label>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                Açıklama (isteğe bağlı)
                <textarea
                  value={assignmentEditDraft.description}
                  onChange={(e) => setAssignmentEditDraft((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '0.35rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    fontSize: '0.95rem',
                    resize: 'vertical',
                  }}
                />
              </label>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                Son teslim tarihi ve saati
                <input
                  type="datetime-local"
                  value={assignmentEditDraft.dueDate}
                  onChange={(e) => setAssignmentEditDraft((p) => ({ ...p, dueDate: e.target.value }))}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '0.35rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    fontSize: '0.95rem',
                  }}
                />
              </label>
            </div>
            {assignmentEditError && (
              <div style={{ marginTop: '0.75rem', color: '#f97316', fontSize: '0.85rem' }}>{assignmentEditError}</div>
            )}
            <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setAssignmentEditOpen(false);
                  setAssignmentEditId(null);
                  setAssignmentEditError(null);
                }}
                disabled={assignmentEditSaving}
              >
                İptal
              </button>
              <button
                type="button"
                className="primary-btn"
                disabled={assignmentEditSaving || !assignmentEditDraft.title.trim() || !assignmentEditDraft.dueDate}
                onClick={async () => {
                  if (!token || !assignmentEditId) return;
                  setAssignmentEditSaving(true);
                  setAssignmentEditError(null);
                  try {
                    await updateTeacherAssignment(token, assignmentEditId, {
                      title: assignmentEditDraft.title.trim(),
                      description: assignmentEditDraft.description.trim() || undefined,
                      dueDate: new Date(assignmentEditDraft.dueDate).toISOString(),
                    });
                    setAssignmentEditOpen(false);
                    setAssignmentEditId(null);
                    const { start, end } = getWeekRange();
                    calendarState
                      .run(async () => {
                        const payload = await getTeacherCalendar(token, start.toISOString(), end.toISOString());
                        return payload.events;
                      })
                      .catch(() => {});
                  } catch (e) {
                    setAssignmentEditError(e instanceof Error ? e.message : 'Güncellenemedi.');
                  } finally {
                    setAssignmentEditSaving(false);
                  }
                }}
              >
                {assignmentEditSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
      {liveClass && (
        <LiveClassOverlay
          url={liveClass.url}
          token={liveClass.token}
          title={liveClass.title}
          role="teacher"
          meetingId={liveClass.meetingId}
          authToken={token ?? undefined}
          onClose={() => setLiveClass(null)}
        />
      )}
    </DashboardLayout>
  );
};

const TeacherSupport: React.FC<{
  token: string | null;
  focusHelpRequestId?: string | null;
  onFocusHandled?: () => void;
}> = ({ token, focusHelpRequestId, onFocusHandled }) => {
  const [items, setItems] = useState<TeacherHelpRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [mode, setMode] = useState<'audio_only' | 'audio_video'>('audio_only');
  const [useScreenShare, setUseScreenShare] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [pdfPageImage, setPdfPageImage] = useState<string | null>(null);
  const solutionRecordRef = useRef<HTMLDivElement>(null);

  const refresh = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getTeacherHelpRequests(token);
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yardım talepleri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh().catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!focusHelpRequestId || !onFocusHandled) return;
    if (items.some((x) => x.id === focusHelpRequestId)) {
      setActiveRequestId(focusHelpRequestId);
      setMode('audio_only');
      setUseScreenShare(false);
      clearRecording();
      onFocusHandled();
    }
  }, [focusHelpRequestId, items, onFocusHandled]);

  useEffect(() => {
    if (activeRequestId) {
      setTimeout(() => {
        solutionRecordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [activeRequestId]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // ignore
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (liveVideoRef.current) {
        // eslint-disable-next-line no-param-reassign
        liveVideoRef.current.srcObject = null;
      }
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const activeRequestForEffect = activeRequestId ? items.find((x) => x.id === activeRequestId) ?? null : null;
  const pdfFileUrl = activeRequestForEffect?.testAssetFileUrl;
  const pdfPageMatch = activeRequestForEffect?.questionId?.match(/^pdf-page-(\d+)$/);
  const pdfPageNum = pdfPageMatch ? parseInt(pdfPageMatch[1], 10) : 0;

  useEffect(() => {
    if (!pdfFileUrl || !pdfPageNum) {
      setPdfPageImage(null);
      return;
    }
    let cancelled = false;
    setPdfPageImage(null);
    (async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ url: pdfFileUrl, withCredentials: false });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;
        const page = await pdfDoc.getPage(pdfPageNum);
        const scale = 3;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx || cancelled) return;
        canvas.width = Math.min(viewport.width, 1000);
        canvas.height = (viewport.height * canvas.width) / viewport.width;
        const scaledViewport = page.getViewport({ scale: (scale * canvas.width) / viewport.width });
        await page.render({
          canvasContext: ctx,
          viewport: scaledViewport,
          intent: 'display',
          background: 'rgb(255,255,255)',
          canvas,
        }).promise;
        if (cancelled) return;
        setPdfPageImage(canvas.toDataURL('image/png'));
      } catch {
        if (!cancelled) setPdfPageImage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfFileUrl, pdfPageNum]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (liveVideoRef.current) {
      // eslint-disable-next-line no-param-reassign
      liveVideoRef.current.srcObject = null;
    }
  };

  const startRecording = async () => {
    if (recording) return;
    if (!activeRequestId) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Tarayıcı medya kaydını desteklemiyor.');
      return;
    }
    setError(null);
    setRecordedBlob(null);
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    chunksRef.current = [];
    stopStream();

    let stream: MediaStream;
    if (mode === 'audio_video' && useScreenShare) {
      try {
        let displayStream: MediaStream | null = null;

        if ((navigator.mediaDevices as any)?.getDisplayMedia) {
          displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: true,
          });
        } else if ((navigator as any).getDisplayMedia) {
          displayStream = await (navigator as any).getDisplayMedia({ video: true });
        }

        if (!displayStream) {
          setError('Tarayıcı ekran paylaşımını desteklemiyor.');
          return;
        }
        let audioStream: MediaStream | null = null;
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch {
          // Mikrofon alınamazsa sadece ekran paylaşımıyla devam et.
        }
        const tracks = [
          ...displayStream.getVideoTracks(),
          ...(audioStream ? audioStream.getAudioTracks() : []),
        ];
        stream = new MediaStream(tracks);
      } catch (e) {
        setError(
          e instanceof Error
            ? `Ekran paylaşımı başlatılamadı: ${e.message}`
            : 'Ekran paylaşımı başlatılamadı.',
        );
        return;
      }
    } else {
      const constraints: MediaStreamConstraints =
        mode === 'audio_video' ? { audio: true, video: true } : { audio: true, video: false };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    }

    streamRef.current = stream;

    if (liveVideoRef.current) {
      // eslint-disable-next-line no-param-reassign
      liveVideoRef.current.srcObject = stream;
      liveVideoRef.current
        .play()
        .catch(() => {
          // autoplay engellenirse sessizce geç
        });
    }

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (evt) => {
      if (evt.data && evt.data.size > 0) chunksRef.current.push(evt.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || (mode === 'audio_video' ? 'video/webm' : 'audio/webm'),
      });
      setRecordedBlob(blob);
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      stopStream();
      chunksRef.current = [];
    };
    recorder.start();
    setRecording(true);
    setPaused(false);
  };

  const stopRecording = () => {
    if (!recording) return;
    setRecording(false);
    setPaused(false);
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      stopStream();
    }
  };

  const clearRecording = () => {
    setRecordedBlob(null);
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
  };

  const pauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== 'recording') return;
    try {
      recorder.pause();
      setPaused(true);
    } catch {
      // ignore
    }
  };

  const resumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== 'paused') return;
    try {
      recorder.resume();
      setPaused(false);
    } catch {
      // ignore
    }
  };

  const sendRecording = async () => {
    if (!token || !activeRequestId || !recordedBlob) return;
    setSending(true);
    setError(null);
    try {
      const file = new File([recordedBlob], `solution-${activeRequestId}.webm`, {
        type: recordedBlob.type || (mode === 'audio_video' ? 'video/webm' : 'audio/webm'),
      });
      await respondTeacherHelpRequest(token, activeRequestId, { mode, file });
      clearRecording();
      setActiveRequestId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderilemedi.');
    } finally {
      setSending(false);
    }
  };

  const activeRequest = items.find((x) => x.id === activeRequestId) ?? null;

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <GlassCard
        title="Yardım Talepleri"
        subtitle="Öğrencilerin “Öğretmene sor” istekleri"
        actions={
          <button type="button" className="ghost-btn" onClick={() => refresh().catch(() => {})}>
            Yenile
          </button>
        }
      >
        {loading && <div className="empty-state">Yükleniyor...</div>}
        {error && <div style={{ color: '#fb7185', fontSize: '0.9rem' }}>{error}</div>}
        {!loading && items.length === 0 && <div className="empty-state">Henüz talep yok.</div>}
        <div className="list-stack">
          {items.map((r) => (
            <div key={r.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block' }}>
                  {r.studentName} · {r.assignmentTitle || 'Genel Soru'}
                </strong>
                <small style={{ display: 'block', marginTop: '0.15rem' }}>
                  {r.questionNumber ? `${r.questionNumber}. soru` : 'Soru Havuzu'} {r.message ? `— ${r.message}` : ''}
                </small>
                {(r.correctAnswer != null || r.studentAnswer != null) && (
                  <small style={{ display: 'block', marginTop: '0.2rem', opacity: 0.9 }}>
                    Doğru cevap: <strong>{r.correctAnswer ?? '-'}</strong>
                    {' · '}
                    Öğrenci cevabı: <strong>{r.studentAnswer || 'boş'}</strong>
                  </small>
                )}
                <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.75 }}>
                  {new Date(r.createdAt).toLocaleString('tr-TR')}
                </small>
                {r.response && (
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#34d399' }}>
                    Çözüm gönderildi
                    {(r.response as any).playedAt && ' · Öğrenci oynattı'}
                  </small>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setActiveRequestId(r.id);
                    setMode('audio_only');
                    setUseScreenShare(false);
                    clearRecording();
                  }}
                >
                  Çözümü başlat
                </button>
                {r.response && (
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={async () => {
                      if (!token) return;
                      // eslint-disable-next-line no-alert
                      const confirmed = window.confirm(
                        'Bu soruya gönderdiğiniz çözümü geri almak/silmek istediğinize emin misiniz? Öğrenciler artık bu çözümü göremeyecek.',
                      );
                      if (!confirmed) return;
                      try {
                        await deleteTeacherHelpResponse(token, r.id);
                        if (activeRequestId === r.id) {
                          clearRecording();
                          setActiveRequestId(null);
                        }
                        await refresh();
                      } catch (e) {
                        // eslint-disable-next-line no-alert
                        alert(
                          e instanceof Error
                            ? e.message
                            : 'Çözüm silinirken bir hata oluştu.',
                        );
                      }
                    }}
                  >
                    Çözümü geri al
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {activeRequest && (
        <div ref={solutionRecordRef}>
        <GlassCard
          title="Çözüm Kaydı"
          subtitle={`${activeRequest.studentName} · ${activeRequest.assignmentTitle} · ${activeRequest.questionNumber ?? '-'}. soru${(activeRequest.correctAnswer != null || activeRequest.studentAnswer != null) ? ` · Doğru: ${activeRequest.correctAnswer ?? '-'} · Öğrenci: ${activeRequest.studentAnswer ?? 'boş'}` : ''}`}
        >
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {(pdfPageImage || activeRequest.questionText || activeRequest.imageUrl) && (
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
                  Soru önizlemesi
                </div>
                {activeRequest.imageUrl ? (
                  <img
                    src={resolveContentUrl(activeRequest.imageUrl)}
                    alt="Öğrenci fotoğrafı"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 520,
                      objectFit: 'contain',
                      borderRadius: 16,
                      border: '2px solid rgba(99,102,241,0.2)',
                      background: '#020617',
                      boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
                    }}
                  />
                ) : pdfPageImage ? (
                  <img
                    src={pdfPageImage}
                    alt={`Soru ${activeRequest.questionNumber ?? ''}`}
                    style={{
                      maxWidth: '100%',
                      maxHeight: 480,
                      objectFit: 'contain',
                      borderRadius: 12,
                      border: '1px solid rgba(71,85,105,0.6)',
                      background: '#fff',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      padding: '1rem',
                      borderRadius: 12,
                      border: '1px solid rgba(71,85,105,0.6)',
                      background: 'var(--color-surface-soft, rgba(248,250,252,0.5))',
                      whiteSpace: 'pre-wrap',
                      fontSize: '0.95rem',
                      lineHeight: 1.6,
                    }}
                  >
                    {activeRequest.questionText}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={mode === 'audio_only' ? 'primary-btn' : 'ghost-btn'}
                onClick={() => {
                  setMode('audio_only');
                  setUseScreenShare(false);
                  clearRecording();
                }}
              >
                Sadece ses
              </button>
              <button
                type="button"
                className={mode === 'audio_video' ? 'primary-btn' : 'ghost-btn'}
                onClick={() => {
                  setMode('audio_video');
                  clearRecording();
                }}
              >
                Ses + video
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {!recording && (
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => startRecording().catch(() => {})}
                >
                  Kaydı başlat
                </button>
              )}
              {recording && (
                <>
                  <button type="button" className="primary-btn" onClick={stopRecording}>
                    Durdur
                  </button>
                  {!paused && (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={pauseRecording}
                    >
                      Duraklat
                    </button>
                  )}
                  {paused && (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={resumeRecording}
                    >
                      Devam et
                    </button>
                  )}
                </>
              )}
              <button type="button" className="ghost-btn" onClick={clearRecording} disabled={!recordedBlob || recording}>
                Sil
              </button>
              <button type="button" className="ghost-btn" onClick={() => startRecording().catch(() => {})} disabled={recording}>
                Tekrar kaydet
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setUseScreenShare((prev) => !prev)}
                disabled={recording}
                style={
                  useScreenShare
                    ? {
                        background: 'rgba(37,99,235,0.12)',
                        borderColor: 'rgba(37,99,235,0.6)',
                      }
                    : undefined
                }
              >
                {useScreenShare ? 'Ekran paylaş: Açık' : 'Ekran paylaş: Kapalı'}
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => sendRecording().catch(() => {})}
                disabled={!recordedBlob || sending || recording}
              >
                {sending ? 'Gönderiliyor...' : 'Gönder'}
              </button>
            </div>

            <div style={{ opacity: 0.85 }}>
              Mod: <strong>{mode === 'audio_only' ? 'Sadece ses' : 'Ses + video'}</strong>
            </div>

            {mode === 'audio_video' && (
              <div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--color-text-muted)',
                    marginBottom: '0.25rem',
                  }}
                >
                  Canlı önizleme
                </div>
                <video
                  ref={liveVideoRef}
                  muted
                  autoPlay
                  playsInline
                  style={{ width: '100%', borderRadius: 12, backgroundColor: '#000' }}
                />
              </div>
            )}

            {recordedUrl && (
              <div>
                {mode === 'audio_only' ? (
                  <audio controls style={{ width: '100%' }} src={recordedUrl} />
                ) : (
                  <video controls style={{ width: '100%', borderRadius: 12 }} src={recordedUrl} />
                )}
              </div>
            )}
          </div>
        </GlassCard>
        </div>
      )}
    </div>
  );
};

const TeacherTests: React.FC<{
  aiTestCardRef: React.MutableRefObject<HTMLDivElement | null>;
  token: string | null;
  students: TeacherStudent[];
  tests: TeacherTest[];
  testAssets: TeacherTestAsset[];
  allowedGrades?: string[];
  allowedSubjectNames?: string[];
  onTestsChanged: () => void;
  onTestAssetsChanged: () => void;
  onAssignmentCreated: () => void;
}> = ({ aiTestCardRef, token, students, tests, testAssets, allowedGrades = [], allowedSubjectNames = [], onTestsChanged: _onTestsChanged, onTestAssetsChanged, onAssignmentCreated }) => {
  // Yapılandırılmış test oluşturma UI'ı geçici olarak devre dışı (sadece dosya tabanlı testler kullanılıyor)

  const [assetDraft, setAssetDraft] = useState({
    title: '',
    subjectId: 'sub1',
    topic: '',
    gradeLevel: '9',
  });
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetUploading, setAssetUploading] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [isAssetDragOver, setIsAssetDragOver] = useState(false);
  const assetInputRef = useRef<HTMLInputElement | null>(null);

  const [assignDraft, setAssignDraft] = useState<{
    studentId: string;
    dueDate: string;
    points: number;
    timeLimitMinutes: number;
    mode: 'structured' | 'file';
    testId: string;
    testAssetId: string;
  }>({
    studentId: students[0]?.id ?? '',
    dueDate: '',
    points: 100,
    timeLimitMinutes: 15,
    mode: 'structured',
    testId: tests[0]?.id ?? '',
    testAssetId: testAssets[0]?.id ?? '',
  });
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const [_assignFileId, _setAssignFileId] = useState<string>('');
  const [aiGenSubject, setAiGenSubject] = useState('sub_matematik');
  const [aiGenTopic, setAiGenTopic] = useState('');
  const [aiGenGrade, setAiGenGrade] = useState('9');
  const [aiGenCount, setAiGenCount] = useState(5);
  const [aiGenDifficulty, setAiGenDifficulty] = useState('orta');
  const [aiGenQuestionType, setAiGenQuestionType] = useState<'multiple_choice' | 'true_false' | 'open_ended'>('multiple_choice');
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [aiGenResult, setAiGenResult] = useState<string | null>(null);

  // AI için Müfredat Konuları
  const [aiCurriculumTopics, setAiCurriculumTopics] = useState<CurriculumTopic[]>([]);
  const [aiCurriculumTopicsLoading, setAiCurriculumTopicsLoading] = useState(false);

  // AI için Dersler (Subjects)
  const [aiGenSubjects, setAiGenSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [aiGenSubjectsLoading, setAiGenSubjectsLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    if (!aiGenSubject || !aiGenGrade) {
      setAiCurriculumTopics([]);
      return;
    }
    setAiCurriculumTopicsLoading(true);
    getCurriculumTopics(token, {
      subjectId: aiGenSubject,
      gradeLevel: aiGenGrade,
    })
      .then((topics) => setAiCurriculumTopics(topics))
      .catch(() => setAiCurriculumTopics([]))
      .finally(() => setAiCurriculumTopicsLoading(false));
  }, [token, aiGenSubject, aiGenGrade]);

  // Sınıf seviyesi değiştiğinde AI için dersleri getir
  useEffect(() => {
    if (!token || !aiGenGrade) {
      setAiGenSubjects([]);
      return;
    }
    setAiGenSubjectsLoading(true);
    getCurriculumSubjects(token, aiGenGrade)
      .then((subjects) => {
        setAiGenSubjects(subjects);
        if (subjects.length > 0) {
           const exists = subjects.some(s => s.id === aiGenSubject);
           if (!exists) {
             setAiGenSubject(subjects[0].id);
           }
        }
      })
      .catch(() => setAiGenSubjects([]))
      .finally(() => setAiGenSubjectsLoading(false));
  }, [token, aiGenGrade]);

  // --- Asset Upload için Müfredat Konuları ve Dersleri ---
  const [assetCurriculumSubjects, setAssetCurriculumSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [assetCurriculumSubjectsLoading, setAssetCurriculumSubjectsLoading] = useState(false);
  const [assetCurriculumTopics, setAssetCurriculumTopics] = useState<CurriculumTopic[]>([]);
  const [assetCurriculumTopicsLoading, setAssetCurriculumTopicsLoading] = useState(false);

  // Sınıf değişince Dersleri getir (Asset)
  useEffect(() => {
    if (!token || !assetDraft.gradeLevel) {
      setAssetCurriculumSubjects([]);
      return;
    }
    setAssetCurriculumSubjectsLoading(true);
    getCurriculumSubjects(token, assetDraft.gradeLevel)
      .then((subjects) => {
        setAssetCurriculumSubjects(subjects);
        // Eğer mevcut seçili ders yeni listede yoksa ilk derse geç veya boşalt
        if (subjects.length > 0) {
           const exists = subjects.some(s => s.id === assetDraft.subjectId);
           if (!exists) {
             setAssetDraft(p => ({ ...p, subjectId: subjects[0].id }));
           }
        } else {
             setAssetDraft(p => ({ ...p, subjectId: '' }));
        }
      })
      .catch(() => setAssetCurriculumSubjects([]))
      .finally(() => setAssetCurriculumSubjectsLoading(false));
  }, [token, assetDraft.gradeLevel]);

  // Sınıf veya Ders değişince Konuları getir (Asset)
  useEffect(() => {
    if (!token || !assetDraft.subjectId || !assetDraft.gradeLevel) {
      setAssetCurriculumTopics([]);
      return;
    }
    setAssetCurriculumTopicsLoading(true);
    getCurriculumTopics(token, {
      subjectId: assetDraft.subjectId,
      gradeLevel: assetDraft.gradeLevel,
    })
      .then((topics) => setAssetCurriculumTopics(topics))
      .catch(() => setAssetCurriculumTopics([]))
      .finally(() => setAssetCurriculumTopicsLoading(false));
  }, [token, assetDraft.subjectId, assetDraft.gradeLevel]);
  const parsedAiQuestions = useMemo(
    () => parseAiGeneratedQuestions(aiGenResult),
    [aiGenResult],
  );

  // AI PDF Ayrıştırıcı durumları
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfQuestions, setPdfQuestions] = useState<ParsedPdfQuestion[]>([]);
  const [pdfSaving, setPdfSaving] = useState(false);
  const [pdfSaveMessage, setPdfSaveMessage] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

  // Collapsible kartlar için state'ler
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  
  const toggleCard = (cardId: string) => {
    setExpandedCards((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const handlePdfFileChange = (file: File | null) => {
    if (!file) {
      setPdfFile(null);
      return;
    }
    if (file.type !== 'application/pdf') {
      setPdfError('Lütfen yalnızca PDF dosyası seçin.');
      setPdfFile(null);
      return;
    }
    setPdfError(null);
    setPdfSaveMessage(null);
    setShowPdfPreview(false);
    setPdfFile(file);
  };

  const handlePdfAnalyze = async () => {
    if (!token) {
      setPdfError('Bu özelliği kullanmak için giriş yapmalısınız.');
      return;
    }
    if (!pdfFile) {
      setPdfError('Lütfen önce bir PDF dosyası seçin.');
      return;
    }

    setPdfParsing(true);
    setPdfError(null);
    setPdfSaveMessage(null);
    setShowPdfPreview(false);
    setPdfQuestions([]);

    try {
      const baseUrl = getApiBaseUrl();
      const formData = new FormData();
      formData.append('file', pdfFile);

      const response = await axios.post<{
        success: boolean;
        data?: ParsedPdfQuestion[];
        error?: string;
      }>(`${baseUrl}/api/ai/parse-pdf`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.data.success || !Array.isArray(response.data.data)) {
        setPdfError(
          response.data.error ??
            'Yapay zeka yanıtı beklenmedik formatta döndü. Lütfen tekrar deneyin.',
        );
        setPdfQuestions([]);
        return;
      }

      setPdfQuestions(response.data.data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const serverMessage =
          (err.response?.data as { error?: string } | undefined)?.error ?? err.message;
        setPdfError(serverMessage || 'PDF analiz edilirken bir hata oluştu.');
      } else {
        const message =
          err instanceof Error ? err.message : 'PDF analiz edilirken bir hata oluştu.';
        setPdfError(message);
      }
      setPdfQuestions([]);
    } finally {
      setPdfParsing(false);
    }
  };

  const handlePdfSaveAll = async () => {
    if (!token) {
      setPdfError('Bu özelliği kullanmak için giriş yapmalısınız.');
      return;
    }
    if (!aiGenSubject || !aiGenGrade) {
      setPdfError('Lütfen üstte sınıf ve ders bilgisini seçin.');
      return;
    }
    if (pdfQuestions.length === 0) {
      setPdfError('Önce bir PDF analiz ederek soru çıkarın.');
      return;
    }

    setPdfSaving(true);
    setPdfError(null);
    setPdfSaveMessage(null);

    try {
      const baseUrl = getApiBaseUrl();
      const payload = {
        subjectId: aiGenSubject,
        gradeLevel: aiGenGrade,
        questions: pdfQuestions,
      };

      const response = await axios.post<{
        success: boolean;
        saved?: number;
        error?: string;
      }>(`${baseUrl}/api/ai/save-parsed-questions`, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.data.success) {
        setPdfError(response.data.error ?? 'Sorular veritabanına kaydedilemedi.');
        return;
      }

      const savedCount = response.data.saved ?? pdfQuestions.length;
      setPdfSaveMessage(`${savedCount} soru başarıyla soru bankasına kaydedildi.`);
      setShowPdfPreview(true);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const serverMessage =
          (err.response?.data as { error?: string } | undefined)?.error ?? err.message;
        setPdfError(serverMessage || 'Sorular kaydedilirken bir hata oluştu.');
      } else {
        const message =
          err instanceof Error ? err.message : 'Sorular kaydedilirken bir hata oluştu.';
        setPdfError(message);
      }
    } finally {
      setPdfSaving(false);
    }
  };

  useEffect(() => {
    if (!assignDraft.studentId && students[0]) {
      setAssignDraft((p) => ({ ...p, studentId: students[0].id }));
    }
  }, [students]);

  useEffect(() => {
    if (!assignDraft.testId && tests[0]) {
      setAssignDraft((p) => ({ ...p, testId: tests[0].id }));
    }
  }, [tests]);

  useEffect(() => {
    if (!assignDraft.testAssetId && testAssets[0]) {
      setAssignDraft((p) => ({ ...p, testAssetId: testAssets[0].id }));
    }
  }, [testAssets]);

  const ensureDueDateDefault = () => {
    if (assignDraft.dueDate) return;
    const base = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const local = new Date(base.getTime() - base.getTimezoneOffset() * 60 * 1000);
    setAssignDraft((p) => ({ ...p, dueDate: local.toISOString().slice(0, 16) }));
  };

  const handleUploadAsset = async () => {
    if (!token) return;
    setAssetError(null);
    const title = assetDraft.title.trim();
    const topic = assetDraft.topic.trim();
    if (!title || !topic) {
      setAssetError('Lütfen test başlığı ve konu girin.');
      return;
    }
    if (!assetFile) {
      setAssetError('Lütfen bir dosya seçin (PDF vb.).');
      return;
    }
    setAssetUploading(true);
    try {
      const uploaded = await uploadTeacherTestAssetFile(token, assetFile);
      await createTeacherTestAsset(token, {
        title,
        subjectId: assetDraft.subjectId,
        topic,
        gradeLevel: assetDraft.gradeLevel,
        fileUrl: uploaded.url,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
      });
      setAssetDraft({ title: '', subjectId: 'sub1', topic: '', gradeLevel: '9' });
      setAssetFile(null);
      onTestAssetsChanged();
    } catch (e) {
      setAssetError(e instanceof Error ? e.message : 'Dosya yüklenemedi.');
    } finally {
      setAssetUploading(false);
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!token) return;
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm('Bu test dosyasını silmek istediğinize emin misiniz?');
    if (!confirmed) return;
    try {
      await deleteTeacherTestAsset(token, id);
      onTestAssetsChanged();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e instanceof Error ? e.message : 'Silinemedi');
    }
  };

  const handleAssign = async () => {
    if (!token) return;
    setAssignError(null);
    ensureDueDateDefault();
    if (!assignDraft.studentId) {
      setAssignError('Lütfen bir öğrenci seçin.');
      return;
    }
    if (!assignDraft.dueDate) {
      setAssignError('Lütfen son teslim tarihini seçin.');
      return;
    }
    if (assignDraft.timeLimitMinutes < 1 || assignDraft.timeLimitMinutes > 240) {
      setAssignError('Süre 1 ile 240 dakika arasında olmalıdır.');
      return;
    }

    if (assignDraft.mode === 'structured' && !assignDraft.testId) {
      setAssignError('Lütfen bir yapılandırılmış test seçin.');
      return;
    }
    if (assignDraft.mode === 'file' && !assignDraft.testAssetId) {
      setAssignError('Lütfen bir test dosyası seçin.');
      return;
    }

    const due = new Date(assignDraft.dueDate);
    if (Number.isNaN(due.getTime())) {
      setAssignError('Geçerli bir tarih/saat girin.');
      return;
    }

    setAssignSaving(true);
    try {
      await createTeacherAssignment(token, {
        title:
          assignDraft.mode === 'structured'
            ? `Test: ${tests.find((t) => t.id === assignDraft.testId)?.title ?? 'Test'}`
            : `Test Dosyası: ${testAssets.find((a) => a.id === assignDraft.testAssetId)?.title ?? 'Dosya'}`,
        dueDate: due.toISOString(),
        points: assignDraft.points,
        studentIds: [assignDraft.studentId],
        timeLimitMinutes: assignDraft.timeLimitMinutes,
        ...(assignDraft.mode === 'structured'
          ? { testId: assignDraft.testId }
          : { testAssetId: assignDraft.testAssetId }),
      });
      onAssignmentCreated();
      setAssignDraft((p) => ({ ...p, dueDate: '' }));
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : 'Atama başarısız.');
    } finally {
      setAssignSaving(false);
    }
  };

  const handleAiGenerateQuestions = async () => {
    if (!token || !aiGenTopic.trim() || !aiGenSubject) return;
    if (aiTestCardRef.current) {
      try {
        aiTestCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        // scrollIntoView desteklenmiyorsa sessizce yoksay
      }
    }
    setAiGenLoading(true);
    setAiGenResult(null);
    try {
      // Soru bankasına eklemek için QuestionBankTab mantığıyla üret
      const difficultyMap: Record<string, 'easy' | 'medium' | 'hard'> = {
        kolay: 'easy',
        orta: 'medium',
        zor: 'hard',
      };
      const qbPayload: AIQuestionGeneratePayload = {
        subjectId: aiGenSubject,
        gradeLevel: aiGenGrade,
        topic: aiGenTopic.trim(),
        difficulty: difficultyMap[aiGenDifficulty] || 'medium',
        questionType: aiGenQuestionType,
        count: aiGenCount,
      };
      const qbResult = await generateQuestionBankItems(token, qbPayload);
      
      // Soruları metin formatında göster (eski format için uyumluluk)
      const questionsText = qbResult.questions.map((q, idx) => {
        const choices = Array.isArray(q.choices) ? q.choices : [];
        const choicesText = choices.map((c, i) => `${String.fromCharCode(65 + i)}) ${c}`).join('\n');
        return `${idx + 1}. ${q.text}\n${choicesText}\nDoğru Cevap: ${q.correctAnswer}\n${q.solutionExplanation ? `Açıklama: ${q.solutionExplanation}` : ''}`;
      }).join('\n\n');
      
      setAiGenResult(questionsText);
    } catch (e) {
      setAiGenResult(e instanceof Error ? e.message : 'Soru üretilemedi.');
    } finally {
      setAiGenLoading(false);
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="dual-grid">
        <div style={{ display: 'grid', gap: '1rem' }}>
        <GlassCard>
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '0.5rem 0',
            }}
            onClick={() => toggleCard('ai-generate')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Sparkles className="w-5 h-5 text-purple-400" strokeWidth={1.75} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'white' }}>AI ile Otomatik Soru Üretimi</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Konu ve kriterlere göre test soruları oluştur</p>
              </div>
            </div>
            {expandedCards.has('ai-generate') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          {expandedCards.has('ai-generate') && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            <select value={aiGenGrade} onChange={(e) => setAiGenGrade(e.target.value)}>
              <option value="4">4. Sınıf</option>
              <option value="5">5. Sınıf</option>
              <option value="6">6. Sınıf</option>
              <option value="7">7. Sınıf</option>
              <option value="8">8. Sınıf</option>
              <option value="9">9. Sınıf</option>
              <option value="10">10. Sınıf</option>
              <option value="11">11. Sınıf</option>
              <option value="12">12. Sınıf</option>
              <option value="TYT">TYT</option>
              <option value="AYT">AYT</option>
            </select>
            <select value={aiGenSubject} onChange={(e) => setAiGenSubject(e.target.value)}>
              {aiGenSubjectsLoading ? (
                <option>Yükleniyor...</option>
              ) : aiGenSubjects.length > 0 ? (
                aiGenSubjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="sub_matematik">Matematik</option>
                  <option value="sub_fizik">Fizik</option>
                  <option value="sub_biyoloji">Biyoloji</option>
                  <option value="sub_kimya">Kimya</option>
                </>
              )}
            </select>
            
            {(aiCurriculumTopics.length > 0) ? (
               <select
                value={aiGenTopic}
                onChange={(e) => setAiGenTopic(e.target.value)}
              >
                <option value="">Konu seçin</option>
                {aiCurriculumTopics.map((t) => (
                  <option key={t.id} value={t.topicName}>
                    {t.kazanimKodu ? `${t.kazanimKodu} - ${t.topicName}` : t.topicName}
                  </option>
                ))}
              </select>
            ) : (
                <input
                type="text"
                placeholder={aiCurriculumTopicsLoading ? 'Konular yükleniyor...' : 'Konu (örn: Üslü Sayılar)'}
                value={aiGenTopic}
                onChange={(e) => setAiGenTopic(e.target.value)}
              />
            )}

            <select value={aiGenCount} onChange={(e) => setAiGenCount(Number(e.target.value))}>
              {[5, 10, 15, 20, 30, 40].map((n) => (
                <option key={n} value={n}>{n} soru</option>
              ))}
            </select>
            <select value={aiGenDifficulty} onChange={(e) => setAiGenDifficulty(e.target.value)}>
              <option value="kolay">Kolay</option>
              <option value="orta">Orta</option>
              <option value="zor">Zor</option>
            </select>
            <select value={aiGenQuestionType} onChange={(e) => setAiGenQuestionType(e.target.value as 'multiple_choice' | 'true_false' | 'open_ended')}>
              <option value="multiple_choice">Çoktan Seçmeli</option>
              <option value="true_false">Doğru/Yanlış</option>
              <option value="open_ended">Açık Uçlu</option>
            </select>
            <button
              type="button"
              className="primary-btn"
              onClick={handleAiGenerateQuestions}
              disabled={aiGenLoading || !aiGenTopic.trim()}
            >
              {aiGenLoading ? 'Üretiliyor...' : 'Soruları Üret'}
            </button>
              </div>
              {aiGenResult && (
                <div style={{ marginTop: '1rem' }}>
              <div style={{ marginBottom: '0.6rem', padding: '0.75rem', borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', fontSize: '0.9rem' }}>
                ✓ Sorular başarıyla üretildi ve soru bankasına eklendi. Aşağıdaki soru bankasından görüntüleyebilirsiniz.
              </div>
              {parsedAiQuestions ? (
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: 12,
                    background: 'rgba(15,23,42,0.5)',
                    border: '1px solid rgba(51,65,85,0.9)',
                    fontSize: '0.9rem',
                    maxHeight: 360,
                    overflowY: 'auto',
                    display: 'grid',
                    gap: '0.8rem',
                  }}
                >
                  {parsedAiQuestions.map((q) => (
                    <div
                      key={q.index}
                      style={{
                        padding: '0.75rem 0.9rem',
                        borderRadius: 10,
                        background: 'rgba(15,23,42,0.85)',
                        border: '1px solid rgba(55,65,81,0.9)',
                      }}
                    >
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a5b4fc', marginBottom: '0.25rem' }}>
                        {q.index}. Soru
                      </div>
                      <div style={{ color: 'white', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{q.text}</div>
                      {q.choices && q.choices.length > 0 && (
                        <div
                          style={{
                            marginTop: '0.5rem',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: '0.25rem 0.75rem',
                            fontSize: '0.85rem',
                          }}
                        >
                          {q.choices.map((choice, i) => {
                            const letter = String.fromCharCode(65 + i);
                            const isCorrect =
                              q.correctAnswer &&
                              (q.correctAnswer.trim().toUpperCase() === letter ||
                                q.correctAnswer.trim().toUpperCase() === `${letter})` ||
                                q.correctAnswer.trim() === choice.trim());
                            return (
                              <div
                                key={letter}
                                style={{
                                  color: isCorrect ? '#4ade80' : 'rgba(226,232,240,0.9)',
                                }}
                              >
                                <span style={{ fontWeight: 600 }}>{letter})</span> {choice}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {(q.correctAnswer || q.explanation) && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#e5e7eb' }}>
                          {q.correctAnswer && (
                            <div style={{ color: '#a5b4fc' }}>
                              Doğru cevap: <strong>{q.correctAnswer}</strong>
                            </div>
                          )}
                          {q.explanation && (
                            <div style={{ marginTop: '0.25rem', color: '#cbd5f5' }}>
                              Açıklama: {q.explanation}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: 12,
                    background: 'rgba(15,23,42,0.5)',
                    border: '1px solid rgba(51,65,85,0.9)',
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.9rem',
                    maxHeight: 320,
                    overflowY: 'auto',
                  }}
                >
                  {aiGenResult}
                </div>
              )}
                </div>
              )}
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '0.5rem 0',
            }}
            onClick={() => toggleCard('ai-pdf')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FileText className="w-5 h-5 text-blue-400" strokeWidth={1.75} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'white' }}>AI PDF Ayrıştırıcı</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>PDF test kitaplarındaki soruları hızlıca soru bankasına aktar</p>
              </div>
            </div>
            {expandedCards.has('ai-pdf') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          {expandedCards.has('ai-pdf') && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Üstte seçtiğiniz <strong>sınıf</strong> ve <strong>ders</strong> bilgisi bu PDF’ten
              çıkan sorular için kullanılacaktır.
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.6rem',
                alignItems: 'center',
              }}
            >
              <label
                className="ghost-btn"
                style={{ cursor: 'pointer', marginRight: '0.25rem' }}
              >
                PDF Seç
                <input
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => handlePdfFileChange(e.target.files?.[0] ?? null)}
                />
              </label>
              {pdfFile && (
                <span style={{ fontSize: '0.85rem' }}>
                  Seçilen dosya: <strong>{pdfFile.name}</strong>
                </span>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                className="ghost-btn"
                onClick={handlePdfAnalyze}
                disabled={pdfParsing || !pdfFile}
              >
                {pdfParsing ? 'Analiz Ediliyor...' : 'PDF’ten Soruları Çıkar'}
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handlePdfSaveAll}
                disabled={
                  pdfSaving ||
                  pdfQuestions.length === 0 ||
                  !aiGenSubject ||
                  !aiGenGrade
                }
              >
                {pdfSaving ? 'Kaydediliyor...' : 'Tümünü Soru Bankasına Kaydet'}
              </button>
              {pdfQuestions.length > 0 && (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Ayrıştırılan soru sayısı: <strong>{pdfQuestions.length}</strong>
                </span>
              )}
            </div>

            {pdfError && (
              <div
                style={{
                  marginTop: '0.4rem',
                  fontSize: '0.8rem',
                  color: '#fecaca',
                }}
              >
                {pdfError}
              </div>
            )}

            {pdfSaveMessage && (
              <div
                style={{
                  marginTop: '0.4rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#22c55e',
                    textShadow: '0 0 10px rgba(34,197,94,0.45)',
                  }}
                >
                  {pdfSaveMessage}
                </span>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setShowPdfPreview((prev) => !prev)}
                  style={{
                    padding: '0.25rem 0.65rem',
                    fontSize: '0.8rem',
                    borderRadius: 999,
                  }}
                >
                  {showPdfPreview ? 'Önizlemeyi Gizle' : 'Kaydedilen Soruları Gör'}
                </button>
              </div>
            )}

            {showPdfPreview && pdfQuestions.length > 0 && (
              <div
                style={{
                  marginTop: '0.6rem',
                  padding: '0.75rem',
                  borderRadius: 10,
                  background: 'rgba(15,23,42,0.7)',
                  border: '1px solid rgba(51,65,85,0.9)',
                  fontSize: '0.8rem',
                  maxHeight: 260,
                  overflowY: 'auto',
                }}
              >
                {Object.entries(
                  pdfQuestions.reduce<Record<string, ParsedPdfQuestion[]>>((acc, q) => {
                    const key = (q.topic ?? 'Genel').toString().trim() || 'Genel';
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(q);
                    return acc;
                  }, {}),
                ).map(([topic, questions]) => (
                  <div
                    key={topic}
                    style={{
                      padding: '0.5rem 0',
                      borderTop: '1px solid rgba(51,65,85,0.8)',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: '0.25rem',
                        color: '#a5b4fc',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                      }}
                    >
                      <span>{topic}</span>
                      <span style={{ fontSize: '0.75rem', color: '#e5e7eb' }}>
                        {questions.length} soru
                      </span>
                    </div>
                    {questions.slice(0, 3).map((q, idx) => (
                      <div
                        key={`${topic}-${idx}-${q.question_text.slice(0, 20)}`}
                        style={{
                          padding: '0.35rem 0',
                          borderTop: idx === 0 ? 'none' : '1px dashed rgba(71,85,105,0.8)',
                        }}
                      >
                        <div style={{ fontWeight: 500, marginBottom: '0.1rem' }}>
                          {idx + 1}. Soru
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{q.question_text}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
              </div>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '0.5rem 0',
            }}
            onClick={() => toggleCard('test-upload')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FileDown className="w-5 h-5 text-green-400" strokeWidth={1.75} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'white' }}>Test Dosyası Yükle</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>PDF gibi bir dosyayı test olarak ekleyin</p>
              </div>
            </div>
            {expandedCards.has('test-upload') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          {expandedCards.has('test-upload') && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
            <input
              type="text"
              placeholder="Test başlığı"
              value={assetDraft.title}
              onChange={(e) => setAssetDraft((p) => ({ ...p, title: e.target.value }))}
            />

            <select
              value={assetDraft.gradeLevel}
              onChange={(e) => setAssetDraft((p) => ({ ...p, gradeLevel: e.target.value }))}
            >
              <option value="4">4. Sınıf</option>
              <option value="5">5. Sınıf</option>
              <option value="6">6. Sınıf</option>
              <option value="7">7. Sınıf</option>
              <option value="8">8. Sınıf</option>
              <option value="9">9. Sınıf</option>
              <option value="10">10. Sınıf</option>
              <option value="11">11. Sınıf</option>
              <option value="12">12. Sınıf</option>
              <option value="TYT">TYT</option>
              <option value="AYT">AYT</option>
            </select>

            <select
              value={assetDraft.subjectId}
              onChange={(e) => setAssetDraft((p) => ({ ...p, subjectId: e.target.value }))}
            >
               {assetCurriculumSubjectsLoading ? (
                <option>Yükleniyor...</option>
              ) : assetCurriculumSubjects.length > 0 ? (
                assetCurriculumSubjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="sub_matematik">Matematik</option>
                  <option value="sub_fizik">Fizik</option>
                  <option value="sub_biyoloji">Biyoloji</option>
                  <option value="sub_kimya">Kimya</option>
                </>
              )}
            </select>
            
            {(assetCurriculumTopics.length > 0) ? (
               <select
                value={assetDraft.topic}
                onChange={(e) => setAssetDraft((p) => ({ ...p, topic: e.target.value }))}
              >
                <option value="">Konu seçin</option>
                {assetCurriculumTopics.map((t) => (
                  <option key={t.id} value={t.topicName}>
                    {t.kazanimKodu ? `${t.kazanimKodu} - ${t.topicName}` : t.topicName}
                  </option>
                ))}
              </select>
            ) : (
               <input
                type="text"
                placeholder={assetCurriculumTopicsLoading ? 'Konular yükleniyor...' : 'Konu'}
                value={assetDraft.topic}
                onChange={(e) => setAssetDraft((p) => ({ ...p, topic: e.target.value }))}
              />
            )}

            <div
              onClick={() => assetInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsAssetDragOver(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setIsAssetDragOver(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsAssetDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  setAssetFile(file);
                  setAssetError(null);
                }
              }}
              style={{
                borderRadius: 14,
                border: isAssetDragOver
                  ? '2px dashed rgba(59,130,246,0.9)'
                  : '1px dashed rgba(148,163,184,0.85)',
                padding: '0.75rem 0.9rem',
                background: isAssetDragOver
                  ? 'rgba(59,130,246,0.06)'
                  : 'rgba(248,250,252,0.96)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                Dosya seç veya sürükleyip bırak
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-muted)',
                }}
              >
                {assetFile
                  ? `Seçilen: ${assetFile.name}`
                  : 'PDF, resim veya .zip dosyasını buraya bırakabilirsiniz.'}
              </div>
              <div>
                <button
                  type="button"
                  className="ghost-btn"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.9rem' }}
                >
                  Dosya Seç
                </button>
              </div>
              <input
                ref={assetInputRef}
                type="file"
                accept=".pdf,application/pdf,image/*,.zip"
                onChange={(e) => setAssetFile(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }}
              />
            </div>
            {assetError && <div style={{ color: '#f97316', fontSize: '0.85rem' }}>{assetError}</div>}
            <button type="button" className="primary-btn" onClick={handleUploadAsset} disabled={assetUploading}>
              {assetUploading ? 'Yükleniyor...' : 'Dosyayı Yükle ve Kaydet'}
            </button>
              </div>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '0.5rem 0',
            }}
            onClick={() => toggleCard('assign-test')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Send className="w-5 h-5 text-orange-400" strokeWidth={1.75} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'white' }}>Öğrenciye Test Ata</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Öğrenciye özel test + süre belirleyin</p>
              </div>
            </div>
            {expandedCards.has('assign-test') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          {expandedCards.has('assign-test') && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
            <select
              value={assignDraft.studentId}
              onChange={(e) => setAssignDraft((p) => ({ ...p, studentId: e.target.value }))}
            >
              <option value="">Öğrenci seçin</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={assignDraft.mode === 'structured' ? 'primary-btn' : 'ghost-btn'}
                onClick={() => setAssignDraft((p) => ({ ...p, mode: 'structured' }))}
              >
                Yapılandırılmış test
              </button>
              <button
                type="button"
                className={assignDraft.mode === 'file' ? 'primary-btn' : 'ghost-btn'}
                onClick={() => setAssignDraft((p) => ({ ...p, mode: 'file' }))}
              >
                Dosya testi
              </button>
            </div>

            {assignDraft.mode === 'structured' && (
              <select
                value={assignDraft.testId}
                onChange={(e) => setAssignDraft((p) => ({ ...p, testId: e.target.value }))}
              >
                <option value="">Test seçin</option>
                {tests.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            )}

            {assignDraft.mode === 'file' && (
              <select
                value={assignDraft.testAssetId}
                onChange={(e) => setAssignDraft((p) => ({ ...p, testAssetId: e.target.value }))}
              >
                <option value="">Dosya seçin</option>
                {testAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} ({a.gradeLevel})
                  </option>
                ))}
              </select>
            )}

            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Son teslim:
              <input
                type="datetime-local"
                value={assignDraft.dueDate}
                onFocus={ensureDueDateDefault}
                onChange={(e) => setAssignDraft((p) => ({ ...p, dueDate: e.target.value }))}
                style={{ width: '100%', marginTop: '0.2rem' }}
              />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Süre (dk):
              <input
                type="number"
                min={1}
                max={240}
                value={assignDraft.timeLimitMinutes}
                onChange={(e) => setAssignDraft((p) => ({ ...p, timeLimitMinutes: Number(e.target.value) || 0 }))}
                style={{ width: '100%', marginTop: '0.2rem' }}
              />
            </label>
            {assignError && <div style={{ color: '#f97316', fontSize: '0.85rem' }}>{assignError}</div>}
            <button type="button" className="primary-btn" onClick={handleAssign} disabled={assignSaving}>
              {assignSaving ? 'Atanıyor...' : 'Testi Ata'}
            </button>
              </div>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              cursor: 'pointer',
              padding: '0.5rem 0',
            }}
            onClick={() => toggleCard('test-files')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Layers className="w-5 h-5 text-indigo-400" strokeWidth={1.75} />
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'white' }}>Yüklenen Test Dosyaları</h3>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Kayıtlar</p>
              </div>
            </div>
            {expandedCards.has('test-files') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
          {expandedCards.has('test-files') && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="list-stack">
            {testAssets.length === 0 && <div className="empty-state">Henüz test dosyası yok.</div>}
            {testAssets.slice(0, 8).map((a) => (
              <div className="list-row" key={a.id}>
                <div>
                  <strong>{a.title}</strong>
                  <small>
                    {a.topic} · {a.gradeLevel}. sınıf
                  </small>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => window.open(a.fileUrl, '_blank', 'noopener,noreferrer')}
                  >
                    Aç
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => handleDeleteAsset(a.id)}>
                    Sil
                  </button>
                </div>
              </div>
            ))}
              </div>
            </div>
          )}
        </GlassCard>
        </div>
      </div>
      <GlassCard>
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            cursor: 'pointer',
            padding: '0.5rem 0',
          }}
          onClick={() => toggleCard('question-bank')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <BookOpen className="w-5 h-5 text-cyan-400" strokeWidth={1.75} />
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'white' }}>Soru Bankası</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Tüm soruları görüntüle, düzenle ve yönet</p>
            </div>
          </div>
          {expandedCards.has('question-bank') ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
        {expandedCards.has('question-bank') && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <QuestionBankTab
              token={token}
              allowedGrades={allowedGrades}
              allowedSubjectNames={allowedSubjectNames}
            />
          </div>
        )}
      </GlassCard>
    </div>
  );
};

const TeacherOverview: React.FC<{
  metrics: Array<{ label: string; value: string; helper?: string; trendLabel?: string; trendTone?: 'positive' | 'neutral' }>;
  onNavigate?: (tab: TeacherTab) => void;
}> = ({ metrics, onNavigate }) => {
  const shortcuts: { id: TeacherTab; label: string; icon: React.ReactNode }[] = [
    { id: 'live', label: 'Canlı Ders', icon: <Video size={20} /> },
    { id: 'calendar', label: 'Takvim', icon: <CalendarCheck size={20} /> },
    { id: 'schedule', label: 'Ders Programı', icon: <CalendarCheck size={20} /> },
    { id: 'coaching', label: 'Kişisel Takip', icon: <TrendingUp size={20} /> },
    { id: 'students', label: 'Öğrenciler', icon: <Users size={20} /> },
    { id: 'parents', label: 'Veliler', icon: <Users size={20} /> },
  ];

  return (
    <div className="dashboard-overview" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Kısayollar */}
      {onNavigate && (
        <GlassCard title="Kısayollar" subtitle="Sık kullanılan sayfalara hızlı erişim" className="overview-shortcuts-card">
          <div className="overview-shortcuts-grid">
            {shortcuts.map((s) => (
              <button
                key={s.id}
                type="button"
                className="overview-shortcut-btn"
                onClick={() => onNavigate(s.id)}
              >
                <span className="overview-shortcut-icon">{s.icon}</span>
                <span className="overview-shortcut-label">{s.label}</span>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Metrik kartları */}
      <GlassCard title="İstatistikler" subtitle="Genel bakış metrikleri" className="overview-metrics-card">
        <div className="overview-metrics-grid">
          {metrics.map((m, i) => (
            <MetricCard
              key={i}
              label={m.label}
              value={m.value}
              helper={m.helper}
              trendLabel={m.trendLabel}
              trendTone={m.trendTone ?? 'neutral'}
            />
          ))}
        </div>
      </GlassCard>
    </div>
  );
};

const GRADE_OPTIONS: { value: string; label: string; isLgsOrYks?: boolean }[] = [
  { value: '4', label: '4. Sınıf' },
  { value: '5', label: '5. Sınıf' },
  { value: '6', label: '6. Sınıf' },
  { value: '7', label: '7. Sınıf' },
  { value: '8', label: '8. Sınıf (LGS)' },
  { value: '9', label: '9. Sınıf' },
  { value: '10', label: '10. Sınıf' },
  { value: '11', label: '11. Sınıf' },
  { value: '12', label: '12. Sınıf' },
  { value: 'TYT', label: 'TYT', isLgsOrYks: true },
  { value: 'AYT', label: 'AYT', isLgsOrYks: true },
];

const TeacherContent: React.FC<{
  contents: TeacherContent[];
  draft: { title: string; type: string; topic: string; subjectId: string; gradeLevel: string; url: string; description: string };
  onDraftChange: (draft: { title: string; type: string; topic: string; subjectId: string; gradeLevel: string; url: string; description: string }) => void;
  onCreateContent: () => void;
  onSelectVideoFile: (file: File | null) => void;
  selectedVideoFileName?: string | null;
  uploadingVideo?: boolean;
  curriculumTopics: CurriculumTopic[];
  loadingCurriculumTopics?: boolean;
  curriculumSubjects?: Array<{ id: string; name: string }>;
  loadingCurriculumSubjects?: boolean;
  /** Öğretmenin atandığı sınıf seviyeleri (örn. ['9','10']); boşsa tümü gösterilir. */
  allowedGrades?: string[];
  /** Öğretmenin branş adları (örn. ['Matematik']); sadece bu dersler listelenir. */
  allowedSubjectNames?: string[];
}> = ({
  contents,
  draft,
  onDraftChange,
  onCreateContent,
  onSelectVideoFile,
  selectedVideoFileName,
  uploadingVideo,
  curriculumTopics,
  loadingCurriculumTopics,
  curriculumSubjects = [],
  loadingCurriculumSubjects = false,
  allowedGrades = [],
  allowedSubjectNames = [],
}) => {
  // Sınıf seçenekleri: atanan sınıflar + 9–12 varsa TYT/AYT, 8 varsa 8 (LGS) zaten dahil
  const hasLise = allowedGrades.length === 0 || allowedGrades.some((g) => ['9', '10', '11', '12'].includes(g));
  const gradeOptions = GRADE_OPTIONS.filter((opt) => {
    if (opt.isLgsOrYks) return hasLise; // TYT/AYT sadece 9–12 öğretmenleri
    if (allowedGrades.length === 0) return true;
    return allowedGrades.includes(opt.value);
  });

  // Ders listesi: sadece öğretmenin branşı
  const fallbackSubjects = [
    { id: 'sub_matematik', name: 'Matematik' },
    { id: 'sub_fizik', name: 'Fizik' },
    { id: 'sub_biyoloji', name: 'Biyoloji' },
    { id: 'sub_kimya', name: 'Kimya' },
  ];
  const subjectList = curriculumSubjects.length > 0 ? curriculumSubjects : fallbackSubjects;
  const filteredSubjects =
    allowedSubjectNames.length === 0
      ? subjectList
      : subjectList.filter((sub) => allowedSubjectNames.some((n) => n.trim().toLowerCase() === sub.name.trim().toLowerCase()));

  return (
  <GlassCard title="İçerik Kütüphanesi" subtitle="Yeni içerik oluştur">
      <div className="list-stack" style={{ marginBottom: '1rem' }}>
        <div className="list-row">
          <div style={{ flex: 1 }}>
            <strong>Yeni İçerik</strong>
            <small>Ders, konu ve link girin veya video yükleyin</small>
          </div>
        </div>
        <div style={{ display: 'grid', gap: '0.6rem' }}>

          <div style={{ display: 'grid', gap: '0.35rem' }}>
             <select
              value={draft.gradeLevel}
              onChange={(event) => onDraftChange({ ...draft, gradeLevel: event.target.value })}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: 999,
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-surface)',
                fontSize: '0.9rem',
              }}
            >
              <option value="">{gradeOptions.length === 0 ? 'Yetkili sınıf yok' : 'Sınıf seçin'}</option>
              {gradeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <select
            value={draft.subjectId}
            onChange={(event) => onDraftChange({ ...draft, subjectId: event.target.value })}
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem',
              borderRadius: 999,
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface)',
              fontSize: '0.9rem',
            }}
          >
            {loadingCurriculumSubjects ? (
              <option>Dersler yükleniyor...</option>
            ) : filteredSubjects.length > 0 ? (
              <>
                <option value="">Ders seçin</option>
                {filteredSubjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </>
            ) : (
              <>
                <option value="">{allowedSubjectNames.length === 0 ? 'Ders seçin' : 'Branşınıza ait ders bulunamadı'}</option>
              </>
            )}
          </select>

            {draft.gradeLevel && draft.subjectId && (
              <div style={{ display: 'grid', gap: '0.25rem' }}>
                {loadingCurriculumTopics && (
                  <small style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    Konular yükleniyor...
                  </small>
                )}
                {curriculumTopics.length > 0 ? (
                  <select
                    value={draft.topic}
                    onChange={(event) => onDraftChange({ ...draft, topic: event.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: 999,
                      border: '1px solid var(--color-border-subtle)',
                      background: 'var(--color-surface)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <option value="">Konu seçin (MEB müfredatı)</option>
                    {curriculumTopics.map((t) => (
                      <option key={t.id} value={t.topicName}>
                        {t.kazanimKodu ? `${t.kazanimKodu} - ${t.topicName}` : t.topicName}
                      </option>
                    ))}
                  </select>
                ) : (
                  !loadingCurriculumTopics && (
                     <input
                      type="text"
                      placeholder="Konu başlığı (Manuel giriş)"
                      value={draft.topic}
                      onChange={(event) => onDraftChange({ ...draft, topic: event.target.value })}
                    />
                  )
                )}
              </div>
            )}
            
          <input
            type="text"
            placeholder="İçerik başlığı"
            value={draft.title}
            onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
          />
          <input
            type="text"
            placeholder="Konu detayı / açıklama"
            value={draft.description}
            onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
          />
        <div
          style={{
            borderRadius: 14,
            border: '1px dashed rgba(148,163,184,0.7)',
            padding: '1rem 1.1rem',
            background: 'rgba(15,23,42,0.02)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
          }}
        >
          <input
            id="teacher-content-video"
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              onSelectVideoFile(file);
            }}
          />
          <label
            htmlFor="teacher-content-video"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>Video yükle</span>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                Dosyayı seçin veya bu alanın üzerine sürükleyip bırakın.
              </span>
            </div>
            <span
              style={{
                fontSize: '0.8rem',
                padding: '0.35rem 0.9rem',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #4f46e5, #2563eb)',
                color: '#f9fafb',
                boxShadow: '0 10px 25px rgba(37,99,235,0.45)',
                whiteSpace: 'nowrap',
              }}
            >
              En fazla 100MB
            </span>
          </label>
          {selectedVideoFileName && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.4rem',
                alignItems: 'center',
                fontSize: '0.8rem',
                color: '#4b5563',
              }}
            >
              <span
                style={{
                  padding: '0.2rem 0.7rem',
                  borderRadius: 999,
                  background: 'rgba(37,99,235,0.08)',
                  color: '#1d4ed8',
                }}
              >
                {selectedVideoFileName}
              </span>
              {uploadingVideo && <span>Yükleniyor...</span>}
            </div>
          )}
          <input
            type="text"
            placeholder="İçerik URL (YouTube vb.)"
            value={draft.url}
            onChange={(event) => onDraftChange({ ...draft, url: event.target.value })}
            style={{ marginTop: '0.25rem' }}
          />
        </div>
        <button
          type="button"
          className="primary-btn"
          onClick={onCreateContent}
          style={{ justifySelf: 'flex-end', marginTop: '0.25rem' }}
        >
          Kaydet
        </button>
      </div>
    </div>
    <div className="list-stack">
      {contents.map((content) => (
        <div className="list-row" key={content.id}>
          <div>
            <strong>{content.title}</strong>
            <small>{content.type}</small>
          </div>
          <TagChip label="Yayınlandı" tone="success" />
        </div>
      ))}
      {contents.length === 0 && <div className="empty-state">İçerik bulunamadı.</div>}
    </div>
  </GlassCard>
  );
};

const TeacherCalendar: React.FC<{
  events: CalendarEvent[];
  students: TeacherStudent[];
  onCreateMeeting: () => void;
  onEditMeeting: (meetingId: string) => void;
  onDeleteMeeting: (meetingId: string) => void;
  onEditAssignment?: (assignmentId: string, event: CalendarEvent) => void;
  announcements: TeacherAnnouncement[];
  announcementDraft: { gradeLevel: string; studentId: string; title: string; message: string; scheduledDate: string };
  onAnnouncementDraftChange: (draft: { gradeLevel: string; studentId: string; title: string; message: string; scheduledDate: string }) => void;
  onCreateAnnouncement: () => void;
  announcementOpen: boolean;
  onToggleAnnouncement: (value: boolean) => void;
  creatingAnnouncement: boolean;
  announcementError: string | null;
}> = ({
  events,
  students,
  onCreateMeeting: _onCreateMeeting,
  onEditMeeting,
  onDeleteMeeting,
  onEditAssignment,
  announcements,
  announcementDraft,
  onAnnouncementDraftChange,
  onCreateAnnouncement,
  announcementOpen,
  onToggleAnnouncement,
  creatingAnnouncement,
  announcementError,
}) => {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const announcementGradeLevels = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => { if (s.gradeLevel) set.add(s.gradeLevel); });
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  }, [students]);
  const announcementStudentsInGrade = useMemo(() => {
    if (!announcementDraft.gradeLevel) return [];
    return students.filter((s) => s.gradeLevel === announcementDraft.gradeLevel);
  }, [students, announcementDraft.gradeLevel]);

  const byDay = events.reduce<Record<string, CalendarEvent[]>>((acc, event) => {
    const day = formatShortDate(event.startDate);
    if (!acc[day]) acc[day] = [];
    acc[day].push(event);
    return acc;
  }, {});
  const sortedDays = Object.keys(byDay).sort((a, b) => {
    const [da, ma] = a.split(' ');
    const [db, mb] = b.split(' ');
    const months: Record<string, number> = { Oca: 1, Şub: 2, Mar: 3, Nis: 4, May: 5, Haz: 6, Tem: 7, Ağu: 8, Eyl: 9, Eki: 10, Kas: 11, Ara: 12 };
    return (months[ma] ?? 0) * 100 + parseInt(da, 10) - ((months[mb] ?? 0) * 100 + parseInt(db, 10));
  });

  return (
    <GlassCard
      title="Haftalık Takvim"
      subtitle="Etkinlikler ve duyurular"
      actions={
        <button
          type="button"
          className={announcementOpen ? 'primary-btn' : 'ghost-btn'}
          onClick={() => onToggleAnnouncement(!announcementOpen)}
        >
          <Layers size={16} /> Duyuru Oluştur
        </button>
      }
    >
      {announcementOpen && (
        <div
          className="calendar-announcement-form"
          style={{
            border: '1px solid rgba(148,163,184,0.35)',
            borderRadius: 16,
            padding: '1rem 1.25rem',
            background: 'rgba(15,23,42,0.04)',
            marginBottom: '1.25rem',
            display: 'grid',
            gap: '0.75rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>Sınıf</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {announcementGradeLevels.length === 0 && (
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Öğrenci listesi yükleniyor...</span>
              )}
              {announcementGradeLevels.map((g) => {
                const isActive = announcementDraft.gradeLevel === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => onAnnouncementDraftChange({
                      ...announcementDraft,
                      gradeLevel: g,
                      studentId: '',
                    })}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: 999,
                      border: `1px solid ${isActive ? 'var(--color-primary-strong)' : 'var(--color-border-subtle)'}`,
                      background: isActive ? 'var(--color-primary-soft)' : 'var(--color-surface-strong)',
                      color: isActive ? 'var(--color-primary-strong)' : 'var(--color-text-main)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    {g}. Sınıf
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>Öğrenci (isteğe bağlı)</div>
            <select
              value={announcementDraft.studentId}
              onChange={(e) => onAnnouncementDraftChange({ ...announcementDraft, studentId: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 8,
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-surface)',
                fontSize: '0.9rem',
              }}
            >
              <option value="">Tüm sınıf</option>
              {announcementStudentsInGrade.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Duyuru başlığı"
            value={announcementDraft.title}
            onChange={(event) =>
              onAnnouncementDraftChange({ ...announcementDraft, title: event.target.value })
            }
            style={{
              padding: '0.6rem 0.9rem',
              borderRadius: 10,
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface)',
              fontSize: '0.95rem',
            }}
          />
          <textarea
            placeholder="Duyuru mesajı"
            value={announcementDraft.message}
            onChange={(event) =>
              onAnnouncementDraftChange({ ...announcementDraft, message: event.target.value })
            }
            rows={3}
            style={{
              resize: 'vertical',
              padding: '0.6rem 0.9rem',
              borderRadius: 10,
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface)',
              fontSize: '0.95rem',
            }}
          />
          <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Planlanan tarih (isteğe bağlı):
            <input
              type="datetime-local"
              style={{ width: '100%', marginTop: '0.35rem', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--color-border-subtle)' }}
              value={announcementDraft.scheduledDate}
              onFocus={() => {
                if (!announcementDraft.scheduledDate) {
                  const now = new Date();
                  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
                  onAnnouncementDraftChange({
                    ...announcementDraft,
                    scheduledDate: local.toISOString().slice(0, 16),
                  });
                }
              }}
              onChange={(event) =>
                onAnnouncementDraftChange({ ...announcementDraft, scheduledDate: event.target.value })
              }
            />
          </label>
          {announcementError && (
            <div style={{ color: '#f97316', fontSize: '0.85rem' }}>{announcementError}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="ghost-btn" onClick={() => onToggleAnnouncement(false)}>
              Vazgeç
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={onCreateAnnouncement}
              disabled={creatingAnnouncement}
            >
              {creatingAnnouncement ? 'Kaydediliyor...' : 'Duyuruyu Kaydet'}
            </button>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div className="empty-state">Takvim verisi bulunamadı.</div>
      ) : (
        <div className="calendar-grid calendar-modern calendar-premium">
          {sortedDays.map((day) => (
            <div key={day} className="calendar-day">
              <div className="calendar-day-header">{day}</div>
              <div className="calendar-day-events">
                {byDay[day].map((event) => {
                  const isMeeting = (event.type || '').toLowerCase() === 'meeting';
                  const meetingId = event.relatedId;
                  const isSelected = selectedEventId === event.id;

                  return (
                    <div
                      key={event.id}
                      className={`calendar-event ${isSelected ? 'calendar-event--selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedEventId(isSelected ? null : event.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedEventId(isSelected ? null : event.id);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="calendar-event-icon">{getEventIcon(event)}</span>
                      <div className="calendar-event-body">
                        <span className="calendar-event-title">{event.title}</span>
                        {event.startDate && (
                          <span className="calendar-event-time">{formatTime(event.startDate)}</span>
                        )}
                        {isSelected && (
                          <div className="calendar-event-detail">
                            {event.description && (
                              <p className="calendar-event-description">{event.description}</p>
                            )}
                            {event.endDate && (
                              <span className="calendar-event-meta">
                                Bitiş: {formatTime(event.endDate)}
                              </span>
                            )}
                            <span className="calendar-event-meta calendar-event-type">
                              {event.type || 'Etkinlik'}
                            </span>
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <span className="calendar-event-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={() => {
                              if (isMeeting && meetingId) {
                                onEditMeeting(meetingId);
                              } else if (event.relatedId && onEditAssignment) {
                                onEditAssignment(event.relatedId, event);
                              } else {
                                alert('Bu etkinlik türü için düzenleme şu an desteklenmiyor.');
                              }
                            }}
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            className="ghost-btn calendar-event-delete"
                            onClick={() => {
                              if (isMeeting && meetingId) onDeleteMeeting(meetingId);
                              else alert('Bu etkinlik türü için silme şu an desteklenmiyor.');
                            }}
                          >
                            Sil
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {announcements.length > 0 && (
        <div className="calendar-recent-announcements">
          <div className="calendar-recent-title">Son Duyurular</div>
          <div className="list-stack">
            {announcements.slice(0, 3).map((announcement) => (
              <div className="list-row" key={announcement.id}>
                <div>
                  <strong>{announcement.title}</strong>
                  <small>
                    {announcement.scheduledDate
                      ? `Planlanan: ${new Date(announcement.scheduledDate).toLocaleString('tr-TR')}`
                      : 'Taslak'}{' '}
                    — {new Date(announcement.createdAt).toLocaleDateString('tr-TR')}
                  </small>
                </div>
                <TagChip
                  label={announcement.status === 'draft' ? 'Taslak' : 'Planlandı'}
                  tone={announcement.status === 'draft' ? 'info' : 'warning'}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
};

const _TeacherAiAssistant: React.FC<{
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  messages: AiMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  loading: boolean;
  error: string | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  format: 'text' | 'pdf' | 'xlsx';
  onFormatChange: (value: 'text' | 'pdf' | 'xlsx') => void;
  onDownloadAttachment: (attachment: NonNullable<AiMessage['attachment']>) => void;
}> = ({
  open,
  onToggle,
  onClose,
  messages,
  input,
  onInputChange,
  onSend,
  loading,
  error,
  scrollRef,
  format,
  onFormatChange,
  onDownloadAttachment,
}) => (
  <>
    {!open && (
      <button
        type="button"
        onClick={onToggle}
        style={{
          position: 'fixed',
          right: '1.5rem',
          bottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.85rem 1.1rem',
          borderRadius: 999,
          border: '1px solid rgba(129,140,248,0.7)',
          background: 'linear-gradient(135deg, rgba(30,64,175,0.95), rgba(79,70,229,0.95))',
          color: '#f8fafc',
          boxShadow: '0 18px 45px rgba(15,23,42,0.6)',
          zIndex: 90,
          cursor: 'pointer',
          fontWeight: 600,
        }}
        aria-label="Soru üretici yapay zekayı aç"
      >
        <MessageCircle size={18} />
        Soru üretici
      </button>
    )}

    {open && (
      <div
        style={{
          position: 'fixed',
          right: '1.5rem',
          bottom: '1.5rem',
          width: 'min(420px, 92vw)',
          height: 'min(560px, 85vh)',
          zIndex: 95,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(2,6,23,0.98)',
          borderRadius: 22,
          border: '1px solid rgba(79,70,229,0.6)',
          boxShadow: '0 30px 80px rgba(15,23,42,0.75)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '1rem 1.2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(30,41,59,0.9)',
            background: 'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,64,175,0.95))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#e2e8f0' }}>
            <Sparkles size={18} />
            <div>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', opacity: 0.7 }}>
                Yapay Zeka ile
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                Soru / test üretici
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ghost-btn"
            style={{
              border: '1px solid rgba(148,163,184,0.7)',
              background: 'rgba(15,23,42,0.85)',
              color: '#e2e8f0',
            }}
            aria-label="Kapat"
          >
            <X size={16} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            padding: '1rem 1.1rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            background:
              'radial-gradient(circle at top, rgba(30,41,59,0.75), rgba(2,6,23,0.98))',
          }}
        >
          {messages.map((message) => (
            <div
              key={message.id}
              style={{
                display: 'flex',
                justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '80%',
                  padding: '0.7rem 0.9rem',
                  borderRadius: 16,
                  background:
                    message.role === 'user'
                      ? 'linear-gradient(135deg, rgba(59,130,246,0.95), rgba(37,99,235,0.95))'
                      : 'rgba(15,23,42,0.9)',
                  color: '#f8fafc',
                  border:
                    message.role === 'user'
                      ? '1px solid rgba(129,140,248,0.9)'
                      : '1px solid rgba(51,65,85,0.9)',
                  lineHeight: 1.5,
                  fontSize: '0.9rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {message.role === 'assistant' && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      marginBottom: '0.35rem',
                      opacity: 0.85,
                    }}
                  >
                    <Bot size={14} />
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      Asistan
                    </span>
                  </div>
                )}
                {message.content}
                {message.attachment && (
                  <div style={{ marginTop: '0.6rem' }}>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => onDownloadAttachment(message.attachment!)}
                      style={{
                        border: '1px solid rgba(148,163,184,0.8)',
                        color: '#e2e8f0',
                        background: 'rgba(15,23,42,0.6)',
                      }}
                    >
                      {message.attachment.filename} indir
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={scrollRef} />
        </div>

        <div
          style={{
            padding: '0.9rem 1.1rem 1.1rem',
            borderTop: '1px solid rgba(30,41,59,0.85)',
            background: 'rgba(2,6,23,0.98)',
          }}
        >
          <div style={{ marginBottom: '0.45rem', fontSize: '0.78rem', color: '#9ca3af' }}>
            Örnek: “9. sınıf matematik, denklemler konusu için 5 orta seviye test sorusu üret,
            her soruyu a-b-c-d şıklı ver.”
          </div>
          <div style={{ marginBottom: '0.6rem' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
              Çıktı formatı:
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[
                { value: 'text' as const, label: 'Metin', icon: FileText },
                { value: 'pdf' as const, label: 'PDF', icon: FileDown },
                { value: 'xlsx' as const, label: 'Excel', icon: FileSpreadsheet },
              ].map(({ value, label, icon: Icon }) => {
                const isActive = format === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onFormatChange(value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.5rem 0.85rem',
                      borderRadius: 12,
                      border: isActive
                        ? '2px solid rgba(99,102,241,0.9)'
                        : '1px solid rgba(148,163,184,0.5)',
                      background: isActive
                        ? 'rgba(99,102,241,0.25)'
                        : 'rgba(15,23,42,0.8)',
                      color: isActive ? '#c7d2fe' : '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <textarea
              value={input}
              onChange={(event) => onInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (input.trim()) onSend();
                }
              }}
              placeholder="Soru isteğini, sınıfı ve konuyu detaylıca yaz..."
              rows={3}
              style={{
                flex: 1,
                borderRadius: 14,
                border: '1px solid rgba(51,65,85,0.95)',
                background: '#020617',
                color: '#e5e7eb',
                padding: '0.7rem 0.8rem',
                resize: 'none',
                fontSize: '0.9rem',
              }}
            />
            <button
              type="button"
              onClick={onSend}
              className="primary-btn"
              disabled={loading || !input.trim()}
              style={{ minWidth: 44, height: 44, borderRadius: 14, alignSelf: 'flex-end' }}
              aria-label="Gönder"
            >
              {loading ? '...' : <Send size={16} />}
            </button>
          </div>
          {error && (
            <div style={{ marginTop: '0.4rem', color: '#fca5a5', fontSize: '0.8rem' }}>
              {error}
            </div>
          )}
          {!error && format !== 'text' && (
            <div style={{ marginTop: '0.4rem', color: '#94a3b8', fontSize: '0.75rem' }}>
              Cevaplar metin içinde gösterilir, ayrıca otomatik olarak {format === 'pdf' ? 'PDF' : 'Excel'} dosyası hazırlanır.
            </div>
          )}
        </div>
      </div>
    )}
  </>
);
void _TeacherAiAssistant;

const TeacherMeetingModal: React.FC<{
  open: boolean;
  onClose: () => void;
  draft: TeacherMeetingDraft;
  onDraftChange: (draft: TeacherMeetingDraft) => void;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
  students: TeacherStudent[];
  /** Öğretmenin girebildiği sınıf seviyeleri */
  allowedGrades: string[];
  /** Öğretmenin atanmış branşları (ders adları) */
  teacherSubjects: string[];
}> = ({
  open,
  onClose,
  draft,
  onDraftChange,
  onSubmit,
  saving,
  error,
  students,
  allowedGrades,
  teacherSubjects,
}) => {
  if (!open) return null;

  // Sınıfları sayısal sıraya göre sırala ve özel durumları ekle
  const sortedGradeOptions = useMemo(() => {
    const numericGrades = allowedGrades
      .filter((g) => g !== 'Mezun' && !isNaN(Number(g)))
      .map((g) => Number(g))
      .sort((a, b) => a - b)
      .map((g) => String(g));
    
    const specialGrades: string[] = [];
    
    // 9, 10, 11, 12 veya Mezun varsa TYT ve AYT ekle
    const hasLise = allowedGrades.some((g) => ['9', '10', '11', '12', 'Mezun'].includes(g));
    if (hasLise) {
      specialGrades.push('TYT', 'AYT');
    }
    
    // 8. sınıf varsa LGS ekle (8 zaten listede olacak, LGS ayrı bir seçenek değil)
    // Mezun varsa ekle
    const otherGrades = allowedGrades.filter((g) => g === 'Mezun');
    
    return [...numericGrades, ...otherGrades, ...specialGrades];
  }, [allowedGrades]);

  const handleFieldChange = <K extends keyof TeacherMeetingDraft>(key: K, value: TeacherMeetingDraft[K]) => {
    onDraftChange({
      ...draft,
      [key]: value,
    });
  };

  const toggleSelectedStudent = (studentId: string) => {
    if (draft.selectedStudentIds.includes(studentId)) {
      handleFieldChange(
        'selectedStudentIds',
        draft.selectedStudentIds.filter((id) => id !== studentId),
      );
    } else {
      handleFieldChange('selectedStudentIds', [...draft.selectedStudentIds, studentId]);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.45)',
        backdropFilter: 'blur(14px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1.5rem',
        zIndex: 80,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '100%',
          background: 'var(--color-surface)',
          borderRadius: 24,
          padding: '1.5rem 1.75rem',
          boxShadow: 'var(--shadow-strong)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          color: 'var(--color-text-main)',
          overflow: 'hidden',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.8rem', opacity: 0.75, textTransform: 'uppercase' }}>
              Canlı ders planla
            </div>
            <h3 style={{ margin: '0.15rem 0 0', fontSize: '1.2rem' }}>Yeni Canlı Ders</h3>
          </div>
          <button
            type="button"
            className="ghost-btn"
            onClick={onClose}
          >
            Kapat
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '0.6rem 0.8rem',
              borderRadius: 12,
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.4)',
              fontSize: '0.85rem',
              color: '#b91c1c',
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
            gap: '1rem',
            alignItems: 'flex-start',
            minWidth: 0,
          }}
          className="teacher-meeting-modal-grid"
        >
          <div
            style={{
              display: 'grid',
              gap: '0.65rem',
            }}
          >
            <input
              type="text"
              placeholder="Ders&Açıklama"
              value={draft.title}
              onChange={(event) => handleFieldChange('title', event.target.value)}
            />
            <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
              Hedef Sınıf:
              <select
                value={draft.targetGrade}
                onChange={(event) => handleFieldChange('targetGrade', event.target.value)}
                style={{ width: '100%', marginTop: '0.2rem' }}
                required
              >
                <option value="">Seçin</option>
                {sortedGradeOptions.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade === 'Mezun' ? 'Mezun' : grade === 'TYT' ? 'TYT' : grade === 'AYT' ? 'AYT' : grade === '8' ? '8. Sınıf (LGS)' : `${grade}. Sınıf`}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
              Ders / Branş:
              <select
                value={draft.subjectName ?? ''}
                onChange={(event) => handleFieldChange('subjectName', event.target.value || undefined)}
                style={{ width: '100%', marginTop: '0.2rem' }}
                disabled={teacherSubjects.length === 0}
              >
                <option value="">Seçin</option>
                {teacherSubjects.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
              Tarih ve saat:
              <input
                type="datetime-local"
                value={draft.scheduledAt}
                onChange={(event) => handleFieldChange('scheduledAt', event.target.value)}
                style={{ width: '100%', marginTop: '0.2rem' }}
              />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Süre (dakika):
              <input
                type="number"
                min={15}
                max={180}
                value={draft.durationMinutes}
                onChange={(event) =>
                  handleFieldChange('durationMinutes', Number(event.target.value) || 0)
                }
                style={{ width: '100%', marginTop: '0.2rem' }}
              />
            </label>
          </div>

          <div
            style={{
              display: 'grid',
              gap: '0.7rem',
              padding: '0.85rem 0.95rem',
              borderRadius: 18,
              background: 'var(--list-row-bg)',
              border: '1px solid var(--list-row-border)',
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.35rem' }}>
                Toplantı türü
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {[
                  { id: 'class', label: 'Sınıf Dersi' },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={draft.type === option.id ? 'primary-btn' : 'ghost-btn'}
                    onClick={() => handleFieldChange('type', option.id as TeacherMeetingType)}
                    style={
                      draft.type === option.id
                        ? undefined
                        : {
                            border: '1px solid rgba(209,213,219,0.9)',
                            background: '#f9fafb',
                            color: '#111827',
                          }
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.35rem' }}>
                Katılımcılar
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.35rem' }}>
                {[
                  { id: 'all', label: 'Tüm öğrenciler' },
                  { id: 'selected', label: 'Seçili öğrenciler' },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={draft.audience === option.id ? 'primary-btn' : 'ghost-btn'}
                    onClick={() => handleFieldChange('audience', option.id as MeetingAudience)}
                    style={
                      draft.audience === option.id
                        ? undefined
                        : {
                            border: '1px solid rgba(209,213,219,0.9)',
                            background: '#f9fafb',
                            color: '#111827',
                          }
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {draft.audience === 'all' && (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Sınıfınızdaki tüm öğrenciler bu derse davet edilecek.
                </div>
              )}
              {draft.audience === 'selected' && (
                <div
                  style={{
                    marginTop: '0.35rem',
                    maxHeight: 180,
                    overflow: 'auto',
                    padding: '0.4rem 0.2rem',
                    borderRadius: 12,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  {students.length === 0 && (
                    <div className="empty-state">Henüz tanımlı öğrenci bulunmuyor.</div>
                  )}
                  {students.map((student) => {
                    const sameGrade = draft.targetGrade ? student.gradeLevel === draft.targetGrade : true;
                    if (!sameGrade) return null;
                    const checked = draft.selectedStudentIds.includes(student.id);
                    return (
                      <label
                        key={student.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.4rem',
                          padding: '0.35rem 0.45rem',
                          borderRadius: 999,
                          cursor: 'pointer',
                          background: checked
                            ? 'rgba(37,99,235,0.15)'
                            : 'transparent',
                        }}
                      >
                        <span style={{ fontSize: '0.85rem' }}>
                          {student.name}{' '}
                          {student.gradeLevel ? `(${student.gradeLevel}. Sınıf)` : ''}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelectedStudent(student.id)}
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: '0.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Bu toplantı, öğrenci ve velilerin takviminde de görünecektir.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="ghost-btn"
              onClick={onClose}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={onSubmit}
              disabled={saving}
            >
              {saving ? 'Kaydediliyor...' : 'Canlı Dersi Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TeacherStudents: React.FC<{
  token: string | null;
  students: TeacherStudent[];
  studentsLoading: boolean;
  selectedStudentId: string;
  onSelectStudent: (value: string) => void;
  messages: (Message & { fromUserName?: string; toUserName?: string })[];
  studentProfile: TeacherStudentProfile | null;
  profileLoading: boolean;
  onMarkMessageRead: (messageId: string) => void;
}> = ({
  token,
  students,
  studentsLoading,
  selectedStudentId,
  onSelectStudent,
  messages: _messages,
  studentProfile,
  profileLoading,
  onMarkMessageRead: _onMarkMessageRead,
}) => {
  const { user } = useAuth();

  type MessageMode = 'none' | 'student';
  type StudentsFilterState = {
    gradeLevel: string;
    subjectId: string;
  };

  const STORAGE_KEY = 'teacher_students_filter_v1';

  const [messageMode, setMessageMode] = useState<MessageMode>('none');
  const [studentMessageText, setStudentMessageText] = useState('');
  const [showAllMessages, setShowAllMessages] = useState(true);

  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [availableSubjects, setAvailableSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);

  const now = Date.now();
  const studentsWithPresence = students.map((s) => {
    const last = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : NaN;
    const isOnline = !Number.isNaN(last) && now - last <= 2 * 60 * 1000;
    return { ...s, isOnline };
  });

  const teacherAssignedGrades = (user?.assignedGrades ?? []).filter(Boolean);
  const teacherSubjectNames = (user?.subjectAreas ?? []).filter(Boolean);

  const isFilterReady = selectedGradeLevel !== '' && selectedSubjectId !== '';

  // LocalStorage'dan filtre yükle
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as StudentsFilterState | null;
      if (!parsed || typeof parsed !== 'object') return;

      const validGrade =
        parsed.gradeLevel && teacherAssignedGrades.includes(parsed.gradeLevel)
          ? parsed.gradeLevel
          : '';
      setSelectedGradeLevel(validGrade);
      if (parsed.subjectId) {
        setSelectedSubjectId(parsed.subjectId);
      }
    } catch {
      // sessizce yut
    }
  }, [teacherAssignedGrades.join(',')]);

  // Sınıf değişince dersleri getir (sadece öğretmenin girdiği dersler)
  useEffect(() => {
    if (!token || !selectedGradeLevel) {
      setAvailableSubjects([]);
      setSubjectsError(null);
      return;
    }
    setSubjectsLoading(true);
    setSubjectsError(null);
    getCurriculumSubjects(token, selectedGradeLevel)
      .then((subjects) => {
        const filtered = subjects.filter((s) =>
          teacherSubjectNames.some(
            (name) => name.toLocaleLowerCase('tr-TR') === s.name.toLocaleLowerCase('tr-TR'),
          ),
        );
        setAvailableSubjects(filtered);
        if (!filtered.some((s) => s.id === selectedSubjectId)) {
          setSelectedSubjectId('');
        }
      })
      .catch((e) => {
        setAvailableSubjects([]);
        setSubjectsError(e instanceof Error ? e.message : 'Dersler yüklenemedi.');
      })
      .finally(() => {
        setSubjectsLoading(false);
      });
  }, [token, selectedGradeLevel, teacherSubjectNames.join(','), selectedSubjectId]);

  // Filtreyi localStorage'a yaz
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const state: StudentsFilterState = {
        gradeLevel: selectedGradeLevel,
        subjectId: selectedSubjectId,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // sessizce yut
    }
  }, [selectedGradeLevel, selectedSubjectId]);

  const filteredStudents = studentsWithPresence.filter((s) => {
    if (!isFilterReady) return false;
    if (selectedGradeLevel && s.gradeLevel !== selectedGradeLevel) return false;
    return true;
  });

  // Seçili öğrenci filtrelenmiş listede yoksa ilkine kay
  useEffect(() => {
    if (!isFilterReady) return;
    if (!selectedStudentId && filteredStudents[0]) {
      onSelectStudent(filteredStudents[0].id);
      return;
    }
    if (selectedStudentId && !filteredStudents.some((s) => s.id === selectedStudentId)) {
      if (filteredStudents[0]) {
        onSelectStudent(filteredStudents[0].id);
      }
    }
  }, [isFilterReady, filteredStudents, selectedStudentId, onSelectStudent]);

  const handleClearFilter = () => {
    setSelectedGradeLevel('');
    setSelectedSubjectId('');
  };

  return (
    <GlassCard
      title="Öğrenci İçgörüleri"
      subtitle="Sınıf ve ders bazlı öğrenci inceleme"
      actions={
        <>
          <button
            type="button"
            className={showAllMessages ? 'primary-btn' : 'ghost-btn'}
            onClick={() => setShowAllMessages((prev) => !prev)}
          >
            <Users size={16} /> Tümü
          </button>
        </>
      }
    >
      {/* Filtre Barı */}
      <div
        className="students-filter-bar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'flex-end',
          marginBottom: '1rem',
        }}
      >
        <div className="students-filter-field students-filter-field--grade">
          <div className="students-filter-label">Sınıf Seçiniz</div>
          <select
            value={selectedGradeLevel}
            onChange={(e) => setSelectedGradeLevel(e.target.value)}
            className="students-filter-select students-filter-select--premium"
          >
            <option value="">
              {teacherAssignedGrades.length === 0 ? 'Yetkili sınıf yok' : 'Sınıf seçiniz'}
            </option>
            {teacherAssignedGrades.map((g) => (
              <option key={g} value={g}>
                {g === 'Mezun' ? 'Mezun Sınıfı' : `${g}. Sınıf`}
              </option>
            ))}
          </select>
        </div>

        <div className="students-filter-field students-filter-field--subject">
          <div className="students-filter-label">Ders Seçiniz</div>
          <select
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            disabled={!selectedGradeLevel || subjectsLoading || availableSubjects.length === 0}
            className="students-filter-select students-filter-select--premium"
            style={{ opacity: !selectedGradeLevel || subjectsLoading ? 0.7 : 1 }}
          >
            {!selectedGradeLevel ? (
              <option value="">Önce sınıf seçiniz</option>
            ) : subjectsLoading ? (
              <option value="">Dersler yükleniyor...</option>
            ) : availableSubjects.length === 0 ? (
              <option value="">Bu sınıf için yetkili ders bulunamadı</option>
            ) : (
              <>
                <option value="">Ders seçiniz</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </>
            )}
          </select>
          {subjectsError && (
            <div style={{ fontSize: '0.75rem', color: '#f97316', marginTop: 2 }}>
              {subjectsError}
            </div>
          )}
        </div>

        <button
          type="button"
          className="ghost-btn"
          onClick={handleClearFilter}
        >
          Filtreyi Temizle
        </button>
      </div>

      {/* Başlangıç boş durumu */}
      {!isFilterReady && (
        <div
          className="empty-state"
          style={{ marginBottom: '0.75rem', borderRadius: 16, padding: '1rem' }}
        >
          Lütfen işlem yapmak için önce <strong>Sınıf</strong> ve <strong>Ders</strong> seçiniz.
        </div>
      )}

      {isFilterReady && (
        <>
          {/* Öğrenci Tablosu */}
          <div style={{ marginBottom: '1rem' }}>
            <div
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-text-muted)',
                marginBottom: '0.45rem',
              }}
            >
              Öğrenci listesi
            </div>
            <div className="students-table-wrapper" style={{ maxHeight: 260, overflow: 'auto' }}>
              {studentsLoading ? (
                <div className="empty-state">Öğrenciler yükleniyor...</div>
              ) : filteredStudents.length === 0 ? (
                <div className="empty-state">
                  Bu kriterlere uygun kayıt bulunamadı.
                </div>
              ) : (
                <table className="students-table">
                  <thead>
                    <tr>
                      <th>Ad Soyad</th>
                      <th>Sınıf</th>
                      <th>Okul Numarası</th>
                      <th>Durum</th>
                      <th>Son Sınav Puanı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((student) => {
                      const isSelected = student.id === selectedStudentId;
                      const schoolNumber = student.id.slice(0, 8);
                      return (
                        <tr
                          key={student.id}
                          className={isSelected ? 'students-table-row--active' : undefined}
                          onClick={() => onSelectStudent(student.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td>{student.name}</td>
                          <td>{student.gradeLevel ? `${student.gradeLevel}. Sınıf` : '—'}</td>
                          <td>{schoolNumber}</td>
                          <td>{student.isOnline ? 'Çevrimiçi' : 'Offline'}</td>
                          <td>—</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Detay kartı + mesaj + sonuçlar */}
          <div style={{ marginBottom: '1.25rem' }}>
            {profileLoading ? (
              <div className="empty-state">Öğrenci verileri yükleniyor...</div>
            ) : !selectedStudentId || !filteredStudents.some((s) => s.id === selectedStudentId) ? (
              <div className="empty-state">
                Listeden bir öğrenci seçtiğinizde detayları burada göreceksiniz.
              </div>
            ) : studentProfile ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                    padding: '1rem',
                    borderRadius: 16,
                    background: 'var(--color-surface-soft)',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  {studentProfile.student.profilePictureUrl ? (
                    <img
                      src={resolveContentUrl(studentProfile.student.profilePictureUrl)}
                      alt={studentProfile.student.name}
                      style={{
                        width: '4rem',
                        height: '4rem',
                        borderRadius: '1rem',
                        objectFit: 'cover',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '4rem',
                        height: '4rem',
                        borderRadius: '1rem',
                        background: 'var(--color-primary)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        fontWeight: 700,
                      }}
                    >
                      {studentProfile.student.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                      {studentProfile.student.name}
                    </h2>
                    <p
                      style={{
                        margin: '0.2rem 0 0',
                        fontSize: '0.9rem',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {studentProfile.student.gradeLevel
                        ? `${studentProfile.student.gradeLevel}. Sınıf`
                        : 'Öğrenci'}{' '}
                      · ID: {studentProfile.student.id.slice(0, 8)}
                    </p>
                  </div>
                </div>
                <div className="metric-grid metric-grid--fixed">
                  <MetricCard
                    label="Çözülen Test"
                    value={`${studentProfile.results.length}`}
                    helper="Toplam deneme"
                    trendLabel="Güncel"
                    trendTone="positive"
                  >
                    <div className="sparkline-bar" />
                  </MetricCard>
                  <MetricCard
                    label="Ortalama Skor"
                    value={
                      studentProfile.results.length
                        ? `${Math.round(
                            studentProfile.results.reduce(
                              (sum, item) => sum + item.scorePercent,
                              0,
                            ) / studentProfile.results.length,
                          )}%`
                        : '%0'
                    }
                    helper="Tüm testler"
                    trendLabel="Ölçüm"
                    trendTone="neutral"
                  >
                    <div className="sparkline-bar" />
                  </MetricCard>
                  <MetricCard
                    label="Doğru / Yanlış"
                    value={`${studentProfile.results.reduce((sum, r) => sum + r.correctCount, 0)} / ${studentProfile.results.reduce((sum, r) => sum + r.incorrectCount, 0)}`}
                    helper="Toplam sorular"
                    trendLabel="Analiz"
                    trendTone="neutral"
                  >
                    <div className="sparkline-bar" />
                  </MetricCard>
                </div>

                {/* Mesaj Gönder */}
                <div
                  style={{
                    marginTop: '1.25rem',
                    marginBottom: '1.25rem',
                    padding: '1.25rem',
                    borderRadius: 12,
                    background: 'var(--color-surface-soft, #f9fafb)',
                    border: '1px solid var(--color-border-subtle)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '1rem',
                    }}
                  >
                    <MessageCircle size={18} style={{ color: 'var(--color-primary)' }} />
                    <span
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        color: 'var(--color-text-main)',
                      }}
                    >
                      Mesaj gönder
                    </span>
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        color: 'var(--color-text-muted)',
                        marginBottom: '0.4rem',
                      }}
                    >
                      Alıcı öğrenci
                    </label>
                    <select
                      value={selectedStudentId}
                      onChange={(e) => onSelectStudent(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.9rem',
                        fontSize: '0.9rem',
                        borderRadius: 8,
                        border: '1px solid var(--color-border-subtle)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-text-main)',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">
                        {filteredStudents.length === 0
                          ? 'Öğrenci bulunamadı'
                          : 'Öğrenci seçin'}
                      </option>
                      {filteredStudents.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.gradeLevel ? ` — ${s.gradeLevel}. Sınıf` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {messageMode === 'none' ? (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setMessageMode('student')}
                        disabled={!selectedStudentId}
                        style={{
                          padding: '0.5rem 1rem',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          borderRadius: 999,
                          border: 'none',
                          cursor: selectedStudentId ? 'pointer' : 'not-allowed',
                          opacity: selectedStudentId ? 1 : 0.5,
                          background: 'var(--color-primary-soft, #dbeafe)',
                          color: 'var(--color-primary)',
                        }}
                      >
                        Öğrenciye Mesaj
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setMessageMode('none');
                            setStudentMessageText('');
                          }}
                          style={{
                            padding: '0.35rem 0.7rem',
                            fontSize: '0.8rem',
                            borderRadius: 6,
                            border: '1px solid var(--color-border-subtle)',
                            background: 'transparent',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Geri
                        </button>
                        <span
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--color-text-muted)',
                            padding: '0.2rem 0.5rem',
                            borderRadius: 4,
                            background: 'var(--color-surface)',
                          }}
                        >
                          Öğrenciye mesaj
                        </span>
                      </div>
                      {messageMode === 'student' && (
                        <>
                          <textarea
                            placeholder="Mesajınızı yazın..."
                            value={studentMessageText}
                            onChange={(e) => setStudentMessageText(e.target.value)}
                            rows={4}
                            style={{
                              width: '100%',
                              padding: '0.75rem 1rem',
                              fontSize: '0.9rem',
                              borderRadius: 10,
                              border: '1px solid var(--color-border-subtle)',
                              background: 'var(--color-surface)',
                              color: 'var(--color-text-main)',
                              resize: 'vertical',
                              minHeight: 100,
                            }}
                          />
                          <button
                            type="button"
                            className="primary-btn"
                            disabled={!selectedStudentId || !studentMessageText.trim() || !token}
                            onClick={async () => {
                              if (!token || !selectedStudentId || !studentMessageText.trim()) return;
                              try {
                                await sendTeacherMessage(token, {
                                  toUserId: selectedStudentId,
                                  text: studentMessageText.trim(),
                                });
                                setStudentMessageText('');
                                setMessageMode('none');
                                // eslint-disable-next-line no-alert
                                alert('Mesaj gönderildi.');
                              } catch (e) {
                                // eslint-disable-next-line no-alert
                                alert(e instanceof Error ? e.message : 'Mesaj gönderilemedi.');
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.4rem',
                              padding: '0.6rem 1.25rem',
                            }}
                          >
                            <Send size={16} /> Gönder
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Test Sonuçları (öğretmenin atadığı testler) */}
                <div style={{ marginTop: '1.25rem' }}>
                  <h3
                    style={{
                      margin: '0 0 0.75rem',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: 'var(--color-text-main)',
                    }}
                  >
                    Test Sonuçları
                  </h3>
                  <div className="list-stack">
                    {studentProfile.results.length === 0 && (
                      <div className="empty-state">Bu öğrenci için test sonucu bulunamadı.</div>
                    )}
                    {studentProfile.results.map((result) => (
                      <div key={result.id} className="list-row">
                        <div>
                          <strong>{result.testId}</strong>
                          <small>
                            {new Date(result.completedAt).toLocaleDateString('tr-TR')} — Skor{' '}
                            {result.scorePercent}%
                          </small>
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: '#64748b',
                              marginTop: '0.2rem',
                            }}
                          >
                            Doğru {result.correctCount} · Yanlış {result.incorrectCount} · Boş{' '}
                            {result.blankCount}
                          </div>
                        </div>
                        <TagChip
                          label={result.scorePercent >= 70 ? 'Başarılı' : 'Takip'}
                          tone={result.scorePercent >= 70 ? 'success' : 'warning'}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sınav Sonuçları (deneme sınavları: TYT, AYT vb.) */}
                <div style={{ marginTop: '1.5rem' }}>
                  <h3
                    style={{
                      margin: '0 0 0.75rem',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: 'var(--color-text-main)',
                    }}
                  >
                    Sınav Sonuçları
                  </h3>
                  <div className="list-stack">
                    {(!studentProfile.examResults || studentProfile.examResults.length === 0) && (
                      <div className="empty-state">Bu öğrenci için sınav sonucu bulunamadı.</div>
                    )}
                    {studentProfile.examResults?.map((er) => (
                      <div key={er.id} className="list-row">
                        <div>
                          <strong>{er.examName}</strong>
                          <small>
                            {new Date(er.examDate).toLocaleDateString('tr-TR')} · {er.examType} —{' '}
                            Puan: {typeof er.score === 'number' ? er.score.toFixed(1) : er.score}{' '}
                            {typeof er.percentile === 'number' ? ` · Dilim: %${er.percentile.toFixed(1)}` : ''}
                          </small>
                          {typeof er.totalNet === 'number' && (
                            <div
                              style={{
                                fontSize: '0.8rem',
                                color: '#64748b',
                                marginTop: '0.2rem',
                              }}
                            >
                              Net: {er.totalNet.toFixed(1)}
                            </div>
                          )}
                        </div>
                        <TagChip
                          label={typeof er.percentile === 'number' && er.percentile >= 50 ? 'İyi' : 'Takip'}
                          tone={typeof er.percentile === 'number' && er.percentile >= 50 ? 'success' : 'warning'}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">
                Bir öğrenci seçerek detaylarını görüntüleyin.
              </div>
            )}
          </div>
        </>
      )}

    </GlassCard>
  );
}
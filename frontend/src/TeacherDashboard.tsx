import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  Bot,
  CalendarCheck,
  ClipboardList,
  FileText,
  FileSpreadsheet,
  FileDown,
  Layers,
  Library,
  MessageCircle,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  X,
  BarChart3,
} from 'lucide-react';
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
  generateTeacherQuestions,
  type TeacherAnnouncement,
  createTeacherAnnouncement,
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
  getStudentPerformanceReport,
  resolveContentUrl,
  type AnnualReportData,
} from './api';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { DashboardLayout, GlassCard, MetricCard, TagChip } from './components/DashboardPrimitives';
import { AnnualPerformanceReport } from './AnnualPerformanceReport';

if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}
import type { BreadcrumbItem, SidebarItem } from './components/DashboardPrimitives';
import { useApiState } from './hooks/useApiState';
import { LiveClassOverlay } from './LiveClassOverlay';
import { QuestionBankTab } from './QuestionBankTab';
import { CoachingTab } from './CoachingTab';
import { ParentOperationsTab } from './ParentOperationsTab';

type TeacherTab =
  | 'overview'
  | 'content'
  | 'live'
  | 'calendar'
  | 'students'
  | 'parents'
  | 'tests'
  | 'questionbank'
  | 'support'
  | 'notifications'
  | 'coaching'
  | 'reports';

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

  const [readingMode, setReadingMode] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('reading_mode') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      document.documentElement.classList.toggle('reading-mode', readingMode);
      window.localStorage.setItem('reading_mode', readingMode ? '1' : '0');
    } catch {
      // ignore
    }
  }, [readingMode]);
  const [contents, setContents] = useState<TeacherContent[]>([]);
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [tests, setTests] = useState<TeacherTest[]>([]);
  const [testAssets, setTestAssets] = useState<TeacherTestAsset[]>([]);
  const [meetings, setMeetings] = useState<TeacherMeeting[]>([]);
  const [studentMessages, setStudentMessages] = useState<Message[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentProfile, setSelectedStudentProfile] = useState<TeacherStudentProfile | null>(null);
  const [studentProfileLoading, setStudentProfileLoading] = useState(false);
  const [reportData, setReportData] = useState<AnnualReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
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
    title: '',
    message: '',
    scheduledDate: '',
  });
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementCreating, setAnnouncementCreating] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );
  const [aiOpen, setAiOpen] = useState(false);
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
  const [aiError, setAiError] = useState<string | null>(null);
  const aiScrollRef = useRef<HTMLDivElement | null>(null);
  const aiTestCardRef = useRef<HTMLDivElement | null>(null);
  const [aiFormat, setAiFormat] = useState<'text' | 'pdf' | 'xlsx'>('text');
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

  useEffect(() => {
    const tab = searchParams.get('tab');
    const notificationId = searchParams.get('notificationId');
    if (tab === 'notifications') {
      setActiveTab('notifications');
      if (notificationId) setActiveNotificationId(notificationId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleReloadNotifications = async () => {
    if (!token) return;
    try {
      setNotificationsLoading(true);
      setNotificationsError(null);
      const data = await getTeacherNotifications(token, 10);
      setNotifications(data);
      // Eğer aktif bildirim yoksa, en üstteki bildirimi seçili yap
      if (!activeNotificationId && data.length > 0) {
        setActiveNotificationId(data[0].id);
      }
    } catch (e) {
      setNotificationsError((e as Error).message);
    } finally {
      setNotificationsLoading(false);
    }
  };

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
        const data = await getTeacherStudents(token);
        if (cancelled) return;
        setStudents(data);
        if (!selectedStudentId && data[0]) {
          setSelectedStudentId(data[0].id);
        }
      } catch {
        // sessizce yut
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
  }, [token, selectedStudentId]);

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
    if (!token || !selectedStudentId || activeTab !== 'reports') {
      setReportData(null);
      return;
    }
    setReportLoading(true);
    getStudentPerformanceReport(token, selectedStudentId)
      .then(setReportData)
      .catch(() => setReportData(null))
      .finally(() => setReportLoading(false));
  }, [token, selectedStudentId, activeTab]);

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
        label: 'Ortalama Skor',
        value: `${summary?.averageScoreLast7Days ?? 0}%`,
        helper: 'Son 7 gün',
        trendLabel: 'Güncel',
        trendTone: 'positive' as const,
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
    const title = announcementDraft.title.trim();
    const message = announcementDraft.message.trim();
    if (!title || !message) {
      setAnnouncementError('Lütfen duyuru başlığı ve mesajı girin.');
      return;
    }
    setAnnouncementCreating(true);
    setAnnouncementError(null);
    try {
      const created = await createTeacherAnnouncement(token, {
        title,
        message,
        scheduledDate: announcementDraft.scheduledDate || undefined,
      });
      setAnnouncements((prev) => [created, ...prev]);
      setAnnouncementDraft({ title: '', message: '', scheduledDate: '' });
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

  const handleAiSend = async () => {
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

  const handleDownloadAttachment = (attachment: NonNullable<AiMessage['attachment']>) => {
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
        id: 'content',
        label: 'Ders İçeriği',
        icon: <BookOpen size={18} />,
        description: 'Kaynaklar',
        active: activeTab === 'content',
        onClick: () => setActiveTab('content'),
      },
      {
        id: 'live',
        label: 'Canlı Ders',
        icon: <Video size={18} />,
        description: 'Ders yayınları',
        active: activeTab === 'live',
        onClick: () => setActiveTab('live'),
      },
      {
        id: 'tests',
        label: 'Test & Sorular',
        icon: <ClipboardList size={18} />,
        description: 'Soru yükle',
        active: activeTab === 'tests',
        onClick: () => setActiveTab('tests'),
      },
      {
        id: 'questionbank',
        label: 'Soru Bankası',
        icon: <Library size={18} />,
        description: 'AI soru üret',
        active: activeTab === 'questionbank',
        onClick: () => setActiveTab('questionbank'),
      },
      {
        id: 'support',
        label: 'Yardım Talepleri',
        icon: <MessageCircle size={18} />,
        description: 'Soru çöz',
        active: activeTab === 'support',
        onClick: () => setActiveTab('support'),
      },
      {
        id: 'notifications',
        label: 'Bildirimler',
        icon: <Bell size={18} />,
        description: 'Mesaj & uyarı',
        active: activeTab === 'notifications',
        onClick: () => setActiveTab('notifications'),
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
      {
        id: 'coaching',
        label: 'Koçluk',
        icon: <TrendingUp size={18} />,
        description: 'Koçluk takip',
        active: activeTab === 'coaching',
        onClick: () => setActiveTab('coaching'),
      },
      {
        id: 'reports',
        label: 'Rapor',
        icon: <BarChart3 size={18} />,
        description: 'Yıllık gelişim',
        active: activeTab === 'reports',
        onClick: () => setActiveTab('reports'),
      },
    ],
    [activeTab],
  );

  const teacherBreadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const tabLabels: Record<string, string> = {
      overview: 'Genel Bakış',
      content: 'Ders İçeriği',
      live: 'Canlı Ders',
      tests: 'Test & Sorular',
      questionbank: 'Soru Bankası',
      support: 'Yardım Talepleri',
      notifications: 'Bildirimler',
      calendar: 'Takvim & Etüt',
      students: 'Öğrenciler',
      parents: 'Veli İşlemleri',
      coaching: 'Koçluk Takip',
      reports: 'Yıllık Rapor',
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
      brand="SKYTECH"
      tagline={user?.name ?? 'Öğretmen'}
      title="Öğretmen Yönetim Paneli"
      subtitle="Gerçek zamanlı içerik, takvim ve öğrenci verileri."
      status={{ label: `${dashboardState.data?.recentActivity?.length ?? 0} aktivite`, tone: 'warning' }}
      breadcrumbs={teacherBreadcrumbs}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'ÖĞ',
        name: user?.name ?? 'Öğretmen',
        subtitle: 'Öğretmen',
      }}
      headerActions={
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            className="ghost-btn"
            aria-label={readingMode ? 'Okuma modunu kapat' : 'Okuma modunu aç'}
            onClick={() => setReadingMode((p) => !p)}
            style={{
              border: readingMode ? '1px solid rgba(99,102,241,0.9)' : undefined,
              background: readingMode ? 'rgba(99,102,241,0.15)' : undefined,
            }}
          >
            <BookOpen size={16} />
          </button>
          <button
            type="button"
            className="ghost-btn"
            aria-label="Bildirimler"
            onClick={() => {
              setActiveTab('notifications');
              handleReloadNotifications().catch(() => {});
              handleReloadUnreadCount().catch(() => {});
            }}
            style={{ position: 'relative' }}
          >
            <Bell size={16} />
            {unreadNotificationCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 4,
                  minWidth: 14,
                  height: 14,
                  borderRadius: 999,
                  background: 'var(--color-danger, #ef4444)',
                  color: '#fff',
                  fontSize: '0.6rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                }}
              >
                {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
              </span>
            )}
          </button>
        </div>
      }
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
          activities={dashboardState.data?.recentActivity ?? []}
          meetings={meetings}
          onStartLive={handleStartLiveMeeting}
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
          onCreateMeeting={openMeetingModal}
          onEditMeeting={handleEditMeeting}
          onDeleteMeeting={handleDeleteMeeting}
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
      {activeTab === 'questionbank' && token && (
        <QuestionBankTab token={token} />
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
        />
      )}
      {activeTab === 'students' && (
        <TeacherStudents
          token={token}
          students={students}
          selectedStudentId={selectedStudentId}
          onSelectStudent={setSelectedStudentId}
          assignments={assignmentsState.data ?? []}
          messages={studentMessages}
          studentProfile={selectedStudentProfile}
          profileLoading={studentProfileLoading}
          onMarkMessageRead={handleMarkMessageRead}
          onOpenCoaching={() => setActiveTab('coaching')}
        />
      )}
      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <GlassCard title="Rapor Görüntüleme" subtitle="Öğrenci karnesini seçin">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                style={{
                  padding: '0.6rem 1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-main)',
                  minWidth: '240px',
                  fontSize: '0.9rem',
                }}
              >
                <option value="">{students.length === 0 ? 'Öğrenci bulunamadı' : 'Bir öğrenci seçin...'}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.gradeLevel ? `(${s.gradeLevel}. Sınıf)` : ''}
                  </option>
                ))}
              </select>
              
              {!selectedStudentId && (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                  Lütfen yukarıdan bir öğrenci seçiniz.
                </div>
              )}
            </div>
          </GlassCard>

          {reportLoading ? (
            <div className="glass-card p-8 flex items-center justify-center text-muted">
              <span className="animate-pulse">Rapor hazırlanıyor, lütfen bekleyin...</span>
            </div>
          ) : selectedStudent ? (
            <AnnualPerformanceReport
              reportData={reportData}
            />
          ) : (
            <div className="empty-state">Raporunu görüntülemek istediğiniz öğrenciyi seçin.</div>
          )}
        </div>
      )}
      {(activeTab === 'tests' || activeTab === 'questionbank') && (
        <TeacherAiAssistant
          open={aiOpen}
          onToggle={() => setAiOpen((prev) => !prev)}
          onClose={() => setAiOpen(false)}
          messages={aiMessages}
          input={aiInput}
          onInputChange={setAiInput}
          onSend={handleAiSend}
          loading={aiLoading}
          error={aiError}
          scrollRef={aiScrollRef}
          format={aiFormat}
          onFormatChange={setAiFormat}
          onDownloadAttachment={handleDownloadAttachment}
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
  onTestsChanged: () => void;
  onTestAssetsChanged: () => void;
  onAssignmentCreated: () => void;
}> = ({ aiTestCardRef, token, students, tests, testAssets, onTestsChanged: _onTestsChanged, onTestAssetsChanged, onAssignmentCreated }) => {
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
  const [aiGenFormat, setAiGenFormat] = useState<'metin' | 'pdf' | 'xlsx'>('metin');
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
  const [aiGenAttachment, setAiGenAttachment] = useState<{ filename: string; mimeType: string; data: string } | null>(null);
  const [aiGenAnswerKey, setAiGenAnswerKey] = useState<Record<string, string> | null>(null);
  const [aiGenSavingAsTest, setAiGenSavingAsTest] = useState(false);
  const parsedAiQuestions = useMemo(
    () => parseAiGeneratedQuestions(aiGenResult),
    [aiGenResult],
  );

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
    if (!token || !aiGenTopic.trim()) return;
    if (aiTestCardRef.current) {
      try {
        aiTestCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        // scrollIntoView desteklenmiyorsa sessizce yoksay
      }
    }
    setAiGenLoading(true);
    setAiGenResult(null);
    setAiGenAttachment(null);
    setAiGenAnswerKey(null);
    try {
      const res = await generateTeacherQuestions(token, {
        topic: aiGenTopic.trim(),
        gradeLevel: `${aiGenGrade}. Sınıf`,
        count: aiGenCount,
        difficulty: aiGenDifficulty,
        format: aiGenFormat,
      });
      setAiGenResult(res.questions);
      if (res.attachment) {
        setAiGenAttachment(res.attachment);
      }
      if (res.answerKey && Object.keys(res.answerKey).length > 0) {
        setAiGenAnswerKey(res.answerKey);
      }
    } catch (e) {
      setAiGenResult(e instanceof Error ? e.message : 'Soru üretilemedi.');
    } finally {
      setAiGenLoading(false);
    }
  };

  const handleSaveAiAsTest = async () => {
    if (!token || !aiGenAttachment || !aiGenAnswerKey) return;
    setAiGenSavingAsTest(true);
    try {
      const blob = new Blob(
        [Uint8Array.from(atob(aiGenAttachment.data), (c) => c.charCodeAt(0))],
        { type: aiGenAttachment.mimeType },
      );
      const file = new File([blob], aiGenAttachment.filename, { type: aiGenAttachment.mimeType });
      const uploaded = await uploadTeacherTestAssetFile(token, file);
      await createTeacherTestAsset(token, {
        title: `${aiGenTopic.trim()} - AI`,
        subjectId: assetDraft.subjectId,
        topic: aiGenTopic.trim(),
        gradeLevel: assetDraft.gradeLevel,
        fileUrl: uploaded.url,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        answerKeyJson: JSON.stringify(aiGenAnswerKey),
      });
      onTestAssetsChanged();
      setAiGenAttachment(null);
      setAiGenAnswerKey(null);
      // eslint-disable-next-line no-alert
      alert('Test dosyası kaydedildi. Artık ödev olarak atayabilirsiniz.');
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setAiGenSavingAsTest(false);
    }
  };

  const downloadAiGenAttachment = () => {
    if (!aiGenAttachment) return;
    const blob = new Blob(
      [Uint8Array.from(atob(aiGenAttachment.data), (c) => c.charCodeAt(0))],
      { type: aiGenAttachment.mimeType },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = aiGenAttachment.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="dual-grid">
      <div style={{ display: 'grid', gap: '1rem' }}>
        <GlassCard
          title="AI ile Otomatik Soru Üretimi"
          subtitle="Konu ve kriterlere göre test soruları oluştur"
        >
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
            <select value={aiGenFormat} onChange={(e) => setAiGenFormat(e.target.value as 'metin' | 'pdf' | 'xlsx')}>
              <option value="metin">Metin</option>
              <option value="pdf">PDF İndir</option>
              <option value="xlsx">Excel İndir</option>
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
              {aiGenAttachment && (
                <div style={{ marginBottom: '0.6rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="primary-btn" onClick={downloadAiGenAttachment}>
                    {aiGenAttachment.filename.endsWith('.pdf') ? 'PDF İndir' : 'Excel İndir'}
                  </button>
                  {aiGenAttachment.filename.endsWith('.pdf') && aiGenAnswerKey && Object.keys(aiGenAnswerKey).length > 0 && (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={handleSaveAiAsTest}
                      disabled={aiGenSavingAsTest}
                      style={{ border: '1px solid rgba(34,197,94,0.9)', color: '#4ade80' }}
                    >
                      {aiGenSavingAsTest ? 'Kaydediliyor...' : 'Test Olarak Kaydet'}
                    </button>
                  )}
                </div>
              )}
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
        </GlassCard>
        <GlassCard title="Test Dosyası Yükle" subtitle="PDF gibi bir dosyayı test olarak ekleyin">
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            <input
              type="text"
              placeholder="Test başlığı"
              value={assetDraft.title}
              onChange={(e) => setAssetDraft((p) => ({ ...p, title: e.target.value }))}
            />
            <select
              value={assetDraft.subjectId}
              onChange={(e) => setAssetDraft((p) => ({ ...p, subjectId: e.target.value }))}
            >
              <option value="sub1">Matematik</option>
              <option value="sub2">Fizik</option>
              <option value="sub3">Biyoloji</option>
              <option value="sub4">Kimya</option>
            </select>
            <input
              type="text"
              placeholder="Konu"
              value={assetDraft.topic}
              onChange={(e) => setAssetDraft((p) => ({ ...p, topic: e.target.value }))}
            />
            <select
              value={assetDraft.gradeLevel}
              onChange={(e) => setAssetDraft((p) => ({ ...p, gradeLevel: e.target.value }))}
            >
              <option value="9">9. Sınıf</option>
              <option value="10">10. Sınıf</option>
              <option value="11">11. Sınıf</option>
              <option value="12">12. Sınıf</option>
            </select>

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
        </GlassCard>

        <GlassCard title="Öğrenciye Test Ata" subtitle="Öğrenciye özel test + süre belirleyin">
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
        </GlassCard>

        <GlassCard title="Yüklenen Test Dosyaları" subtitle="Kayıtlar">
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
        </GlassCard>
      </div>
    </div>
  );
};

const TeacherOverview: React.FC<{
  metrics: Array<{ label: string; value: string; helper?: string; trendLabel?: string; trendTone?: 'positive' | 'neutral' }>;
  activities: string[];
  meetings: TeacherMeeting[];
  onStartLive: (meetingId: string) => void;
}> = ({ metrics, activities, meetings, onStartLive }) => {
  const now = Date.now();
  const upcomingMeetings = meetings
    .filter((meeting) => canTeacherStartMeeting(meeting.scheduledAt, now))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 3);

  const visibleMeetings = upcomingMeetings;

  return (
    <>
    <div className="metric-grid">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} {...metric}>
          <div className="sparkline-bar" />
        </MetricCard>
      ))}
    </div>

    <div className="dual-grid">
      <GlassCard
        title="Sıradaki Görevler"
        subtitle="Yaklaşan toplantılar"
      >
        <div className="list-stack">
          {visibleMeetings.map((meeting) => (
            <div className="list-row" key={meeting.id}>
              <div>
                <strong>{meeting.title}</strong>
                <small>
                  {formatShortDate(meeting.scheduledAt)} · {formatTime(meeting.scheduledAt)}
                </small>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                <TagChip label="Toplantı" tone="success" />
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => onStartLive(meeting.id)}
                  disabled={!canTeacherStartMeeting(meeting.scheduledAt, now)}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.7rem' }}
                  title={
                    !canTeacherStartMeeting(meeting.scheduledAt, now)
                      ? 'Seans başlatma süresi geçti. Yeni seans oluşturun.'
                      : undefined
                  }
                >
                  Canlıyı Başlat
                </button>
              </div>
            </div>
          ))}
          {visibleMeetings.length === 0 && (
            <div className="empty-state">
              Henüz planlı canlı ders yok. Yukarıdan yeni bir ders oluşturabilirsiniz.
            </div>
          )}
        </div>
      </GlassCard>

      <GlassCard title="Son Aktiviteler" subtitle="Güncel hareketler">
        <div className="list-stack">
          {activities.slice(0, 4).map((activity, idx) => (
            <div className="list-row" key={`${activity}-${idx}`}>
              <div>
                {(() => {
                  const match = activity.match(
                    /^Öğrenci\s+(.+?)\s+(\d+)%\s+skorla\s+"(.+)"\s+testini\s+tamamladı$/i,
                  );
                  if (!match) {
                    return (
                      <>
                        <strong>{activity}</strong>
                        <small>Son 7 gün</small>
                      </>
                    );
                  }

                  const studentNameRaw = (match[1] ?? '').trim();
                  const studentName = studentNameRaw.replace(/\s+Öğrenci$/i, '').trim();
                  const score = (match[2] ?? '').trim();
                  const testTitle = (match[3] ?? '').trim();

                  return (
                    <>
                      <strong style={{ display: 'block' }}>{studentName || 'Öğrenci'}</strong>
                      <small style={{ display: 'block' }}>
                        %{score} · {testTitle}
                      </small>
                      <small style={{ display: 'block', marginTop: '0.2rem' }}>Son 7 gün</small>
                    </>
                  );
                })()}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  height: '100%',
                  flexShrink: 0,
                }}
              >
                <TagChip label="Güncel" tone="success" />
              </div>
            </div>
          ))}
          {activities.length === 0 && <div className="empty-state">Aktivite yok.</div>}
        </div>
      </GlassCard>
    </div>
  </>
  );
};

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
}) => (
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
              <option value="">Sınıf seçin</option>
              <option value="4">4. Sınıf</option>
              <option value="5">5. Sınıf</option>
              <option value="6">6. Sınıf</option>
              <option value="7">7. Sınıf</option>
              <option value="8">8. Sınıf (LGS)</option>
              <option value="9">9. Sınıf</option>
              <option value="10">10. Sınıf</option>
              <option value="11">11. Sınıf</option>
              <option value="12">12. Sınıf</option>
              <option value="TYT">TYT</option>
              <option value="AYT">AYT</option>
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
            ) : curriculumSubjects.length > 0 ? (
              <>
                 {curriculumSubjects.map((sub) => (
                   <option key={sub.id} value={sub.id}>
                     {sub.name}
                   </option>
                 ))}
                 {/* Fallback veya ek seçenekler istenirse buraya eklenebilir */}
              </>
            ) : (
              <>
                <option value="sub_matematik">Matematik</option>
                <option value="sub_fizik">Fizik</option>
                <option value="sub_biyoloji">Biyoloji</option>
                <option value="sub_kimya">Kimya</option>
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

const TeacherCalendar: React.FC<{
  events: CalendarEvent[];
  onCreateMeeting: () => void;
  onEditMeeting: (meetingId: string) => void;
  onDeleteMeeting: (meetingId: string) => void;
  announcements: TeacherAnnouncement[];
  announcementDraft: { title: string; message: string; scheduledDate: string };
  onAnnouncementDraftChange: (draft: { title: string; message: string; scheduledDate: string }) => void;
  onCreateAnnouncement: () => void;
  announcementOpen: boolean;
  onToggleAnnouncement: (value: boolean) => void;
  creatingAnnouncement: boolean;
  announcementError: string | null;
}> = ({
  events,
  onCreateMeeting: _onCreateMeeting,
  onEditMeeting,
  onDeleteMeeting,
  announcements,
  announcementDraft,
  onAnnouncementDraftChange,
  onCreateAnnouncement,
  announcementOpen,
  onToggleAnnouncement,
  creatingAnnouncement,
  announcementError,
}) => {
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
    <>
    <GlassCard title="Haftalık Takvim" subtitle="Etkinlikler">
      {events.length === 0 ? (
        <div className="empty-state">Takvim verisi bulunamadı.</div>
      ) : (
        <div className="calendar-grid calendar-modern">
          {sortedDays.map((day) => (
            <div key={day} className="calendar-day">
              <div className="calendar-day-header">{day}</div>
              <div className="calendar-day-events">
                {byDay[day].map((event) => {
                  const isMeeting = (event.type || '').toLowerCase() === 'meeting';
                  const meetingId = event.relatedId;

                  return (
                    <div key={event.id} className="calendar-event">
                      <span className="calendar-event-icon">{getEventIcon(event)}</span>
                      <span className="calendar-event-title">{event.title}</span>
                      {event.startDate && (
                        <span className="calendar-event-time">{formatTime(event.startDate)}</span>
                      )}
                      {isMeeting && meetingId && (
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            className="ghost-btn"
                            style={{
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.75rem',
                            }}
                            onClick={() => onEditMeeting(meetingId)}
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            className="ghost-btn"
                            style={{
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.75rem',
                              borderColor: 'rgba(248,113,113,0.7)',
                              color: '#b91c1c',
                            }}
                            onClick={() => onDeleteMeeting(meetingId)}
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
    </GlassCard>

    <GlassCard
      title="Hızlı Aksiyonlar"
      subtitle="Duyuru ve toplantı"
      actions={
        <>
          <button
            type="button"
            className={announcementOpen ? 'primary-btn' : 'ghost-btn'}
            onClick={() => onToggleAnnouncement(!announcementOpen)}
          >
            <Layers size={16} /> Duyuru Oluştur
          </button>
        </>
      }
    >
      {announcementOpen && (
        <div
          style={{
            border: '1px solid rgba(148,163,184,0.4)',
            borderRadius: 16,
            padding: '0.9rem 1rem',
            background: 'rgba(15,23,42,0.03)',
            marginBottom: '1rem',
            display: 'grid',
            gap: '0.6rem',
          }}
        >
          <input
            type="text"
            placeholder="Duyuru başlığı"
            value={announcementDraft.title}
            onChange={(event) =>
              onAnnouncementDraftChange({ ...announcementDraft, title: event.target.value })
            }
          />
          <textarea
            placeholder="Duyuru mesajı"
            value={announcementDraft.message}
            onChange={(event) =>
              onAnnouncementDraftChange({ ...announcementDraft, message: event.target.value })
            }
            rows={3}
            style={{ resize: 'vertical' }}
          />
          <label style={{ fontSize: '0.8rem', color: '#475569' }}>
            Planlanan tarih (isteğe bağlı):
            <input
              type="datetime-local"
              style={{ width: '100%', marginTop: '0.2rem' }}
              value={announcementDraft.scheduledDate}
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
      <div className="list-stack">
        {announcements.length === 0 && <div className="empty-state">Henüz duyuru yok.</div>}
        {announcements.slice(0, 4).map((announcement) => (
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
    </GlassCard>
  </>
  );
};

const TeacherAiAssistant: React.FC<{
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
          }}
        >
          <div
            style={{
              display: 'grid',
              gap: '0.65rem',
            }}
          >
            <input
              type="text"
              placeholder="Ders başlığı (örn. Denklemler Tekrar Dersi)"
              value={draft.title}
              onChange={(event) => handleFieldChange('title', event.target.value)}
            />
            <textarea
              placeholder="Açıklama (konu, kazanımlar, beklentiler)"
              value={draft.description}
              onChange={(event) => handleFieldChange('description', event.target.value)}
              rows={3}
              style={{ resize: 'vertical' }}
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
                {allowedGrades.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade === 'Mezun' ? 'Mezun' : `${grade}. Sınıf`}
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
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.35rem' }}>
                Toplantı türü
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {[
                  { id: 'class', label: 'Sınıf Dersi' },
                  { id: 'teacher_student', label: 'Birebir Öğrenci' },
                  { id: 'teacher_student_parent', label: 'Öğrenci + Veli' },
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

            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.35rem' }}>
                Katılımcılar
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.35rem' }}>
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
  selectedStudentId: string;
  onSelectStudent: (value: string) => void;
  assignments: Array<{ id: string; title?: string; dueDate?: string }>;
  messages: (Message & { fromUserName?: string; toUserName?: string })[];
  studentProfile: TeacherStudentProfile | null;
  profileLoading: boolean;
  onMarkMessageRead: (messageId: string) => void;
  onOpenCoaching: () => void;
}> = ({
  token,
  students,
  selectedStudentId,
  onSelectStudent,
  assignments,
  messages: _messages,
  studentProfile,
  profileLoading,
  onMarkMessageRead: _onMarkMessageRead,
  onOpenCoaching,
}) => {
  type MessageMode = 'none' | 'student';
  const [messageMode, setMessageMode] = useState<MessageMode>('none');
  const [studentMessageText, setStudentMessageText] = useState('');
  const [showAllMessages, setShowAllMessages] = useState(true);
  const now = Date.now();
  const studentsWithPresence = students.map((s) => {
    const last = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : NaN;
    const isOnline = !Number.isNaN(last) && now - last <= 2 * 60 * 1000;
    return { ...s, isOnline };
  });

  return (
    <GlassCard
      title="Öğrenci İçgörüleri"
      subtitle="Mesajlar, görevler ve koçluk"
      actions={
        <>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setShowAllMessages((prev) => !prev)}
            style={{
              background: showAllMessages ? 'var(--color-surface-strong)' : 'transparent',
              color: showAllMessages ? 'var(--color-text-main)' : 'var(--color-text-muted)',
            }}
          >
            <Users size={16} /> Tümü
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={onOpenCoaching}
          >
            Koçluk Paneli
          </button>
        </>
      }
    >
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.45rem' }}>
          Aktiflik
        </div>
        <div className="list-stack" style={{ maxHeight: 240, overflow: 'auto' }}>
          {studentsWithPresence.length === 0 && <div className="empty-state">Öğrenci bulunamadı.</div>}
          {studentsWithPresence.map((student) => (
            <button
              key={student.id}
              type="button"
              className="list-row"
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                background: student.id === selectedStudentId ? 'var(--color-surface-strong)' : undefined,
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
              onClick={() => onSelectStudent(student.id)}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                {student.profilePictureUrl ? (
                  <img
                    src={resolveContentUrl(student.profilePictureUrl)}
                    alt={student.name}
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid var(--color-border-subtle)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '50%',
                      background: 'var(--color-primary-soft)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                    }}
                  >
                    {student.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                {student.isOnline && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: '0.75rem',
                      height: '0.75rem',
                      borderRadius: '50%',
                      background: '#22c55e',
                      border: '2px solid var(--color-surface)',
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <strong
                  style={{
                    display: 'block',
                    color: 'var(--color-text-main)',
                  }}
                >
                  {student.name} {student.gradeLevel ? `(${student.gradeLevel}. Sınıf)` : ''}
                </strong>
                <small
                  style={{
                    display: 'block',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {student.isOnline
                    ? 'Çevrimiçi'
                    : student.lastSeenAt
                      ? `Son görülme: ${new Date(student.lastSeenAt).toLocaleString('tr-TR')}`
                      : 'Son görülme: -'}
                </small>
              </div>
              <TagChip label={student.isOnline ? 'Online' : 'Offline'} tone={student.isOnline ? 'success' : 'warning'} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        {profileLoading ? (
          <div className="empty-state">Öğrenci verileri yükleniyor...</div>
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
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
                  {studentProfile.student.gradeLevel ? `${studentProfile.student.gradeLevel}. Sınıf` : 'Öğrenci'} · ID: {studentProfile.student.id.slice(0, 8)}
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
                        studentProfile.results.reduce((sum, item) => sum + item.scorePercent, 0) /
                          studentProfile.results.length,
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

            {/* Mesaj Gönder - test sonuçlarının üzerinde (sadece öğrenci) */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <MessageCircle size={18} style={{ color: 'var(--color-primary)' }} />
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-main)' }}>
                  Mesaj gönder
                </span>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-text-muted)', marginBottom: '0.4rem' }}>
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
                  <option value="">{students.length === 0 ? 'Öğrenci bulunamadı' : 'Öğrenci seçin'}</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} {s.gradeLevel ? ` — ${s.gradeLevel}. Sınıf` : ''}</option>
                  ))}
                </select>
              </div>
              {messageMode === 'none' ? (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setMessageMode('student')}
                    disabled={!selectedStudentId}
                    style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, borderRadius: 999, border: 'none', cursor: selectedStudentId ? 'pointer' : 'not-allowed', opacity: selectedStudentId ? 1 : 0.5, background: 'var(--color-primary-soft, #dbeafe)', color: 'var(--color-primary)' }}
                  >
                    Öğrenciye Mesaj
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => { setMessageMode('none'); setStudentMessageText(''); }}
                      style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem', borderRadius: 6, border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      <ArrowRight size={14} style={{ transform: 'rotate(180deg)' }} /> Geri
                    </button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', padding: '0.2rem 0.5rem', borderRadius: 4, background: 'var(--color-surface)' }}>
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
                        style={{ width: '100%', padding: '0.75rem 1rem', fontSize: '0.9rem', borderRadius: 10, border: '1px solid var(--color-border-subtle)', background: 'var(--color-surface)', color: 'var(--color-text-main)', resize: 'vertical', minHeight: 100 }}
                      />
                      <button
                        type="button"
                        className="primary-btn"
                        disabled={!selectedStudentId || !studentMessageText.trim() || !token}
                        onClick={async () => {
                          if (!token || !selectedStudentId || !studentMessageText.trim()) return;
                          try {
                            await sendTeacherMessage(token, { toUserId: selectedStudentId, text: studentMessageText.trim() });
                            setStudentMessageText('');
                            setMessageMode('none');
                            alert('Mesaj gönderildi.');
                          } catch (e) {
                            alert(e instanceof Error ? e.message : 'Mesaj gönderilemedi.');
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.6rem 1.25rem' }}
                      >
                        <Send size={16} /> Gönder
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="list-stack" style={{ marginTop: '1rem' }}>
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
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
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
          </>
        ) : (
          <div className="empty-state">Öğrenci seçildiğinde performans burada görünecek.</div>
        )}
      </div>

      {/* Bildirimler artık ayrı 'Bildirimler' sekmesinde; burada mesaj listesi gösterilmiyor */}
      <div className="list-stack">
        {assignments.slice(0, 4).map((assignment) => (
          <div className="list-row" key={assignment.id}>
            <div>
              <strong>{assignment.title ?? 'Görev'}</strong>
              <small>Son teslim: {formatShortDate(assignment.dueDate)}</small>
            </div>
            <span className="progress-pill">
              Risk <ArrowRight size={14} />
            </span>
          </div>
        ))}
        {assignments.length === 0 && <div className="empty-state">Görev bulunamadı.</div>}
      </div>
    </GlassCard>
  );
}
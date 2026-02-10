import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Award, Bell, BookOpen, Calendar, CalendarCheck, CheckCircle, ClipboardList, FileText, ListChecks, Maximize2, Minimize2, Target, Video, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import {
  apiRequest,
  getApiBaseUrl,
  getStudentAssignments,
  getStudentAssignmentDetail,
  getStudentCalendar,
  getStudentContents,
  getStudentDashboard,
  getStudentMeetings,
  getStudentProgressCharts,
  getStudentProgressTopics,
  getStudentTodos,
  createStudentTodo,
  updateStudentTodo,
  deleteStudentTodo,
  submitStudentAssignment,
  completeStudentAssignment,
  createStudentHelpRequest,
  getStudentHelpRequest,
  getStudentTeachers,
  createStudentComplaint,
  watchStudentContent,
  joinStudentLiveMeeting,
  markStudentHelpResponsePlayed,
  getStudentCoachingSessions,
  getStudentTestFeedback,
  getStudentBadges,
  recordFocusSession,
  type CalendarEvent,
  type ProgressCharts,
  type ProgressOverview,
  type StudentAssignment,
  type StudentContent,
  type StudentDashboardSummary,
  type StudentMeeting,
  type StudentTodo,
  type Question,
  type StudentAssignmentDetail,
  type TeacherListItem,
  type StudentCoachingSession,
  type StudentBadgeProgress,
} from './api';
import { Breadcrumb, DashboardLayout, GlassCard, MetricCard, TagChip } from './components/DashboardPrimitives';
import type { BreadcrumbItem, SidebarItem } from './components/DashboardPrimitives';
import { useApiState } from './hooks/useApiState';
import { StudentPlanner, type PlannerCreatePayload } from './components/StudentPlanner.tsx';
import { DrawingCanvas } from './DrawingCanvas';
import { LiveClassOverlay } from './LiveClassOverlay';
import { PdfTestOverlay, type PdfTestAssignment } from './PdfTestOverlay';
import { useSearchParams } from 'react-router-dom';
import { StudentQuestionBankTab } from './StudentQuestionBankTab';
import { StudentBadgesTab } from './StudentBadges';
import { FocusZone } from './components/FocusZone';

type StudentTab =
  | 'overview'
  | 'assignments'
  | 'planner'
  | 'grades'
  | 'coursenotes'
  | 'pomodoro'
  | 'questionbank'
  | 'badges'
  | 'liveclasses'
  | 'coaching'
  | 'notifications'
  | 'complaints';
type AssignmentStatus = 'todo' | 'in-progress' | 'done' | 'overdue';

const sortMeetingsByDate = (items: StudentMeeting[]): StudentMeeting[] =>
  [...items].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

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

const formatCountdown = (totalSeconds: number) => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, '0');
  const ss = String(safe % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

const deriveStatus = (assignment: StudentAssignment): AssignmentStatus => {
  const due = new Date(assignment.dueDate).getTime();
  if (Number.isNaN(due)) return 'todo';
  return due < Date.now() ? 'overdue' : 'todo';
};

const resolveContentUrl = (url: string): string => {
  if (!url) return url;
  // Backend yüklemeleri (uploads, solutions vb.) - API base kullan
  if (url.startsWith('/uploads')) {
    return `${getApiBaseUrl()}${url}`;
  }
  // Mutlak URL veya frontend public (/pdfs, /tests vb.)
  return url;
};

const MEETING_WINDOW_BEFORE_MS = 10 * 60 * 1000; // 10 dk önce katılıma izin

const isMeetingJoinable = (
  scheduledAt: string,
  durationMinutes: number,
  now = Date.now(),
): boolean => {
  const start = new Date(scheduledAt).getTime();
  if (Number.isNaN(start)) return false;
  const end = start + durationMinutes * 60 * 1000;
  const windowStart = start - MEETING_WINDOW_BEFORE_MS;
  return now >= windowStart && now <= end;
};

export const StudentDashboard: React.FC = () => {
  const { token, user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<StudentTab>('overview');

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
  const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
  const [meetings, setMeetings] = useState<StudentMeeting[]>([]);
  const [contents, setContents] = useState<StudentContent[]>([]);
  const todosState = useApiState<StudentTodo[]>([]);
  const [todoMutation, setTodoMutation] = useState<{
    creating: boolean;
    updatingId: string | null;
    deletingId: string | null;
  }>({
    creating: false,
    updatingId: null,
    deletingId: null,
  });

  const dashboardState = useApiState<StudentDashboardSummary>(null);
  const assignmentsState = useApiState<StudentAssignment[]>([]);
  const progressState = useApiState<ProgressOverview>(null);
  const chartsState = useApiState<ProgressCharts>(null);
  const calendarState = useApiState<CalendarEvent[]>([]);
  const coachingState = useApiState<StudentCoachingSession[]>([]);
  const [badges, setBadges] = useState<StudentBadgeProgress[]>([]);
  const [badgesLoading, setBadgesLoading] = useState(false);
  const [badgesError, setBadgesError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    dashboardState.run(() => getStudentDashboard(token)).catch(() => {});
    assignmentsState
      .run(() => getStudentAssignments(token))
      .then((data) => setAssignments(data))
      .catch(() => {});
    getStudentContents(token).then(setContents).catch(() => {});
    getStudentMeetings(token)
      .then((data) => setMeetings(sortMeetingsByDate(data)))
      .catch(() => {});
    progressState.run(() => getStudentProgressTopics(token)).catch(() => {});
    chartsState.run(() => getStudentProgressCharts(token)).catch(() => {});
    const { start, end } = getWeekRange();
    calendarState
      .run(async () => {
        const payload = await getStudentCalendar(token, start.toISOString(), end.toISOString());
        return payload.events;
      })
      .catch(() => {});
    todosState.run(() => getStudentTodos(token)).catch(() => {});
    coachingState.run(() => getStudentCoachingSessions(token)).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || activeTab !== 'badges') return;
    let cancelled = false;
    const load = async () => {
      setBadgesLoading(true);
      setBadgesError(null);
      try {
        const data = await getStudentBadges(token);
        if (cancelled) return;
        setBadges(data);
      } catch (error) {
        if (cancelled) return;
        setBadgesError(
          error instanceof Error ? error.message : 'Rozetler yüklenemedi',
        );
      } finally {
        if (!cancelled) setBadgesLoading(false);
      }
    };
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, activeTab]);

  // Ödevleri periyodik olarak yenile (öğretmen yeni ödev atayınca öğrenci sayfayı yenilemeden görsün)
  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    const reloadAssignments = async () => {
      try {
        const data = await getStudentAssignments(token);
        if (cancelled) return;
        setAssignments(data);
        assignmentsState.setData(data);
      } catch {
        // sessizce yut
      }
    };

    // İlk açılışta hemen yükle
    reloadAssignments().catch(() => {});

    // Daha gerçek zamanlı his için periyodu kısalttık
    const id = window.setInterval(() => {
      reloadAssignments().catch(() => {});
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token]);

  const groupedAssignments = useMemo(() => {
    const groups: Record<AssignmentStatus, StudentAssignment[]> = {
      todo: [],
      'in-progress': [],
      done: [],
      overdue: [],
    };
    assignments.forEach((assignment) => {
      groups[deriveStatus(assignment)].push(assignment);
    });
    return groups;
  }, [assignments]);

  const metrics = useMemo(() => {
    const summary = dashboardState.data;
    return [
      {
        label: 'Genel Ortalama',
        value: `${summary?.averageScorePercent ?? 0}%`,
        helper: 'Son 7 gün',
        trendLabel: `${summary?.testsSolvedThisWeek ?? 0} test`,
        trendTone: 'positive' as const,
      },
      {
        label: 'Çözülen Soru',
        value: `${summary?.totalQuestionsThisWeek ?? 0}`,
        helper: 'Bu hafta',
        trendLabel: 'Hedef: 200',
        trendTone: 'neutral' as const,
      },
      {
        label: 'Bekleyen Ödev',
        value: `${summary?.pendingAssignmentsCount ?? 0}`,
        helper: 'Aktif görevler',
        trendLabel: assignments.length ? `${assignments.length} toplam` : 'Güncel',
        trendTone: 'neutral' as const,
      },
      {
        label: 'İzlenen İçerik',
        value: `${summary?.lastWatchedContents?.length ?? 0}`,
        helper: 'Son içerikler',
        trendLabel: 'Güncel',
        trendTone: 'positive' as const,
      },
    ];
  }, [dashboardState.data, assignments.length]);

  const [joinMeetingHint, setJoinMeetingHint] = useState<string | null>(null);
  const [liveClass, setLiveClass] = useState<{ url: string; token: string; title?: string } | null>(
    null,
  );

  type StudentNotification = {
    id: string;
    userId: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    createdAt: string;
    relatedEntityType?: string;
    relatedEntityId?: string;
  };

  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();

  const [focusedNotificationId, setFocusedNotificationId] = useState<string | null>(null);

  useEffect(() => {
    const notif = searchParams.get('notifications');
    const notificationId = searchParams.get('notificationId');
    if (notif === '1') {
      setActiveTab('notifications');
      if (notificationId) setFocusedNotificationId(notificationId);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  const [solutionOverlay, setSolutionOverlay] = useState<{
    open: boolean;
    title: string;
    mode: 'audio_only' | 'audio_video';
    url: string;
    helpRequestId?: string;
  } | null>(null);

  const loadNotifications = async () => {
    if (!token) return;
    setNotificationsLoading(true);
    try {
      const data = await apiRequest<StudentNotification[]>(
        '/student/notifications?limit=10',
        {},
        token,
      );
      setNotifications(data);
    } catch {
      // ignore
    } finally {
      setNotificationsLoading(false);
    }
  };

  const nextMeeting = useMemo(() => {
    if (!meetings.length) return null;
    const joinable = meetings.filter((m) =>
      isMeetingJoinable(m.scheduledAt, m.durationMinutes ?? 30),
    );
    if (!joinable.length) return null;
    const sorted = [...joinable].sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
    return sorted[0];
  }, [meetings]);

  const isNextMeetingFromCoaching = useMemo(() => {
    if (!nextMeeting) return false;
    const sessions = coachingState.data ?? [];
    return sessions.some((session) => session.meetingId === nextMeeting.id);
  }, [nextMeeting, coachingState.data]);

  useEffect(() => {
    if (!token) return;
    loadNotifications().catch(() => {});
    const id = window.setInterval(() => loadNotifications().catch(() => {}), 30000);
    return () => window.clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (activeTab === 'notifications' && token) {
      loadNotifications().catch(() => {});
    }
  }, [activeTab, token]);

  useEffect(() => {
    if (activeTab === 'notifications' && focusedNotificationId && notifications.length > 0) {
      const el = document.querySelector(`[data-notification-id="${focusedNotificationId}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeTab, focusedNotificationId, notifications]);

  const handleJoinMeeting = async (meetingId?: string) => {
    if (!token) {
      setJoinMeetingHint('Oturum süresi dolmuş olabilir, lütfen tekrar giriş yapın.');
      return;
    }

    if (!meetings.length) {
      setJoinMeetingHint('Şu anda katılabileceğiniz planlı canlı ders bulunmuyor.');
      return;
    }

    const target = meetingId ? meetings.find((m) => m.id === meetingId) ?? null : nextMeeting;
    if (!target) {
      setJoinMeetingHint('Şu anda katılabileceğiniz planlı canlı ders bulunmuyor.');
      return;
    }

    try {
      const session = await joinStudentLiveMeeting(token, target.id);
      if (session.mode === 'external' && session.meetingUrl) {
        setJoinMeetingHint(null);
        window.open(session.meetingUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      if (session.mode === 'internal' && session.url && session.token) {
        setJoinMeetingHint(null);
        setLiveClass({ url: session.url, token: session.token, title: target.title });
        return;
      }
      setJoinMeetingHint(
        'Canlı derse katılırken bir sorun oluştu. Lütfen kısa bir süre sonra tekrar deneyin.',
      );
    } catch (error) {
      setJoinMeetingHint(
        error instanceof Error
          ? `Canlı derse katılamadın: ${error.message}`
          : 'Canlı derse katılırken bir hata oluştu.',
      );
    }
  };

  const [initialDocToShow, setInitialDocToShow] = useState<{ url: string; title: string } | null>(null);
  const handleOpenContent = (initialDoc?: { url: string; title: string }) => {
    setInitialDocToShow(initialDoc ?? null);
    setShowNotesLibrary(true);
  };

  const [activeTest, setActiveTest] = useState<StudentAssignmentDetail | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scratchpads, setScratchpads] = useState<Record<string, string>>({});
  const [testSubmitting, setTestSubmitting] = useState(false);
  const [testStartedAtMs, setTestStartedAtMs] = useState<number | null>(null);
  const [testRemainingSeconds, setTestRemainingSeconds] = useState<number | null>(null);
  const [lastTestResult, setLastTestResult] = useState<{
    testTitle: string;
    correctCount: number;
    incorrectCount: number;
    blankCount: number;
    scorePercent: number;
    analysis?: {
      overallLevel: 'weak' | 'average' | 'strong';
      weakTopics: string[];
      strongTopics: string[];
      recommendedNextActions: string[];
    };
    testResultId?: string;
  } | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);
  const [showNotesLibrary, setShowNotesLibrary] = useState(false);
  const [startedAssignmentIds, setStartedAssignmentIds] = useState<string[]>([]);
  const [activePdfAssignment, setActivePdfAssignment] = useState<{
    assignment: PdfTestAssignment;
    fileUrl: string;
    timeLimitMinutes?: number;
    answerKey?: Record<string, string>;
  } | null>(null);
  const [pdfTestSubmitting, setPdfTestSubmitting] = useState(false);
  const [pdfTestStartedAtMs, setPdfTestStartedAtMs] = useState<number | null>(null);
  const [pdfTestRemainingSeconds, setPdfTestRemainingSeconds] = useState<number | null>(null);

  const submitActiveTest = async () => {
    if (!token || !activeTest?.assignment.testId) return;
    if (testSubmitting) return;
    setTestSubmitting(true);
    try {
      const payload = activeTest.questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] ?? '',
        scratchpadImageData: scratchpads[q.id],
      }));
      const durationSeconds =
        testStartedAtMs != null ? Math.max(0, Math.round((Date.now() - testStartedAtMs) / 1000)) : 0;
      const result = await submitStudentAssignment(
        token,
        activeTest.assignment.id,
        payload,
        durationSeconds,
      );
      setLastTestResult({
        testTitle: activeTest.test?.title ?? activeTest.assignment.title,
        correctCount: result.correctCount ?? 0,
        incorrectCount: result.incorrectCount ?? 0,
        blankCount: result.blankCount ?? 0,
        scorePercent: result.scorePercent ?? 0,
        analysis: result.questionBankAnalysis
          ? {
              overallLevel: result.questionBankAnalysis.overallLevel,
              weakTopics: result.questionBankAnalysis.weakTopics,
              strongTopics: result.questionBankAnalysis.strongTopics,
              recommendedNextActions:
                result.questionBankAnalysis.recommendedNextActions,
            }
          : undefined,
        testResultId: result.id,
      });
      setAssignments((prev) => prev.filter((item) => item.id !== activeTest.assignment.id));
      setActiveTest(null);
      setTestStartedAtMs(null);
      setTestRemainingSeconds(null);
    } finally {
      setTestSubmitting(false);
    }
  };

  useEffect(() => {
    if (!activeTest) return;
    const limitMinutes = activeTest.assignment.timeLimitMinutes;
    if (testStartedAtMs == null) return;
    if (typeof limitMinutes !== 'number' || limitMinutes <= 0) return;

    const totalSeconds = Math.round(limitMinutes * 60);
    const tick = () => {
      const elapsed = Math.floor((Date.now() - testStartedAtMs) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);
      setTestRemainingSeconds(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activeTest?.assignment.id, activeTest?.assignment.timeLimitMinutes, testStartedAtMs]);

  useEffect(() => {
    if (!activePdfAssignment) return;
    const limitMinutes = activePdfAssignment.timeLimitMinutes;
    if (pdfTestStartedAtMs == null) return;
    if (typeof limitMinutes !== 'number' || limitMinutes <= 0) return;

    const totalSeconds = Math.round(limitMinutes * 60);
    const tick = () => {
      const elapsed = Math.floor((Date.now() - pdfTestStartedAtMs) / 1000);
      const remaining = Math.max(0, totalSeconds - elapsed);
      setPdfTestRemainingSeconds(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activePdfAssignment?.assignment.id, activePdfAssignment?.timeLimitMinutes, pdfTestStartedAtMs]);

  useEffect(() => {
    if (!activeTest) return;
    if (typeof testRemainingSeconds !== 'number') return;
    if (testRemainingSeconds > 0) return;
    if (testSubmitting) return;
    submitActiveTest().catch(() => {});
  }, [activeTest, testRemainingSeconds, testSubmitting]);

  const handleOpenAssignment = async (assignment: StudentAssignment) => {
    if (!token) return;

    // Yerel olarak "başladı" bilgisini tut (oturum süresince)
    setStartedAssignmentIds((prev) =>
      prev.includes(assignment.id) ? prev : [...prev, assignment.id],
    );

    // İçerik (video/doküman) ödevi ise, içeriği yeni sekmede aç; ödev listede kalır
    if (assignment.contentId && !assignment.testId) {
      const content = contents.find((c) => c.id === assignment.contentId);
      if (content?.url) {
        const url = resolveContentUrl(content.url);
        try {
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch {
          // sessizce yut
        }
      }
      return;
    }

    // Yapılandırılmış test ödevi – test çözme penceresini aç
    if (assignment.testId) {
      const detail = await getStudentAssignmentDetail(token, assignment.id);
      setActiveTest(detail);
      setActiveQuestionIndex(0);
      setAnswers({});
      setScratchpads({});
      const startedAt = Date.now();
      setTestStartedAtMs(startedAt);
      const limitMinutes = detail.assignment.timeLimitMinutes;
      if (typeof limitMinutes === 'number' && limitMinutes > 0) {
        setTestRemainingSeconds(Math.round(limitMinutes * 60));
      } else {
        setTestRemainingSeconds(null);
      }
      return;
    }

    // Dosya tabanlı test (testAssetId) – Uygulama içi interaktif PDF test arayüzünü aç
    if (!assignment.testId && assignment.testAssetId && assignment.testAsset) {
      const fileUrl = resolveContentUrl(assignment.testAsset.fileUrl);
      let answerKey: Record<string, string> | undefined;
      if (assignment.testAsset.answerKeyJson) {
        try {
          answerKey = JSON.parse(assignment.testAsset.answerKeyJson) as Record<string, string>;
        } catch {
          // ignore parse error
        }
      }
      const limitMin = assignment.timeLimitMinutes;
      setPdfTestStartedAtMs(Date.now());
      setPdfTestRemainingSeconds(
        typeof limitMin === 'number' && limitMin > 0 ? Math.round(limitMin * 60) : null,
      );
      setActivePdfAssignment({
        assignment: {
          id: assignment.id,
          title: assignment.title,
          testAsset: assignment.testAsset,
        },
        fileUrl,
        timeLimitMinutes: limitMin,
        answerKey,
      });
      return;
    }
  };

  const handleSubmitAssignment = async (assignment: StudentAssignment) => {
    if (!token) return;
    if (assignment.contentId && !assignment.testId) {
      const content = contents.find((c) => c.id === assignment.contentId);
      const seconds = (content?.durationMinutes ?? 30) * 60;
      await watchStudentContent(token, assignment.contentId, seconds, true);
      setAssignments((prev) => prev.filter((item) => item.id !== assignment.id));
      return;
    }
    // Dosya tabanlı test ödevi (testAssetId var, testId yok) için sadece ödevi tamamlanmış işaretle
    // Böylece /submit endpoint'inden 404 hatası alınmaz.
    if (!assignment.testId && (assignment as any).testAssetId) {
      await completeStudentAssignment(token, assignment.id, false);
      setAssignments((prev) => prev.filter((item) => item.id !== assignment.id));
      return;
    }
    if (assignment.testId) {
      // Liste üzerindeki "Teslim Et" doğrudan çözüm göndermez; önce test penceresini açar.
      await handleOpenAssignment(assignment);
      return;
    }
    await submitStudentAssignment(token, assignment.id, [], 0);
    setAssignments((prev) => prev.filter((item) => item.id !== assignment.id));
  };

  const plannerTodos = todosState.data ?? [];

  const handleCreateTodo = async (payload: PlannerCreatePayload) => {
    if (!token) return;
    setTodoMutation((prev) => ({ ...prev, creating: true }));
    try {
      const created = await createStudentTodo(token, payload);
      todosState.setData([...(todosState.data ?? []), created]);
    } catch (error) {
      throw error;
    } finally {
      setTodoMutation((prev) => ({ ...prev, creating: false }));
    }
  };

  const handleUpdateTodo = async (todoId: string, updates: Partial<StudentTodo>) => {
    if (!token) return;
    setTodoMutation((prev) => ({ ...prev, updatingId: todoId }));
    try {
      const updated = await updateStudentTodo(token, todoId, updates);
      const current = todosState.data ?? [];
      todosState.setData(current.map((todo) => (todo.id === todoId ? updated : todo)));
    } catch (error) {
      throw error;
    } finally {
      setTodoMutation((prev) => ({ ...prev, updatingId: null }));
    }
  };

  const handleDeleteTodo = async (todoId: string) => {
    if (!token) return;
    setTodoMutation((prev) => ({ ...prev, deletingId: todoId }));
    try {
      await deleteStudentTodo(token, todoId);
      const current = todosState.data ?? [];
      todosState.setData(current.filter((todo) => todo.id !== todoId));
    } catch (error) {
      throw error;
    } finally {
      setTodoMutation((prev) => ({ ...prev, deletingId: null }));
    }
  };

  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const items: BreadcrumbItem[] = [
      { label: 'Ana Sayfa', onClick: activeTab !== 'overview' ? () => setActiveTab('overview') : undefined },
    ];
    if (activeTab === 'assignments') items.push({ label: 'Ödevler' });
    else if (activeTab === 'planner') items.push({ label: 'Planlama' });
    else if (activeTab === 'grades') items.push({ label: 'Sınav Analizi' });
    else if (activeTab === 'coursenotes') items.push({ label: 'Ders Notları' });
    else if (activeTab === 'pomodoro') items.push({ label: 'Pomodoro' });
    else if (activeTab === 'questionbank') items.push({ label: 'Soru Havuzu' });
    else if (activeTab === 'badges') items.push({ label: 'Rozetlerim' });
    else if (activeTab === 'liveclasses') items.push({ label: 'Canlı Dersler' });
    else if (activeTab === 'coaching') items.push({ label: 'Koçluk' });
    else if (activeTab === 'notifications') items.push({ label: 'Bildirimler' });
    else if (activeTab === 'complaints') items.push({ label: 'Şikayet/Öneri' });
    return items;
  }, [activeTab]);

  const sidebarItems = useMemo<SidebarItem[]>(
    () => [
      {
        id: 'overview',
        label: 'Genel Bakış',
        icon: <BookOpen size={18} />,
        description: 'Performans',
        active: activeTab === 'overview',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('overview');
        },
      },
      {
        id: 'assignments',
        label: 'Ödevler',
        icon: <ListChecks size={18} />,
        description: 'Takip',
        badge: assignments.length || undefined,
        active: activeTab === 'assignments',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('assignments');
        },
      },
      {
        id: 'planner',
        label: 'Planlama',
        icon: <Calendar size={18} />,
        description: 'Görevler',
        badge: plannerTodos.filter((todo) => todo.status !== 'completed').length || undefined,
        active: activeTab === 'planner',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('planner');
        },
      },
      {
        id: 'grades',
        label: 'Notlar',
        icon: <Award size={18} />,
        description: 'Analiz',
        active: activeTab === 'grades',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('grades');
        },
      },
      {
        id: 'coursenotes',
        label: 'Ders Notları',
        icon: <FileText size={18} />,
        description: 'Konu Anlatımları',
        active: activeTab === 'coursenotes',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('coursenotes');
        },
      },
      {
        id: 'pomodoro',
        label: 'Pomodoro',
        icon: <Target size={18} />,
        description: 'Focus Zone',
        active: activeTab === 'pomodoro',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('pomodoro');
        },
      },
      {
        id: 'questionbank',
        label: 'Soru Havuzu',
        icon: <BookOpen size={18} />,
        description: 'Konu Testleri',
        active: activeTab === 'questionbank',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('questionbank');
        },
      },
      {
        id: 'badges',
        label: 'Rozetler',
        icon: <Award size={18} />,
        description: 'Başarılarım',
        active: activeTab === 'badges',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('badges');
        },
      },
      {
        id: 'liveclasses',
        label: 'Canlı Dersler',
        icon: <Video size={18} />,
        description: 'Planlı dersler',
        active: activeTab === 'liveclasses',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('liveclasses');
        },
      },
      {
        id: 'coaching',
        label: 'Koçluk',
        icon: <CalendarCheck size={18} />,
        description: 'Görüşmeler',
        active: activeTab === 'coaching',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('coaching');
        },
      },
      {
        id: 'notifications',
        label: 'Bildirimler',
        icon: <Bell size={18} />,
        description: 'Mesajlar',
        badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined,
        active: activeTab === 'notifications',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('notifications');
          loadNotifications().catch(() => {});
        },
      },
      {
        id: 'complaints',
        label: 'Şikayet/Öneri',
        icon: <ClipboardList size={18} />,
        description: 'Admin',
        active: activeTab === 'complaints',
        onClick: () => {
          setShowNotesLibrary(false);
          setActiveTest(null);
          setActiveTab('complaints');
        },
      },
    ],
    [activeTab, assignments.length, plannerTodos.length, unreadNotificationsCount],
  );

  return (
    <DashboardLayout
      accent="indigo"
      brand="SKYTECH"
      tagline={user?.name ?? 'Öğrenci'}
      title={
        activeTab === 'overview'
          ? 'Çalışma Paneli'
          : activeTab === 'assignments'
            ? 'Ödev Akışı'
            : activeTab === 'planner'
              ? 'Planlama'
              : activeTab === 'grades'
                ? 'Sınav Analizi'
                : activeTab === 'pomodoro'
                  ? 'Pomodoro'
                  : activeTab === 'questionbank'
                    ? 'Soru Havuzu Testleri'
                  : activeTab === 'badges'
                    ? 'Rozetlerim'
                    : activeTab === 'liveclasses'
                      ? 'Canlı Dersler'
                      : activeTab === 'coaching'
                        ? 'Koçluk Görüşmeleri'
                        : activeTab === 'notifications'
                          ? 'Bildirimler'
                          : 'Şikayet/Öneri'
      }
      subtitle="Gerçek verilerle çalışma serini ve ödevlerini yönet."
      status={{ label: `${dashboardState.data?.testsSolvedThisWeek ?? 0} test çözüldü`, tone: 'warning' }}
      breadcrumbs={breadcrumbs}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'ÖG',
        name: user?.name ?? 'Öğrenci',
        subtitle: 'Öğrenci',
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
              loadNotifications().catch(() => {});
            }}
            style={{ position: 'relative' }}
          >
            <Bell size={16} />
            {unreadNotificationsCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  background: '#ef4444',
                  color: 'white',
                  borderRadius: 999,
                  padding: '0 6px',
                  fontSize: '0.7rem',
                  lineHeight: '16px',
                  height: 16,
                  minWidth: 16,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>
        </div>
      }
      onLogout={logout}
    >
      {activeTab === 'overview' && (
        <StudentOverview
          metrics={metrics}
          meeting={nextMeeting}
          isCoachingMeeting={isNextMeetingFromCoaching}
          events={calendarState.data ?? []}
          groupedAssignments={groupedAssignments}
          contents={contents}
          onJoinMeeting={handleJoinMeeting}
          onOpenContentLibrary={handleOpenContent}
          joinMeetingHint={joinMeetingHint}
          loading={dashboardState.loading}
        />
      )}
      {activeTab === 'badges' && (
        <StudentBadgesTab badges={badges} loading={badgesLoading} error={badgesError} />
      )}
      {activeTab === 'assignments' && (
        <StudentAssignments
          assignments={assignments}
          onOpen={handleOpenAssignment}
          onSubmit={handleSubmitAssignment}
          loading={assignmentsState.loading}
          startedAssignmentIds={startedAssignmentIds}
        />
      )}
      {activeTab === 'planner' && (
        <StudentPlanner
          todos={plannerTodos}
          assignments={assignments}
          contents={contents}
          loading={todosState.loading}
          mutationState={todoMutation}
          onCreate={handleCreateTodo}
          onUpdate={handleUpdateTodo}
          onDelete={handleDeleteTodo}
          token={token}
          defaultGradeLevel={user?.gradeLevel}
        />
      )}
      {activeTab === 'grades' && (
        <StudentGrades progress={progressState.data} charts={chartsState.data} loading={progressState.loading} />
      )}
      {activeTab === 'coursenotes' && (
        <NotesLibraryOverlay
          contents={contents}
          initialDoc={null}
          globalReadingMode={readingMode}
          token={token}
          embedded
          onClose={() => {}}
        />
      )}
      {activeTab === 'pomodoro' && (
        <GlassCard
          title="Focus Zone"
          subtitle="Odaklan, tamamla, XP kazan"
          className="focus-zone-wrapper"
        >
          <FocusZone
            todoItems={plannerTodos
              .filter((t) => t.status !== 'completed')
              .map((t) => ({ id: t.id, title: t.title }))}
            token={token}
            onXpEarned={(xp) => {
              if (token && xp > 0) recordFocusSession(token, xp).catch(() => {});
            }}
          />
        </GlassCard>
      )}
      {activeTab === 'questionbank' && token && (
        <StudentQuestionBankTab
          token={token}
          defaultGradeLevel={user?.gradeLevel}
          onTestStarted={(detail) => {
            setActiveTest(detail);
            setActiveQuestionIndex(0);
            setAnswers({});
            setScratchpads({});
            setTestStartedAtMs(Date.now());
            setTestRemainingSeconds(null);
          }}
        />
      )}
      {activeTab === 'liveclasses' && (
        <GlassCard title="Canlı Dersler" subtitle="Planlanmış canlı ders ve toplantılar">
          {meetings.length === 0 && (
            <div className="empty-state">Henüz planlanmış canlı dersiniz yok.</div>
          )}
          {meetings.length > 0 && (
            <div className="list-stack">
              {meetings.map((m) => (
                <div key={m.id} className="list-row">
                  <div>
                    <strong>{m.title}</strong>
                    <small>
                      {new Date(m.scheduledAt).toLocaleString('tr-TR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {m.durationMinutes ? ` • ${m.durationMinutes} dk` : null}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={() => handleJoinMeeting(m.id)}
                  >
                    Katıl
                  </button>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}
      {activeTab === 'coaching' && (
        <StudentCoachingTab
          loading={coachingState.loading}
          sessions={coachingState.data ?? []}
          onJoinMeeting={handleJoinMeeting}
        />
      )}
      {activeTab === 'notifications' && (
        <GlassCard title="Bildirimler" subtitle="Ödevler, çözümler ve güncellemeler">
          {notificationsLoading && notifications.length === 0 && (
            <div className="empty-state">Yükleniyor...</div>
          )}
          {!notificationsLoading && notifications.length === 0 && (
            <div className="empty-state">Henüz bildirim yok.</div>
          )}
          {notifications.length > 0 && (
            <div className="list-stack">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  data-notification-id={n.id}
                  className="list-row"
                  style={{
                    alignItems: 'flex-start',
                    ...(focusedNotificationId === n.id
                      ? {
                          background: 'rgba(59,130,246,0.12)',
                          borderLeft: '3px solid rgb(59,130,246)',
                          borderRadius: 8,
                          marginLeft: 2,
                        }
                      : {}),
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block' }}>{n.title}</strong>
                    <small style={{ display: 'block', marginTop: '0.15rem' }}>{n.body}</small>
                    <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.75 }}>
                      {formatShortDate(n.createdAt)}
                    </small>
                    {n.type === 'help_response_ready' &&
                      n.relatedEntityType === 'help_request' &&
                      n.relatedEntityId && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <button
                            type="button"
                            className="primary-btn"
                            onClick={async () => {
                              if (!token) return;
                              try {
                                const help = await getStudentHelpRequest(token, n.relatedEntityId!);
                                if (!help.response) {
                                  // eslint-disable-next-line no-alert
                                  alert('Henüz çözüm eklenmemiş.');
                                  return;
                                }
                                setSolutionOverlay({
                                  open: true,
                                  title: n.title,
                                  mode: help.response.mode,
                                  url: resolveContentUrl(help.response.url),
                                  helpRequestId: help.id,
                                });
                                if (!n.read) {
                                  await apiRequest(`/student/notifications/${n.id}/read`, { method: 'PUT' }, token);
                                  await loadNotifications();
                                }
                              } catch (e) {
                                // eslint-disable-next-line no-alert
                                alert(e instanceof Error ? e.message : 'Çözüm açılamadı.');
                              }
                            }}
                          >
                            Çözümü gör
                          </button>
                        </div>
                      )}
                  </div>
                  <TagChip label={n.read ? 'Okundu' : 'Yeni'} tone={n.read ? 'success' : 'warning'} />
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}
      {activeTab === 'complaints' && (
        <StudentComplaints token={token} />
      )}
      {activeTest && (
        <TestSolveOverlay
          detail={activeTest}
          currentIndex={activeQuestionIndex}
          onChangeIndex={setActiveQuestionIndex}
          answers={answers}
          onChangeAnswer={(questionId, value) =>
            setAnswers((prev) => ({
              ...prev,
              [questionId]: value,
            }))
          }
          scratchpads={scratchpads}
          onChangeScratchpad={(questionId, dataUrl) =>
            setScratchpads((prev) => ({
              ...prev,
              [questionId]: dataUrl,
            }))
          }
          onClose={() => {
            setActiveTest(null);
            setTestStartedAtMs(null);
            setTestRemainingSeconds(null);
          }}
          remainingSeconds={testRemainingSeconds}
          onAskTeacher={async (questionId, message) => {
            if (!token || !activeTest) return;
            try {
              await createStudentHelpRequest(token, {
                assignmentId: activeTest.assignment.id,
                questionId,
                message: message || undefined,
              });
              // eslint-disable-next-line no-alert
              alert('Öğretmenine bildirim gönderildi. Sesli veya video çözümle en kısa sürede dönüş yapılacak.');
            } catch (e) {
              // eslint-disable-next-line no-alert
              alert(e instanceof Error ? e.message : 'Bildirim gönderilemedi.');
            }
          }}
          readingModeEnabled={readingMode}
          onSubmit={submitActiveTest}
          submitting={testSubmitting}
        />
      )}
      {activePdfAssignment && (
        <PdfTestOverlay
          assignment={activePdfAssignment.assignment}
          fileUrl={activePdfAssignment.fileUrl}
          timeLimitMinutes={activePdfAssignment.timeLimitMinutes}
          answerKey={activePdfAssignment.answerKey}
          remainingSeconds={pdfTestRemainingSeconds}
          onTimeUp={async (ans) => {
            if (!token || !activePdfAssignment || pdfTestSubmitting) return;
            setPdfTestSubmitting(true);
            try {
              const answersForApi = Object.fromEntries(
                Object.entries(ans ?? {}).map(([k, v]) => [String(k), v ?? '']),
              );
              const result = (await completeStudentAssignment(
                token,
                activePdfAssignment.assignment.id,
                false,
                answersForApi,
              )) as { correctCount?: number; incorrectCount?: number; blankCount?: number; scorePercent?: number };
              if (typeof result?.correctCount === 'number') {
                setLastTestResult({
                  testTitle: activePdfAssignment.assignment.title,
                  correctCount: result.correctCount,
                  incorrectCount: result.incorrectCount ?? 0,
                  blankCount: result.blankCount ?? 0,
                  scorePercent: result.scorePercent ?? 0,
                });
              }
              setAssignments((prev) => prev.filter((a) => a.id !== activePdfAssignment.assignment.id));
              setActivePdfAssignment(null);
              setPdfTestStartedAtMs(null);
              setPdfTestRemainingSeconds(null);
              // eslint-disable-next-line no-alert
              alert('Süre doldu. Test otomatik olarak teslim edildi.');
            } catch (e) {
              // eslint-disable-next-line no-alert
              alert(e instanceof Error ? e.message : 'Teslim edilemedi.');
            } finally {
              setPdfTestSubmitting(false);
            }
          }}
          onClose={() => {
            setActivePdfAssignment(null);
            setPdfTestStartedAtMs(null);
            setPdfTestRemainingSeconds(null);
          }}
          onAskTeacher={async (questionId, message, studentAnswer) => {
            if (!token) return;
            try {
              await createStudentHelpRequest(token, {
                assignmentId: activePdfAssignment.assignment.id,
                questionId,
                message: message || undefined,
                studentAnswer: studentAnswer || undefined,
              });
              // eslint-disable-next-line no-alert
              alert('Öğretmenine bildirim gönderildi. Sesli veya görüntülü çözümle en kısa sürede dönüş yapılacak.');
            } catch (e) {
              // eslint-disable-next-line no-alert
              alert(e instanceof Error ? e.message : 'Bildirim gönderilemedi.');
            }
          }}
          onSubmit={async (ans) => {
            if (!token || !activePdfAssignment) return;
            setPdfTestSubmitting(true);
            try {
              const answersForApi = Object.fromEntries(
                Object.entries(ans ?? {}).map(([k, v]) => [String(k), v ?? '']),
              );
              const result = (await completeStudentAssignment(
                token,
                activePdfAssignment.assignment.id,
                false,
                answersForApi,
              )) as { correctCount?: number; incorrectCount?: number; blankCount?: number; scorePercent?: number };
              if (typeof result?.correctCount === 'number') {
                setLastTestResult({
                  testTitle: activePdfAssignment.assignment.title,
                  correctCount: result.correctCount,
                  incorrectCount: result.incorrectCount ?? 0,
                  blankCount: result.blankCount ?? 0,
                  scorePercent: result.scorePercent ?? 0,
                });
              }
              setAssignments((prev) => prev.filter((a) => a.id !== activePdfAssignment.assignment.id));
              setActivePdfAssignment(null);
              setPdfTestStartedAtMs(null);
              setPdfTestRemainingSeconds(null);
            } catch (e) {
              // eslint-disable-next-line no-alert
              alert(e instanceof Error ? e.message : 'Ödev teslim edilemedi.');
            } finally {
              setPdfTestSubmitting(false);
            }
          }}
          submitting={pdfTestSubmitting}
        />
      )}
      {lastTestResult && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: '3.5rem',
            zIndex: 80,
          }}
        >
          <div
            style={{
              minWidth: 320,
              maxWidth: 420,
              background: 'rgba(15,23,42,0.97)',
              borderRadius: 16,
              padding: '1rem 1.1rem',
              boxShadow: '0 25px 60px rgba(0,0,0,0.8)',
              border: '1px solid rgba(55,65,81,0.9)',
              color: '#e5e7eb',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', opacity: 0.75, textTransform: 'uppercase' }}>
                  Test Sonucu
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                  {lastTestResult.testTitle}
                </div>
              </div>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setLastTestResult(null)}
                style={{
                  padding: '0.25rem 0.7rem',
                  fontSize: '0.8rem',
                  border: '1px solid rgba(148,163,184,0.9)',
                  background: 'rgba(15,23,42,0.9)',
                  color: '#e5e7eb',
                }}
              >
                Kapat
              </button>
            </div>
            <div style={{ fontSize: '0.85rem', display: 'grid', gap: '0.25rem' }}>
              <div>
                <strong>Doğru:</strong> {lastTestResult.correctCount}
              </div>
              <div>
                <strong>Yanlış:</strong> {lastTestResult.incorrectCount}
              </div>
              <div>
                <strong>Boş:</strong> {lastTestResult.blankCount}
              </div>
              <div>
                <strong>Puan:</strong> %{lastTestResult.scorePercent}
              </div>
              {lastTestResult.analysis && (
                <>
                  <div style={{ marginTop: '0.25rem' }}>
                    <strong>Genel Durum:</strong>{' '}
                    {lastTestResult.analysis.overallLevel === 'weak'
                      ? 'Geliştirilmeli'
                      : lastTestResult.analysis.overallLevel === 'strong'
                        ? 'Güçlü'
                        : 'Orta'}
                  </div>
                  {lastTestResult.analysis.weakTopics.length > 0 && (
                    <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                      <strong>Zayıf Konular:</strong>{' '}
                      {lastTestResult.analysis.weakTopics.join(', ')}
                    </div>
                  )}
                  {lastTestResult.analysis.recommendedNextActions.length > 0 && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        opacity: 0.9,
                        marginTop: '0.15rem',
                      }}
                    >
                      {lastTestResult.analysis.recommendedNextActions[0]}
                    </div>
                  )}
                </>
              )}
              {lastTestResult.testResultId && token && (
                <div
                  style={{
                    marginTop: '0.4rem',
                    display: 'flex',
                    gap: '0.4rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    className="primary-btn"
                    style={{
                      fontSize: '0.75rem',
                      padding: '0.25rem 0.7rem',
                    }}
                    disabled={aiFeedbackLoading}
                    onClick={async () => {
                      if (!token || !lastTestResult.testResultId) return;
                      setAiFeedbackLoading(true);
                      try {
                        const res = await getStudentTestFeedback(
                          token,
                          lastTestResult.testResultId,
                          'pdf',
                        );
                        setAiFeedback(res.feedback);
                        if (res.attachment) {
                          const blob = new Blob(
                            [
                              Uint8Array.from(
                                atob(res.attachment.data),
                                (c) => c.charCodeAt(0),
                              ),
                            ],
                            { type: res.attachment.mimeType },
                          );
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = res.attachment.filename;
                          a.click();
                          URL.revokeObjectURL(url);
                        }
                      } catch (e) {
                        // eslint-disable-next-line no-alert
                        alert(
                          e instanceof Error
                            ? e.message
                            : 'Detaylı yorum alınamadı.',
                        );
                      } finally {
                        setAiFeedbackLoading(false);
                      }
                    }}
                  >
                    {aiFeedbackLoading
                      ? 'AI yorum hazırlanıyor...'
                      : 'Detaylı AI yorumu göster ve PDF indir'}
                  </button>
                </div>
              )}
              {aiFeedback && (
                <div
                  style={{
                    marginTop: '0.35rem',
                    paddingTop: '0.35rem',
                    borderTop: '1px solid rgba(55,65,81,0.8)',
                    fontSize: '0.8rem',
                    opacity: 0.95,
                  }}
                >
                  {aiFeedback}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showNotesLibrary && (
        <NotesLibraryOverlay
          contents={contents}
          initialDoc={initialDocToShow}
          globalReadingMode={readingMode}
          token={token}
          onClose={() => {
            setShowNotesLibrary(false);
            setInitialDocToShow(null);
          }}
        />
      )}
      {liveClass && (
        <LiveClassOverlay
          url={liveClass.url}
          token={liveClass.token}
          title={liveClass.title}
          role="student"
          authToken={token ?? undefined}
          onClose={() => setLiveClass(null)}
        />
      )}

      {solutionOverlay?.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.75)',
            zIndex: 95,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '1.5rem',
          }}
          onClick={() => setSolutionOverlay(null)}
        >
          <div
            style={{
              width: 'min(860px, 96vw)',
              background: '#0b1220',
              borderRadius: 18,
              border: '1px solid rgba(55,65,81,0.9)',
              color: '#e5e7eb',
              boxShadow: '0 30px 80px rgba(0,0,0,0.75)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '1rem 1.1rem',
                borderBottom: '1px solid rgba(31,41,55,0.9)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 700 }}>Çözüm</div>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setSolutionOverlay(null)}
                style={{
                  border: '1px solid rgba(148,163,184,0.9)',
                  background: 'rgba(15,23,42,0.9)',
                  color: '#e5e7eb',
                }}
              >
                Kapat
              </button>
            </div>
            <div style={{ padding: '1rem 1.1rem' }}>
              <div style={{ opacity: 0.85, marginBottom: '0.75rem' }}>{solutionOverlay.title}</div>
              {solutionOverlay.mode === 'audio_only' ? (
                <audio
                  controls
                  style={{ width: '100%' }}
                  src={solutionOverlay.url}
                  onPlay={async () => {
                    if (!token || !solutionOverlay.helpRequestId) return;
                    try {
                      await markStudentHelpResponsePlayed(token, solutionOverlay.helpRequestId);
                    } catch {
                      // sessizce yut
                    }
                  }}
                />
              ) : (
                <video
                  controls
                  style={{ width: '100%', borderRadius: 12 }}
                  src={solutionOverlay.url}
                  onPlay={async () => {
                    if (!token || !solutionOverlay.helpRequestId) return;
                    try {
                      await markStudentHelpResponsePlayed(token, solutionOverlay.helpRequestId);
                    } catch {
                      // sessizce yut
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

const TestSolveOverlay: React.FC<{
  detail: StudentAssignmentDetail;
  currentIndex: number;
  onChangeIndex: (index: number) => void;
  answers: Record<string, string>;
  onChangeAnswer: (questionId: string, value: string) => void;
  scratchpads: Record<string, string>;
  onChangeScratchpad: (questionId: string, dataUrl: string) => void;
  onClose: () => void;
  remainingSeconds: number | null;
  onAskTeacher: (questionId: string, message?: string) => void;
  readingModeEnabled: boolean;
  onSubmit: () => Promise<void>;
  submitting: boolean;
}> = ({
  detail,
  currentIndex,
  onChangeIndex,
  answers,
  onChangeAnswer,
  scratchpads,
  onChangeScratchpad,
  onClose,
  remainingSeconds,
  onAskTeacher,
  readingModeEnabled,
  onSubmit,
  submitting,
}) => {
  const questions = detail.questions;
  const question = questions[currentIndex] as Question | undefined;
  const [showDrawing, setShowDrawing] = useState(false);
  const [askTeacherQuestionId, setAskTeacherQuestionId] = useState<string | null>(null);
  const [askTeacherMessage, setAskTeacherMessage] = useState('');
  const [drawingTool, setDrawingTool] = useState<'pen' | 'line' | 'rect' | 'triangle' | 'eraser'>('pen');
  const [drawingColor, setDrawingColor] = useState<string>('#111827');
  const [drawingLineWidth, setDrawingLineWidth] = useState<number>(3);
  const [eraserWidth, setEraserWidth] = useState<number>(18);

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const canvasWidth = Math.min(1200, viewportWidth - 40);
  // Çizim paneli, başlık ve araç çubuğu için ekstra alan bırakarak yüksekliği sınırlayalım
  const canvasHeight = Math.min(800, Math.max(300, viewportHeight - 260));

  if (!question) return null;

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      onChangeIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      onChangeIndex(currentIndex - 1);
    }
  };

  const answerValue = answers[question.id] ?? '';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background:
          'radial-gradient(circle at top left, rgba(15,23,42,0.98), rgba(15,23,42,0.96))',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 60,
        padding: '2rem 1.25rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1200,
          maxHeight: '100%',
          background: readingModeEnabled ? 'rgba(255,250,240,0.98)' : '#0b1220',
          borderRadius: 24,
          padding: '1.75rem',
          boxShadow: '0 30px 80px rgba(0,0,0,0.65)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
          color: readingModeEnabled ? '#111827' : '#e5e7eb',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <Breadcrumb
                items={[
                  { label: 'Ödevler' },
                  { label: detail.assignment?.title ?? detail.test?.title ?? 'Test' },
                  { label: `Soru ${currentIndex + 1} / ${questions.length}` },
                ]}
                variant={readingModeEnabled ? 'light' : 'default'}
              />
              <h3 style={{ margin: '0.35rem 0 0 0', fontSize: '1.15rem', opacity: 0.9 }}>
                {detail.test?.title ?? 'Test'}
              </h3>
            </div>
            {typeof remainingSeconds === 'number' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '0.25rem',
                  marginRight: '0.75rem',
                }}
              >
                <div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase' }}>
                  Kalan süre
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: remainingSeconds <= 60 ? '#fb7185' : '#e5e7eb' }}>
                  {formatCountdown(remainingSeconds)}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ghost-btn"
              style={{
                color: readingModeEnabled ? '#111827' : '#e5e7eb',
                border: readingModeEnabled ? '1px solid rgba(148,163,184,0.6)' : '1px solid rgba(148,163,184,0.9)',
                background: readingModeEnabled ? 'rgba(255,247,237,0.9)' : 'rgba(15,23,42,0.9)',
              }}
            >
              Kapat
            </button>
          </div>

          <div
            style={{
              padding: '1rem 1.25rem',
              borderRadius: 16,
              background: readingModeEnabled ? 'rgba(255,247,237,0.95)' : 'linear-gradient(135deg, #111827, #020617)',
              border: readingModeEnabled ? '1px solid rgba(148,163,184,0.45)' : '1px solid rgba(55,65,81,0.9)',
              boxShadow: '0 18px 40px rgba(0,0,0,0.75)',
            }}
          >
            <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: readingModeEnabled ? 1.85 : 1.6 }}>
              {question.text}
            </p>

            {question.type === 'multiple_choice' && question.choices && (
              <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
                {question.choices.map((choice) => (
                  <label
                    key={choice}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 999,
                      background:
                        answerValue === choice
                          ? 'rgba(59,130,246,0.15)'
                          : 'rgba(15,23,42,0.8)',
                      border:
                        answerValue === choice
                          ? '1px solid rgba(129,140,248,0.9)'
                          : '1px solid rgba(31,41,55,0.9)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name={`q-${question.id}`}
                      checked={answerValue === choice}
                      onChange={() => onChangeAnswer(question.id, choice)}
                    />
                    <span style={{ fontSize: '0.9rem' }}>{choice}</span>
                  </label>
                ))}
              </div>
            )}

            {question.type === 'true_false' && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
                {['true', 'false'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => onChangeAnswer(question.id, val)}
                    className={answerValue === val ? 'primary-btn' : 'ghost-btn'}
                    style={
                      answerValue === val
                        ? undefined
                        : {
                            border: '1px solid rgba(148,163,184,0.9)',
                            background: 'rgba(15,23,42,0.9)',
                            color: '#e5e7eb',
                          }
                    }
                  >
                    {val === 'true' ? 'Doğru' : 'Yanlış'}
                  </button>
                ))}
              </div>
            )}

            {question.type === 'open_ended' && (
              <textarea
                value={answerValue}
                onChange={(event) => onChangeAnswer(question.id, event.target.value)}
                placeholder="Cevabını buraya yaz"
                style={{
                  width: '100%',
                  marginTop: '1rem',
                  minHeight: 120,
                  borderRadius: 12,
                  border: '1px solid rgba(55,65,81,0.9)',
                  background: '#020617',
                  color: '#e5e7eb',
                  resize: 'vertical',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9rem',
                }}
              />
            )}

            <div
              style={{
                marginTop: '1.25rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  style={{
                    border: '1px solid rgba(148,163,184,0.9)',
                    background: 'rgba(15,23,42,0.9)',
                    color: '#e5e7eb',
                  }}
                >
                  Önceki
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={handleNext}
                  disabled={currentIndex === questions.length - 1}
                  style={{
                    border: '1px solid rgba(148,163,184,0.9)',
                    background: 'rgba(15,23,42,0.9)',
                    color: '#e5e7eb',
                  }}
                >
                  Sonraki
                </button>
              </div>
              <button
                type="button"
                className="primary-btn"
                onClick={onSubmit}
                disabled={submitting}
              >
                {submitting ? 'Gönderiliyor...' : 'Testi Bitir ve Gönder'}
              </button>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-start', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowDrawing(true)}
                style={{
                  border: '1px solid rgba(148,163,184,0.9)',
                  background: 'rgba(15,23,42,0.9)',
                  color: '#e5e7eb',
                }}
              >
                Çizim Alanını Aç
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setAskTeacherQuestionId(question.id)}
                style={{
                  border: '1px solid rgba(59,130,246,0.9)',
                  background: 'rgba(30,58,138,0.5)',
                  color: '#93c5fd',
                }}
              >
                Bu soruyu öğretmene sor
              </button>
            </div>
          </div>
        </div>
      </div>
      {showDrawing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.95)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 70,
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 1200,
              maxHeight: '100%',
              background: '#020617',
              borderRadius: 24,
              padding: '1.25rem',
              boxShadow: '0 30px 80px rgba(0,0,0,0.75)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              color: '#e5e7eb',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', opacity: 0.7, textTransform: 'uppercase' }}>
                  Çizim Alanı
                </div>
                <div style={{ fontSize: '1rem', marginTop: '0.15rem' }}>
                  Soru {currentIndex + 1} için çalışma
                </div>
              </div>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setShowDrawing(false)}
                style={{
                  border: '1px solid rgba(148,163,184,0.9)',
                  background: 'rgba(15,23,42,0.9)',
                  color: '#e5e7eb',
                }}
              >
                Kapat
              </button>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }}
            >
              {[
                { id: 'pen', label: 'Serbest' },
                { id: 'line', label: 'Düz Çizgi' },
                { id: 'rect', label: 'Dikdörtgen' },
                { id: 'triangle', label: 'Dik Üçgen' },
                { id: 'eraser', label: 'Silgi' },
              ].map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={drawingTool === tool.id ? 'primary-btn' : 'ghost-btn'}
                  onClick={() => setDrawingTool(tool.id as any)}
                  style={
                    drawingTool === tool.id
                      ? undefined
                      : {
                          border: '1px solid rgba(55,65,81,0.9)',
                          background: 'rgba(15,23,42,0.9)',
                          color: '#e5e7eb',
                        }
                  }
                >
                  {tool.label}
                </button>
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.4rem',
                marginBottom: '0.5rem',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.8rem', opacity: 0.8 }}>Renk:</span>
              {['#111827', '#1d4ed8', '#be123c', '#047857', '#eab308'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDrawingColor(c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '999px',
                    border:
                      drawingColor === c
                        ? '2px solid #e5e7eb'
                        : '1px solid rgba(148,163,184,0.8)',
                    background: c,
                    padding: 0,
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '0.5rem',
                alignItems: 'center',
              }}
            >
              <label style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                Çizgi:
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={drawingLineWidth}
                  onChange={(event) => setDrawingLineWidth(Number(event.target.value))}
                  style={{ marginLeft: 8, verticalAlign: 'middle' }}
                />
              </label>
              <label style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                Silgi:
                <input
                  type="range"
                  min={8}
                  max={40}
                  value={eraserWidth}
                  onChange={(event) => setEraserWidth(Number(event.target.value))}
                  style={{ marginLeft: 8, verticalAlign: 'middle' }}
                />
              </label>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                borderRadius: 16,
                background: '#020617',
                padding: '0.5rem',
              }}
            >
              <DrawingCanvas
                width={canvasWidth}
                height={canvasHeight}
                initialImageDataUrl={scratchpads[question.id]}
                onChange={(dataUrl) => onChangeScratchpad(question.id, dataUrl)}
                tool={drawingTool}
                color={drawingColor}
                lineWidth={drawingLineWidth}
                eraserWidth={eraserWidth}
              />
            </div>
          </div>
        </div>
      )}
      {askTeacherQuestionId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.9)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 75,
            padding: '1.5rem',
          }}
          onClick={() => { setAskTeacherQuestionId(null); setAskTeacherMessage(''); }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#0b1220',
              borderRadius: 16,
              padding: '1.25rem',
              boxShadow: '0 30px 80px rgba(0,0,0,0.75)',
              border: '1px solid rgba(55,65,81,0.9)',
              color: '#e5e7eb',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Bu soruyu öğretmene sor</div>
            <p style={{ fontSize: '0.9rem', opacity: 0.85, margin: '0 0 1rem 0' }}>
              Öğretmeniniz sesli veya video/ekran paylaşımı ile çözüm gönderecek.
            </p>
            <textarea
              placeholder="Ek not (isteğe bağlı) — Örn: integral kısmında takıldım"
              value={askTeacherMessage}
              onChange={(e) => setAskTeacherMessage(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: 8,
                border: '1px solid rgba(71,85,105,0.9)',
                background: 'rgba(15,23,42,0.9)',
                color: '#e5e7eb',
                fontSize: '0.9rem',
                resize: 'vertical',
                marginBottom: '1rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => { setAskTeacherQuestionId(null); setAskTeacherMessage(''); }}
                style={{ border: '1px solid rgba(148,163,184,0.9)', color: '#e5e7eb' }}
              >
                İptal
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  onAskTeacher(askTeacherQuestionId, askTeacherMessage.trim() || undefined);
                  setAskTeacherQuestionId(null);
                  setAskTeacherMessage('');
                }}
              >
                Gönder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SAVE_PROGRESS_INTERVAL_MS = 10000;

const NotesLibraryOverlay: React.FC<{
  contents: StudentContent[];
  initialDoc?: { url: string; title: string } | null;
  globalReadingMode?: boolean;
  token: string | null;
  embedded?: boolean;
  onClose: () => void;
}> = ({ contents, initialDoc, globalReadingMode, token, embedded = false, onClose }) => {
  const gradeOptions = ['all', '9', '10', '11', '12'] as const;
  const [activeGrade, setActiveGrade] = useState<string>('all');
  const [activeVideoContent, setActiveVideoContent] = useState<StudentContent | null>(null);
  const [videoCompleted, setVideoCompleted] = useState(false);
  const [showResumeHint, setShowResumeHint] = useState(false);
  const [showVideoExitConfirm, setShowVideoExitConfirm] = useState(false);
  const [videoExitAlsoCloseOverlay, setVideoExitAlsoCloseOverlay] = useState(false);
  const [activeDocUrl, setActiveDocUrl] = useState<string | null>(null);
  const [activeDocTitle, setActiveDocTitle] = useState<string>('');
  const [docViewerFullscreen, setDocViewerFullscreen] = useState(false);
  const [docViewerReadingMode, setDocViewerReadingMode] = useState(false);
  const [videoReadingMode, setVideoReadingMode] = useState(false);
  const docViewerRef = useRef<HTMLDivElement | null>(null);
  const pdfIsReadingMode = docViewerReadingMode || !!globalReadingMode;
  const videoIsReadingMode = videoReadingMode || !!globalReadingMode;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSaveProgressRef = useRef<number>(0);

  const activeVideoUrl = activeVideoContent?.url
    ? resolveContentUrl(activeVideoContent.url)
    : null;

  const saveVideoProgress = React.useCallback(
    async (contentId: string, watchedSeconds: number, completed: boolean) => {
      if (!token) return;
      try {
        await watchStudentContent(token, contentId, watchedSeconds, completed);
      } catch {
        // Sessizce yut
      }
    },
    [token],
  );

  const toggleDocFullscreen = () => {
    if (!docViewerRef.current) return;
    if (!document.fullscreenElement) {
      docViewerRef.current.requestFullscreen?.();
      setDocViewerFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setDocViewerFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setDocViewerFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    if (initialDoc?.url) {
      setActiveDocUrl(initialDoc.url);
      setActiveDocTitle(initialDoc.title || 'Doküman');
    }
  }, [initialDoc?.url, initialDoc?.title]);

  const normalizeGradeLevel = (value?: string | null): string => {
    if (!value) return '';
    const match = value.match(/\d{1,2}/);
    if (match) return match[0];
    return value.trim();
  };

  const SUBJECT_LABELS: Record<string, string> = {
    sub1: 'Matematik',
    sub2: 'Fizik',
    sub3: 'Biyoloji',
    sub4: 'Kimya',
  };

  const contentsForGrade = contents.filter((c) => {
    if (activeGrade === 'all') return true;
    const gl = normalizeGradeLevel(c.gradeLevel ?? '9');
    return gl === activeGrade;
  });

  const subjectIds = Array.from(
    new Set(contentsForGrade.map((c) => c.subjectId).filter(Boolean)),
  ) as string[];
  const [activeSubject, setActiveSubject] = useState<string | null>(
    subjectIds[0] ?? null,
  );

  const contentsForSubject = contentsForGrade.filter((c) =>
    activeSubject ? c.subjectId === activeSubject : true,
  );
  const topics = Array.from(
    new Set(
      contentsForSubject.map((c) => (c.topic && c.topic.trim()) || 'Genel'),
    ),
  );
  const [activeTopic, setActiveTopic] = useState<string | null>(
    topics[0] ?? null,
  );

  const filteredContents = contentsForSubject.filter((c) => {
    const topic = (c.topic && c.topic.trim()) || 'Genel';
    return activeTopic ? topic === activeTopic : true;
  });

  const notesBreadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const closeContent = () => {
      setActiveVideoContent(null);
      setActiveDocUrl(null);
    };
    const items: BreadcrumbItem[] = [
      { label: 'Ders Notları', onClick: closeContent },
      {
        label: activeGrade === 'all' ? 'Tüm Sınıflar' : `${activeGrade}. Sınıf`,
        onClick: () => { setActiveTopic(null); closeContent(); },
      },
    ];
    if (activeSubject) {
      items.push({
        label: SUBJECT_LABELS[activeSubject] ?? activeSubject,
        onClick: () => { setActiveTopic(null); closeContent(); },
      });
    }
    if (activeTopic) {
      items.push({ label: activeTopic, onClick: closeContent });
    }
    if (activeVideoContent) items.push({ label: activeVideoContent.title });
    else if (activeDocUrl) items.push({ label: activeDocTitle || 'Doküman' });
    return items;
  }, [activeGrade, activeSubject, activeTopic, activeVideoContent, activeDocUrl, activeDocTitle]);

  const overlayIsReadingMode = !!globalReadingMode;
  return (
    <div
      style={{
        ...(embedded
          ? { position: 'relative', minHeight: 400 }
          : {
              position: 'fixed',
              inset: 0,
              zIndex: 65,
            }),
        background: overlayIsReadingMode
          ? 'radial-gradient(circle at top left, #fff7ed, #fffaf0)'
          : 'radial-gradient(circle at top left, rgba(15,23,42,0.96), rgba(15,23,42,0.98))',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: embedded ? '1rem 0' : '4.5rem 1.25rem 2rem',
        transition: 'background 0.3s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1400,
          maxHeight: '100%',
          background: overlayIsReadingMode ? '#fffaf0' : '#020617',
          borderRadius: 24,
          padding: '1.5rem',
          boxShadow: overlayIsReadingMode ? '0 30px 80px rgba(15,23,42,0.15)' : '0 30px 80px rgba(0,0,0,0.85)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          color: overlayIsReadingMode ? '#1f2937' : '#e5e7eb',
          overflow: 'hidden',
          border: overlayIsReadingMode ? '1px solid rgba(251,191,36,0.3)' : undefined,
          transition: 'background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <Breadcrumb items={notesBreadcrumbs} variant="light" />
            <h3 style={{ margin: '0.5rem 0 0', fontSize: '1.25rem' }}>
              Konu Anlatımları
            </h3>
          </div>
          {!embedded && (
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                if (activeVideoContent) {
                  if (videoCompleted) {
                    setActiveVideoContent(null);
                    setVideoCompleted(false);
                    setShowResumeHint(false);
                    onClose();
                  } else {
                    setVideoExitAlsoCloseOverlay(true);
                    setShowVideoExitConfirm(true);
                  }
                } else {
                  onClose();
                }
              }}
              style={{
                border: '1px solid rgba(148,163,184,0.9)',
                background: 'rgba(15,23,42,0.9)',
                color: '#e5e7eb',
              }}
            >
              Kapat
            </button>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)',
            gap: '1rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              padding: '0.9rem 1rem',
              borderRadius: 18,
              background: 'rgba(15,23,42,0.85)',
              border: '1px solid rgba(51,65,85,0.9)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Sınıf</div>
              <div
                style={{
                  marginTop: '0.4rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '0.4rem',
                }}
              >
                {gradeOptions.map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    className={activeGrade === grade ? 'primary-btn' : 'ghost-btn'}
                    onClick={() => setActiveGrade(grade)}
                    style={
                      activeGrade === grade
                        ? undefined
                        : {
                            border: '1px solid rgba(55,65,81,0.9)',
                            background: 'rgba(15,23,42,0.9)',
                            color: '#e5e7eb',
                          }
                    }
                  >
                    {grade === 'all' ? 'Tümü' : `${grade}. Sınıf`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.3rem' }}>
                Ders
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.4rem',
                }}
              >
                {subjectIds.length === 0 && (
                  <span style={{ fontSize: '0.8rem', opacity: 0.75 }}>
                    Bu sınıf için içerik yok.
                  </span>
                )}
                {subjectIds.map((subjectId) => (
                  <button
                    key={subjectId}
                    type="button"
                    className={activeSubject === subjectId ? 'primary-btn' : 'ghost-btn'}
                    onClick={() => setActiveSubject(subjectId)}
                    style={
                      activeSubject === subjectId
                        ? undefined
                        : {
                            border: '1px solid rgba(55,65,81,0.9)',
                            background: 'rgba(15,23,42,0.9)',
                            color: '#e5e7eb',
                          }
                    }
                  >
                    {SUBJECT_LABELS[subjectId] ?? subjectId}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.3rem' }}>
                Konu
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.4rem',
                }}
              >
                {topics.length === 0 && (
                  <span style={{ fontSize: '0.8rem', opacity: 0.75 }}>
                    Henüz konu için içerik yok.
                  </span>
                )}
                {topics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    className={activeTopic === topic ? 'primary-btn' : 'ghost-btn'}
                    onClick={() => setActiveTopic(topic)}
                    style={
                      activeTopic === topic
                        ? undefined
                        : {
                            border: '1px solid rgba(55,65,81,0.9)',
                            background: 'rgba(15,23,42,0.9)',
                            color: '#e5e7eb',
                          }
                    }
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: 18,
              background: 'rgba(15,23,42,0.92)',
              border: '1px solid rgba(51,65,85,0.9)',
              padding: '1rem 1.1rem',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            {filteredContents.length === 0 ? (
              <div className="empty-state">Bu filtrelerde içerik bulunamadı.</div>
            ) : (
              <div className="list-stack">
                {filteredContents.map((content) => {
                  const isVideo = (content.url ?? '').toLowerCase().endsWith('.mp4');
                  return (
                    <div
                      className="list-row"
                      key={content.id}
                      style={{
                        cursor: content.url ? 'pointer' : 'default',
                        background: 'rgba(248,250,252,0.96)',
                        borderRadius: 16,
                        border: '1px solid rgba(148,163,184,0.4)',
                        color: '#0f172a',
                      }}
                      onClick={() => {
                        if (!content.url) return;
                        if (isVideo) {
                          setActiveVideoContent(content);
                          setVideoCompleted(false);
                        } else {
                          setActiveDocUrl(resolveContentUrl(content.url!));
                          setActiveDocTitle(content.title ?? 'Doküman');
                        }
                      }}
                    >
                      <div>
                        <strong style={{ color: '#0f172a' }}>{content.title}</strong>
                        <small style={{ color: '#4b5563' }}>
                          {isVideo ? 'Video' : 'PDF / Doküman'}
                        </small>
                      </div>
                      {content.url && (
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isVideo) {
                              setActiveVideoContent(content);
                              setVideoCompleted(false);
                            } else {
                              setActiveDocUrl(resolveContentUrl(content.url!));
                              setActiveDocTitle(content.title ?? 'Doküman');
                            }
                          }}
                        >
                          Aç
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {activeDocUrl && (
              <div
                ref={docViewerRef}
                style={{
                  borderRadius: 16,
                  background: pdfIsReadingMode ? '#fffaf0' : 'rgba(15,23,42,0.95)',
                  border: `1px solid ${pdfIsReadingMode ? 'rgba(251,191,36,0.5)' : 'rgba(148,163,184,0.5)'}`,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 420,
                  transition: 'background 0.3s ease, border-color 0.3s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.6rem 1rem',
                    background: pdfIsReadingMode ? 'rgba(255,250,240,0.95)' : 'rgba(15,23,42,0.98)',
                    borderBottom: '1px solid rgba(148,163,184,0.3)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: pdfIsReadingMode ? '#1f2937' : '#e5e7eb',
                    }}
                  >
                    {activeDocTitle}
                  </span>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setDocViewerReadingMode((v) => !v)}
                      title={pdfIsReadingMode ? 'Okuma modunu kapat' : 'Okuma modu (sıcak arka plan)'}
                      style={{
                        padding: '0.35rem 0.6rem',
                        color: pdfIsReadingMode ? '#92400e' : '#9ca3af',
                        background: pdfIsReadingMode ? 'rgba(251,191,36,0.25)' : 'transparent',
                        border: pdfIsReadingMode ? '1px solid rgba(251,191,36,0.5)' : undefined,
                      }}
                    >
                      <BookOpen size={16} />
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={toggleDocFullscreen}
                      title="Tam ekran"
                      style={{ padding: '0.35rem 0.6rem', color: '#9ca3af' }}
                    >
                      {docViewerFullscreen ? (
                        <Minimize2 size={16} />
                      ) : (
                        <Maximize2 size={16} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        setActiveDocUrl(null);
                        setActiveDocTitle('');
                        if (!globalReadingMode) setDocViewerReadingMode(false);
                      }}
                      style={{ padding: '0.35rem 0.6rem', color: '#9ca3af' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    minHeight: 360,
                    background: pdfIsReadingMode ? '#fff7ed' : '#0f172a',
                    overflow: 'hidden',
                    filter: pdfIsReadingMode ? 'sepia(0.45) brightness(1.05) contrast(0.95)' : 'none',
                    transition: 'filter 0.3s ease, background 0.3s ease',
                    borderRadius: '0 0 16px 16px',
                  }}
                >
                  <iframe
                    src={`${activeDocUrl}#toolbar=1`}
                    title={activeDocTitle}
                    style={{
                      width: '100%',
                      height: '100%',
                      minHeight: 360,
                      border: 'none',
                      background: pdfIsReadingMode ? '#fff7ed' : '#1e293b',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {activeVideoUrl && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: videoIsReadingMode ? 'rgba(255,250,240,0.85)' : 'rgba(15,23,42,0.75)',
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1.25rem',
            transition: 'background 0.3s ease',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 900,
              background: videoIsReadingMode ? '#fffaf0' : '#020617',
              borderRadius: 24,
              padding: '1.5rem',
              boxShadow: '0 26px 80px rgba(0,0,0,0.9)',
              border: `1px solid ${videoIsReadingMode ? 'rgba(251,191,36,0.5)' : 'rgba(148,163,184,0.9)'}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.9rem',
              transition: 'background 0.3s ease, border-color 0.3s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    opacity: 0.8,
                    textTransform: 'uppercase',
                    color: videoIsReadingMode ? '#92400e' : '#a5b4fc',
                  }}
                >
                  Video oynatıcı
                </div>
                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.15rem', color: videoIsReadingMode ? '#1f2937' : '#e5e7eb' }}>
                  Dersi izliyorsunuz
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setVideoReadingMode((v) => !v)}
                  title={videoIsReadingMode ? 'Okuma modunu kapat' : 'Okuma modu'}
                  style={{
                    padding: '0.35rem 0.6rem',
                    color: videoIsReadingMode ? '#92400e' : '#9ca3af',
                    background: videoIsReadingMode ? 'rgba(251,191,36,0.25)' : 'transparent',
                    border: videoIsReadingMode ? '1px solid rgba(251,191,36,0.5)' : undefined,
                  }}
                >
                  <BookOpen size={16} />
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    if (videoCompleted) {
                      setActiveVideoContent(null);
                      setVideoCompleted(false);
                    } else {
                      setVideoExitAlsoCloseOverlay(false);
                      setShowVideoExitConfirm(true);
                    }
                  }}
                >
                  Kapat
                </button>
              </div>
            </div>

            {showResumeHint && (
              <div
                style={{
                  marginBottom: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 12,
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(96, 165, 250, 0.5)',
                  fontSize: '0.85rem',
                  color: '#93c5fd',
                }}
              >
                Kaldığın yerden devam ediyorsun
              </div>
            )}
            <div
              style={{
                overflow: 'hidden',
                borderRadius: 18,
                filter: videoIsReadingMode ? 'sepia(0.35) brightness(1.05) contrast(0.98)' : 'none',
                transition: 'filter 0.3s ease',
              }}
            >
              <video
                ref={videoRef}
                src={activeVideoUrl}
                controls
                autoPlay
                style={{ width: '100%', maxHeight: '70vh', borderRadius: 18, backgroundColor: '#000' }}
                onLoadedMetadata={() => {
                  const vid = videoRef.current;
                  const content = activeVideoContent;
                  if (vid && content?.watchRecord && !content.watchRecord.completed && content.watchRecord.watchedSeconds > 0) {
                    vid.currentTime = Math.min(content.watchRecord.watchedSeconds, vid.duration - 1);
                    setShowResumeHint(true);
                    setTimeout(() => setShowResumeHint(false), 3500);
                  }
                }}
                onTimeUpdate={() => {
                  const vid = videoRef.current;
                  const content = activeVideoContent;
                  if (!vid || !content || !token) return;
                  const now = Date.now();
                  if (now - lastSaveProgressRef.current >= SAVE_PROGRESS_INTERVAL_MS) {
                    lastSaveProgressRef.current = now;
                    const sec = Math.floor(vid.currentTime);
                    if (sec > 0) saveVideoProgress(content.id, sec, false);
                  }
                }}
                onEnded={() => {
                  const content = activeVideoContent;
                  if (content && token) {
                    const vid = videoRef.current;
                    const duration = vid ? Math.floor(vid.duration) : (content.durationMinutes ?? 30) * 60;
                    saveVideoProgress(content.id, duration, true);
                  }
                  setVideoCompleted(true);
                }}
              />
            </div>

            {videoCompleted && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem 0.9rem',
                  borderRadius: 14,
                  background: 'rgba(22,163,74,0.12)',
                  border: '1px solid rgba(34,197,94,0.55)',
                  fontSize: '0.9rem',
                  color: '#bbf7d0',
                }}
              >
                Videoyu başarıyla tamamladın. Harika çalıştın, şimdi istersen diğer içeriklere
                geçebilirsin.
              </div>
            )}
          </div>
        </div>
      )}

      {activeVideoUrl && showVideoExitConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.75)',
            zIndex: 80,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            padding: '4rem 1.25rem 2rem',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              background: '#020617',
              borderRadius: 20,
              padding: '1.25rem 1.4rem',
              boxShadow: '0 26px 70px rgba(0,0,0,0.9)',
              border: '1px solid rgba(148,163,184,0.9)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              color: '#e5e7eb',
            }}
          >
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>Videodan çıkmak üzeresin</div>
            <div style={{ fontSize: '0.85rem', color: '#cbd5f5' }}>
              Çıkarsan bu videodaki izleme ilerlemen kaydedilmeyebilir. Devam etmek istediğine emin
              misin?
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                marginTop: '0.25rem',
              }}
            >
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setShowVideoExitConfirm(false);
                  setVideoExitAlsoCloseOverlay(false);
                }}
              >
                Videoda kal
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={async () => {
                  const content = activeVideoContent;
                  if (content && token && videoRef.current) {
                    const sec = Math.floor(videoRef.current.currentTime);
                    if (sec > 0) await saveVideoProgress(content.id, sec, false);
                  }
                  setShowVideoExitConfirm(false);
                  setActiveVideoContent(null);
                  setVideoCompleted(false);
                  setShowResumeHint(false);
                  if (videoExitAlsoCloseOverlay) {
                    setVideoExitAlsoCloseOverlay(false);
                    onClose();
                  }
                }}
              >
                Çıkışı onayla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StudentOverview: React.FC<{
  metrics: Array<{
    label: string;
    value: string;
    helper?: string;
    trendLabel?: string;
    trendTone?: 'positive' | 'neutral' | 'negative';
  }>;
  meeting: StudentMeeting | null;
  isCoachingMeeting?: boolean;
  events: CalendarEvent[];
  groupedAssignments: Record<AssignmentStatus, StudentAssignment[]>;
  contents: StudentContent[];
  onJoinMeeting: (meetingId?: string) => void;
  onOpenContentLibrary: (initialDoc?: { url: string; title: string }) => void;
  loading: boolean;
  joinMeetingHint?: string | null;
}> = ({
  metrics,
  meeting,
  isCoachingMeeting,
  events,
  groupedAssignments,
  contents,
  onJoinMeeting,
  onOpenContentLibrary,
  loading,
  joinMeetingHint,
}) => (
  <>
    <div className="metric-grid">
      {metrics.map((metric) => (
        <MetricCard key={metric.label} {...metric}>
          <div className="sparkline-bar" />
        </MetricCard>
      ))}
    </div>

    <div className="dual-grid">
      <GlassCard title="Bugünkü Plan" subtitle="Toplantı ve ders bağlantıları">
        <div className="list-stack">
          <div className="list-row">
            <div>
              <strong>{meeting?.title ?? 'Canlı Ders'}</strong>
              <small>
                {meeting
                  ? `${formatShortDate(meeting.scheduledAt)}`
                  : 'Planlı ders bulunamadı'}
              </small>
            </div>
            <button
              type="button"
              className="primary-btn"
              onClick={() => onJoinMeeting(meeting?.id)}
              disabled={!meeting}
            >
              {meeting && isCoachingMeeting ? 'Görüşmeye Katıl' : 'Derse Katıl'}{' '}
              <ArrowRight size={16} />
            </button>
          </div>
          {joinMeetingHint && (
            <div className="card-subtitle" style={{ marginTop: '0.35rem' }}>
              {joinMeetingHint}
            </div>
          )}
        </div>
      </GlassCard>

      <GlassCard title="Haftalık Takvim" subtitle="Planlı etkinlikler">
        {loading && <div className="empty-state">Takvim yükleniyor...</div>}
        {!loading && events.length === 0 && <div className="empty-state">Takvimde kayıt yok.</div>}
        {!loading && events.length > 0 && (
          <div className="calendar-events-list">
            {events.slice(0, 5).map((event) => {
              const t = (event.type || '').toLowerCase();
              const title = (event.title || '').toLowerCase();
              let Icon = CalendarCheck;
              if (t.includes('test') || title.includes('test')) Icon = ClipboardList;
              else if (t.includes('meeting') || t.includes('live') || title.includes('canlı')) Icon = Video;
              else if (t.includes('lesson') || t.includes('ders')) Icon = BookOpen;

              const isMeeting = t.includes('meeting') || t.includes('live') || title.includes('canlı');
              const meetingId = event.relatedId;
              const startTime = event.startDate ? new Date(event.startDate).getTime() : NaN;
              const endTime = event.endDate ? new Date(event.endDate).getTime() : startTime + 30 * 60 * 1000;
              const now = Date.now();
              const canJoin =
                isMeeting &&
                Boolean(meetingId) &&
                !Number.isNaN(startTime) &&
                now >= startTime - MEETING_WINDOW_BEFORE_MS &&
                now <= endTime;

              return (
                <div
                  key={event.id}
                  className="calendar-event calendar-event-inline"
                  style={canJoin ? { cursor: 'pointer' } : undefined}
                  onClick={() => {
                    if (canJoin) onJoinMeeting(meetingId);
                  }}
                >
                  <span className="calendar-event-icon"><Icon size={14} /></span>
                  <div>
                    <span className="calendar-event-title">{event.title}</span>
                    <span className="calendar-event-meta">{formatShortDate(event.startDate)} · {event.status ?? 'Plan'}</span>
                  </div>
                  {canJoin && (
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onJoinMeeting(meetingId);
                      }}
                      style={{ marginLeft: 'auto', padding: '0.25rem 0.7rem', fontSize: '0.75rem' }}
                    >
                      Katıl
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>

    <GlassCard title="Konu Anlatımları" subtitle="Öğretmeninizin paylaştığı PDF ve videolar">
      <div className="list-stack">
        {(contents ?? []).slice(0, 6).map((content) => {
          const isVideo = (content.url ?? '').toLowerCase().endsWith('.mp4');
          return (
            <div className="list-row" key={content.id}>
              <div>
                <strong>{content.title}</strong>
                <small>{isVideo ? 'Video' : 'PDF / Doküman'}</small>
              </div>
              {content.url && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    if (isVideo) {
                      window.open(resolveContentUrl(content.url!), '_blank', 'noopener,noreferrer');
                    } else {
                      onOpenContentLibrary({
                        url: resolveContentUrl(content.url!),
                        title: content.title ?? 'Doküman',
                      });
                    }
                  }}
                >
                  Aç
                </button>
              )}
            </div>
          );
        })}
        {(!contents || contents.length === 0) && (
          <div className="empty-state">Henüz içerik yüklenmedi.</div>
        )}
      </div>
    </GlassCard>

    <GlassCard title="Ödev Akışı" subtitle="Görev durumu">
      <div className="kanban">
        <KanbanColumn title="Bekleyen" count={groupedAssignments.todo.length}>
          {groupedAssignments.todo.map((assignment) => (
            <KanbanCard key={assignment.id} assignment={assignment} />
          ))}
        </KanbanColumn>
        <KanbanColumn title="Geciken" count={groupedAssignments.overdue.length}>
          {groupedAssignments.overdue.map((assignment) => (
            <KanbanCard key={assignment.id} assignment={assignment} completed />
          ))}
        </KanbanColumn>
      </div>
    </GlassCard>
  </>
);

const KanbanColumn: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({
  title,
  count,
  children,
}) => (
  <div className="kanban-column">
    <h4>
      {title} ({count})
    </h4>
    {count === 0 ? <p className="card-subtitle">Henüz öğe yok</p> : children}
  </div>
);

const KanbanCard: React.FC<{ assignment: StudentAssignment; completed?: boolean }> = ({ assignment, completed }) => (
  <div className="kanban-card">
    <strong>{assignment.title}</strong>
    <p className="card-subtitle">{formatShortDate(assignment.dueDate)}</p>
    <TagChip label={completed ? 'Geciken' : 'Bekliyor'} tone={completed ? 'warning' : 'info'} />
    {completed && (
      <span className="progress-pill" style={{ marginTop: '0.5rem' }}>
        <CheckCircle size={14} /> Teslim bekleniyor
      </span>
    )}
  </div>
);

const StudentAssignments: React.FC<{
  assignments: StudentAssignment[];
  onOpen: (assignment: StudentAssignment) => Promise<void>;
  onSubmit: (assignment: StudentAssignment) => Promise<void>;
  loading: boolean;
  startedAssignmentIds: string[];
}> = ({ assignments, onOpen, onSubmit, loading, startedAssignmentIds }) => (
  <GlassCard
    title="Ödev Takibi"
    subtitle="Görevleri gerçek zamanlı güncelle"
    actions={<TagChip label="Canlı API" tone="success" />}
  >
    {loading && <div className="empty-state">Ödevler yükleniyor...</div>}
    {!loading && assignments.length === 0 && <div className="empty-state">Aktif ödev yok.</div>}
    <div className="list-stack">
      {assignments.map((assignment) => (
        <div className="list-row" key={assignment.id}>
          <div>
            <strong>{assignment.title}</strong>
            <small>Son teslim: {formatShortDate(assignment.dueDate)}</small>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button type="button" className="ghost-btn" onClick={() => onOpen(assignment)}>
              {startedAssignmentIds.includes(assignment.id) ? 'Devam et' : 'Başla'}
            </button>
            <button type="button" className="primary-btn" onClick={() => onSubmit(assignment)}>
              Teslim Et
            </button>
          </div>
        </div>
      ))}
    </div>
  </GlassCard>
);

const StudentGrades: React.FC<{
  progress: ProgressOverview | null;
  charts: ProgressCharts | null;
  loading: boolean;
}> = ({ progress, charts, loading }) => (
  <div className="dual-grid">
    <GlassCard
      title="Sınav Performansı"
      subtitle="Son 7 gün ortalama"
    >
      {loading && <div className="empty-state">Analiz yükleniyor...</div>}
      <div className="list-stack">
        <div className="list-row">
          <div>
            <strong>Ortalama Skor</strong>
            <small>Güncel başarı</small>
          </div>
          <TagChip label={`${progress?.averageScorePercent ?? 0}%`} tone="success" />
        </div>
        <div className="list-row">
          <div>
            <strong>Toplam Soru</strong>
            <small>Bu hafta çözülen</small>
          </div>
          <TagChip label={`${progress?.totalQuestionsSolved ?? 0}`} tone="warning" />
        </div>
      </div>
    </GlassCard>

    <GlassCard title="Ders Bazlı Gelişim" subtitle="Konu tamamlanma">
      <div className="list-stack">
        {(progress?.topics ?? []).slice(0, 4).map((topic) => (
          <div className="list-row" key={topic.topic}>
            <div>
              <strong>{topic.topic}</strong>
              <small>Tamamlama: {topic.completionPercent}%</small>
            </div>
            <span className="progress-pill">
              {topic.averageScorePercent}% <Calendar size={14} />
            </span>
          </div>
        ))}
        {charts?.daily?.length === 0 && <div className="empty-state">Veri bulunamadı.</div>}
      </div>
    </GlassCard>
  </div>
);

const StudentCoachingTab: React.FC<{
  loading: boolean;
  sessions: StudentCoachingSession[];
  onJoinMeeting: (meetingId: string) => void;
}> = ({ loading, sessions, onJoinMeeting }) => {
  const upcoming = useMemo(
    () =>
      sessions
        .filter((s) => new Date(s.date).getTime() >= Date.now())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0],
    [sessions],
  );

  const last = useMemo(
    () =>
      sessions
        .filter((s) => new Date(s.date).getTime() < Date.now())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0],
    [sessions],
  );

  return (
    <div className="panel-grid">
      <GlassCard
        title="Koçluk Görüşmeleri"
        subtitle="Öğretmeninle yaptığın birebir gelişim seansları."
      >
        <div className="metric-grid">
          <MetricCard
            label="Toplam Seans"
            value={`${sessions.length}`}
            helper="Tüm zamanlar"
            trendLabel={sessions.length ? 'Aktif koçluk' : 'Başlamak için öğretmeninle konuş.'}
            trendTone={sessions.length ? 'positive' : 'neutral'}
          />
          <MetricCard
            label="Sıradaki Seans"
            value={upcoming ? formatShortDate(upcoming.date) : '-'}
            helper={upcoming ? upcoming.teacherName : 'Planlanmış seans yok'}
            trendLabel={upcoming ? 'Hazırlığını yap' : 'Takipte kal'}
            trendTone={upcoming ? 'positive' : 'neutral'}
          >
            {upcoming && (
              <div className="metric-inline">
                <CalendarCheck size={14} />
              </div>
            )}
          </MetricCard>
          <MetricCard
            label="Son Görüşme"
            value={last ? formatShortDate(last.date) : '-'}
            helper={last ? last.teacherName : 'Henüz görüşme yapılmadı'}
            trendLabel={last ? 'Geri bildirimi gözden geçir' : 'İlk görüşme seni bekliyor'}
            trendTone={last ? 'neutral' : 'negative'}
          />
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.35rem' }}>Tüm Seanslar</h3>
          {loading && sessions.length === 0 && (
            <div className="empty-state">Koçluk kayıtların yükleniyor...</div>
          )}
          {!loading && sessions.length === 0 && (
            <div className="empty-state">
              Henüz koçluk görüşmesi yapılmamış. Öğretmeninle birlikte hedef belirlediğinizde
              buradan tarih ve detayları takip edebilirsin.
            </div>
          )}
          {sessions.length > 0 && (
            <div className="list-stack">
              {sessions.map((s) => (
                <div key={s.id} className="list-row">
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block' }}>
                      {s.title || 'Koçluk görüşmesi'}
                    </strong>
                    <small
                      style={{
                        display: 'block',
                        marginTop: '0.2rem',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {formatShortDate(s.date)} ·{' '}
                      {new Date(s.date).toLocaleTimeString('tr-TR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      {s.durationMinutes ? `· ${s.durationMinutes} dk` : ''}
                    </small>
                    <small
                      style={{
                        display: 'block',
                        marginTop: '0.25rem',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      Koç: {s.teacherName}
                    </small>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-end' }}>
                    <TagChip
                      label={s.mode === 'video' ? 'Görüntülü' : 'Sesli'}
                      tone={s.mode === 'video' ? 'info' : 'success'}
                    />
                    {s.meetingId &&
                      isMeetingJoinable(s.date, s.durationMinutes ?? 30) && (
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => onJoinMeeting(s.meetingId!)}
                        >
                          Görüşmeye Katıl
                        </button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div
            style={{
              marginTop: '0.75rem',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
            }}
          >
            Koçluk seanslarının detaylı notları yalnızca öğretmenin ve yetkili yöneticilerin
            erişimine açıktır; burada sadece temel planlama bilgileri gösterilir.
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

const StudentComplaints: React.FC<{ token: string | null }> = ({ token }) => {
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [form, setForm] = useState<{ aboutTeacherId: string; subject: string; body: string }>({
    aboutTeacherId: '',
    subject: '',
    body: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoadingTeachers(true);
    getStudentTeachers(token)
      .then(setTeachers)
      .catch(() => {})
      .finally(() => setLoadingTeachers(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!token) return;
    setError(null);
    setSuccess(null);
    const subject = form.subject.trim();
    const body = form.body.trim();
    if (!subject || !body) {
      setError('Lütfen konu ve açıklama girin.');
      return;
    }
    setSaving(true);
    try {
      await createStudentComplaint(token, {
        subject,
        body,
        aboutTeacherId: form.aboutTeacherId || undefined,
      });
      setForm({ aboutTeacherId: '', subject: '', body: '' });
      setSuccess('Gönderildi. Admin paneline iletildi.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gönderilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard title="Şikayet / Öneri" subtitle="Admin’e iletilir (isteğe bağlı öğretmen seçimi)">
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <select
          value={form.aboutTeacherId}
          onChange={(e) => setForm((p) => ({ ...p, aboutTeacherId: e.target.value }))}
          disabled={loadingTeachers}
        >
          <option value="">{loadingTeachers ? 'Öğretmenler yükleniyor...' : 'Öğretmen seç (opsiyonel)'}</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Konu"
          value={form.subject}
          onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
        />
        <textarea
          placeholder="Açıklama"
          value={form.body}
          onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
          rows={6}
          style={{ resize: 'vertical' }}
        />
        {error && <div className="error">{error}</div>}
        {success && <div style={{ color: '#10b981', fontSize: '0.9rem' }}>{success}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="primary-btn" onClick={() => handleSubmit().catch(() => {})} disabled={saving}>
            {saving ? 'Gönderiliyor...' : 'Gönder'}
          </button>
        </div>
      </div>
    </GlassCard>
  );
};

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
  MessageCircle,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from './AuthContext';
import {
  createTeacherContent,
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
  sendTeacherMessage,
  uploadTeacherVideo,
  type CalendarEvent,
  type TeacherContent,
  type TeacherDashboardSummary,
  type TeacherMeeting,
  type TeacherStudent,
  type TeacherStudentProfile,
  type Message,
  sendTeacherAiMessage,
  type TeacherAnnouncement,
  createTeacherAnnouncement,
} from './api';
import { DashboardLayout, GlassCard, MetricCard, TagChip } from './components/DashboardPrimitives';
import type { SidebarItem } from './components/DashboardPrimitives';
import { useApiState } from './hooks/useApiState';
import { LiveClassOverlay } from './LiveClassOverlay';

type TeacherTab = 'overview' | 'content' | 'calendar' | 'students';

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
  const [meetings, setMeetings] = useState<TeacherMeeting[]>([]);
  const [messageText, setMessageText] = useState('');
  const [studentMessages, setStudentMessages] = useState<Message[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedStudentProfile, setSelectedStudentProfile] = useState<TeacherStudentProfile | null>(null);
  const [studentProfileLoading, setStudentProfileLoading] = useState(false);
  const [contentDraft, setContentDraft] = useState({
    title: '',
    type: 'video',
    topic: '',
    gradeLevel: '',
    url: '',
  });
  const [contentSubjectId, setContentSubjectId] = useState<string>('sub1');
  const [contentVideoFile, setContentVideoFile] = useState<File | null>(null);
  const [contentUploading, setContentUploading] = useState(false);
  const [announcements, setAnnouncements] = useState<TeacherAnnouncement[]>([]);
  const [announcementDraft, setAnnouncementDraft] = useState({
    title: '',
    message: '',
    scheduledDate: '',
  });
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [announcementCreating, setAnnouncementCreating] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
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
  });
  const [liveClass, setLiveClass] = useState<{ url: string; token: string; title?: string } | null>(null);

  const dashboardState = useApiState<TeacherDashboardSummary>(null);
  const assignmentsState = useApiState<Array<{ id: string; title?: string; dueDate?: string }>>([]);
  const calendarState = useApiState<CalendarEvent[]>([]);

  useEffect(() => {
    if (!token) return;
    dashboardState.run(() => getTeacherDashboard(token)).catch(() => {});
    getTeacherContents(token).then(setContents).catch(() => {});
    getTeacherMessages(token)
      .then(setStudentMessages)
      .catch(() => {});
    getTeacherStudents(token)
      .then((data) => {
        setStudents(data);
        if (!selectedStudentId && data[0]) {
          setSelectedStudentId(data[0].id);
        }
      })
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
  }, [token]);

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

  const handleSendMessage = async () => {
    if (!token || !selectedStudentId || !messageText.trim()) return;
    const created = await sendTeacherMessage(token, { toUserId: selectedStudentId, text: messageText.trim() });
    setMessageText('');
    setStudentMessages((prev) => [...prev, created]);
  };

  const handleSaveMeeting = async () => {
    if (!token) return;

    const title = meetingDraft.title.trim();

    if (!title || !meetingDraft.scheduledAt) {
      setMeetingError('Lütfen ders başlığı ve tarih/saat alanlarını doldurun.');
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

    let targetStudentIds: string[] = [];
    if (meetingDraft.audience === 'selected') {
      targetStudentIds = meetingDraft.selectedStudentIds;
      if (targetStudentIds.length === 0) {
        setMeetingError('Lütfen en az bir öğrenci seçin.');
        return;
      }
    } else {
      targetStudentIds = students.map((s) => s.id);
      if (targetStudentIds.length === 0) {
        setMeetingError('Sistemde kayıtlı öğrenci bulunamadı.');
        return;
      }
    }

    const composedTitle =
      meetingDraft.description.trim().length > 0
        ? `${title} – ${meetingDraft.description.trim()}`
        : title;

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
    const subjectId = contentSubjectId || contents[0]?.subjectId || 'sub1';
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
      description: contentDraft.topic || '', // Konu detayı açıklama olarak kullanılıyor
      durationMinutes: 0, // Video süresi opsiyonel, varsayılan 0
    });
    setContents((prev) => [created, ...prev]);
    setContentDraft({ title: '', type: 'video', topic: '', gradeLevel: '', url: '' });
    setContentVideoFile(null);
    setContentSubjectId('sub1');
  };

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
        setLiveClass({ url: session.url, token: session.token, title });
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
    ],
    [activeTab],
  );

  return (
    <DashboardLayout
      accent="slate"
      brand="SKYTECH"
      tagline={user?.name ?? 'Öğretmen'}
      title="Öğretmen Kontrol Merkezi"
      subtitle="Gerçek zamanlı içerik, takvim ve öğrenci verileri."
      status={{ label: `${dashboardState.data?.recentActivity?.length ?? 0} aktivite`, tone: 'warning' }}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'ÖĞ',
        name: user?.name ?? 'Öğretmen',
        subtitle: 'Öğretmen',
      }}
      headerActions={
        <button type="button" className="ghost-btn" aria-label="Bildirimler">
          <Bell size={16} />
        </button>
      }
      onLogout={logout}
    >
      {activeTab === 'overview' && (
        <TeacherOverview
          metrics={metrics}
          activities={dashboardState.data?.recentActivity ?? []}
          meetings={meetings}
          onCreateMeeting={openMeetingModal}
          onStartLive={handleStartLiveMeeting}
        />
      )}
      {activeTab === 'content' && (
        <TeacherContent
          contents={contents}
          draft={contentDraft}
          subjectId={contentSubjectId}
          onChangeSubject={setContentSubjectId}
          onDraftChange={setContentDraft}
          onCreateContent={handleCreateContent}
          onSelectVideoFile={setContentVideoFile}
          selectedVideoFileName={contentVideoFile?.name}
          uploadingVideo={contentUploading}
        />
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
      {activeTab === 'students' && (
        <TeacherStudents
          students={students}
          messageText={messageText}
          onMessageChange={setMessageText}
          selectedStudentId={selectedStudentId}
          onSelectStudent={setSelectedStudentId}
          onSendMessage={handleSendMessage}
          assignments={assignmentsState.data ?? []}
          messages={studentMessages}
          studentProfile={selectedStudentProfile}
          profileLoading={studentProfileLoading}
        />
      )}
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
          });
        }}
        draft={meetingDraft}
        onDraftChange={setMeetingDraft}
        onSubmit={handleSaveMeeting}
        saving={meetingSaving}
        error={meetingError}
        students={students}
      />
      {liveClass && (
        <LiveClassOverlay
          url={liveClass.url}
          token={liveClass.token}
          title={liveClass.title}
          role="teacher"
          onClose={() => setLiveClass(null)}
        />
      )}
    </DashboardLayout>
  );
};

const TeacherOverview: React.FC<{
  metrics: Array<{ label: string; value: string; helper?: string; trendLabel?: string; trendTone?: 'positive' | 'neutral' }>;
  activities: string[];
  meetings: TeacherMeeting[];
  onCreateMeeting: () => void;
  onStartLive: (meetingId: string) => void;
}> = ({ metrics, activities, meetings, onCreateMeeting, onStartLive }) => {
  const now = Date.now();
  const upcomingMeetings = meetings
    .filter((meeting) => {
      const time = new Date(meeting.scheduledAt).getTime();
      if (Number.isNaN(time)) return false;
      // Biraz tolerans: 10 dk geçmiş toplantıları da gösterme
      return time >= now - 10 * 60 * 1000;
    })
    .slice(0, 3);

  // Eğer hiç yaklaşan yoksa, en son 3 toplantıyı göster
  const visibleMeetings =
    upcomingMeetings.length > 0 ? upcomingMeetings : meetings.slice(-3);

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
        actions={
          <>
            <button type="button" className="primary-btn" onClick={onCreateMeeting}>
              Yeni Canlı Ders
            </button>
          </>
        }
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
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.7rem' }}
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
          {activities.slice(0, 4).map((activity) => (
            <div className="list-row" key={activity}>
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
  draft: { title: string; type: string; topic: string; gradeLevel: string; url: string };
  subjectId: string;
  onChangeSubject: (subjectId: string) => void;
  onDraftChange: (draft: { title: string; type: string; topic: string; gradeLevel: string; url: string }) => void;
  onCreateContent: () => void;
  onSelectVideoFile: (file: File | null) => void;
  selectedVideoFileName?: string | null;
  uploadingVideo?: boolean;
}> = ({ contents, draft, subjectId, onChangeSubject, onDraftChange, onCreateContent, onSelectVideoFile, selectedVideoFileName, uploadingVideo }) => (
  <GlassCard title="İçerik Kütüphanesi" subtitle="Yeni içerik oluştur">
      <div className="list-stack" style={{ marginBottom: '1rem' }}>
        <div className="list-row">
          <div style={{ flex: 1 }}>
            <strong>Yeni İçerik</strong>
            <small>Ders, konu ve link girin veya video yükleyin</small>
          </div>
        </div>
        <div style={{ display: 'grid', gap: '0.6rem' }}>
          <select
            value={subjectId}
            onChange={(event) => onChangeSubject(event.target.value)}
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem',
              borderRadius: 999,
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface)',
              fontSize: '0.9rem',
            }}
          >
            <option value="sub1">Matematik</option>
            <option value="sub2">Fizik</option>
            <option value="sub3">Biyoloji</option>
            <option value="sub4">Kimya</option>
          </select>
          <input
            type="text"
            placeholder="Konu başlığı"
            value={draft.title}
            onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
          />
          <input
            type="text"
            placeholder="Konu detayı / açıklama"
            value={draft.topic}
            onChange={(event) => onDraftChange({ ...draft, topic: event.target.value })}
          />
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
            <option value="9">9. Sınıf</option>
            <option value="10">10. Sınıf</option>
            <option value="11">11. Sınıf</option>
            <option value="12">12. Sınıf</option>
          </select>
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
  onCreateMeeting,
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
          <button type="button" className="primary-btn" onClick={onCreateMeeting}>
            Canlı Ders Planla
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
}> = ({ open, onClose, draft, onDraftChange, onSubmit, saving, error, students }) => {
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
  students: TeacherStudent[];
  messageText: string;
  onMessageChange: (value: string) => void;
  selectedStudentId: string;
  onSelectStudent: (value: string) => void;
  onSendMessage: () => void;
  assignments: Array<{ id: string; title?: string; dueDate?: string }>;
  messages: (Message & { fromUserName?: string; toUserName?: string })[];
  studentProfile: TeacherStudentProfile | null;
  profileLoading: boolean;
}> = ({
  students,
  messageText,
  onMessageChange,
  selectedStudentId,
  onSelectStudent,
  onSendMessage,
  assignments,
  messages,
  studentProfile,
  profileLoading,
}) => {
  const [showAllMessages, setShowAllMessages] = useState(true);

  const visibleMessages = showAllMessages
    ? messages
    : messages.filter(
        (message) =>
          message.fromUserId === selectedStudentId ||
          message.toUserId === selectedStudentId ||
          message.studentId === selectedStudentId,
      );

  return (
    <GlassCard
      title="Öğrenci İçgörüleri"
      subtitle="Mesajlar ve görevler"
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
        </>
      }
    >
      <div style={{ display: 'grid', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <select value={selectedStudentId} onChange={(event) => onSelectStudent(event.target.value)}>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.name} {student.gradeLevel ? `(${student.gradeLevel}. Sınıf)` : ''}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Mesajınız"
          value={messageText}
          onChange={(event) => onMessageChange(event.target.value)}
        />
        <button type="button" className="ghost-btn" onClick={onSendMessage}>
          Hızlı Gönder
        </button>
      </div>
      <div style={{ marginBottom: '1.25rem' }}>
        {profileLoading ? (
          <div className="empty-state">Öğrenci verileri yükleniyor...</div>
        ) : studentProfile ? (
          <>
            <div className="metric-grid">
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
      <div
        className="list-stack"
        style={{
          marginBottom: '1.25rem',
          maxHeight: 260,
          overflow: 'auto',
        }}
      >
        {visibleMessages
          .slice()
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .reverse()
          .map((message) => (
            <div key={message.id} className="list-row">
              <div>
                <strong>
                  {message.fromUserName ?? message.fromUserId} → {message.toUserName ?? message.toUserId}
                </strong>
                <small>{message.text}</small>
              </div>
              <span className="chip subtle">{formatShortDate(message.createdAt)}</span>
            </div>
          ))}
        {visibleMessages.length === 0 && <div className="empty-state">Henüz mesaj yok.</div>}
      </div>
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
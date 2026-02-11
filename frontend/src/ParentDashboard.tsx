import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BookOpen, CalendarCheck, ClipboardList, MessageSquare, PhoneCall, BarChart3, Video } from 'lucide-react';
import { useAuth } from './AuthContext';
import {
  getParentCalendar,
  getParentChildSummary,
  getParentChildFeedback,
  getParentTeachers,
  createParentComplaint,
  getParentConversations,
  getParentDashboard,
  getParentMeetings,
  getParentNotifications,
  getParentConversation,
  joinParentMeeting,
  markParentMessageRead,
  sendParentMessage,
  resolveContentUrl,
  type CalendarEvent,
  type Conversation,
  type Message,
  type ParentDashboardSummary,
  type ParentMeeting,
  type ParentNotification,
  type StudentDetailSummary,
  type TeacherFeedbackItem,
  type TeacherListItem,
} from './api';
import { ParentReports } from './ParentReports';
import { DashboardLayout, GlassCard, MetricCard, TagChip } from './components/DashboardPrimitives';
import type { BreadcrumbItem, SidebarItem } from './components/DashboardPrimitives';
import { useApiState } from './hooks/useApiState';
import { useSearchParams } from 'react-router-dom';

type ParentTab = 'overview' | 'calendar' | 'messages' | 'notifications' | 'feedback' | 'complaints' | 'reports';

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
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
};

export const ParentDashboard: React.FC = () => {
  const { token, user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ParentTab>('overview');
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'overview' || tab === 'notifications' || tab === 'reports') {
      if (tab === 'notifications') {
        setActiveTab('notifications');
      } else if (tab === 'reports') {
        setActiveTab('reports');
      } else {
        setActiveTab('overview');
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const dashboardState = useApiState<ParentDashboardSummary>(null);
  const summaryState = useApiState<StudentDetailSummary>(null);
  const notificationsState = useApiState<ParentNotification[]>([]);
  const calendarState = useApiState<CalendarEvent[]>([]);
  const meetingsState = useApiState<ParentMeeting[]>([]);
  const conversationsState = useApiState<Conversation[]>([]);
  const messagesState = useApiState<Message[]>([]);
  const feedbackState = useApiState<TeacherFeedbackItem[]>([]);

  useEffect(() => {
    if (!token) return;
    dashboardState
      .run(() => getParentDashboard(token))
      .then((data) => {
        if (!selectedStudentId && data.children.length > 0) {
          setSelectedStudentId(data.children[0].studentId);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !selectedStudentId) return;
    summaryState.run(() => getParentChildSummary(token, selectedStudentId)).catch(() => {});
  }, [token, selectedStudentId]);

  useEffect(() => {
    if (!token || !selectedStudentId) return;
    if (activeTab !== 'feedback') return;
    feedbackState.run(() => getParentChildFeedback(token, selectedStudentId)).catch(() => {});
  }, [token, selectedStudentId, activeTab]);

  useEffect(() => {
    if (!token) return;
    const { start, end } = getWeekRange();
    notificationsState.run(() => getParentNotifications(token, 50)).catch(() => {});
    calendarState
      .run(async () => {
        const payload = await getParentCalendar(token, start.toISOString(), end.toISOString());
        return payload.events;
      })
      .catch(() => {});
    meetingsState.run(() => getParentMeetings(token)).catch(() => {});
    conversationsState
      .run(() => getParentConversations(token))
      .then((data) => {
        if (!selectedConversationId && data.length > 0) {
          setSelectedConversationId(data[0].userId);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !selectedConversationId) return;
    getParentConversation(token, selectedConversationId)
      .then((data) => {
        messagesState.setData(data);
        data
          .filter((message) => !message.read && message.toUserId === user?.id)
          .forEach((message) => markParentMessageRead(token, message.id).catch(() => {}));
      })
      .catch((err) => messagesState.setError(err instanceof Error ? err.message : 'Mesajlar yüklenemedi'));
  }, [token, selectedConversationId, user]);

  const selectedChild = dashboardState.data?.children.find((child) => child.studentId === selectedStudentId);
  const activeConversation = conversationsState.data?.find((conv) => conv.userId === selectedConversationId);

  const handleReply = async () => {
    if (!token || !activeConversation) return;

    // Eğer yanıt metni boşsa, bu çağrı "Ara" isteği olarak yorumlanır
    const text = replyText.trim() || 'Veli sizinle canlı görüşme talep ediyor.';
    const subject = replyText.trim()
      ? undefined
      : 'Canlı görüşme talebi';

    const message = await sendParentMessage(token, {
      toUserId: activeConversation.userId,
      studentId: activeConversation.studentId,
      text,
      // Öğretmene anlamlı bir başlık iletilsin
      subject,
    });
    messagesState.setData([...(messagesState.data ?? []), message]);
    setReplyText('');
  };

  const handleJoinMeeting = async () => {
    if (!token) return;
    const meeting = meetingsState.data?.[0];
    if (!meeting) return;
    const res = await joinParentMeeting(token, meeting.id);
    window.open(res.meetingUrl, '_blank', 'noopener,noreferrer');
  };

  const sidebarItems = useMemo<SidebarItem[]>(
    () => [
      {
        id: 'overview',
        label: 'Akademik Durum',
        icon: <BarChart3 size={18} />,
        description: 'Özet',
        active: activeTab === 'overview',
        onClick: () => setActiveTab('overview'),
      },
      {
        id: 'calendar',
        label: 'Devamsızlık',
        icon: <CalendarCheck size={18} />,
        description: 'Takvim',
        active: activeTab === 'calendar',
        onClick: () => setActiveTab('calendar'),
      },
      {
        id: 'reports',
        label: 'Gelişim Raporu',
        icon: <BarChart3 size={18} />,
        description: 'Öğrenci hedef ve performans özeti',
        active: activeTab === 'reports',
        onClick: () => setActiveTab('reports'),
      },
      {
        id: 'messages',
        label: 'İletişim',
        icon: <MessageSquare size={18} />,
        description: 'Rehberlik',
        badge: conversationsState.data?.reduce((sum, c) => sum + c.unreadCount, 0) || undefined,
        active: activeTab === 'messages',
        onClick: () => setActiveTab('messages'),
      },
      {
        id: 'notifications',
        label: 'Bildirimler',
        icon: <Bell size={18} />,
        description: 'Kurum bildirimleri',
        badge:
          (notificationsState.data ?? []).filter((n) => !n.read).length > 0
            ? (notificationsState.data ?? []).filter((n) => !n.read).length
            : undefined,
        active: activeTab === 'notifications',
        onClick: () => setActiveTab('notifications'),
      },
      {
        id: 'feedback',
        label: 'Değerlendirme',
        icon: <BookOpen size={18} />,
        description: 'Öğretmen notu',
        active: activeTab === 'feedback',
        onClick: () => setActiveTab('feedback'),
      },
      {
        id: 'complaints',
        label: 'Şikayet/Öneri',
        icon: <ClipboardList size={18} />,
        description: 'Admin',
        active: activeTab === 'complaints',
        onClick: () => setActiveTab('complaints'),
      },
    ],
    [activeTab, conversationsState.data, notificationsState.data],
  );

  const parentBreadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const tabLabels: Record<string, string> = {
      overview: 'Akademik Durum',
      calendar: 'Devamsızlık',
      reports: 'Gelişim Raporu',
      messages: 'İletişim',
      notifications: 'Bildirimler',
      feedback: 'Değerlendirme',
      complaints: 'Şikayet/Öneri',
    };
    const items: BreadcrumbItem[] = [
      { label: 'Ana Sayfa', onClick: activeTab !== 'overview' ? () => setActiveTab('overview') : undefined },
    ];
    if (tabLabels[activeTab]) items.push({ label: tabLabels[activeTab] });
    return items;
  }, [activeTab]);

  return (
    <DashboardLayout
      accent="emerald"
      brand="SKYTECH"
      tagline={selectedChild?.studentName ?? 'Veli Yönetim Paneli'}
      title="Veli Yönetim Paneli"
      subtitle="Akademik performans, takvim ve mesajları gerçek zamanlı takip edin."
      status={{
        label: selectedChild?.status === 'active' ? 'Aktif - Okulda' : 'Pasif',
        tone: selectedChild?.status === 'active' ? 'success' : 'warning',
      }}
      breadcrumbs={parentBreadcrumbs}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'VP',
        name: user?.name ?? 'Veli',
        subtitle: 'Veli',
        profilePictureUrl: resolveContentUrl(user?.profilePictureUrl),
      }}
      headerActions={
        <button
          type="button"
          className="ghost-btn"
          aria-label="Bildirimler"
          onClick={() => setActiveTab('notifications')}
        >
          <Bell size={16} />
        </button>
      }
      onLogout={logout}
    >
      {activeTab === 'overview' && (
        <ParentOverview
          summary={summaryState.data}
          notifications={notificationsState.data ?? []}
          meetings={meetingsState.data ?? []}
          onJoinMeeting={handleJoinMeeting}
          loading={summaryState.loading}
        />
      )}
      {activeTab === 'calendar' && (
        <ParentCalendar events={calendarState.data ?? []} loading={calendarState.loading} />
      )}
      {activeTab === 'reports' && <ParentReports />}
      {activeTab === 'notifications' && (
        <GlassCard title="Bildirimler" subtitle="Kurum ve öğretmen bildirimleri">
          <div className="list-stack">
            {notificationsState.loading && (notificationsState.data ?? []).length === 0 && (
              <div className="empty-state">Yükleniyor...</div>
            )}
            {!notificationsState.loading && (notificationsState.data ?? []).length === 0 && (
              <div className="empty-state">Henüz bildirim yok.</div>
            )}
            {(notificationsState.data ?? []).map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                  <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.75 }}>
                    {new Date(item.createdAt).toLocaleDateString('tr-TR')}
                  </small>
                </div>
                <TagChip label={item.read ? 'Okundu' : 'Yeni'} tone={item.read ? 'success' : 'warning'} />
              </div>
            ))}
          </div>
        </GlassCard>
      )}
      {activeTab === 'messages' && (
        <ParentMessages
          conversations={conversationsState.data ?? []}
          messages={messagesState.data ?? []}
          selectedConversationId={selectedConversationId}
          onSelectConversation={setSelectedConversationId}
          replyText={replyText}
          onReplyTextChange={setReplyText}
          onReply={handleReply}
          loading={messagesState.loading}
          error={messagesState.error}
        />
      )}
      {activeTab === 'feedback' && (
        <ParentFeedback items={feedbackState.data ?? []} loading={feedbackState.loading} error={feedbackState.error} />
      )}
      {activeTab === 'complaints' && <ParentComplaints token={token} />}
    </DashboardLayout>
  );
};

const ParentComplaints: React.FC<{ token: string | null }> = ({ token }) => {
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
    getParentTeachers(token)
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
      await createParentComplaint(token, {
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

const ParentFeedback: React.FC<{
  items: TeacherFeedbackItem[];
  loading: boolean;
  error: string | null;
}> = ({ items, loading, error }) => (
  <GlassCard title="Öğretmen Değerlendirmeleri" subtitle="Sadece veli görebilir">
    {loading && <div className="empty-state">Yükleniyor...</div>}
    {error && <div className="error">{error}</div>}
    {!loading && items.length === 0 && <div className="empty-state">Henüz değerlendirme yok.</div>}
    <div className="list-stack">
      {items.map((f) => (
        <div key={f.id} className="list-row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block' }}>{f.title}</strong>
            <small style={{ display: 'block', marginTop: '0.15rem' }}>
              {f.teacherName} · {new Date(f.createdAt).toLocaleString('tr-TR')}
            </small>
            <div style={{ marginTop: '0.45rem', whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {f.content}
            </div>
          </div>
          <TagChip label={f.type} tone="info" />
        </div>
      ))}
    </div>
  </GlassCard>
);

const ParentOverview: React.FC<{
  summary: StudentDetailSummary | null;
  notifications: ParentNotification[];
  meetings: ParentMeeting[];
  onJoinMeeting: () => void;
  loading: boolean;
}> = ({ summary, notifications, meetings, onJoinMeeting, loading }) => {
  const quick = summary?.quickStats;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1.5rem',
          padding: '1.25rem',
          borderRadius: 20,
          background: 'var(--color-surface-soft)',
          border: '1px solid var(--color-border-subtle)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {summary?.profilePictureUrl ? (
          <img
            src={resolveContentUrl(summary.profilePictureUrl)}
            alt={summary.studentName}
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
            {summary?.studentName.slice(0, 2).toUpperCase() || 'ÖGR'}
          </div>
        )}
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-main)' }}>
            {summary?.studentName || 'Yükleniyor...'}
          </h2>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            {summary?.gradeLevel ? `${summary.gradeLevel}. Sınıf` : 'Öğrenci'} · {summary?.className || 'Okulda'}
          </p>
        </div>
      </div>

      <div className="metric-grid">
        <MetricCard
          label="Ortalama Skor"
          value={`${quick?.averageScorePercent ?? 0}%`}
          helper="Son 7 gün"
          trendLabel={`${quick?.testsSolvedLast7Days ?? 0} test`}
          trendTone="positive"
        >
          <div className="sparkline-bar" />
        </MetricCard>
        <MetricCard
          label="Çalışma Süresi"
          value={`${quick?.totalStudyMinutes ?? 0} dk`}
          helper="Toplam izleme"
          trendLabel="Günlük hedef"
        >
          <div className="sparkline-bar" />
        </MetricCard>
        <MetricCard
          label="Bekleyen Ödev"
          value={`${quick?.pendingAssignmentsCount ?? 0}`}
          helper={`Geciken: ${quick?.overdueAssignmentsCount ?? 0}`}
          trendLabel="Haftalık görev"
          trendTone="neutral"
        >
          <div className="sparkline-bar" />
        </MetricCard>
        <MetricCard
          label="Aktiviteler"
          value={`${summary?.recentActivities?.length ?? 0}`}
          helper="Son kayıtlar"
          trendLabel="Güncel"
          trendTone="positive"
        >
          <div className="sparkline-bar" />
        </MetricCard>
      </div>

      <div className="dual-grid">
        <GlassCard title="Kurum Bildirimleri" subtitle="Son güncellemeler">
          <div className="list-stack">
            {loading && <div className="empty-state">Bildirimler yükleniyor...</div>}
            {!loading && notifications.length === 0 && <div className="empty-state">Bildirim bulunamadı.</div>}
            {notifications.map((item) => (
              <div className="list-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </div>
                <TagChip label={item.read ? 'Okundu' : 'Yeni'} tone={item.read ? 'success' : 'warning'} />
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard
          title="Toplantılar ve Canlı Dersler"
          subtitle="Planlanan rehberlik ve canlı oturumlar"
          actions={
            <>
              <button type="button" className="ghost-btn" onClick={onJoinMeeting}>
                Görüşmeye Katıl
              </button>
              <button type="button" className="primary-btn" onClick={onJoinMeeting}>
                Randevu Seç
              </button>
            </>
          }
        >
          <div className="list-stack">
            {meetings.length === 0 && <div className="empty-state">Planlı görüşme yok.</div>}
            {meetings.map((meeting) => (
              <div className="list-row" key={meeting.id}>
                <div>
                  <strong>{meeting.title}</strong>
                  <small>
                    {formatShortDate(meeting.scheduledAt)} · {formatTime(meeting.scheduledAt)}
                  </small>
                </div>
                <TagChip
                  label={meeting.durationMinutes ? `${meeting.durationMinutes} dk` : 'Toplantı'}
                  tone="success"
                />
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </>
  );
};

const getEventIcon = (event: CalendarEvent) => {
  const t = (event.type || '').toLowerCase();
  const title = (event.title || '').toLowerCase();
  if (t.includes('test') || title.includes('test')) return <ClipboardList size={14} />;
  if (t.includes('meeting') || t.includes('live') || title.includes('canlı')) return <Video size={14} />;
  if (t.includes('lesson') || t.includes('ders')) return <BookOpen size={14} />;
  return <CalendarCheck size={14} />;
};

const ParentCalendar: React.FC<{ events: CalendarEvent[]; loading: boolean }> = ({ events, loading }) => {
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
      <GlassCard title="Haftalık Takvim" subtitle="Etüt ve toplantılar">
        {loading && <div className="empty-state">Takvim yükleniyor...</div>}
        {!loading && events.length === 0 && <div className="empty-state">Takvimde kayıt bulunamadı.</div>}
        <div className="calendar-grid calendar-modern">
          {sortedDays.map((day) => (
            <div key={day} className="calendar-day">
              <div className="calendar-day-header">{day}</div>
              <div className="calendar-day-events">
                {byDay[day].map((event) => (
                  <div key={event.id} className="calendar-event">
                    <span className="calendar-event-icon">{getEventIcon(event)}</span>
                    <span className="calendar-event-title">{event.title}</span>
                    {event.startDate && (
                      <span className="calendar-event-time">{formatTime(event.startDate)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </>
  );
};

const ParentMessages: React.FC<{
  conversations: Conversation[];
  messages: Message[];
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  replyText: string;
  onReplyTextChange: (value: string) => void;
  onReply: () => void;
  loading: boolean;
  error: string | null;
}> = ({
  conversations,
  messages,
  selectedConversationId,
  onSelectConversation,
  replyText,
  onReplyTextChange,
  onReply,
  loading,
  error,
}) => {
  const activeConversation = conversations.find((conv) => conv.userId === selectedConversationId);
  const latestMessage = messages[messages.length - 1];

  return (
    <div className="dual-grid">
      <GlassCard title="İletişim Kutusu" subtitle="Rehberlik ve öğretmen mesajları">
        <div className="list-stack">
          {conversations.length === 0 && <div className="empty-state">Konuşma bulunamadı.</div>}
          {conversations.map((thread) => (
            <button
              type="button"
              key={thread.userId}
              onClick={() => onSelectConversation(thread.userId)}
              className={`list-row message-row${thread.userId === selectedConversationId ? ' active' : ''}`}
              style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              {thread.profilePictureUrl ? (
                <img
                  src={resolveContentUrl(thread.profilePictureUrl)}
                  alt={thread.userName}
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: '50%',
                    objectFit: 'cover',
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
                    flexShrink: 0,
                  }}
                >
                  {thread.userName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <strong>{thread.userName}</strong>
                <small>{thread.lastMessage?.text ?? 'Mesaj yok'}</small>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                <span>{formatShortDate(thread.lastMessage?.createdAt)}</span>
                {thread.unreadCount > 0 && <TagChip label={`+${thread.unreadCount}`} tone="warning" />}
              </div>
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard
        title={activeConversation?.userName ?? 'Mesaj Detayı'}
        subtitle={
          activeConversation?.studentName
            ? `İlgili öğrenci: ${activeConversation.studentName}`
            : 'Son mesajlar'
        }
        actions={
          <>
            <button
              type="button"
              className="ghost-btn"
              onClick={onReply}
            >
              <PhoneCall size={16} /> Ara
            </button>
            <button type="button" className="primary-btn" onClick={onReply}>
              Yanıtla
            </button>
          </>
        }
      >
        {loading && <div className="empty-state">Mesajlar yükleniyor...</div>}
        {error && <div className="error">{error}</div>}
        {!loading && messages.length === 0 && <div className="empty-state">Mesaj bulunamadı.</div>}
        {latestMessage && (
          <div
            className="list-row"
            style={{
              marginBottom: '0.75rem',
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface)',
            }}
          >
            <div>
              <strong style={{ display: 'block' }}>
                {latestMessage.subject || 'Son mesaj'}
              </strong>
              <small style={{ display: 'block', marginTop: '0.25rem' }}>
                {latestMessage.text}
              </small>
            </div>
            <span>{formatTime(latestMessage.createdAt)}</span>
          </div>
        )}
        <div className="list-stack">
          {messages.map((message) => (
            <div className="list-row" key={message.id}>
              <div>
                <strong>{message.fromUserId === activeConversation?.userId ? activeConversation?.userName : 'Siz'}</strong>
                <small>{message.text}</small>
              </div>
              <span>{formatTime(message.createdAt)}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.6rem' }}>
          <input
            type="text"
            value={replyText}
            onChange={(event) => onReplyTextChange(event.target.value)}
            placeholder="Yanıtınızı yazın..."
          />
          <button type="button" className="ghost-btn" onClick={onReply}>
            Hızlı Gönder
          </button>
        </div>
      </GlassCard>
    </div>
  );
};
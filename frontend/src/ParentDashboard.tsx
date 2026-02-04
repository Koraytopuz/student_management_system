import React, { useEffect, useMemo, useState } from 'react';
import { Bell, BookOpen, CalendarCheck, ClipboardList, MessageSquare, PhoneCall, BarChart3, Video } from 'lucide-react';
import { useAuth } from './AuthContext';
import {
  getParentCalendar,
  getParentChildSummary,
  getParentConversations,
  getParentDashboard,
  getParentMeetings,
  getParentNotifications,
  getParentConversation,
  joinParentMeeting,
  markParentMessageRead,
  sendParentMessage,
  type CalendarEvent,
  type Conversation,
  type Message,
  type ParentDashboardSummary,
  type ParentMeeting,
  type ParentNotification,
  type StudentDetailSummary,
} from './api';
import { DashboardLayout, GlassCard, MetricCard, TagChip } from './components/DashboardPrimitives';
import type { SidebarItem } from './components/DashboardPrimitives';
import { useApiState } from './hooks/useApiState';

type ParentTab = 'overview' | 'calendar' | 'messages';

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
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const dashboardState = useApiState<ParentDashboardSummary>(null);
  const summaryState = useApiState<StudentDetailSummary>(null);
  const notificationsState = useApiState<ParentNotification[]>([]);
  const calendarState = useApiState<CalendarEvent[]>([]);
  const meetingsState = useApiState<ParentMeeting[]>([]);
  const conversationsState = useApiState<Conversation[]>([]);
  const messagesState = useApiState<Message[]>([]);

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
    if (!token) return;
    const { start, end } = getWeekRange();
    notificationsState.run(() => getParentNotifications(token)).catch(() => {});
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
    if (!token || !activeConversation || !replyText.trim()) return;
    const message = await sendParentMessage(token, {
      toUserId: activeConversation.userId,
      studentId: activeConversation.studentId,
      text: replyText.trim(),
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
        id: 'messages',
        label: 'İletişim',
        icon: <MessageSquare size={18} />,
        description: 'Rehberlik',
        badge: conversationsState.data?.reduce((sum, c) => sum + c.unreadCount, 0) || undefined,
        active: activeTab === 'messages',
        onClick: () => setActiveTab('messages'),
      },
    ],
    [activeTab, conversationsState.data],
  );

  return (
    <DashboardLayout
      accent="emerald"
      brand="SKYTECH"
      tagline={selectedChild?.studentName ?? 'Veli Paneli'}
      title="Veli Paneli"
      subtitle="Akademik performans, takvim ve mesajları gerçek zamanlı takip edin."
      status={{
        label: selectedChild?.status === 'active' ? 'Aktif - Okulda' : 'Pasif',
        tone: selectedChild?.status === 'active' ? 'success' : 'warning',
      }}
      sidebarItems={sidebarItems}
      user={{ initials: user?.name?.slice(0, 2).toUpperCase() ?? 'VP', name: user?.name ?? 'Veli', subtitle: 'Veli' }}
      headerActions={
        <button type="button" className="ghost-btn" aria-label="Bildirimler">
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
    </DashboardLayout>
  );
};

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
              style={{ textAlign: 'left' }}
            >
              <div>
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
        subtitle="Son mesajlar"
        actions={
          <>
            <button type="button" className="ghost-btn">
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
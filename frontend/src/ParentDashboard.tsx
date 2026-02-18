import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BookOpen, CalendarCheck, ClipboardList, MessageSquare, BarChart3, Video, Maximize2, Minimize2, Send } from 'lucide-react';
import { useAuth } from './AuthContext';
import {
  apiRequest,
  downloadAnalysisPdf,
  getParentCalendar,
  getParentChildSummary,
  getParentTeachers,
  createParentComplaint,
  getParentConversations,
  getParentDashboard,
  getParentMeetings,
  getParentNotifications,
  getParentConversation,
  markParentMessageRead,
  sendParentMessage,
  getParentStudentAttendance,
  markParentNotificationRead,
  markAllParentNotificationsRead,
  resolveContentUrl,
  type CalendarEvent,
  type Conversation,
  type Message,
  type ParentDashboardSummary,
  type ParentMeeting,
  type ParentNotification,
  type StudentDetailSummary,
  type TeacherListItem,
  type ParentAttendanceRecord,
} from './api';
import { ParentReports } from './ParentReports';
import { DashboardLayout, GlassCard, TagChip } from './components/DashboardPrimitives';
import type { BreadcrumbItem, SidebarItem } from './components/DashboardPrimitives';
import { useApiState } from './hooks/useApiState';
import { useSearchParams } from 'react-router-dom';
import { NotificationDetailModal, type NotificationDetailModalData } from './components/NotificationDetailModal';

type ParentTab = 'overview' | 'calendar' | 'messages' | 'notifications' | 'complaints' | 'reports';

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
  const [messageFeedback, setMessageFeedback] = useState<string | null>(null);

  const dashboardState = useApiState<ParentDashboardSummary>(null);
  const summaryState = useApiState<StudentDetailSummary>(null);
  const notificationsState = useApiState<ParentNotification[]>([]);
  const calendarState = useApiState<CalendarEvent[]>([]);
  const meetingsState = useApiState<ParentMeeting[]>([]);
  const conversationsState = useApiState<Conversation[]>([]);
  const messagesState = useApiState<Message[]>([]);
  const attendanceState = useApiState<ParentAttendanceRecord[]>([]);

  const unreadNotificationsCount =
    notificationsState.data?.filter((n) => !n.read).length ?? 0;

  const [notificationDetailOpen, setNotificationDetailOpen] = useState(false);
  const [activeNotificationId, setActiveNotificationId] = useState<string | null>(null);
  const activeNotification = (notificationsState.data ?? []).find((n) => n.id === activeNotificationId) ?? null;

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
    if (activeTab !== 'calendar') return;
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    attendanceState
      .run(() => getParentStudentAttendance(token, selectedStudentId, { startDate }))
      .catch(() => {});
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

    const text = replyText.trim() || 'Veli sizinle canlı görüşme talep ediyor.';
    const subject = replyText.trim() ? undefined : 'Canlı görüşme talebi';

    try {
      const message = await sendParentMessage(token, {
        toUserId: activeConversation.userId,
        studentId: activeConversation.studentId,
        text,
        subject,
      });
      messagesState.setData([...(messagesState.data ?? []), message]);
      setReplyText('');
      setMessageFeedback('Mesaj iletildi.');
      window.setTimeout(() => setMessageFeedback(null), 4000);
    } catch (e) {
      setMessageFeedback(e instanceof Error ? e.message : 'Mesaj gönderilemedi.');
      window.setTimeout(() => setMessageFeedback(null), 5000);
    }
  };

  const sidebarItems = useMemo<SidebarItem[]>(
    () => [
      {
        id: 'overview',
        label: 'Genel Bakış',
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
        description: 'Kurum & öğretmen',
        active: activeTab === 'notifications',
        onClick: () => setActiveTab('notifications'),
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
    [activeTab, conversationsState.data, unreadNotificationsCount],
  );

  const parentBreadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const tabLabels: Record<string, string> = {
      overview: 'Genel Bakış',
      calendar: 'Devamsızlık',
      reports: 'Gelişim Raporu',
      messages: 'İletişim',
      notifications: 'Bildirimler',
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
      brand={user?.institutionName ?? 'SKYANALİZ'}
      tagline={selectedChild?.studentName ?? 'Veli Yönetim Paneli'}
      title="Veli Yönetim Paneli"
      subtitle="Akademik performans, takvim ve mesajları gerçek zamanlı takip edin."
      breadcrumbs={parentBreadcrumbs}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'VP',
        name: user?.name ?? 'Veli',
        subtitle: 'Veli',
        profilePictureUrl: resolveContentUrl(user?.profilePictureUrl),
      }}
      onLogout={logout}
    >
      {activeTab === 'overview' && (
        <ParentOverview
          summary={summaryState.data}
          onNavigate={(tab: ParentTab) => setActiveTab(tab)}
        />
      )}
      {activeTab === 'calendar' && (
        <ParentCalendar
          events={calendarState.data ?? []}
          attendance={attendanceState.data ?? []}
          loading={calendarState.loading}
          attendanceLoading={attendanceState.loading}
        />
      )}
      {activeTab === 'reports' && <ParentReports />}
      {activeTab === 'notifications' && (
        <GlassCard
          title="Bildirimler"
          subtitle="Kurum ve öğretmen bildirimleri"
          actions={
            <button
              type="button"
              className="ghost-btn"
              disabled={!token || unreadNotificationsCount === 0}
              onClick={async () => {
                if (!token) return;
                try {
                  await markAllParentNotificationsRead(token);
                  // local state update for instant badge drop
                  notificationsState.setData((notificationsState.data ?? []).map((n) => ({ ...n, read: true })));
                  window.dispatchEvent(new Event('notifications-updated'));
                } catch {
                  // ignore
                }
              }}
              title="Tüm bildirimleri okundu yap"
            >
              Tümünü Okundu Yap
            </button>
          }
        >
          <div className="list-stack">
            {notificationsState.loading && (notificationsState.data ?? []).length === 0 && (
              <div className="empty-state">Yükleniyor...</div>
            )}
            {!notificationsState.loading && (notificationsState.data ?? []).length === 0 && (
              <div className="empty-state">Henüz bildirim yok.</div>
            )}
            {(notificationsState.data ?? []).map((item) => (
              <button
                type="button"
                className="list-row"
                key={item.id}
                style={{ alignItems: 'flex-start', textAlign: 'left', cursor: 'pointer' }}
                onClick={() => {
                  setActiveNotificationId(item.id);
                  setNotificationDetailOpen(true);
                }}
              >
                <div style={{ flex: 1 }}>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                  <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.75 }}>
                    {new Date(item.createdAt).toLocaleDateString('tr-TR')}
                  </small>
                  {item.type === 'analysis_report_ready' &&
                    item.relatedEntityType === 'analysis_report' &&
                    item.relatedEntityId &&
                    token && (
                      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (!token) return;
                            try {
                              const payload = JSON.parse(item.relatedEntityId!) as { studentId: string; examId: number };
                              await downloadAnalysisPdf(token, payload.studentId, payload.examId);
                              if (!item.read) {
                                await apiRequest(`/parent/notifications/${item.id}/read`, { method: 'PUT' }, token);
                                notificationsState.run(() => getParentNotifications(token, 50)).catch(() => {});
                              }
                            } catch (e) {
                              alert(e instanceof Error ? e.message : 'PDF indirilemedi.');
                            }
                          }}
                        >
                          PDF İndir / Görüntüle
                        </button>
                      </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <TagChip label={item.read ? 'Okundu' : 'Yeni'} tone={item.read ? 'success' : 'warning'} />
                  {!item.read && token && (
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await markParentNotificationRead(token, item.id);
                          notificationsState.setData(
                            (notificationsState.data ?? []).map((n) =>
                              n.id === item.id ? { ...n, read: true } : n,
                            ),
                          );
                          window.dispatchEvent(new Event('notifications-updated'));
                        } catch {
                          // ignore
                        }
                      }}
                      title="Okundu olarak işaretle"
                    >
                      Okundu
                    </button>
                  )}
                </div>
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      <NotificationDetailModal
        open={notificationDetailOpen}
        notification={
          activeNotification
            ? ({
                id: activeNotification.id,
                title: activeNotification.title,
                body: activeNotification.body,
                createdAt: activeNotification.createdAt,
                read: activeNotification.read,
                type: activeNotification.type,
                relatedEntityType: activeNotification.relatedEntityType,
                relatedEntityId: activeNotification.relatedEntityId,
              } satisfies NotificationDetailModalData)
            : null
        }
        onClose={() => setNotificationDetailOpen(false)}
        actions={
          activeNotification && !activeNotification.read && token ? (
            <button
              type="button"
              className="ghost-btn"
              onClick={async () => {
                if (!token) return;
                try {
                  await markParentNotificationRead(token, activeNotification.id);
                  notificationsState.setData(
                    (notificationsState.data ?? []).map((n) =>
                      n.id === activeNotification.id ? { ...n, read: true } : n,
                    ),
                  );
                  window.dispatchEvent(new Event('notifications-updated'));
                } catch {
                  // ignore
                }
              }}
            >
              Okundu
            </button>
          ) : null
        }
      />
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
          messageFeedback={messageFeedback}
        />
      )}
      {activeTab === 'complaints' && (
        <ParentComplaints token={token} studentId={selectedStudentId} />
      )}
    </DashboardLayout>
  );
};

const ParentComplaints: React.FC<{ token: string | null; studentId: string | null }> = ({
  token,
  studentId,
}) => {
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
    getParentTeachers(token, studentId)
      .then(setTeachers)
      .catch(() => {})
      .finally(() => setLoadingTeachers(false));
  }, [token, studentId]);

  useEffect(() => {
    if (!form.aboutTeacherId) return;
    if (teachers.some((t) => t.id === form.aboutTeacherId)) return;
    setForm((p) => ({ ...p, aboutTeacherId: '' }));
  }, [teachers, form.aboutTeacherId]);

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
      <div style={{ display: 'grid', gap: '0.85rem' }}>
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              marginBottom: '0.25rem',
              fontWeight: 600,
            }}
          >
            Öğretmen (opsiyonel)
          </label>
          <select
            value={form.aboutTeacherId}
            onChange={(e) => setForm((p) => ({ ...p, aboutTeacherId: e.target.value }))}
            disabled={loadingTeachers}
            className="w-full text-sm"
            style={{
              padding: '0.55rem 0.75rem',
              borderRadius: 12,
              border: '1px solid var(--ui-control-border)',
              background: 'var(--ui-control-bg)',
              color: 'var(--color-text-main)',
            }}
          >
            <option value="">
              {loadingTeachers ? 'Öğretmenler yükleniyor...' : 'Öğretmen seç (opsiyonel)'}
            </option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              color: 'var(--color-text-muted)',
              marginBottom: '0.25rem',
              fontWeight: 600,
            }}
          >
            Konu
          </label>
          <input
            type="text"
            placeholder="Örn: Sınıf, öğretmen, sistem ile ilgili geri bildirim"
            value={form.subject}
            onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
            className="w-full text-sm"
            style={{
              padding: '0.55rem 0.75rem',
              borderRadius: 12,
            border: '1px solid var(--ui-control-border)',
            background: 'var(--ui-control-bg)',
            color: 'var(--color-text-main)',
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
            color: 'var(--color-text-muted)',
              marginBottom: '0.25rem',
              fontWeight: 600,
            }}
          >
            Açıklama
          </label>
          <textarea
            placeholder="Lütfen geri bildiriminizi detaylı şekilde yazın."
            value={form.body}
            onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
            rows={5}
            className="w-full text-sm"
            style={{
              resize: 'vertical',
              padding: '0.6rem 0.75rem',
              borderRadius: 12,
            border: '1px solid var(--ui-control-border)',
            background: 'var(--ui-control-bg)',
            color: 'var(--color-text-main)',
              minHeight: 96,
            }}
          />
        </div>

        {error && <div className="error">{error}</div>}
        {success && (
          <div style={{ color: '#22c55e', fontSize: '0.85rem', fontWeight: 500 }}>{success}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="primary-btn"
            onClick={() => handleSubmit().catch(() => {})}
            disabled={saving}
          >
            {saving ? 'Gönderiliyor...' : 'Gönder'}
          </button>
        </div>
      </div>
    </GlassCard>
  );
};

const ParentOverview: React.FC<{
  summary: StudentDetailSummary | null;
  notifications?: ParentNotification[];
  meetings?: ParentMeeting[];
  onJoinMeeting?: () => void;
  loading?: boolean;
  token?: string | null;
  onMarkNotificationRead?: () => void;
  onNavigate?: (tab: ParentTab) => void;
}> = ({ summary, onNavigate }) => {
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

      {/* Kısayollar */}
      {onNavigate && (
        <GlassCard
          title="Kısayollar"
          subtitle="Sık kullanılan sayfalara hızlı erişim"
          className="overview-shortcuts-card"
        >
          <div className="overview-shortcuts-grid">
            {[
              { id: 'reports' as ParentTab, label: 'Gelişim Raporu', icon: <BarChart3 size={20} /> },
              { id: 'calendar' as ParentTab, label: 'Devamsızlık', icon: <CalendarCheck size={20} /> },
              { id: 'messages' as ParentTab, label: 'İletişim', icon: <MessageSquare size={20} /> },
              { id: 'notifications' as ParentTab, label: 'Bildirimler', icon: <Bell size={20} /> },
              { id: 'complaints' as ParentTab, label: 'Şikayet/Öneri', icon: <ClipboardList size={20} /> },
            ].map((s) => (
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

const ParentCalendar: React.FC<{
  events: CalendarEvent[];
  attendance: ParentAttendanceRecord[];
  loading: boolean;
  attendanceLoading: boolean;
}> = ({ events, attendance, loading, attendanceLoading }) => {
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

  const absentCount = attendance.filter((r) => !r.present).length;
  const presentCount = attendance.filter((r) => r.present).length;

  return (
    <>
      <GlassCard title="Devamsızlık Kayıtları" subtitle="Son 30 günün yoklama kayıtları">
        {attendanceLoading && <div className="empty-state">Devamsızlık kayıtları yükleniyor...</div>}
        {!attendanceLoading && attendance.length === 0 && (
          <div className="empty-state">Devamsızlık kaydı bulunamadı.</div>
        )}
        {!attendanceLoading && attendance.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                marginBottom: '0.25rem',
              }}
            >
              <TagChip label={`Devamsızlık: ${absentCount}`} tone={absentCount > 0 ? 'warning' : 'success'} />
              <TagChip label={`Katılım: ${presentCount}`} tone="success" />
            </div>
            {attendance.map((record) => (
              <div
                key={record.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${!record.present ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>
                    {new Date(record.date).toLocaleDateString('tr-TR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>{record.classGroupName}</span>
                    {' · '}
                    <span>Yoklamayı alan: {record.teacherName}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                    Kaydedilme: {new Date(record.createdAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </div>
                  {record.notes && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--color-text-muted)',
                        marginTop: '0.25rem',
                        fontStyle: 'italic',
                      }}
                    >
                      Not: {record.notes}
                    </div>
                  )}
                </div>
                <TagChip label={record.present ? 'Geldi' : 'Gelmedi'} tone={record.present ? 'success' : 'error'} />
              </div>
            ))}
          </div>
        )}
      </GlassCard>

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
  messageFeedback?: string | null;
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
  messageFeedback,
}) => {
  const activeConversation = conversations.find((conv) => conv.userId === selectedConversationId);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const replyInputRef = useRef<HTMLInputElement | null>(null);

  const roleLabel = (role?: string) => {
    if (!role) return 'Kullanıcı';
    if (role === 'teacher') return 'Öğretmen';
    if (role === 'admin') return 'Yönetici';
    if (role === 'student') return 'Öğrenci';
    if (role === 'parent') return 'Veli';
    return role;
  };

  useEffect(() => {
    // konuşma değişince ve yeni mesaj gelince aşağı kaydır
    const el = messageListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [selectedConversationId, messages.length]);

  return (
    <div className="dual-grid" style={detailExpanded ? { gridTemplateColumns: '1fr' } : undefined}>
      {!detailExpanded && (
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
                <small style={{ display: 'block', marginTop: '0.1rem' }}>
                  {roleLabel(thread.userRole)}
                  {thread.userRole === 'teacher' && (thread.subjectAreas?.[0] || thread.subjectAreas?.length)
                    ? ` • ${(thread.subjectAreas ?? []).filter(Boolean).join(', ')}`
                    : ''}
                </small>
                <small style={{ display: 'block', marginTop: '0.15rem' }}>
                  {thread.lastMessage?.text ?? 'Mesaj yok'}
                </small>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                <span>{formatShortDate(thread.lastMessage?.createdAt)}</span>
                {thread.unreadCount > 0 && <TagChip label={`+${thread.unreadCount}`} tone="warning" />}
              </div>
            </button>
          ))}
        </div>
        </GlassCard>
      )}

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
              onClick={() => setDetailExpanded((v) => !v)}
            >
              {detailExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{' '}
              {detailExpanded ? 'Küçült' : 'Genişlet'}
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                replyInputRef.current?.focus();
              }}
            >
              Yanıtla
            </button>
          </>
        }
      >
        {loading && <div className="empty-state">Mesajlar yükleniyor...</div>}
        {error && <div className="error">{error}</div>}
        {!loading && !activeConversation && (
          <div className="empty-state">Soldan bir öğretmen seçin.</div>
        )}

        {!loading && activeConversation && (
          <div
            ref={messageListRef}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
              maxHeight: detailExpanded ? 520 : 380,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            {messages.length === 0 && <div className="empty-state">Mesaj bulunamadı.</div>}
            {messages.map((message) => {
              const fromTeacher = message.fromUserId === activeConversation.userId;
              const senderLabel = fromTeacher ? activeConversation.userName : 'Siz';
              return (
                <div
                  key={message.id}
                  style={{
                    display: 'flex',
                    justifyContent: fromTeacher ? 'flex-start' : 'flex-end',
                  }}
                >
                  <div
                    style={{
                      maxWidth: detailExpanded ? '78%' : '92%',
                      padding: '0.65rem 0.75rem',
                      borderRadius: 14,
                      border: `1px solid ${
                        fromTeacher ? 'rgba(59,130,246,0.25)' : 'rgba(34,197,94,0.25)'
                      }`,
                      background: fromTeacher
                        ? 'rgba(59,130,246,0.08)'
                        : 'rgba(34,197,94,0.08)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        marginBottom: message.subject ? 6 : 2,
                      }}
                    >
                      <strong style={{ fontSize: '0.9rem' }}>{senderLabel}</strong>
                      <small style={{ opacity: 0.75, whiteSpace: 'nowrap' }}>
                        {new Date(message.createdAt).toLocaleString('tr-TR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                    </div>
                    {message.subject && (
                      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.9rem' }}>
                        {message.subject}
                      </div>
                    )}
                    <div
                      style={{
                        fontSize: '0.92rem',
                        lineHeight: 1.45,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {message.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.6rem' }}>
          {messageFeedback && (
            <div
              role="status"
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 8,
                fontSize: '0.875rem',
                background: 'var(--color-surface-soft)',
                color: 'var(--color-text-main)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              {messageFeedback}
            </div>
          )}
          <input
            type="text"
            value={replyText}
            onChange={(event) => onReplyTextChange(event.target.value)}
            placeholder="Yanıtınızı yazın..."
            ref={replyInputRef}
          />
          <button type="button" className="primary-btn" onClick={onReply} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
            <Send size={16} /> Gönder
          </button>
        </div>
      </GlassCard>
    </div>
  );
};
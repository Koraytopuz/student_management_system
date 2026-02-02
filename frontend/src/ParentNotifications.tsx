import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';

interface Notification {
  id: string;
  userId: string;
  studentId?: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType?: 'assignment' | 'test' | 'meeting' | 'message' | 'content' | 'feedback';
  relatedEntityId?: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
}

export const ParentNotifications: React.FC = () => {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    loadNotifications();
    loadUnreadCount();
  }, [token]);

  const loadNotifications = () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    apiRequest<Notification[]>('/parent/notifications', {}, token)
      .then((data) => {
        setNotifications(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const loadUnreadCount = () => {
    if (!token) return;
    apiRequest<{ count: number }>('/parent/notifications/unread-count', {}, token)
      .then((data) => setUnreadCount(data.count))
      .catch(() => {});
  };

  const handleMarkAsRead = async (id: string) => {
    if (!token) return;
    try {
      await apiRequest(`/parent/notifications/${id}/read`, { method: 'PUT' }, token);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, readAt: new Date().toISOString() } : n)),
      );
      loadUnreadCount();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!token) return;
    try {
      await apiRequest('/parent/notifications/read-all', { method: 'PUT' }, token);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await apiRequest(`/parent/notifications/${id}`, { method: 'DELETE' }, token);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      loadUnreadCount();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'assignment_created':
        return '📝';
      case 'assignment_due_soon':
        return '⏰';
      case 'assignment_overdue':
        return '⚠️';
      case 'test_result_ready':
        return '✅';
      case 'meeting_scheduled':
        return '📅';
      case 'meeting_reminder':
        return '🔔';
      case 'weekly_summary':
        return '📊';
      case 'message_received':
        return '💬';
      case 'feedback_received':
        return '💭';
      case 'low_activity':
        return '📉';
      case 'low_performance':
        return '📉';
      default:
        return '🔔';
    }
  };

  const filteredNotifications =
    filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  if (!token) {
    return <div>Önce giriş yapmalısınız.</div>;
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>Bildirimler</h2>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllAsRead}>
            Tümünü Okundu İşaretle ({unreadCount})
          </button>
        )}
      </div>

      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        <button
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          Tümü ({notifications.length})
        </button>
        <button
          className={filter === 'unread' ? 'active' : ''}
          onClick={() => setFilter('unread')}
        >
          Okunmamış ({unreadCount})
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div>Yükleniyor...</div>}

      {!loading && filteredNotifications.length === 0 && (
        <div className="card">
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
            {filter === 'unread' ? 'Okunmamış bildirim yok' : 'Henüz bildirim yok'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filteredNotifications.map((notification) => (
          <div
            key={notification.id}
            className="card"
            style={{
              opacity: notification.read ? 0.7 : 1,
              borderLeft: notification.read ? 'none' : '4px solid var(--color-primary)',
            }}
          >
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'start' }}>
              <div style={{ fontSize: '1.5rem' }}>
                {getNotificationIcon(notification.type)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem' }}>{notification.title}</h3>
                  {!notification.read && (
                    <span className="badge badge-error" style={{ fontSize: '0.75rem' }}>
                      Yeni
                    </span>
                  )}
                </div>
                <p style={{ margin: '0.5rem 0', fontSize: '0.875rem' }}>
                  {notification.body}
                </p>
                {notification.studentId && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                    Öğrenci ID: {notification.studentId}
                  </p>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                  {new Date(notification.createdAt).toLocaleString('tr-TR')}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                  {!notification.read && (
                    <button
                      onClick={() => handleMarkAsRead(notification.id)}
                      style={{ fontSize: '0.875rem', padding: '0.25rem 0.5rem' }}
                    >
                      Okundu İşaretle
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(notification.id)}
                    style={{
                      fontSize: '0.875rem',
                      padding: '0.25rem 0.5rem',
                      background: 'transparent',
                      color: 'var(--error)',
                    }}
                  >
                    Sil
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

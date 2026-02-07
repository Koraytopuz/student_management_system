import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';
import type { UserRole } from './api';

interface Notification {
  id: string;
  userId: string;
  type: 'assignment_created' | 'assignment_due_soon' | 'assignment_overdue' | 'test_result_ready' | 'meeting_scheduled' | 'weekly_summary';
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

interface NotificationCenterProps {
  role: UserRole;
  /** Tam bildirim sayfasına yönlendirme; "Tümünü Gör" tıklandığında çağrılır */
  onViewAll?: () => void;
}

const getNotificationIcon = (type: Notification['type']): string => {
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
    case 'weekly_summary':
      return '📊';
    default:
      return '🔔';
  }
};

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ role, onViewAll }) => {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // Her 30 saniyede bir güncelle
    return () => clearInterval(interval);
  }, [token, role]);

  useEffect(() => {
    if (notifications.length > 0) {
      const unread = notifications.filter((n) => !n.read).length;
      setUnreadCount(unread);
    }
  }, [notifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const loadNotifications = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const data = await apiRequest<Notification[]>(`/${role}/notifications?limit=50`, {}, token);
      setNotifications(data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id: string) => {
    if (!token) return;
    try {
      await apiRequest(`/${role}/notifications/${id}/read`, { method: 'PUT' }, token);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!token || unreadCount === 0) return;
    try {
      await apiRequest(`/${role}/notifications/read-all`, { method: 'PUT' }, token);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dakika önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  const displayedNotifications = notifications.slice(0, 10);

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.5rem',
          fontSize: '1.5rem',
        }}
        aria-label={`Bildirimler${unreadCount > 0 ? ` (${unreadCount} okunmamış)` : ''}`}
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '0',
              right: '0',
              background: 'var(--color-error, #e74c3c)',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: '0',
            marginTop: '0.5rem',
            background: 'var(--color-bg, white)',
            border: '1px solid var(--color-border, #ddd)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            width: '360px',
            maxHeight: '500px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              padding: '1rem',
              borderBottom: '1px solid var(--color-border, #ddd)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Bildirimler</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary, #007bff)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  padding: '0.25rem 0.5rem',
                }}
              >
                Tümünü okundu işaretle
              </button>
            )}
          </div>

          <div
            style={{
              overflowY: 'auto',
              maxHeight: '400px',
            }}
          >
            {loading && notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted, #666)' }}>
                Yükleniyor...
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted, #666)' }}>
                Bildirim yok
              </div>
            ) : (
              displayedNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--color-border, #eee)',
                    cursor: notification.read ? 'default' : 'pointer',
                    background: notification.read
                      ? 'var(--color-bg, white)'
                      : 'var(--color-bg-hover, #f8f9fa)',
                    borderLeft: notification.read ? 'none' : '4px solid var(--color-primary, #007bff)',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!notification.read) {
                      e.currentTarget.style.background = 'var(--color-bg-hover, #f0f0f0)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!notification.read) {
                      e.currentTarget.style.background = 'var(--color-bg-hover, #f8f9fa)';
                    }
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'start' }}>
                    <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>
                      {getNotificationIcon(notification.type)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'start',
                          marginBottom: '0.25rem',
                        }}
                      >
                        <h4
                          style={{
                            margin: 0,
                            fontSize: '0.9rem',
                            fontWeight: notification.read ? 'normal' : 'bold',
                            color: 'var(--color-text, #333)',
                          }}
                        >
                          {notification.title}
                        </h4>
                        {!notification.read && (
                          <span
                            style={{
                              background: 'var(--color-primary, #007bff)',
                              color: 'white',
                              borderRadius: '50%',
                              width: '8px',
                              height: '8px',
                              flexShrink: 0,
                              marginLeft: '0.5rem',
                            }}
                          />
                        )}
                      </div>
                      <p
                        style={{
                          margin: '0.25rem 0 0.5rem 0',
                          fontSize: '0.875rem',
                          color: 'var(--color-text-muted, #666)',
                          lineHeight: '1.4',
                        }}
                      >
                        {notification.body}
                      </p>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-text-muted, #999)',
                        }}
                      >
                        {formatDate(notification.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 10 && (
            <div
              style={{
                padding: '0.75rem',
                borderTop: '1px solid var(--color-border, #ddd)',
                textAlign: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onViewAll?.();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary, #007bff)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Tümünü Gör ({notifications.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

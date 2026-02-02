import React, { useState, useEffect } from 'react';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';
import type { UserRole } from './api';

interface CalendarEvent {
  id: string;
  type: 'assignment' | 'meeting' | 'exam';
  title: string;
  startDate: string;
  endDate?: string;
  description?: string;
  status?: 'pending' | 'completed' | 'overdue' | 'cancelled';
  color?: string;
  relatedId: string;
}

interface CalendarResponse {
  events: CalendarEvent[];
  startDate: string;
  endDate: string;
  viewType: string;
}

interface CalendarViewProps {
  role: UserRole;
}

type ViewType = 'month' | 'week' | 'day' | 'list';

const getEventColor = (event: CalendarEvent): string => {
  if (event.color) return event.color;
  switch (event.type) {
    case 'assignment':
      return event.status === 'overdue' ? '#e74c3c' : event.status === 'completed' ? '#27ae60' : '#3498db';
    case 'meeting':
      return '#9b59b6';
    case 'exam':
      return '#e67e22';
    default:
      return '#95a5a6';
  }
};

const getEventIcon = (type: CalendarEvent['type']): string => {
  switch (type) {
    case 'assignment':
      return '📝';
    case 'meeting':
      return '📅';
    case 'exam':
      return '📋';
    default:
      return '📌';
  }
};

export const CalendarView: React.FC<CalendarViewProps> = ({ role }) => {
  const { token } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<ViewType>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [typeFilter, setTypeFilter] = useState<CalendarEvent['type'] | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!token) return;
    loadCalendar();
  }, [token, currentDate, viewType, typeFilter, statusFilter]);

  const loadCalendar = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);

      const startDate = new Date(currentDate);
      startDate.setDate(1); // Ayın ilk günü
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(startDate);
      if (viewType === 'month') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (viewType === 'week') {
        endDate.setDate(endDate.getDate() + 7);
      } else {
        endDate.setDate(endDate.getDate() + 1);
      }

      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        viewType,
        ...(typeFilter !== 'all' && { type: typeFilter }),
        ...(statusFilter !== 'all' && { status: statusFilter }),
      });

      const data = await apiRequest<CalendarResponse>(
        `/${role}/calendar?${params.toString()}`,
        {},
        token,
      );
      setEvents(data.events);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string): string => {
    return new Date(dateString).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDaysInMonth = (date: Date): Date[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];

    // Ayın ilk gününden önceki boş günler
    const startDay = firstDay.getDay();
    for (let i = 0; i < startDay; i++) {
      days.push(new Date(year, month, -startDay + i + 1));
    }

    // Ayın günleri
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const getEventsForDate = (date: Date): CalendarEvent[] => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter((event) => {
      const eventDate = new Date(event.startDate).toISOString().split('T')[0];
      return eventDate === dateStr;
    });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  if (loading && events.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p>Yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ background: '#fee', padding: '1rem' }}>
        <p style={{ color: '#c33' }}>Hata: {error}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Takvim</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => navigateMonth('prev')}
              style={{ padding: '0.5rem 1rem' }}
            >
              ← Önceki
            </button>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date())}
              style={{ padding: '0.5rem 1rem' }}
            >
              Bugün
            </button>
            <button
              type="button"
              onClick={() => navigateMonth('next')}
              style={{ padding: '0.5rem 1rem' }}
            >
              Sonraki →
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <select
            value={viewType}
            onChange={(e) => setViewType(e.target.value as ViewType)}
            style={{ padding: '0.5rem' }}
          >
            <option value="month">Ay Görünümü</option>
            <option value="week">Hafta Görünümü</option>
            <option value="day">Gün Görünümü</option>
            <option value="list">Liste Görünümü</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as CalendarEvent['type'] | 'all')}
            style={{ padding: '0.5rem' }}
          >
            <option value="all">Tüm Tipler</option>
            <option value="assignment">Görevler</option>
            <option value="meeting">Toplantılar</option>
            <option value="exam">Sınavlar</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.5rem' }}
          >
            <option value="all">Tüm Durumlar</option>
            <option value="pending">Bekleyen</option>
            <option value="completed">Tamamlanmış</option>
            <option value="overdue">Gecikmiş</option>
          </select>
        </div>
      </div>

      {viewType === 'month' && (
        <div>
          <h3 style={{ textAlign: 'center', marginBottom: '1rem' }}>
            {currentDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '0.5rem',
            }}
          >
            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((day) => (
              <div
                key={day}
                style={{
                  padding: '0.5rem',
                  textAlign: 'center',
                  fontWeight: 'bold',
                  background: 'var(--color-bg-secondary, #f5f5f5)',
                }}
              >
                {day}
              </div>
            ))}
            {getDaysInMonth(currentDate).map((date, idx) => {
              const dayEvents = getEventsForDate(date);
              const isToday =
                date.toDateString() === new Date().toDateString();
              const isCurrentMonth = date.getMonth() === currentDate.getMonth();

              return (
                <div
                  key={idx}
                  style={{
                    minHeight: '80px',
                    padding: '0.5rem',
                    border: '1px solid var(--color-border, #ddd)',
                    background: isToday
                      ? 'var(--color-primary-light, #e3f2fd)'
                      : isCurrentMonth
                        ? 'var(--color-bg, white)'
                        : 'var(--color-bg-muted, #f9f9f9)',
                    opacity: isCurrentMonth ? 1 : 0.5,
                  }}
                >
                  <div
                    style={{
                      fontWeight: isToday ? 'bold' : 'normal',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {date.getDate()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem',
                          background: getEventColor(event),
                          color: 'white',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                        title={event.title}
                      >
                        {getEventIcon(event.type)} {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #666)' }}>
                        +{dayEvents.length - 2} daha
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewType === 'list' && (
        <div>
          <h3 style={{ marginBottom: '1rem' }}>Yaklaşan Etkinlikler</h3>
          {events.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted, #666)' }}>Etkinlik bulunamadı.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {events.map((event) => (
                <div
                  key={event.id}
                  style={{
                    padding: '1rem',
                    border: '1px solid var(--color-border, #ddd)',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${getEventColor(event)}`,
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'start' }}>
                    <span style={{ fontSize: '1.5rem' }}>{getEventIcon(event.type)}</span>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 0.5rem 0' }}>{event.title}</h4>
                      {event.description && (
                        <p style={{ margin: '0 0 0.5rem 0', color: 'var(--color-text-muted, #666)' }}>
                          {event.description}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--color-text-muted, #666)' }}>
                        <span>📅 {formatDate(event.startDate)}</span>
                        {event.endDate && (
                          <span>⏰ {formatTime(event.startDate)} - {formatTime(event.endDate)}</span>
                        )}
                        {event.status && (
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              background:
                                event.status === 'overdue'
                                  ? '#fee'
                                  : event.status === 'completed'
                                    ? '#efe'
                                    : '#eef',
                              color:
                                event.status === 'overdue'
                                  ? '#c33'
                                  : event.status === 'completed'
                                    ? '#3c3'
                                    : '#33c',
                            }}
                          >
                            {event.status === 'overdue'
                              ? 'Gecikmiş'
                              : event.status === 'completed'
                                ? 'Tamamlandı'
                                : 'Bekliyor'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(viewType === 'week' || viewType === 'day') && (
        <div>
          <p style={{ color: 'var(--color-text-muted, #666)' }}>
            Hafta ve gün görünümü yakında eklenecek.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {events.slice(0, 10).map((event) => (
              <div
                key={event.id}
                style={{
                  padding: '1rem',
                  border: '1px solid var(--color-border, #ddd)',
                  borderRadius: '8px',
                  borderLeft: `4px solid ${getEventColor(event)}`,
                }}
              >
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'start' }}>
                  <span style={{ fontSize: '1.5rem' }}>{getEventIcon(event.type)}</span>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>{event.title}</h4>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted, #666)' }}>
                      {formatDate(event.startDate)} {event.endDate && `- ${formatTime(event.startDate)}`}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

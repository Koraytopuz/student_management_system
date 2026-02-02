import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';

interface Meeting {
  id: string;
  type: 'teacher_student' | 'teacher_student_parent' | 'class';
  title: string;
  description?: string;
  teacherId: string;
  teacherName: string;
  studentIds: string[];
  studentNames: string[];
  parentIds: string[];
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  relatedStudentId?: string;
}

export const ParentMeetings: React.FC = () => {
  const { token } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);

    apiRequest<Meeting[]>('/parent/meetings', {}, token)
      .then((data) => {
        setMeetings(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const now = new Date();
  const filteredMeetings = meetings.filter((m) => {
    const meetingDate = new Date(m.scheduledAt);
    if (filter === 'upcoming') return meetingDate >= now;
    if (filter === 'past') return meetingDate < now;
    return true;
  });

  const handleJoinMeeting = (meetingUrl: string) => {
    window.open(meetingUrl, '_blank');
  };

  if (!token) {
    return <div>Önce giriş yapmalısınız.</div>;
  }

  return (
    <div className="panel">
      <h2>Toplantılar</h2>

      <div style={{ marginBottom: '1.5rem' }}>
        <div className="tabs">
          <button
            className={filter === 'upcoming' ? 'active' : ''}
            onClick={() => setFilter('upcoming')}
          >
            Yaklaşan Toplantılar
          </button>
          <button
            className={filter === 'past' ? 'active' : ''}
            onClick={() => setFilter('past')}
          >
            Geçmiş Toplantılar
          </button>
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            Tümü
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      {loading && <div>Yükleniyor...</div>}

      {!loading && filteredMeetings.length === 0 && (
        <div className="card">
          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
            {filter === 'upcoming'
              ? 'Yaklaşan toplantı bulunmuyor'
              : filter === 'past'
                ? 'Geçmiş toplantı bulunmuyor'
                : 'Henüz toplantı bulunmuyor'}
          </p>
        </div>
      )}

      <div className="cards-grid">
        {filteredMeetings.map((meeting) => {
          const meetingDate = new Date(meeting.scheduledAt);
          const isUpcoming = meetingDate >= now;
          const isPast = meetingDate < now;
          const canJoin = isUpcoming && meetingDate <= new Date(now.getTime() + 15 * 60 * 1000);

          return (
            <div key={meeting.id} className="card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'start',
                  marginBottom: '0.5rem',
                }}
              >
                <h3>{meeting.title}</h3>
                <span
                  className={`badge ${
                    isPast
                      ? 'badge-warning'
                      : canJoin
                        ? 'badge-success'
                        : ''
                  }`}
                >
                  {isPast
                    ? 'Geçmiş'
                    : canJoin
                      ? 'Katılabilir'
                      : 'Yaklaşan'}
                </span>
              </div>

              {meeting.description && (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
                  {meeting.description}
                </p>
              )}

              <p>
                <strong>Öğretmen:</strong> {meeting.teacherName}
              </p>

              {meeting.studentNames.length > 0 && (
                <p>
                  <strong>Öğrenci(ler):</strong> {meeting.studentNames.join(', ')}
                </p>
              )}

              <p>
                <strong>Tarih ve Saat:</strong>{' '}
                {meetingDate.toLocaleString('tr-TR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>

              <p>
                <strong>Süre:</strong> {meeting.durationMinutes} dakika
              </p>

              <p>
                <strong>Tip:</strong>{' '}
                {meeting.type === 'teacher_student'
                  ? 'Öğretmen-Öğrenci'
                  : meeting.type === 'teacher_student_parent'
                    ? 'Öğretmen-Öğrenci-Veli'
                    : 'Sınıf Dersi'}
              </p>

              {canJoin && (
                <div style={{ marginTop: '1rem' }}>
                  <button
                    onClick={() => handleJoinMeeting(meeting.meetingUrl)}
                    style={{ width: '100%' }}
                  >
                    Toplantıya Katıl
                  </button>
                </div>
              )}

              {isUpcoming && !canJoin && (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                  Toplantı başlamadan 15 dakika önce katılabilirsiniz
                </p>
              )}

              {isPast && (
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--color-surface-soft)', borderRadius: '6px' }}>
                  <p style={{ fontSize: '0.875rem', margin: 0, color: 'var(--color-text-muted)' }}>
                    Bu toplantı tamamlandı
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

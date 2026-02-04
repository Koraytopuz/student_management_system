import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';

interface ActivityTimeTracking {
  date: string;
  totalMinutes: number;
  testMinutes: number;
  contentWatchingMinutes: number;
  activeSessionMinutes: number;
  breakCount: number;
}

interface ActivityTimeSummary {
  period: 'today' | 'last7days' | 'last30days' | 'custom';
  startDate?: string;
  endDate?: string;
  dailyData: ActivityTimeTracking[];
  totalMinutes: number;
  averageMinutesPerDay: number;
  mostActiveDay: string;
  activityByHour: { hour: number; minutes: number }[];
}

interface AssignmentActivityItem {
  assignmentId: string;
  title: string;
  description?: string;
  type: 'test' | 'content' | 'mixed';
  subjectName: string;
  topic: string;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  completedAt?: string;
  testResult?: {
    testId: string;
    correctCount: number;
    incorrectCount: number;
    blankCount: number;
    scorePercent: number;
    durationSeconds: number;
  };
  contentProgress?: {
    contentId: string;
    watchedPercent: number;
    completed: boolean;
  };
}

interface AssignmentActivitySummary {
  assignments: AssignmentActivityItem[];
  statistics: {
    totalCount: number;
    completedCount: number;
    pendingCount: number;
    overdueCount: number;
    averageScorePercent: number;
  };
}

interface ContentUsageItem {
  contentId: string;
  title: string;
  description?: string;
  type: 'video' | 'audio' | 'document';
  subjectName: string;
  topic: string;
  totalDurationMinutes: number;
  watchedDurationMinutes: number;
  watchedPercent: number;
  watchCount: number;
  lastWatchedAt?: string;
  completed: boolean;
  assignedDate: string;
}

interface ContentUsageSummary {
  contents: ContentUsageItem[];
  statistics: {
    totalContents: number;
    completedCount: number;
    inProgressCount: number;
    notStartedCount: number;
    totalWatchTimeMinutes: number;
    averageCompletionPercent: number;
  };
}

interface ParentDashboardSummaryStudentCard {
  studentId: string;
  studentName: string;
  gradeLevel: string;
}

export const ParentActivityTracking: React.FC = () => {
  const { token } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [students, setStudents] = useState<ParentDashboardSummaryStudentCard[]>([]);
  const [activeTab, setActiveTab] = useState<'time' | 'assignments' | 'content'>('time');
  const [timePeriod, setTimePeriod] = useState<'today' | 'last7days' | 'last30days'>('last7days');
  const [timeData, setTimeData] = useState<ActivityTimeSummary | null>(null);
  const [assignments, setAssignments] = useState<AssignmentActivitySummary | null>(null);
  const [contentUsage, setContentUsage] = useState<ContentUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    // Öğrenci listesini al
    apiRequest<{ children: ParentDashboardSummaryStudentCard[] }>('/parent/dashboard', {}, token)
      .then((data) => {
        setStudents(data.children);
        if (data.children.length > 0 && !selectedStudent) {
          setSelectedStudent(data.children[0].studentId);
        }
      })
      .catch((e) => setError(e.message));
  }, [token, selectedStudent]);

  useEffect(() => {
    if (!token || !selectedStudent) return;

    setLoading(true);
    setError(null);

    if (activeTab === 'time') {
      apiRequest<ActivityTimeSummary>(
        `/parent/children/${selectedStudent}/activity-time?period=${timePeriod}`,
        {},
        token,
      )
        .then(setTimeData)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    } else if (activeTab === 'assignments') {
      apiRequest<AssignmentActivitySummary>(
        `/parent/children/${selectedStudent}/assignments`,
        {},
        token,
      )
        .then(setAssignments)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    } else if (activeTab === 'content') {
      apiRequest<ContentUsageSummary>(
        `/parent/children/${selectedStudent}/content-usage`,
        {},
        token,
      )
        .then(setContentUsage)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [token, selectedStudent, activeTab, timePeriod]);

  if (!token) {
    return <div>Önce giriş yapmalısınız.</div>;
  }

  const selectedStudentName = students.find((s) => s.studentId === selectedStudent)?.studentName;

  return (
    <div className="panel">
      <h2>
        Aktivite Takibi
        {selectedStudentName ? ` · ${selectedStudentName}` : ''}
      </h2>

      {students.length > 1 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Öğrenci Seçin:
          </label>
          <select
            value={selectedStudent || ''}
            onChange={(e) => setSelectedStudent(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid var(--color-border-subtle)',
              width: '100%',
              maxWidth: '300px',
            }}
          >
            {students.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.studentName} ({s.gradeLevel}. Sınıf)
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedStudent && (
        <>
          <div className="tabs" style={{ marginBottom: '1.5rem' }}>
            <button
              className={activeTab === 'time' ? 'active' : ''}
              onClick={() => setActiveTab('time')}
            >
              Zaman Takibi
            </button>
            <button
              className={activeTab === 'assignments' ? 'active' : ''}
              onClick={() => setActiveTab('assignments')}
            >
              Test ve Görevler
            </button>
            <button
              className={activeTab === 'content' ? 'active' : ''}
              onClick={() => setActiveTab('content')}
            >
              İçerik Kullanımı
            </button>
          </div>

          {error && <div className="error">{error}</div>}
          {loading && <div>Yükleniyor...</div>}

          {activeTab === 'time' && timeData && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Zaman Aralığı:
                </label>
                <select
                  value={timePeriod}
                  onChange={(e) =>
                    setTimePeriod(
                      e.target.value as 'today' | 'last7days' | 'last30days',
                    )
                  }
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <option value="today">Bugün</option>
                  <option value="last7days">Son 7 Gün</option>
                  <option value="last30days">Son 30 Gün</option>
                </select>
              </div>

              <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                <div className="stat-card">
                  <span className="stat-label">Toplam Süre</span>
                  <span className="stat-value">
                    {Math.round(timeData.totalMinutes / 60)} saat{' '}
                    {timeData.totalMinutes % 60} dk
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Günlük Ortalama</span>
                  <span className="stat-value">
                    {Math.round(timeData.averageMinutesPerDay / 60)} saat{' '}
                    {timeData.averageMinutesPerDay % 60} dk
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">En Aktif Gün</span>
                  <span className="stat-value">
                    {new Date(timeData.mostActiveDay).toLocaleDateString('tr-TR')}
                  </span>
                </div>
              </div>

              <div className="card">
                <h3>Günlük Aktivite Detayları</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--color-border-subtle)' }}>Tarih</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid var(--color-border-subtle)' }}>Toplam (dk)</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid var(--color-border-subtle)' }}>Test (dk)</th>
                        <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid var(--color-border-subtle)' }}>İçerik (dk)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeData.dailyData.map((day) => (
                        <tr key={day.date}>
                          <td style={{ padding: '0.5rem' }}>
                            {new Date(day.date).toLocaleDateString('tr-TR')}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            {day.totalMinutes}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            {day.testMinutes}
                          </td>
                          <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                            {day.contentWatchingMinutes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'assignments' && assignments && (
            <div>
              <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                <div className="stat-card">
                  <span className="stat-label">Toplam Görev</span>
                  <span className="stat-value">
                    {assignments.statistics.totalCount}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Tamamlanan</span>
                  <span className="stat-value">
                    {assignments.statistics.completedCount}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Bekleyen</span>
                  <span className="stat-value">
                    {assignments.statistics.pendingCount}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Gecikmiş</span>
                  <span className="stat-value" style={{ color: 'var(--error)' }}>
                    {assignments.statistics.overdueCount}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Ortalama Başarı</span>
                  <span className="stat-value">
                    %{assignments.statistics.averageScorePercent}
                  </span>
                </div>
              </div>

              <div className="cards-grid">
                {assignments.assignments.map((assignment) => (
                  <div key={assignment.assignmentId} className="card">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <h3>{assignment.title}</h3>
                      <span
                        className={`badge ${
                          assignment.status === 'completed'
                            ? 'badge-success'
                            : assignment.status === 'overdue'
                              ? 'badge-error'
                              : assignment.status === 'in_progress'
                                ? 'badge-warning'
                                : ''
                        }`}
                      >
                        {assignment.status === 'completed'
                          ? 'Tamamlandı'
                          : assignment.status === 'overdue'
                            ? 'Gecikmiş'
                            : assignment.status === 'in_progress'
                              ? 'Devam Ediyor'
                              : 'Bekliyor'}
                      </span>
                    </div>
                    <p>
                      <strong>Ders:</strong> {assignment.subjectName}
                    </p>
                    <p>
                      <strong>Konu:</strong> {assignment.topic}
                    </p>
                    <p>
                      <strong>Son Tarih:</strong>{' '}
                      {new Date(assignment.dueDate).toLocaleDateString('tr-TR')}
                    </p>
                    {assignment.testResult && (
                      <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--color-surface-soft)', borderRadius: '6px' }}>
                        <p>
                          <strong>Test Sonucu:</strong> %{assignment.testResult.scorePercent}
                        </p>
                        <p style={{ fontSize: '0.875rem' }}>
                          Doğru: {assignment.testResult.correctCount} | Yanlış:{' '}
                          {assignment.testResult.incorrectCount} | Boş:{' '}
                          {assignment.testResult.blankCount}
                        </p>
                      </div>
                    )}
                    {assignment.contentProgress && (
                      <div style={{ marginTop: '1rem' }}>
                        <p>
                          <strong>İzlenme:</strong> %{assignment.contentProgress.watchedPercent}
                        </p>
                        <div
                          style={{
                            width: '100%',
                            height: '8px',
                            background: 'var(--color-surface-soft)',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            marginTop: '0.5rem',
                          }}
                        >
                          <div
                            style={{
                              width: `${assignment.contentProgress.watchedPercent}%`,
                              height: '100%',
                              background: 'var(--color-primary)',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'content' && contentUsage && (
            <div>
              <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                <div className="stat-card">
                  <span className="stat-label">Toplam İçerik</span>
                  <span className="stat-value">
                    {contentUsage.statistics.totalContents}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Tamamlanan</span>
                  <span className="stat-value">
                    {contentUsage.statistics.completedCount}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Devam Eden</span>
                  <span className="stat-value">
                    {contentUsage.statistics.inProgressCount}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Toplam İzleme Süresi</span>
                  <span className="stat-value">
                    {Math.round(contentUsage.statistics.totalWatchTimeMinutes / 60)} saat
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Ortalama Tamamlanma</span>
                  <span className="stat-value">
                    %{contentUsage.statistics.averageCompletionPercent}
                  </span>
                </div>
              </div>

              <div className="cards-grid">
                {contentUsage.contents.map((content) => (
                  <div key={content.contentId} className="card">
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <h3>{content.title}</h3>
                      <span
                        className={`badge ${
                          content.completed
                            ? 'badge-success'
                            : content.watchedPercent > 0
                              ? 'badge-warning'
                              : ''
                        }`}
                      >
                        {content.type === 'video'
                          ? '📹 Video'
                          : content.type === 'audio'
                            ? '🎵 Ses'
                            : '📄 Doküman'}
                      </span>
                    </div>
                    {content.description && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        {content.description}
                      </p>
                    )}
                    <p>
                      <strong>Ders:</strong> {content.subjectName}
                    </p>
                    <p>
                      <strong>Konu:</strong> {content.topic}
                    </p>
                    <p>
                      <strong>Süre:</strong> {content.totalDurationMinutes} dakika
                    </p>
                    <p>
                      <strong>İzlenme:</strong> {content.watchedDurationMinutes} /{' '}
                      {content.totalDurationMinutes} dakika ({content.watchedPercent}%)
                    </p>
                    <div
                      style={{
                        width: '100%',
                        height: '8px',
                        background: 'var(--color-surface-soft)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginTop: '0.5rem',
                      }}
                    >
                      <div
                        style={{
                          width: `${content.watchedPercent}%`,
                          height: '100%',
                          background: content.completed
                            ? 'var(--color-primary)'
                            : 'var(--color-accent)',
                        }}
                      />
                    </div>
                    {content.lastWatchedAt && (
                      <p style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: 'var(--color-text-muted)' }}>
                        Son izlenme:{' '}
                        {new Date(content.lastWatchedAt).toLocaleDateString('tr-TR')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!selectedStudent && students.length === 0 && (
        <p>Henüz bağlı öğrenci bulunmuyor.</p>
      )}
    </div>
  );
};

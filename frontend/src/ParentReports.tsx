import React, { useEffect, useState } from 'react';
import { apiRequest, getParentCoachingNotes, getParentCoachingProgress, type ParentCoachingNote, type ParentCoachingProgress } from './api';
import { useAuth } from './AuthContext';

interface ActivitySummary {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  testsSolved: number;
  questionsSolved: number;
  averageScorePercent: number;
  totalStudyMinutes: number;
  contentsWatched: number;
  contentsWatchTimeMinutes: number;
  assignmentsCompleted: number;
  assignmentsOverdue: number;
  topSubjects: { subjectName: string; studyMinutes: number }[];
  topTopics: { topic: string; studyMinutes: number }[];
  dailyBreakdown: {
    date: string;
    testsSolved: number;
    questionsSolved: number;
    studyMinutes: number;
  }[];
}

interface WeeklyReport {
  id: string;
  studentId: string;
  weekStartDate: string;
  weekEndDate: string;
  generatedAt: string;
  summary: ActivitySummary;
}

interface ParentDashboardSummaryStudentCard {
  studentId: string;
  studentName: string;
}

export const ParentReports: React.FC = () => {
  const { token } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [students, setStudents] = useState<ParentDashboardSummaryStudentCard[]>([]);
  const [activeTab, setActiveTab] = useState<'summary' | 'weekly'>('summary');
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([]);
  const [coachingNotes, setCoachingNotes] = useState<ParentCoachingNote[]>([]);
  const [coachingProgress, setCoachingProgress] = useState<ParentCoachingProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
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

    const fetchData = async () => {
      try {
        if (activeTab === 'summary') {
          const [summaryData, notes, progress] = await Promise.all([
            apiRequest<ActivitySummary>(
              `/parent/children/${selectedStudent}/activity-summary?period=${period}`,
              {},
              token,
            ),
            getParentCoachingNotes(token, selectedStudent),
            getParentCoachingProgress(token, selectedStudent),
          ]);
          setSummary(summaryData);
          setCoachingNotes(notes);
          setCoachingProgress(progress);
        } else if (activeTab === 'weekly') {
          const data = await apiRequest<{ reports: WeeklyReport[] }>(
            `/parent/children/${selectedStudent}/weekly-reports`,
            {},
            token,
          );
          setWeeklyReports(data.reports);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Veriler yüklenemedi');
      } finally {
        setLoading(false);
      }
    };

    fetchData().catch(() => {});
  }, [token, selectedStudent, activeTab, period]);

  if (!token) {
    return <div>Önce giriş yapmalısınız.</div>;
  }

  const selectedStudentName = students.find((s) => s.studentId === selectedStudent)?.studentName;

  return (
    <div className="panel">
      <h2>
        Raporlar
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
                {s.studentName}
              </option>
            ))}
          </select>
        </div>
      )}

      {selectedStudent && (
        <>
          <div className="tabs" style={{ marginBottom: '1.5rem' }}>
            <button
              className={activeTab === 'summary' ? 'active' : ''}
              onClick={() => setActiveTab('summary')}
            >
              Aktivite Özeti
            </button>
            <button
              className={activeTab === 'weekly' ? 'active' : ''}
              onClick={() => setActiveTab('weekly')}
            >
              Haftalık Raporlar
            </button>
          </div>

          {error && <div className="error">{error}</div>}
          {loading && <div>Yükleniyor...</div>}

          {activeTab === 'summary' && summary && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Zaman Aralığı:
                </label>
                <select
                  value={period}
                  onChange={(e) =>
                    setPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')
                  }
                  style={{
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-subtle)',
                  }}
                >
                  <option value="daily">Günlük</option>
                  <option value="weekly">Haftalık</option>
                  <option value="monthly">Aylık</option>
                </select>
              </div>

              <div className="stats-grid" style={{ marginBottom: '2rem' }}>
                <div className="stat-card">
                  <span className="stat-label">Çözülen Test</span>
                  <span className="stat-value">{summary.testsSolved}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Çözülen Soru</span>
                  <span className="stat-value">{summary.questionsSolved}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Toplam Çalışma Süresi</span>
                  <span className="stat-value">
                    {Math.round(summary.totalStudyMinutes / 60)} saat
                  </span>
                </div>
                {summary.assignmentsOverdue > 0 && (
                  <div className="stat-card" style={{ borderColor: 'var(--error)' }}>
                    <span className="stat-label">Gecikmiş Görev</span>
                    <span className="stat-value" style={{ color: 'var(--error)' }}>
                      {summary.assignmentsOverdue}
                    </span>
                  </div>
                )}
              </div>

              {/* Kişisel Gelişim hedef ilerlemesi ve gelişim notları */}
              <div className="cards-grid" style={{ marginBottom: '2rem' }}>
                <div className="card">
                  <h3>Kişisel Gelişim Hedef İlerlemesi</h3>
                  {coachingProgress ? (
                    <>
                      <p style={{ marginBottom: '0.5rem' }}>
                        Tamamlanma Oranı:{' '}
                        <strong>%{coachingProgress.completionPercent}</strong>
                      </p>
                      <div
                        style={{
                          position: 'relative',
                          height: 10,
                          borderRadius: 999,
                          background: 'var(--color-border-subtle)',
                          overflow: 'hidden',
                          marginBottom: '0.5rem',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            width: `${Math.min(
                              100,
                              Math.max(0, coachingProgress.completionPercent),
                            )}%`,
                            background:
                              coachingProgress.completionPercent >= 80
                                ? 'var(--color-success)'
                                : 'var(--color-primary)',
                          }}
                        />
                      </div>
                      <p style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                        Hedef Sayısı: {coachingProgress.goals.length}
                      </p>
                      <p style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                        Tamamlanan: {coachingProgress.completedCount} · Devam Eden:{' '}
                        {coachingProgress.pendingCount}
                      </p>
                      {coachingProgress.overduePendingCount > 0 && (
                        <p
                          style={{
                            fontSize: '0.85rem',
                            color: 'var(--error)',
                          }}
                        >
                          Gecikmiş Hedef:{' '}
                          {coachingProgress.overduePendingCount}
                        </p>
                      )}
                    </>
                  ) : (
                    <p style={{ color: 'var(--color-text-muted)' }}>
                      Henüz kişisel gelişim hedefi bulunmuyor.
                    </p>
                  )}
                </div>

                <div className="card">
                  <h3>Kişisel Gelişim Notları</h3>
                  {coachingNotes.length === 0 ? (
                    <p style={{ color: 'var(--color-text-muted)' }}>
                      Henüz paylaşılmış kişisel gelişim notu bulunmuyor.
                    </p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {coachingNotes.slice(0, 5).map((note) => (
                        <li
                          key={note.id}
                          style={{
                            padding: '0.5rem 0',
                            borderBottom:
                              '1px solid var(--color-border-subtle)',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: 'var(--color-text-muted)',
                              marginBottom: 2,
                            }}
                          >
                            {new Date(note.date).toLocaleString('tr-TR')} ·{' '}
                            {note.coachName}
                          </div>
                          <div
                            style={{
                              fontSize: '0.9rem',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {note.content}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {summary.dailyBreakdown.length > 0 && (
                <div className="card">
                  <h3>Günlük Detaylar</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid var(--color-border-subtle)' }}>Tarih</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid var(--color-border-subtle)' }}>Test</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid var(--color-border-subtle)' }}>Soru</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid var(--color-border-subtle)' }}>Çalışma (dk)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.dailyBreakdown.map((day) => (
                          <tr key={day.date}>
                            <td style={{ padding: '0.5rem' }}>
                              {new Date(day.date).toLocaleDateString('tr-TR')}
                            </td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                              {day.testsSolved}
                            </td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                              {day.questionsSolved}
                            </td>
                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                              {day.studyMinutes}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'weekly' && (
            <div>
              {weeklyReports.length === 0 ? (
                <div className="card">
                  <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Henüz haftalık rapor bulunmuyor
                  </p>
                </div>
              ) : (
                <div className="cards-grid">
                  {weeklyReports.map((report) => (
                    <div key={report.id} className="card">
                      <h3>
                        Haftalık Rapor - {new Date(report.weekStartDate).toLocaleDateString('tr-TR')} - {new Date(report.weekEndDate).toLocaleDateString('tr-TR')}
                      </h3>
                      <p>
                        <strong>Çözülen Test:</strong> {report.summary.testsSolved}
                      </p>
                      <p>
                        <strong>Çözülen Soru:</strong> {report.summary.questionsSolved}
                      </p>
                      <p>
                        <strong>Ortalama Başarı:</strong> %{report.summary.averageScorePercent}
                      </p>
                      <p>
                        <strong>Toplam Çalışma:</strong> {Math.round(report.summary.totalStudyMinutes / 60)} saat
                      </p>
                      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                        Oluşturulma: {new Date(report.generatedAt).toLocaleString('tr-TR')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
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

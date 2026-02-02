import React, { useEffect, useState } from 'react';
import { Link, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';
import { ParentActivityTracking } from './ParentActivityTracking';
import { ParentMessages } from './ParentMessages';
import { ParentNotifications } from './ParentNotifications';
import { ParentReports } from './ParentReports';
import { CalendarView } from './CalendarView';

interface ParentDashboardSummaryStudentCard {
  studentId: string;
  studentName: string;
  gradeLevel: string;
  classId: string;
  className?: string;
  testsSolvedLast7Days: number;
  averageScorePercent: number;
  totalStudyMinutes: number;
  lastActivityDate?: string;
  status: 'active' | 'inactive';
  pendingAssignmentsCount: number;
  overdueAssignmentsCount: number;
}

interface ParentDashboardSummary {
  children: ParentDashboardSummaryStudentCard[];
  overallStats?: {
    totalChildren: number;
    totalTestsSolved: number;
    averageScoreAcrossAll: number;
  };
}

const ParentDashboardMain: React.FC = () => {
  const { token } = useAuth();
  const [summary, setSummary] = useState<ParentDashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) return;
    apiRequest<ParentDashboardSummary>('/parent/dashboard', {}, token)
      .then(setSummary)
      .catch((e) => setError(e.message));
  }, [token]);

  if (!token) {
    return <div>Önce giriş yapmalısınız.</div>;
  }

  return (
    <div className="panel">
      <h2>Veli Paneli</h2>
      {error && <div className="error">{error}</div>}
      {!summary && !error && <div>Yükleniyor...</div>}
      {summary && (
        <>
          {summary.overallStats && (
            <div className="stats-grid" style={{ marginBottom: '2rem' }}>
              <div className="stat-card">
                <span className="stat-label">Toplam Çocuk Sayısı</span>
                <span className="stat-value">
                  {summary.overallStats.totalChildren}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Son 7 Günde Çözülen Test</span>
                <span className="stat-value">
                  {summary.overallStats.totalTestsSolved}
                </span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Genel Ortalama Başarı</span>
                <span className="stat-value">
                  %{summary.overallStats.averageScoreAcrossAll}
                </span>
              </div>
            </div>
          )}

          <div className="cards-grid">
            {summary.children.map((child) => (
              <div key={child.studentId} className="card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1rem',
                  }}
                >
                  <h3>{child.studentName}</h3>
                  <span
                    className={`badge ${
                      child.status === 'active' ? 'badge-success' : 'badge-warning'
                    }`}
                    style={{
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.875rem',
                    }}
                  >
                    {child.status === 'active' ? 'Aktif' : 'Pasif'}
                  </span>
                </div>
                <p>
                  <strong>Sınıf:</strong> {child.gradeLevel} - {child.className || 'Bilinmeyen'}
                </p>
                <p>
                  <strong>Son 7 günde çözülen test:</strong>{' '}
                  {child.testsSolvedLast7Days}
                </p>
                <p>
                  <strong>Ortalama başarı:</strong> %{child.averageScorePercent}
                </p>
                <p>
                  <strong>Toplam çalışma süresi:</strong>{' '}
                  {child.totalStudyMinutes} dk
                </p>
                {child.pendingAssignmentsCount > 0 && (
                  <p style={{ color: 'var(--warning)' }}>
                    <strong>Bekleyen görevler:</strong>{' '}
                    {child.pendingAssignmentsCount}
                  </p>
                )}
                {child.overdueAssignmentsCount > 0 && (
                  <p style={{ color: 'var(--error)' }}>
                    <strong>Gecikmiş görevler:</strong>{' '}
                    {child.overdueAssignmentsCount}
                  </p>
                )}
                {child.lastActivityDate && (
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    <strong>Son aktivite:</strong>{' '}
                    {new Date(child.lastActivityDate).toLocaleDateString('tr-TR')}
                  </p>
                )}
                <div style={{ marginTop: '1rem' }}>
                  <button
                    onClick={() =>
                      navigate(`/parent/children/${child.studentId}`)
                    }
                    style={{ width: '100%' }}
                  >
                    Detayları Görüntüle
                  </button>
                </div>
              </div>
            ))}
            {summary.children.length === 0 && (
              <p>Henüz bağlı öğrenci bulunmuyor.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};


export const ParentDashboard: React.FC = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Eğer aktif sekme 'meetings' ise dashboard'a yönlendir
  useEffect(() => {
    if (activeTab === 'meetings') {
      setActiveTab('dashboard');
    }
  }, [activeTab]);

  if (!token) {
    return <div>Önce giriş yapmalısınız.</div>;
  }

  return (
    <div className="panel-container">
      <nav className="tabs" style={{ marginBottom: '2rem' }}>
        <button
          className={activeTab === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveTab('dashboard')}
        >
          Ana Sayfa
        </button>
        <button
          className={activeTab === 'activity' ? 'active' : ''}
          onClick={() => setActiveTab('activity')}
        >
          Aktivite Takibi
        </button>
        <button
          className={activeTab === 'reports' ? 'active' : ''}
          onClick={() => setActiveTab('reports')}
        >
          Raporlar
        </button>
        <button
          className={activeTab === 'messages' ? 'active' : ''}
          onClick={() => setActiveTab('messages')}
        >
          Mesajlar
        </button>
        <button
          className={activeTab === 'notifications' ? 'active' : ''}
          onClick={() => setActiveTab('notifications')}
        >
          Bildirimler
        </button>
        <button
          className={activeTab === 'calendar' ? 'active' : ''}
          onClick={() => setActiveTab('calendar')}
        >
          Takvim
        </button>
      </nav>

      {activeTab === 'dashboard' && <ParentDashboardMain />}
      {activeTab === 'activity' && <ParentActivityTracking />}
      {activeTab === 'reports' && <ParentReports />}
      {activeTab === 'messages' && <ParentMessages />}
      {activeTab === 'notifications' && <ParentNotifications />}
      {activeTab === 'calendar' && <CalendarView role="parent" />}
    </div>
  );
};

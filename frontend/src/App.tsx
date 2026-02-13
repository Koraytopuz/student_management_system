import React from 'react';
import { Bell, Moon, Sun } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { LoginPage } from './LoginPage';
import { TeacherDashboard } from './TeacherDashboard';
import { StudentDashboard } from './StudentDashboard';
import { ParentDashboard } from './ParentDashboard';
import { AdminDashboard } from './AdminDashboard';
import { AdminReports } from './AdminReports';
import { QuestionParserPage } from './pages/admin/QuestionParserPage';
import { TeacherAssignmentsPage } from './pages/teacher/Assignments';
import { StudentMyHomeworksPage } from './pages/student/MyHomeworks';
import { AnalysisReportPage } from './pages/student/AnalysisReport';
import { ParentChildHomeworksPage } from './pages/parent/ChildHomeworks';

const ProtectedRoute: React.FC<{
  children: React.ReactElement;
  requiredRole?: 'teacher' | 'student' | 'parent' | 'admin';
}> = ({ children, requiredRole }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleGoToNotifications = (notificationId?: string) => {
    const path = location.pathname;
    const idParam = notificationId ? `&notificationId=${encodeURIComponent(notificationId)}` : '';
    if (path.startsWith('/teacher')) navigate(`/teacher?tab=notifications${idParam}`);
    else if (path.startsWith('/student')) navigate(`/student?notifications=1${idParam}`);
    else if (path.startsWith('/parent')) navigate(`/parent?tab=notifications${idParam}`);
    else if (path.startsWith('/admin')) navigate('/admin');
  };
  const [isDark, setIsDark] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem('theme_mode');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
    return window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = isDark ? 'dark' : 'light';
    window.localStorage.setItem('theme_mode', isDark ? 'dark' : 'light');
  }, [isDark]);

  const panelTitle =
    user?.role === 'teacher'
      ? 'Öğretmen Paneli'
      : user?.role === 'parent'
        ? 'Veli Paneli'
        : user?.role === 'admin'
          ? 'Admin Paneli'
          : user?.role === 'student'
            ? 'Öğrenci Paneli'
            : null;

  const isAuthRoute = location.pathname === '/' || location.pathname === '/login';
  const effectivePanelTitle = isAuthRoute ? null : panelTitle;
  const mainClassName = effectivePanelTitle ? 'main main--dashboard' : 'main main--auth';

  const homeLink =
    user?.role === 'admin'
      ? '/admin'
      : user?.role === 'teacher'
        ? '/teacher'
        : user?.role === 'student'
          ? '/student'
          : user?.role === 'parent'
            ? '/parent'
            : '/';

  return (
    <div>
      <header className="topbar">
        <div className="topbar-left">
          <Link to={homeLink} className="logo-text">
            {effectivePanelTitle ?? 'Öğrenci Yönetim Sistemi'}
          </Link>
        </div>
        <div className="topbar-right">
          <div className="topbar-theme">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setIsDark((prev) => !prev)}
              aria-label={isDark ? 'Açık tema' : 'Koyu tema'}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          {user ? (
            <>
              {panelTitle && user.role !== 'admin' && /^\/(teacher|student|parent)/.test(location.pathname) && (
                <button
                  type="button"
                  className="ghost-btn"
                  aria-label="Bildirimler"
                  onClick={() => handleGoToNotifications()}
                  style={{ padding: '0.5rem' }}
                >
                  <Bell size={18} />
                </button>
              )}
              {panelTitle && <span className="panel-pill">{panelTitle}</span>}
              <span className="user-pill">
                {user.name} ({user.role})
              </span>
              <button type="button" onClick={logout}>
                Çıkış
              </button>
            </>
          ) : (
            <Link to="/login">Giriş</Link>
          )}
        </div>
      </header>
      <main className={mainClassName}>{children}</main>
    </div>
  );
};

const AppRoutes: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();

  React.useEffect(() => {
    const baseTitle = 'Öğrenci Yönetim Sistemi';
    const roleTitle =
      user?.role === 'teacher'
        ? 'Öğretmen Paneli'
        : user?.role === 'parent'
          ? 'Veli Paneli'
          : user?.role === 'admin'
            ? 'Admin Paneli'
            : user?.role === 'student'
              ? 'Öğrenci Paneli'
              : null;

    if (typeof document !== 'undefined') {
      document.title = roleTitle ? `${roleTitle} – ${baseTitle}` : baseTitle;
    }
  }, [location.pathname, user?.role]);

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Layout>
            <LoginPage />
          </Layout>
        }
      />
      <Route
        path="/login"
        element={
          <Layout>
            <LoginPage />
          </Layout>
        }
      />
      <Route
        path="/teacher"
        element={
          <Layout>
            <ProtectedRoute requiredRole="teacher">
              <TeacherDashboard />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/teacher/assignments"
        element={
          <Layout>
            <ProtectedRoute requiredRole="teacher">
              <TeacherAssignmentsPage />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/student"
        element={
          <Layout>
            <ProtectedRoute requiredRole="student">
              <StudentDashboard />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/student/homeworks"
        element={
          <Layout>
            <ProtectedRoute requiredRole="student">
              <StudentMyHomeworksPage />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/student/analysis/:examId"
        element={
          <Layout>
            <ProtectedRoute requiredRole="student">
              <AnalysisReportPage />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/parent"
        element={
          <Layout>
            <ProtectedRoute requiredRole="parent">
              <ParentDashboard />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/parent/child-homeworks"
        element={
          <Layout>
            <ProtectedRoute requiredRole="parent">
              <ParentChildHomeworksPage />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/admin"
        element={
          <Layout>
            <ProtectedRoute requiredRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <Layout>
            <ProtectedRoute requiredRole="admin">
              <AdminReports />
            </ProtectedRoute>
          </Layout>
        }
      />
      <Route
        path="/admin/question-parser"
        element={
          <Layout>
            <ProtectedRoute requiredRole="admin">
              <QuestionParserPage />
            </ProtectedRoute>
          </Layout>
        }
      />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter basename={(import.meta.env.BASE_URL || '/').replace(/\/$/, '') || ''}>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
};


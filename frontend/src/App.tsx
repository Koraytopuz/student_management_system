import React from 'react';
import { Bell, BookOpen, ChevronRight, Moon, Sun } from 'lucide-react';
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
import { DashboardSidebarProvider, useDashboardSidebar } from './DashboardSidebarContext';
import { ReadingModeProvider, useReadingMode } from './ReadingModeContext';

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
  const location = useLocation();
  const readingMode = useReadingMode();
  const showReadingModeButton = user && (user.role === 'teacher' || user.role === 'student') && /^\/(teacher|student)/.test(location.pathname);

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

  const sidebarCtx = useDashboardSidebar();

  return (
    <div>
        <header className="topbar">
          <div className="topbar-left">
            {effectivePanelTitle && sidebarCtx && (
              <button
                type="button"
                className="topbar-menu-btn"
                onClick={() =>
                  sidebarCtx.isMobile
                    ? (sidebarCtx.isOverlayOpen ? sidebarCtx.closeOverlay() : sidebarCtx.openOverlay())
                    : sidebarCtx.toggleExpanded()
                }
                aria-label={
                  (sidebarCtx.isMobile ? sidebarCtx.isOverlayOpen : sidebarCtx.isExpanded)
                    ? 'Menüyü kapat'
                    : 'Menüyü aç'
                }
                aria-expanded={sidebarCtx.isMobile ? sidebarCtx.isOverlayOpen : sidebarCtx.isExpanded}
              >
                {(sidebarCtx.isMobile ? sidebarCtx.isOverlayOpen : sidebarCtx.isExpanded) ? (
                  <ChevronRight size={22} />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" x2="20" y1="12" y2="12" />
                    <line x1="4" x2="20" y1="6" y2="6" />
                    <line x1="4" x2="20" y1="18" y2="18" />
                  </svg>
                )}
              </button>
            )}
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
                {showReadingModeButton && (
                  <button
                    type="button"
                    className="ghost-btn"
                    aria-label={readingMode.readingMode ? 'Okuma modunu kapat' : 'Okuma modunu aç'}
                    onClick={() => readingMode.setReadingMode((p) => !p)}
                    style={{
                      padding: '0.5rem',
                      border: readingMode.readingMode ? '1px solid rgba(99,102,241,0.9)' : undefined,
                      background: readingMode.readingMode ? 'rgba(99,102,241,0.15)' : undefined,
                    }}
                  >
                    <BookOpen size={18} />
                  </button>
                )}
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
                <button type="button" className="topbar-logout-btn" onClick={logout}>
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
        <DashboardSidebarProvider>
          <ReadingModeProvider>
            <AppRoutes />
          </ReadingModeProvider>
        </DashboardSidebarProvider>
      </BrowserRouter>
    </AuthProvider>
  );
};


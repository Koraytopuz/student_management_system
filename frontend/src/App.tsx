import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { LoginPage } from './LoginPage';
import { TeacherDashboard } from './TeacherDashboard';
import { StudentDashboard } from './StudentDashboard';
import { ParentDashboard } from './ParentDashboard';
import { AdminDashboard } from './AdminDashboard';

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

  const mainClassName = panelTitle ? 'main main--dashboard' : 'main main--auth';

  return (
    <div>
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/" className="logo-text">
            {panelTitle ?? 'Öğrenci Yönetim Sistemi'}
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
        path="/admin"
        element={
          <Layout>
            <ProtectedRoute requiredRole="admin">
              <AdminDashboard />
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
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
};


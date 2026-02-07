import React, { createContext, useContext, useState } from 'react';
import type { User, UserRole } from './api';

interface AuthState {
  user: User | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  loginSuccess: (user: User, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'student_mgmt_auth';

function loadStoredAuth(): AuthState {
  if (typeof window === 'undefined') return { user: null, token: null };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as AuthState;
      if (parsed?.user && parsed?.token) return parsed;
    }
  } catch {
    // ignore
  }
  return { user: null, token: null };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<AuthState>(loadStoredAuth);

  const loginSuccess = (user: User, token: string) => {
    const next: AuthState = { user, token };
    setState(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const logout = () => {
    setState({ user: null, token: null });
    window.localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        loginSuccess,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export function useRoleGuard(required: UserRole | null) {
  const { user } = useAuth();
  if (!required) return true;
  return user?.role === required;
}


export type UserRole = 'teacher' | 'student' | 'parent' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: User;
  demoInfo?: {
    password: string;
    exampleAdminEmail?: string;
    exampleTeacherEmail?: string;
    exampleStudentEmail?: string;
    exampleParentEmail?: string;
  };
}

const API_BASE_URL = 'http://localhost:4000';
const AUTH_STORAGE_KEY = 'student_mgmt_auth';

function clearAuthAndRedirectToLogin() {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.includes('/auth/login')) {
      clearAuthAndRedirectToLogin();
    }
    throw new Error(errorBody.error ?? `API error: ${res.status}`);
  }

  return res.json();
}

export async function login(
  email: string,
  password: string,
  role: UserRole,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });
}


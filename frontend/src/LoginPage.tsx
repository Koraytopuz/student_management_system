import React, { useState } from 'react';
import { login, type UserRole } from './api';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';

const roles: { value: UserRole; label: string }[] = [
  { value: 'teacher', label: 'Öğretmen' },
  { value: 'student', label: 'Öğrenci' },
  { value: 'parent', label: 'Veli' },
  { value: 'admin', label: 'Yönetici' },
];

export const LoginPage: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState<UserRole>('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { loginSuccess } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await login(email, password, selectedRole);
      loginSuccess(res.user, res.token);
      if (res.user.role === 'teacher') navigate('/teacher');
      else if (res.user.role === 'student') navigate('/student');
      else if (res.user.role === 'parent') navigate('/parent');
      else navigate('/admin');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-layout">
      <div className="login-card">
        <h1>Öğrenci Yönetim Sistemi</h1>
        <p className="subtitle">
          Öğretmen, öğrenci ve veliler için tek panelden yönetim.
        </p>

        <div className="role-selector">
          {roles.map((role) => (
            <button
              key={role.value}
              type="button"
              className={
                selectedRole === role.value ? 'role-btn active' : 'role-btn'
              }
              onClick={() => setSelectedRole(role.value)}
            >
              {role.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>E-posta</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="demo e-posta adresi"
              required
            />
          </label>
          <label className="field">
            <span>Şifre</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <p className="hint">
          Demo için backend&apos;de tanımlı e-posta adreslerini ve
          <code> password123 </code>
          şifresini kullanabilirsiniz.
        </p>
      </div>
    </div>
  );
};


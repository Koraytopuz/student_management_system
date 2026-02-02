import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';

interface AdminSummary {
  teacherCount: number;
  studentCount: number;
  parentCount: number;
  assignmentCount: number;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
}

interface Parent {
  id: string;
  name: string;
  email: string;
  studentIds: string[];
}

export const AdminDashboard: React.FC = () => {
  const { token } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newTeacher, setNewTeacher] = useState({
    name: '',
    email: '',
    subjectAreas: '',
  });
  const [newStudent, setNewStudent] = useState({
    name: '',
    email: '',
    gradeLevel: '',
  });
  const [newParent, setNewParent] = useState({
    name: '',
    email: '',
  });
  const [assignState, setAssignState] = useState({
    parentId: '',
    studentId: '',
  });

  useEffect(() => {
    if (!token) return;

    const fetchAll = async () => {
      try {
        setError(null);
        const [s, t, st, p] = await Promise.all([
          apiRequest<AdminSummary>('/admin/summary', {}, token),
          apiRequest<Teacher[]>('/admin/teachers', {}, token),
          apiRequest<Student[]>('/admin/students', {}, token),
          apiRequest<Parent[]>('/admin/parents', {}, token),
        ]);
        setSummary(s);
        setTeachers(t);
        setStudents(st);
        setParents(p);
      } catch (e) {
        setError((e as Error).message);
      }
    };

    fetchAll();
  }, [token]);

  async function handleAddTeacher(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<Teacher>(
        '/admin/teachers',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newTeacher.name,
            email: newTeacher.email,
            subjectAreas: newTeacher.subjectAreas,
          }),
        },
        token,
      );
      setTeachers((prev) => [...prev, created]);
      setNewTeacher({ name: '', email: '', subjectAreas: '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<Student>(
        '/admin/students',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newStudent.name,
            email: newStudent.email,
            gradeLevel: newStudent.gradeLevel,
          }),
        },
        token,
      );
      setStudents((prev) => [...prev, created]);
      setNewStudent({ name: '', email: '', gradeLevel: '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddParent(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<Parent>(
        '/admin/parents',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newParent.name,
            email: newParent.email,
          }),
        },
        token,
      );
      setParents((prev) => [...prev, created]);
      setNewParent({ name: '', email: '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAssignStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !assignState.parentId || !assignState.studentId) return;
    try {
      const updatedParent = await apiRequest<Parent>(
        `/admin/parents/${assignState.parentId}/assign-student`,
        {
          method: 'POST',
          body: JSON.stringify({ studentId: assignState.studentId }),
        },
        token,
      );
      setParents((prev) =>
        prev.map((p) => (p.id === updatedParent.id ? updatedParent : p)),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!token) {
    return <div>Önce yönetici olarak giriş yapmalısınız.</div>;
  }

  return (
    <div className="panel">
      <h2>Yönetici Paneli</h2>
      {error && <div className="error">{error}</div>}

      {summary && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Öğretmen</span>
            <span className="stat-value">{summary.teacherCount}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Öğrenci</span>
            <span className="stat-value">{summary.studentCount}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Veli</span>
            <span className="stat-value">{summary.parentCount}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Görev/Test</span>
            <span className="stat-value">{summary.assignmentCount}</span>
          </div>
        </div>
      )}

      <div className="cards-grid">
        <div className="card">
          <h3>Öğretmenler</h3>
          <form onSubmit={handleAddTeacher} className="form" style={{ marginBottom: '0.75rem' }}>
            <div className="field">
              <span>İsim</span>
              <input
                value={newTeacher.name}
                onChange={(e) =>
                  setNewTeacher((t) => ({ ...t, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <span>E-posta</span>
              <input
                type="email"
                value={newTeacher.email}
                onChange={(e) =>
                  setNewTeacher((t) => ({ ...t, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <span>Branşlar (virgülle)</span>
              <input
                value={newTeacher.subjectAreas}
                onChange={(e) =>
                  setNewTeacher((t) => ({
                    ...t,
                    subjectAreas: e.target.value,
                  }))
                }
              />
            </div>
            <button type="submit">Öğretmen Ekle</button>
          </form>
          <ul>
            {teachers.map((t) => (
              <li key={t.id}>
                <strong>{t.name}</strong> – {t.email}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Öğrenciler</h3>
          <form onSubmit={handleAddStudent} className="form" style={{ marginBottom: '0.75rem' }}>
            <div className="field">
              <span>İsim</span>
              <input
                value={newStudent.name}
                onChange={(e) =>
                  setNewStudent((s) => ({ ...s, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <span>E-posta</span>
              <input
                type="email"
                value={newStudent.email}
                onChange={(e) =>
                  setNewStudent((s) => ({ ...s, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <span>Sınıf (ör. 9A)</span>
              <input
                value={newStudent.gradeLevel}
                onChange={(e) =>
                  setNewStudent((s) => ({
                    ...s,
                    gradeLevel: e.target.value,
                  }))
                }
              />
            </div>
            <button type="submit">Öğrenci Ekle</button>
          </form>
          <ul>
            {students.map((s) => (
              <li key={s.id}>
                <strong>{s.name}</strong> – {s.email}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>Veliler & Öğrenci Atama</h3>
          <form onSubmit={handleAddParent} className="form" style={{ marginBottom: '0.75rem' }}>
            <div className="field">
              <span>İsim</span>
              <input
                value={newParent.name}
                onChange={(e) =>
                  setNewParent((p) => ({ ...p, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <span>E-posta</span>
              <input
                type="email"
                value={newParent.email}
                onChange={(e) =>
                  setNewParent((p) => ({ ...p, email: e.target.value }))
                }
                required
              />
            </div>
            <button type="submit">Veli Ekle</button>
          </form>

          <form onSubmit={handleAssignStudent} className="form" style={{ marginBottom: '0.75rem' }}>
            <div className="field">
              <span>Veli</span>
              <select
                value={assignState.parentId}
                onChange={(e) =>
                  setAssignState((st) => ({ ...st, parentId: e.target.value }))
                }
              >
                <option value="">Seçin</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span>Öğrenci</span>
              <select
                value={assignState.studentId}
                onChange={(e) =>
                  setAssignState((st) => ({
                    ...st,
                    studentId: e.target.value,
                  }))
                }
              >
                <option value="">Seçin</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit">Velinin Öğrencilerine Ekle</button>
          </form>

          <ul>
            {parents.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> – {p.email}
                {p.studentIds.length > 0 && (
                  <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                    Öğrenciler: {p.studentIds.join(', ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};


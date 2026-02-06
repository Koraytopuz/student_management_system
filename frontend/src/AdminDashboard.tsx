import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';
import {
  DashboardLayout,
  GlassCard,
  MetricCard,
  TagChip,
} from './components/DashboardPrimitives';
import type { SidebarItem } from './components/DashboardPrimitives';

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

interface Complaint {
  id: string;
  fromRole: string;
  fromUser: { id: string; name: string; email: string; role: string };
  aboutTeacher?: { id: string; name: string; email: string; role: string };
  subject: string;
  body: string;
  status: 'open' | 'reviewed' | 'closed';
  createdAt: string;
  reviewedAt?: string;
  closedAt?: string;
}

export const AdminDashboard: React.FC = () => {
  const { token, user, logout } = useAuth();
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
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

  type AdminTab = 'overview' | 'teachers' | 'students' | 'parents' | 'complaints';
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [activeComplaintId, setActiveComplaintId] = useState<string | null>(null);

  const sidebarItems = useMemo<SidebarItem[]>(
    () => [
      {
        id: 'overview',
        label: 'Genel Bakış',
        icon: <span>📊</span>,
        description: 'Özet',
        active: activeTab === 'overview',
        onClick: () => setActiveTab('overview'),
      },
      {
        id: 'teachers',
        label: 'Öğretmenler',
        icon: <span>👩‍🏫</span>,
        description: 'Kadrolar',
        active: activeTab === 'teachers',
        onClick: () => setActiveTab('teachers'),
      },
      {
        id: 'students',
        label: 'Öğrenciler',
        icon: <span>🎓</span>,
        description: 'Kayıtlar',
        active: activeTab === 'students',
        onClick: () => setActiveTab('students'),
      },
      {
        id: 'parents',
        label: 'Veliler',
        icon: <span>👨‍👩‍👧</span>,
        description: 'İlişkilendirme',
        active: activeTab === 'parents',
        onClick: () => setActiveTab('parents'),
      },
      {
        id: 'complaints',
        label: 'Şikayet / Öneri',
        icon: <span>💬</span>,
        description: 'Geri bildirim',
        active: activeTab === 'complaints',
        onClick: () => setActiveTab('complaints'),
      },
    ],
    [activeTab],
  );

  useEffect(() => {
    if (!token) return;

    const fetchAll = async () => {
      try {
        setError(null);
        const [s, t, st, p, c] = await Promise.all([
          apiRequest<AdminSummary>('/admin/summary', {}, token),
          apiRequest<Teacher[]>('/admin/teachers', {}, token),
          apiRequest<Student[]>('/admin/students', {}, token),
          apiRequest<Parent[]>('/admin/parents', {}, token),
          apiRequest<Complaint[]>('/admin/complaints', {}, token),
        ]);
        setSummary(s);
        setTeachers(t);
        setStudents(st);
        setParents(p);
        setComplaints(c);
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
    <DashboardLayout
      accent="slate"
      brand="SKYTECH"
      tagline="Admin Paneli"
      title="Yönetim Konsolu"
      subtitle="Kullanıcılar, atamalar ve geri bildirimleri yönetin."
      status={
        summary
          ? {
              label: `${summary.teacherCount} öğretmen · ${summary.studentCount} öğrenci`,
              tone: 'neutral',
            }
          : undefined
      }
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'AD',
        name: user?.name ?? 'Admin',
        subtitle: 'Yönetici',
      }}
      onLogout={logout}
    >
      {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {activeTab === 'overview' && summary && (
        <>
          <div className="metric-grid">
            <MetricCard
              label="Öğretmenler"
              value={`${summary.teacherCount}`}
              helper="Toplam kayıtlı öğretmen"
              trendLabel="Kadrolar"
            />
            <MetricCard
              label="Öğrenciler"
              value={`${summary.studentCount}`}
              helper="Aktif öğrenci sayısı"
              trendLabel="Kayıtlar"
            />
            <MetricCard
              label="Veliler"
              value={`${summary.parentCount}`}
              helper="Bağlı veli hesabı"
              trendLabel="İletişim"
            />
            <MetricCard
              label="Aktif Görev / Test"
              value={`${summary.assignmentCount}`}
              helper="Sistemde tanımlı"
              trendLabel="Akademik yük"
            />
          </div>

          <div className="dual-grid" style={{ marginTop: '1.5rem' }}>
            <GlassCard
              title="Genel Durum Özeti"
              subtitle="Sistem genelindeki kullanıcı ve görev sayıları."
            >
              <ul style={{ paddingLeft: '1.1rem', marginTop: '0.5rem' }}>
                <li>{summary.teacherCount} öğretmen kayıtlı.</li>
                <li>{summary.studentCount} öğrenci kayıtlı.</li>
                <li>{summary.parentCount} veli hesabı mevcut.</li>
                <li>{summary.assignmentCount} aktif görev / test bulunuyor.</li>
              </ul>
            </GlassCard>

            <GlassCard
              title="Son Şikayetler"
              subtitle="Öğrenci ve velilerden gelen son geri bildirimler."
            >
              {complaints.length === 0 ? (
                <div className="empty-state">Kayıtlı şikayet / öneri bulunmuyor.</div>
              ) : (
                <div className="list-stack">
                  {complaints.slice(0, 4).map((c) => (
                    <div key={c.id} className="list-row">
                      <div>
                        <strong>{c.subject}</strong>
                        <small>
                          {c.fromUser?.name ?? '-'} ·{' '}
                          {new Date(c.createdAt).toLocaleString('tr-TR')}
                        </small>
                      </div>
                      <TagChip
                        label={c.status === 'open' ? 'Açık' : c.status === 'reviewed' ? 'İnceleniyor' : 'Kapalı'}
                        tone={
                          c.status === 'open'
                            ? 'warning'
                            : c.status === 'reviewed'
                              ? 'info'
                              : 'success'
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>
        </>
      )}

      {activeTab === 'complaints' && (
        <div className="dual-grid">
          <GlassCard
            title="Şikayet / Öneri Gelen Kutusu"
            subtitle="Öğrenci ve velilerden gelen tüm kayıtlar."
          >
            {complaints.length === 0 ? (
              <div className="empty-state">Kayıt yok.</div>
            ) : (
              <ul
                style={{
                  display: 'grid',
                  gap: '0.5rem',
                  paddingLeft: 0,
                  listStyle: 'none',
                  maxHeight: 420,
                  overflowY: 'auto',
                }}
              >
                {complaints.slice(0, 50).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveComplaintId(c.id)}
                      className="list-row"
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        justifyContent: 'space-between',
                        borderRadius: 10,
                      }}
                    >
                      <div>
                        <strong>{c.subject}</strong>
                        <small style={{ display: 'block', marginTop: '0.15rem' }}>
                          {c.fromUser?.name ?? '-'} ·{' '}
                          {new Date(c.createdAt).toLocaleDateString('tr-TR')}
                        </small>
                      </div>
                      <TagChip
                        label={c.status}
                        tone={
                          c.status === 'open'
                            ? 'warning'
                            : c.status === 'reviewed'
                              ? 'info'
                              : 'success'
                        }
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>

          <GlassCard
            title="Detaylı İnceleme"
            subtitle="Seçili şikayetin tam içeriği ve durum yönetimi."
          >
            {(() => {
              const current =
                complaints.find((c) => c.id === activeComplaintId) ?? complaints[0] ?? null;
              if (!current) {
                return (
                  <div className="empty-state">
                    İncelemek için soldan bir kayıt seçin.
                  </div>
                );
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{current.subject}</div>
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--color-text-muted)',
                        marginTop: '0.25rem',
                      }}
                    >
                      Gönderen: {current.fromUser?.name ?? '-'} ({current.fromRole})
                      {current.aboutTeacher?.name
                        ? ` · Öğretmen: ${current.aboutTeacher.name}`
                        : ''}
                      {' · '}
                      {new Date(current.createdAt).toLocaleString('tr-TR')}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '0.75rem 0.85rem',
                      borderRadius: 10,
                      border: '1px solid var(--color-border-subtle)',
                      maxHeight: 260,
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      fontSize: '0.9rem',
                    }}
                  >
                    {current.body}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '0.5rem',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--color-text-muted)',
                        marginRight: '0.25rem',
                      }}
                    >
                      Durum: {current.status}
                    </span>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={async () => {
                        if (!token) return;
                        try {
                          const updated = await apiRequest<Complaint>(
                            `/admin/complaints/${current.id}`,
                            { method: 'PUT', body: JSON.stringify({ status: 'reviewed' }) },
                            token,
                          );
                          setComplaints((prev) =>
                            prev.map((x) => (x.id === updated.id ? updated : x)),
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      İncelendi
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={async () => {
                        if (!token) return;
                        try {
                          const updated = await apiRequest<Complaint>(
                            `/admin/complaints/${current.id}`,
                            { method: 'PUT', body: JSON.stringify({ status: 'closed' }) },
                            token,
                          );
                          setComplaints((prev) =>
                            prev.map((x) => (x.id === updated.id ? updated : x)),
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Şikayeti Kapat
                    </button>
                  </div>
                </div>
              );
            })()}
          </GlassCard>
        </div>
      )}

      {activeTab === 'teachers' && (
        <GlassCard
          title="Öğretmenler"
          subtitle="Yeni öğretmen ekleyin ve listeyi yönetin."
        >
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
          <div className="list-stack">
            {teachers.length === 0 && (
              <div className="empty-state">Henüz öğretmen kaydı yok.</div>
            )}
            {teachers.map((t) => (
              <div key={t.id} className="list-row">
                <div>
                  <strong>{t.name}</strong>
                  <small>{t.email}</small>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === 'students' && (
        <GlassCard
          title="Öğrenciler"
          subtitle="Öğrenci kayıtlarını yönetin."
        >
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
          <div className="list-stack">
            {students.length === 0 && (
              <div className="empty-state">Henüz öğrenci kaydı yok.</div>
            )}
            {students.map((s) => (
              <div key={s.id} className="list-row">
                <div>
                  <strong>{s.name}</strong>
                  <small>{s.email}</small>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === 'parents' && (
        <GlassCard
          title="Veliler & Öğrenci Atama"
          subtitle="Veli hesapları oluşturun ve öğrenci atamalarını yönetin."
        >
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

          <div className="list-stack">
            {parents.length === 0 && (
              <div className="empty-state">Henüz veli kaydı yok.</div>
            )}
            {parents.map((p) => (
              <div key={p.id} className="list-row">
                <div>
                  <strong>{p.name}</strong>
                  <small>{p.email}</small>
                  {p.studentIds.length > 0 && (
                    <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                      Öğrenciler: {p.studentIds.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </DashboardLayout>
  );
};


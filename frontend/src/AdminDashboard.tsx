import React, { useEffect, useMemo, useState } from 'react';
import { apiRequest, getAdminNotifications, markAdminNotificationRead, type AdminNotification, getSubjectsList, uploadAdminStudentImage, resolveContentUrl, getStudentPerformanceReport, type AnnualReportData } from './api';
import { useAuth } from './AuthContext';
import {
  DashboardLayout,
  GlassCard,
  MetricCard,
  TagChip,
} from './components/DashboardPrimitives';
import { AnnualPerformanceReport } from './AnnualPerformanceReport';
import type { BreadcrumbItem, SidebarItem } from './components/DashboardPrimitives';

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
  subjectAreas?: string[];
  assignedGrades?: string[];
  profilePictureUrl?: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
   gradeLevel?: string;
   parentPhone?: string;
   profilePictureUrl?: string;
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

function normalizeParentPhoneInput(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D+/g, '');
  if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length !== 10 || !digits.startsWith('5')) {
    return null;
  }
  return digits;
}

function formatParentPhoneForDisplay(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D+/g, '');
  if (digits.length !== 10) return phone;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
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
    password: '',
    subjectAreas: [] as string[],
    assignedGrades: [] as string[],
  });
  const [newStudent, setNewStudent] = useState({
    name: '',
    email: '',
    gradeLevel: '',
    parentPhone: '',
    password: '',
    profilePictureUrl: '',
  });
  const [newParent, setNewParent] = useState({
    name: '',
    email: '',
  });
  const [assignState, setAssignState] = useState({
    parentId: '',
    studentId: '',
  });

  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editStudent, setEditStudent] = useState<{
    name: string;
    email: string;
    gradeLevel: string;
    parentPhone: string;
    password: string;
    profilePictureUrl: string;
  }>({
    name: '',
    email: '',
    gradeLevel: '',
    parentPhone: '',
    password: '',
    profilePictureUrl: '',
  });

  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [reportStudentId, setReportStudentId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<AnnualReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  type AdminTab =
    | 'overview'
    | 'teachers'
    | 'students'
    | 'parents'
    | 'notifications'
    | 'complaints'
    | 'reports';
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [adminNotifications, setAdminNotifications] = useState<AdminNotification[]>([]);
  const [adminNotificationsLoading, setAdminNotificationsLoading] = useState(false);
  const [activeComplaintId, setActiveComplaintId] = useState<string | null>(null);

  useEffect(() => {
    if (!token || activeTab !== 'notifications') return;
    setAdminNotificationsLoading(true);
    getAdminNotifications(token)
      .then(setAdminNotifications)
      .catch(() => setAdminNotifications([]))
      .finally(() => setAdminNotificationsLoading(false));
  }, [token, activeTab]);

  useEffect(() => {
    if (!token || !reportStudentId || activeTab !== 'reports') {
      setReportData(null);
      return;
    }
    setReportLoading(true);
    getStudentPerformanceReport(token, reportStudentId)
      .then(setReportData)
      .catch(() => setReportData(null))
      .finally(() => setReportLoading(false));
  }, [token, reportStudentId, activeTab]);

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
        id: 'notifications',
        label: 'Bildirimler',
        icon: <span>🔔</span>,
        description: 'Sistem bildirimleri',
        badge: adminNotifications.filter((n) => !n.read).length || undefined,
        active: activeTab === 'notifications',
        onClick: () => setActiveTab('notifications'),
      },
      {
        id: 'complaints',
        label: 'Şikayet / Öneri',
        icon: <span>💬</span>,
        description: 'Geri bildirim',
        active: activeTab === 'complaints',
        onClick: () => setActiveTab('complaints'),
      },
      {
        id: 'reports',
        label: 'Rapor',
        icon: <span>📈</span>,
        description: 'Yıllık gelişim',
        active: activeTab === 'reports',
        onClick: () => setActiveTab('reports'),
      },
    ],
    [activeTab, adminNotifications],
  );

  const adminBreadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const tabLabels: Record<string, string> = {
      overview: 'Genel Bakış',
      teachers: 'Öğretmenler',
      students: 'Öğrenciler',
      parents: 'Veliler',
      notifications: 'Bildirimler',
      complaints: 'Şikayet / Öneri',
      reports: 'Yıllık Rapor',
    };
    const items: BreadcrumbItem[] = [
      { label: 'Ana Sayfa', onClick: activeTab !== 'overview' ? () => setActiveTab('overview') : undefined },
    ];
    if (tabLabels[activeTab]) items.push({ label: tabLabels[activeTab] });
    return items;
  }, [activeTab]);

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

  // Tüm dersleri listele (branş seçimi için)
  useEffect(() => {
    if (!token) return;
    setSubjectsLoading(true);
    getSubjectsList(token)
      .then((list) => {
        // Aynı ders ismi birden fazla kez gelirse tekilleştir
        // ve Sosyoloji / Mantık / Psikoloji derslerini hariç tut
        const blocked = new Set(
          ['sosyoloji', 'mantık', 'psikoloji'].map((n) => n.toLowerCase()),
        );
        const byName = new Map<string, { id: string; name: string }>();
        list.forEach((s) => {
          const lower = s.name.toLowerCase();
          if (blocked.has(lower)) return;
          if (!byName.has(lower)) {
            byName.set(lower, { id: s.id, name: s.name });
          }
        });
        setSubjects(Array.from(byName.values()));
      })
      .catch(() => setSubjects([]))
      .finally(() => setSubjectsLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || activeTab !== 'notifications') return;
    setAdminNotificationsLoading(true);
    getAdminNotifications(token)
      .then(setAdminNotifications)
      .catch(() => setAdminNotifications([]))
      .finally(() => setAdminNotificationsLoading(false));
  }, [token, activeTab]);

  async function handleAddTeacher(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      if (!newTeacher.password || newTeacher.password.length < 4) {
        setError('Öğretmen şifresi en az 4 karakter olmalıdır.');
        return;
      }
      const created = await apiRequest<Teacher>(
        '/admin/teachers',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newTeacher.name,
            email: newTeacher.email,
            subjectAreas: newTeacher.subjectAreas,
            assignedGrades: newTeacher.assignedGrades,
            password: newTeacher.password,
          }),
        },
        token,
      );
      setTeachers((prev) => [...prev, created]);
      setNewTeacher({ name: '', email: '', password: '', subjectAreas: [], assignedGrades: [] });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      let normalizedParentPhone: string | undefined;
      if (newStudent.parentPhone.trim()) {
        const cleaned = normalizeParentPhoneInput(newStudent.parentPhone);
        if (!cleaned) {
          setError('Geçersiz veli telefon numarası. Lütfen 555 123 45 67 formatında girin.');
          return;
        }
        normalizedParentPhone = cleaned;
      }

      if (!newStudent.password || newStudent.password.length < 4) {
        setError('Öğrenci şifresi en az 4 karakter olmalıdır.');
        return;
      }

      const created = await apiRequest<Student>(
        '/admin/students',
        {
          method: 'POST',
          body: JSON.stringify({
            name: newStudent.name,
            email: newStudent.email,
            gradeLevel: newStudent.gradeLevel,
            parentPhone: normalizedParentPhone,
            password: newStudent.password,
            profilePictureUrl: newStudent.profilePictureUrl || undefined,
          }),
        },
        token,
      );
      setStudents((prev) => [...prev, created]);
      setNewStudent({ name: '', email: '', gradeLevel: '', parentPhone: '', password: '', profilePictureUrl: '' });
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
            password: 'password123',
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

  function startEditStudent(s: Student) {
    setEditingStudentId(s.id);
    setEditStudent({
      name: s.name,
      email: s.email,
      gradeLevel: s.gradeLevel ?? '',
      parentPhone: s.parentPhone ? formatParentPhoneForDisplay(s.parentPhone) : '',
      password: '',
      profilePictureUrl: s.profilePictureUrl || '',
    });
  }

  async function handleUpdateStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editingStudentId) return;
    try {
      let normalizedParentPhone: string | undefined | null = undefined;
      if (editStudent.parentPhone.trim()) {
        const cleaned = normalizeParentPhoneInput(editStudent.parentPhone);
        if (!cleaned) {
          setError('Geçersiz veli telefon numarası. Lütfen 555 123 45 67 formatında girin.');
          return;
        }
        normalizedParentPhone = cleaned;
      } else {
        normalizedParentPhone = null;
      }

      const updated = await apiRequest<Student>(
        `/admin/students/${editingStudentId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: editStudent.name,
            email: editStudent.email,
            gradeLevel: editStudent.gradeLevel,
            parentPhone: normalizedParentPhone,
            password: editStudent.password || undefined,
            profilePictureUrl: editStudent.profilePictureUrl || undefined,
          }),
        },
        token,
      );
      setStudents((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      setEditingStudentId(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!token) {
    return <div>Önce yönetici olarak giriş yapmalısınız.</div>;
  }

  const reportStudent =
    (reportStudentId && students.find((s) => s.id === reportStudentId)) || students[0] || null;

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
      breadcrumbs={adminBreadcrumbs}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'AD',
        name: user?.name ?? 'Admin',
        subtitle: 'Yönetici',
        profilePictureUrl: resolveContentUrl(user?.profilePictureUrl),
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

      {activeTab === 'notifications' && (
        <GlassCard title="Bildirimler" subtitle="Şikayet / öneri ve sistem bildirimleri">
          {adminNotificationsLoading && adminNotifications.length === 0 && (
            <div className="empty-state">Yükleniyor...</div>
          )}
          {!adminNotificationsLoading && adminNotifications.length === 0 && (
            <div className="empty-state">Henüz bildirim yok.</div>
          )}
          {adminNotifications.length > 0 && (
            <div className="list-stack">
              {adminNotifications.map((n) => (
                <div key={n.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block' }}>{n.title}</strong>
                    <small style={{ display: 'block', marginTop: '0.15rem' }}>{n.body}</small>
                    <small style={{ display: 'block', marginTop: '0.25rem', opacity: 0.75 }}>
                      {new Date(n.createdAt).toLocaleString('tr-TR')}
                    </small>
                    {n.relatedEntityType === 'complaint' && n.relatedEntityId && (
                      <button
                        type="button"
                        className="ghost-btn"
                        style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}
                        onClick={() => {
                          setActiveComplaintId(n.relatedEntityId!);
                          setActiveTab('complaints');
                        }}
                      >
                        Şikayeti incele
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <TagChip label={n.read ? 'Okundu' : 'Yeni'} tone={n.read ? 'success' : 'warning'} />
                    {!n.read && (
                      <button
                        type="button"
                        className="ghost-btn"
                        style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                        onClick={async () => {
                          if (!token) return;
                          try {
                            await markAdminNotificationRead(token, n.id);
                            setAdminNotifications((prev) =>
                              prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)),
                            );
                          } catch {
                            // ignore
                          }
                        }}
                      >
                        Okundu
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
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
              <span>Şifre</span>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Örn. Ogretmen123"
                value={newTeacher.password}
                onChange={(e) =>
                  setNewTeacher((t) => ({ ...t, password: e.target.value }))
                }
                required
              />
            </div>
            <div className="field">
              <span>Hangi sınıflara giriyor?</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
                {['4', '5', '6', '7', '8', '9', '10', '11', '12'].map((grade) => {
                  const selected = newTeacher.assignedGrades.includes(grade);
                  return (
                    <button
                      key={grade}
                      type="button"
                      className={selected ? 'primary-btn' : 'ghost-btn'}
                      onClick={() =>
                        setNewTeacher((t) => ({
                          ...t,
                          assignedGrades: selected
                            ? t.assignedGrades.filter((g) => g !== grade)
                            : [...t.assignedGrades, grade],
                        }))
                      }
                      style={
                        selected
                          ? { padding: '0.25rem 0.6rem', fontSize: '0.8rem' }
                          : {
                              padding: '0.25rem 0.6rem',
                              fontSize: '0.8rem',
                              border: '1px solid rgba(209,213,219,0.9)',
                              background: '#f9fafb',
                              color: '#111827',
                            }
                      }
                    >
                      {grade}. Sınıf
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="field">
              <span>Hangi derslere giriyor?</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.25rem' }}>
                {subjectsLoading && <span style={{ fontSize: '0.85rem' }}>Yükleniyor...</span>}
                {!subjectsLoading &&
                  subjects.map((s) => {
                    const selected = newTeacher.subjectAreas.includes(s.name);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={selected ? 'primary-btn' : 'ghost-btn'}
                        onClick={() =>
                          setNewTeacher((t) => ({
                            ...t,
                            subjectAreas: selected
                              ? t.subjectAreas.filter((name) => name !== s.name)
                              : [...t.subjectAreas, s.name],
                          }))
                        }
                        style={
                          selected
                            ? { padding: '0.25rem 0.6rem', fontSize: '0.8rem' }
                            : {
                                padding: '0.25rem 0.6rem',
                                fontSize: '0.8rem',
                                border: '1px solid rgba(209,213,219,0.9)',
                                background: '#f9fafb',
                                color: '#111827',
                              }
                        }
                      >
                        {s.name}
                      </button>
                    );
                  })}
              </div>
            </div>
            <button type="submit">Öğretmen Ekle</button>
          </form>
          <div className="list-stack">
            {teachers.length === 0 && (
              <div className="empty-state">Henüz öğretmen kaydı yok.</div>
            )}
            {teachers.map((t) => (
              <div key={t.id} className="list-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {t.profilePictureUrl ? (
                  <img
                    src={resolveContentUrl(t.profilePictureUrl)}
                    alt={t.name}
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '50%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      borderRadius: '50%',
                      background: 'var(--color-primary-soft)',
                      color: 'var(--color-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {t.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
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
          subtitle="Öğrenci kayıtlarını yönetin. Yeni öğrenciler için şifre ve sınıf atamasını buradan yapın."
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
              <span>Sınıf</span>
              <select
                value={newStudent.gradeLevel}
                onChange={(e) =>
                  setNewStudent((s) => ({
                    ...s,
                    gradeLevel: e.target.value,
                  }))
                }
                required
              >
                <option value="">Seçin</option>
                {['4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mezun'].map((grade) => (
                  <option key={grade} value={grade}>
                    {grade === 'Mezun' ? 'Mezun' : `${grade}. Sınıf`}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span>Veli Telefonu</span>
              <input
                placeholder="555 123 45 67"
                value={newStudent.parentPhone}
                onChange={(e) =>
                  setNewStudent((s) => ({
                    ...s,
                    parentPhone: e.target.value.replace(/[^\d\s]/g, ''),
                  }))
                }
              />
            </div>
            <div className="field">
              <span>Şifre</span>
              <input
                type="password"
                value={newStudent.password}
                onChange={(e) =>
                  setNewStudent((s) => ({
                    ...s,
                    password: e.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="field">
              <span>Profil Resmi</span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {newStudent.profilePictureUrl && (
                  <img
                    src={newStudent.profilePictureUrl}
                    alt="Preview"
                    style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file && token) {
                      try {
                        const { url } = await uploadAdminStudentImage(token, file);
                        setNewStudent((s) => ({ ...s, profilePictureUrl: url }));
                      } catch (err) {
                        setError('Resim yüklenemedi');
                      }
                    }
                  }}
                />
              </div>
            </div>
            <button type="submit">Öğrenci Ekle</button>
          </form>
          <div className="dual-grid">
            <div className="list-stack">
              {students.length === 0 && (
                <div className="empty-state">Henüz öğrenci kaydı yok.</div>
              )}
              {students.map((s) => {
                const phoneDisplay = s.parentPhone ? formatParentPhoneForDisplay(s.parentPhone) : '—';
                return (
                  <div key={s.id} className="list-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {s.profilePictureUrl ? (
                      <img
                        src={resolveContentUrl(s.profilePictureUrl)}
                        alt={s.name}
                        style={{
                          width: '3rem',
                          height: '3rem',
                          borderRadius: '12px',
                          objectFit: 'cover',
                          boxShadow: 'var(--shadow-sm)',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '3rem',
                          height: '3rem',
                          borderRadius: '12px',
                          background: 'var(--color-primary-soft)',
                          color: 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1rem',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <strong>{s.name}</strong>
                      <small>{s.email}</small>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.2rem', opacity: 0.9 }}>
                        Sınıf: {s.gradeLevel || '—'}
                      </div>
                      <div
                        style={{ fontSize: '0.8rem', marginTop: '0.1rem', opacity: 0.9 }}
                        title={s.parentPhone ? `Veli Tel: ${phoneDisplay}` : 'Veli telefonu girilmemiş'}
                      >
                        Veli Tel:{' '}
                        <span style={{ filter: 'blur(2px)' }}>
                          {phoneDisplay}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => {
                          setReportStudentId(s.id);
                          setActiveTab('reports');
                        }}
                      >
                        PDF / Rapor
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => startEditStudent(s)}
                      >
                        Düzenle
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div>
              <h3 style={{ marginBottom: '0.5rem' }}>Öğrenci Düzenle</h3>
              {editingStudentId ? (
                <form onSubmit={handleUpdateStudent} className="form">
                  <div className="field">
                    <span>İsim</span>
                    <input
                      value={editStudent.name}
                      onChange={(e) =>
                        setEditStudent((s) => ({ ...s, name: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="field">
                    <span>E-posta</span>
                    <input
                      type="email"
                      value={editStudent.email}
                      onChange={(e) =>
                        setEditStudent((s) => ({ ...s, email: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="field">
                    <span>Sınıf</span>
                    <select
                      value={editStudent.gradeLevel}
                      onChange={(e) =>
                        setEditStudent((s) => ({
                          ...s,
                          gradeLevel: e.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Seçin</option>
                      {['4', '5', '6', '7', '8', '9', '10', '11', '12', 'Mezun'].map((grade) => (
                        <option key={grade} value={grade}>
                          {grade === 'Mezun' ? 'Mezun' : `${grade}. Sınıf`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <span>Veli Telefonu</span>
                    <input
                      placeholder="555 123 45 67"
                      value={editStudent.parentPhone}
                      onChange={(e) =>
                        setEditStudent((s) => ({
                          ...s,
                          parentPhone: e.target.value.replace(/[^\d\s]/g, ''),
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <span>Yeni Şifre (opsiyonel)</span>
                    <input
                      type="password"
                      value={editStudent.password}
                      onChange={(e) =>
                        setEditStudent((s) => ({
                          ...s,
                          password: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="field">
                    <span>Profil Resmi</span>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      {editStudent.profilePictureUrl && (
                        <img
                          src={editStudent.profilePictureUrl}
                          alt="Preview"
                          style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                        />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file && token) {
                            try {
                              const { url } = await uploadAdminStudentImage(token, file);
                              setEditStudent((s) => ({ ...s, profilePictureUrl: url }));
                            } catch (err) {
                              setError('Resim yüklenemedi');
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="primary-btn">
                      Kaydet
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setEditingStudentId(null)}
                    >
                      İptal
                    </button>
                  </div>
                </form>
              ) : (
                <div className="empty-state">
                  Düzenlemek için listeden bir öğrenci seçin.
                </div>
              )}
            </div>
          </div>
        </GlassCard>
      )}

      {activeTab === 'parents' && (
        <GlassCard
          title="Veliler & Öğrenci Atama"
          subtitle="Veli hesapları oluşturun ve öğrenci atamalarını yönetin. Yeni velilerin varsayılan şifresi: password123"
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
            {parents.map((p) => {
              const linkedStudentNames = p.studentIds
                .map((id) => students.find((s) => s.id === id)?.name)
                .filter((name): name is string => !!name);
              const label =
                linkedStudentNames.length > 0
                  ? linkedStudentNames.join(', ')
                  : p.studentIds.join(', ');

              return (
                <div key={p.id} className="list-row">
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.email}</small>
                    {p.studentIds.length > 0 && (
                      <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                        Öğrenciler: {label}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {activeTab === 'reports' && (
        <GlassCard
          title="Yıllık Gelişim Raporu"
          subtitle={
            reportStudent
              ? `${reportStudent.name} için yıllık performans özeti`
              : 'Öğrenci bulunamadı'
          }
        >
          {reportLoading ? (
            <div className="empty-state">Rapor verileri hazırlanıyor...</div>
          ) : (
            <AnnualPerformanceReport reportData={reportData} />
          )}
        </GlassCard>
      )}
    </DashboardLayout>
  );
};


import React, { useEffect, useMemo, useState } from 'react';
import { Shield, UserPlus, Users, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { DashboardLayout, type SidebarItem, type BreadcrumbItem } from './components/DashboardPrimitives';
import { useAuth } from './AuthContext';
import { createRootAdmin, deleteRootAdmin, getRootAdmins, updateRootAdmin, type RootAdminUser } from './api';

export const SystemAdminDashboard: React.FC = () => {
  const { user, token, logout } = useAuth();
  const [admins, setAdmins] = useState<RootAdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; email: string; password: string; institutionName: string }>({
    name: '',
    email: '',
    password: '',
    institutionName: '',
  });

  const systemAdminEmail = 'admin@skytechyazilim.com.tr';

  const isSystemAdminUser = user?.role === 'admin' && user.email === systemAdminEmail;

  const loadAdmins = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await getRootAdmins(token);
      setAdmins(list);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isSystemAdminUser) {
      setError('Bu kontrol paneline sadece sistem yöneticisi erişebilir.');
      return;
    }
    void loadAdmins();
  }, [token, isSystemAdminUser]);

  useEffect(() => {
    if (!success) return;
    const t = window.setTimeout(() => setSuccess(null), 2500);
    return () => window.clearTimeout(t);
  }, [success]);

  const handleEdit = (admin: RootAdminUser) => {
    setEditingId(admin.id);
    setForm({
      name: admin.name,
      email: admin.email,
      password: '',
      institutionName: admin.institutionName ?? '',
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm({ name: '', email: '', password: '', institutionName: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      if (editingId) {
        await updateRootAdmin(token, editingId, {
          name: form.name || undefined,
          email: form.email || undefined,
          password: form.password || undefined,
          institutionName: form.institutionName || undefined,
        });
        setSuccess('Yönetici başarıyla güncellendi.');
      } else {
        if (!form.name || !form.email || !form.password || !form.institutionName) {
          setError('İsim, e-posta, kurum adı ve şifre zorunludur.');
          setLoading(false);
          return;
        }
        await createRootAdmin(token, {
          name: form.name,
          email: form.email,
          password: form.password,
          institutionName: form.institutionName,
        });
        setSuccess('Yeni yönetici başarıyla oluşturuldu.');
      }
      resetForm();
      await loadAdmins();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (admin: RootAdminUser) => {
    if (!token) return;
    if (admin.isSystemAdmin) {
      setError('Sistem yöneticisi bu panelden silinemez.');
      return;
    }
    const ok = window.confirm(`"${admin.name}" adlı yöneticiyi silmek istediğinize emin misiniz?`);
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      await deleteRootAdmin(token, admin.id);
      setSuccess('Yönetici silindi.');
      if (editingId === admin.id) {
        resetForm();
      }
      await loadAdmins();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const sidebarItems: SidebarItem[] = useMemo(
    () => [
      {
        id: 'admins',
        label: 'Yöneticiler',
        icon: <Users size={18} />,
        active: true,
        onClick: () => {},
      },
    ],
    [],
  );

  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Kontrol Paneli' },
    { label: 'Yönetici Yönetimi' },
  ];

  const meInitials = useMemo(() => {
    const name = user?.name ?? 'Sistem Yöneticisi';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0]?.charAt(0).toUpperCase() ?? 'S';
    return (parts[0]?.charAt(0) ?? 'S').toUpperCase() + (parts[1]?.charAt(0) ?? '').toUpperCase();
  }, [user?.name]);

  return (
    <DashboardLayout
      accent="indigo"
      brand="SKYANALİZ"
      title="Kontrol Paneli"
      subtitle="Yönetici hesaplarını tek yerden yönet"
      status={{
        label: 'Sadece sistem yöneticisi',
        tone: 'neutral',
      }}
      breadcrumbs={breadcrumbs}
      sidebarItems={sidebarItems}
      user={{
        initials: meInitials,
        name: user?.name ?? 'Sistem Yöneticisi',
        subtitle: user?.email ?? systemAdminEmail,
        profilePictureUrl: undefined,
      }}
      headerActions={
        <button
          type="button"
          className="ghost-btn"
          onClick={() => {
            void loadAdmins();
          }}
          title="Yenile"
        >
          <RefreshCw size={16} />
        </button>
      }
      onLogout={logout}
    >
      <div className="dashboard-content" style={{ paddingLeft: '1.5rem', paddingRight: '0.5rem' }}>
        <div className="dashboard-header-row">
          <div className="dashboard-header-main">
            <div className="dashboard-header-icon">
              <Shield size={22} />
            </div>
            <div>
              <h1 className="dashboard-title">Yönetici Yönetimi</h1>
              <p className="dashboard-subtitle">
                Bu ekrandan sisteme erişebilecek <strong>admin</strong> kullanıcılarını ekleyebilir, düzenleyebilir ve
                silebilirsiniz.
              </p>
            </div>
          </div>
        </div>

        {!isSystemAdminUser && (
          <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
            Bu sayfaya sadece sistem yöneticisi (admin@skytechyazilim.com.tr) erişebilir.
          </div>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {success && (
          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
            {success}
          </div>
        )}

        <div className="grid grid-2">
          <section className="card">
            <header className="card-header">
              <div className="card-title-row">
                <div className="card-title-main">
                  <UserPlus size={18} />
                  <span>{editingId ? 'Yönetici Düzenle' : 'Yeni Yönetici Ekle'}</span>
                </div>
              </div>
            </header>
            <form className="card-body form" onSubmit={handleSubmit}>
              <label className="field">
                <span>İsim Soyisim</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Örn. Okul Yöneticisi"
                  required
                />
              </label>
              <label className="field">
                <span>E-posta</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="ornek@okul.com"
                  required
                  disabled={editingId !== null}
                />
              </label>
              <label className="field">
                <span>Kurum Adı</span>
                <input
                  type="text"
                  value={form.institutionName}
                  onChange={(e) => setForm((f) => ({ ...f, institutionName: e.target.value }))}
                  placeholder="Örn. SKY Dershanesi - Şube A"
                  required={!editingId}
                />
              </label>
              <label className="field">
                <span>{editingId ? 'Yeni Şifre (opsiyonel)' : 'Şifre'}</span>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={editingId ? 'Boş bırakırsanız şifre değişmez' : 'En az 4 karakter'}
                />
              </label>

              <div className="form-actions" style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={loading || !isSystemAdminUser}
                  style={{ minWidth: '130px' }}
                >
                  {loading ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Ekle'}
                </button>
                {editingId && (
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={resetForm}
                    disabled={loading}
                  >
                    İptal
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="card">
            <header className="card-header">
              <div className="card-title-row">
                <div className="card-title-main">
                  <Users size={18} />
                  <span>Mevcut Yöneticiler</span>
                </div>
              </div>
              <p className="card-subtitle">
                Sistem yöneticisi (admin@skytechyazilim.com.tr) güvenlik için bu ekrandan silinemez veya düzenlenemez.
              </p>
            </header>
            <div className="card-body">
              {loading && admins.length === 0 && <div>Yükleniyor...</div>}
              {!loading && admins.length === 0 && <div>Henüz kayıtlı yönetici yok.</div>}
              {!loading && admins.length > 0 && (
                <div className="students-table-wrapper">
                  <table className="students-table">
                    <thead>
                    <tr>
                      <th>İsim</th>
                      <th>E-posta</th>
                      <th>Kurum</th>
                      <th>Tür</th>
                      <th>Son Görülme</th>
                      <th style={{ textAlign: 'right' }}>İşlemler</th>
                    </tr>
                    </thead>
                    <tbody>
                      {admins.map((admin) => (
                        <tr key={admin.id}>
                          <td>{admin.name}</td>
                          <td>{admin.email}</td>
                          <td>{admin.institutionName ?? '—'}</td>
                          <td>
                            {admin.isSystemAdmin ? (
                              <span className="badge badge-outline">Sistem Yöneticisi</span>
                            ) : (
                              <span className="badge">Admin</span>
                            )}
                          </td>
                          <td>{admin.lastSeenAt ? new Date(admin.lastSeenAt).toLocaleString('tr-TR') : '-'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {!admin.isSystemAdmin && (
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'flex-end',
                                  gap: '0.5rem',
                                }}
                              >
                                <button
                                  type="button"
                                  className="ghost-btn"
                                  onClick={() => handleEdit(admin)}
                                  disabled={loading || !isSystemAdminUser}
                                  style={{
                                    padding: '0.35rem 0.9rem',
                                    borderRadius: 999,
                                    fontSize: '0.8rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                  }}
                                >
                                  <Pencil size={14} />
                                  <span>Güncelle</span>
                                </button>
                                <button
                                  type="button"
                                  className="ghost-btn"
                                  onClick={() => handleDelete(admin)}
                                  disabled={loading || !isSystemAdminUser}
                                  style={{
                                    padding: '0.35rem 0.9rem',
                                    borderRadius: 999,
                                    fontSize: '0.8rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    borderColor: 'rgba(248, 113, 113, 0.8)',
                                    color: '#b91c1c',
                                    background: 'rgba(248, 113, 113, 0.08)',
                                  }}
                                >
                                  <Trash2 size={14} />
                                  <span>Sil</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
};


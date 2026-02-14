import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarClock, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/tr';
import { useAuth } from '../../AuthContext';
import {
  getParentDashboard,
  getStudentHomeworks,
  type HomeworkItem,
  type ParentDashboardSummary,
} from '../../api';
import { DashboardLayout, GlassCard, TagChip } from '../../components/DashboardPrimitives';

dayjs.extend(relativeTime);
dayjs.locale('tr');

type HomeworkTab = 'pending' | 'completed' | 'late';

export const ParentChildHomeworksPage: React.FC = () => {
  const { token, user, logout } = useAuth();
  const [dashboard, setDashboard] = useState<ParentDashboardSummary | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [homeworks, setHomeworks] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingChild, setLoadingChild] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HomeworkTab>('pending');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getParentDashboard(token)
      .then((data) => {
        setDashboard(data);
        if (!selectedStudentId && data.children.length > 0) {
          setSelectedStudentId(data.children[0].studentId);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Öğrenci listesi yüklenemedi'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token || !selectedStudentId) return;
    setLoadingChild(true);
    getStudentHomeworks(token, selectedStudentId)
      .then(setHomeworks)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ödevler yüklenemedi'))
      .finally(() => setLoadingChild(false));
  }, [token, selectedStudentId]);

  const categorized = useMemo(() => {
    const now = dayjs();
    const pending: HomeworkItem[] = [];
    const completed: HomeworkItem[] = [];
    const late: HomeworkItem[] = [];

    homeworks.forEach((hw) => {
      const isLate =
        hw.status === 'LATE' ||
        (hw.status === 'PENDING' && dayjs(hw.dueDate).isBefore(now));
      if (hw.status === 'COMPLETED') {
        completed.push(hw);
      } else if (isLate) {
        late.push({ ...hw, status: 'LATE' });
      } else {
        pending.push(hw);
      }
    });

    return { pending, completed, late };
  }, [homeworks]);

  const visibleList =
    activeTab === 'pending'
      ? categorized.pending
      : activeTab === 'completed'
        ? categorized.completed
        : categorized.late;

  const selectedChild = dashboard?.children.find((c) => c.studentId === selectedStudentId) ?? null;

  const sidebarItems = useMemo(
    () => [
      {
        id: 'child-homeworks',
        label: 'Ödev Takibi',
        icon: <BookOpen size={18} />,
        description: 'Çocuğunuzun bireysel ödevleri',
        active: true,
        onClick: () => {},
      },
    ],
    [],
  );

  return (
    <DashboardLayout
      accent="emerald"
      brand="SKY"
      brandSuffix="ANALİZ"
      tagline="Çocuğunuzun bireysel ödev durumunu görüntüleyin"
      title="Ödev Takibi"
      subtitle="Bekleyen, tamamlanan ve gecikmiş ödevleri renkli rozetlerle görün."
      status={{
        label: selectedChild ? selectedChild.studentName : 'Veli Paneli',
        tone: 'success',
      }}
      breadcrumbs={[{ label: 'Veli Paneli' }, { label: 'Ödev Takibi' }]}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'VL',
        name: user?.name ?? 'Veli',
        subtitle: 'Veli',
      }}
      onLogout={logout}
    >
      <GlassCard
        title="Çocuk Seçimi"
        subtitle="Ödevlerini görüntülemek istediğiniz çocuğu seçin"
      >
        {loading && (
          <div className="empty-state">
            <Loader2 className="mr-2 inline-block animate-spin" size={16} />
            Çocuklarınız yükleniyor...
          </div>
        )}
        {!loading && (!dashboard || dashboard.children.length === 0) && (
          <div className="empty-state">Sistemde kayıtlı öğrenci bulunamadı.</div>
        )}
        {dashboard && dashboard.children.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="form-select"
              value={selectedStudentId ?? ''}
              onChange={(e) => setSelectedStudentId(e.target.value || null)}
            >
              {dashboard.children.map((child) => (
                <option key={child.studentId} value={child.studentId}>
                  {child.studentName} {child.gradeLevel ? `· ${child.gradeLevel}. Sınıf` : ''}
                </option>
              ))}
            </select>
            {selectedChild && (
              <span className="text-xs text-slate-300">
                Bekleyen ödev: <strong>{selectedChild.pendingAssignmentsCount}</strong> ·
                Geciken: <strong>{selectedChild.overdueAssignmentsCount}</strong>
              </span>
            )}
          </div>
        )}
      </GlassCard>

      <GlassCard
        title="Bireysel Ödevler"
        subtitle="Bu ekran sadece görüntüleme içindir (Read-Only)"
      >
        <div className="mb-4 flex gap-2 border-b border-slate-700 pb-2">
          <button
            type="button"
            className={`tab-chip ${activeTab === 'pending' ? 'tab-chip--active' : ''}`}
            onClick={() => setActiveTab('pending')}
          >
            <Clock size={14} className="mr-1" />
            Bekleyenler ({categorized.pending.length})
          </button>
          <button
            type="button"
            className={`tab-chip ${activeTab === 'completed' ? 'tab-chip--active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            <CheckCircle2 size={14} className="mr-1" />
            Tamamlananlar ({categorized.completed.length})
          </button>
          <button
            type="button"
            className={`tab-chip ${activeTab === 'late' ? 'tab-chip--active' : ''}`}
            onClick={() => setActiveTab('late')}
          >
            <XCircle size={14} className="mr-1" />
            Gecikmişler ({categorized.late.length})
          </button>
        </div>

        {loadingChild && (
          <div className="empty-state">
            <Loader2 className="mr-2 inline-block animate-spin" size={16} />
            Ödevler yükleniyor...
          </div>
        )}
        {!loadingChild && visibleList.length === 0 && (
          <div className="empty-state">
            Bu sekmede gösterilecek ödev yok.
          </div>
        )}
        {error && <div className="error mb-2">{error}</div>}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleList.map((hw) => {
            const isLate =
              hw.status === 'LATE' ||
              (hw.status === 'PENDING' && dayjs(hw.dueDate).isBefore(dayjs()));
            const remaining = dayjs(hw.dueDate).fromNow();
            return (
              <div
                key={hw.id}
                className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-4 shadow-sm flex flex-col justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <BookOpen size={20} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-50">
                        {hw.title}
                      </h3>
                      <TagChip
                        label={
                          hw.status === 'COMPLETED'
                            ? 'Tamamlandı'
                            : isLate
                              ? 'Yapılmadı'
                              : 'Devam Ediyor'
                        }
                        tone={
                          hw.status === 'COMPLETED'
                            ? 'success'
                            : isLate
                              ? 'warning'
                              : 'info'
                        }
                      />
                    </div>
                    {hw.lessonName && (
                      <p className="text-xs text-slate-300 flex items-center gap-1">
                        <BookOpen size={12} />
                        {hw.lessonName}
                      </p>
                    )}
                    {hw.description && (
                      <p className="mt-1 line-clamp-3 text-xs text-slate-300">
                        {hw.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                  <div className="flex flex-col gap-0.5">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock size={12} />
                      Son tarih:{' '}
                      {dayjs(hw.dueDate).format('DD MMM YYYY HH:mm')}
                    </span>
                    <span className={isLate ? 'text-rose-400' : 'text-emerald-400'}>
                      {isLate ? `Süresi geçti (${remaining})` : `${remaining}`}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </DashboardLayout>
  );
};


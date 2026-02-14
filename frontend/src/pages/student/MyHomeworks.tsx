import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarClock, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/tr';
import confetti from 'canvas-confetti';
import { useAuth } from '../../AuthContext';
import { getStudentHomeworks, updateHomeworkStatus, type HomeworkItem, type HomeworkStatus } from '../../api';
import { DashboardLayout, GlassCard, TagChip } from '../../components/DashboardPrimitives';

dayjs.extend(relativeTime);
dayjs.locale('tr');

type HomeworkTab = 'pending' | 'completed' | 'late';

export const StudentMyHomeworksPage: React.FC = () => {
  const { token, user, logout } = useAuth();
  const [homeworks, setHomeworks] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<HomeworkTab>('pending');
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!token || !user) return;
    setLoading(true);
    getStudentHomeworks(token, user.id)
      .then(setHomeworks)
      .catch((e) => setError(e instanceof Error ? e.message : 'Ödevler yüklenemedi'))
      .finally(() => setLoading(false));
  }, [token, user]);

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

  const triggerConfetti = () => {
    confetti({
      particleCount: 120,
      spread: 60,
      origin: { y: 0.7 },
    });
  };

  const optimisticUpdateStatus = (id: string, status: HomeworkStatus) => {
    setHomeworks((prev) =>
      prev.map((hw) =>
        hw.id === id
          ? {
              ...hw,
              status,
            }
          : hw,
      ),
    );
  };

  const handleMarkCompleted = async (homeworkId: string) => {
    if (!token) return;
    setError(null);
    setUpdatingIds((prev) => new Set(prev).add(homeworkId));

    const previous = homeworks.find((h) => h.id === homeworkId);
    optimisticUpdateStatus(homeworkId, 'COMPLETED');
    triggerConfetti();

    try {
      const res = await updateHomeworkStatus(token, homeworkId, 'COMPLETED');
      optimisticUpdateStatus(homeworkId, res.status);
    } catch (e) {
      if (previous) {
        setHomeworks((prevList) =>
          prevList.map((hw) => (hw.id === previous.id ? previous : hw)),
        );
      }
      setError(e instanceof Error ? e.message : 'Durum güncellenemedi');
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(homeworkId);
        return next;
      });
    }
  };

  const sidebarItems = useMemo(
    () => [
      {
        id: 'homeworks',
        label: 'Ödevlerim',
        icon: <BookOpen size={18} />,
        description: 'Bireysel ödev listesi',
        active: true,
        onClick: () => {},
      },
    ],
    [],
  );

  return (
    <DashboardLayout
      accent="indigo"
      brand="SKY"
      brandSuffix="ANALİZ"
      tagline="Bireysel ödevlerinizi buradan takip edin"
      title="Ödevlerim"
      subtitle="Öğretmeninizin size özel verdiği ödevleri görüntüleyin ve tamamlayın."
      status={{
        label: 'Aktif',
        tone: 'success',
      }}
      breadcrumbs={[{ label: 'Öğrenci Paneli' }, { label: 'Ödevlerim' }]}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'ÖG',
        name: user?.name ?? 'Öğrenci',
        subtitle: 'Öğrenci',
      }}
      onLogout={logout}
    >
      <GlassCard
        title="Bireysel Ödevler"
        subtitle="Bekleyen, tamamlanan ve gecikmiş ödevler"
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

        {loading && (
          <div className="empty-state">
            <Loader2 className="mr-2 inline-block animate-spin" size={16} />
            Ödevler yükleniyor...
          </div>
        )}
        {!loading && visibleList.length === 0 && (
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
            const isPendingTab = activeTab === 'pending';
            const isUpdating = updatingIds.has(hw.id);
            return (
              <div
                key={hw.id}
                className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-4 shadow-sm flex flex-col justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
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
                              ? 'Gecikmiş'
                              : 'Bekliyor'
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
                  {isPendingTab && (
                    <button
                      type="button"
                      className="primary-btn px-3 py-1 text-xs"
                      onClick={() => handleMarkCompleted(hw.id)}
                      disabled={isUpdating}
                    >
                      {isUpdating ? 'Güncelleniyor...' : 'Tamamlandı Olarak İşaretle'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </DashboardLayout>
  );
};


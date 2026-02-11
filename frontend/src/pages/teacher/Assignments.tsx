import React, { useEffect, useMemo, useState } from 'react';
import { PlusCircle, ClipboardList, CalendarClock, User as UserIcon, BookOpen, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/tr';
import { useAuth } from '../../AuthContext';
import {
  createTeacherHomework,
  getTeacherHomeworks,
  getTeacherStudents,
  getSubjectsList,
  type HomeworkItem,
  type SubjectItem,
  type TeacherStudent,
} from '../../api';
import { DashboardLayout, GlassCard, TagChip } from '../../components/DashboardPrimitives';

dayjs.extend(relativeTime);
dayjs.locale('tr');

const homeworkSchema = z.object({
  studentId: z.string().min(1, 'Öğrenci seçin'),
  lessonId: z.string().min(1, 'Ders seçin'),
  title: z.string().min(3, 'Başlık en az 3 karakter olmalı'),
  description: z.string().min(5, 'Açıklama en az 5 karakter olmalı'),
  dueDate: z.string().min(1, 'Teslim tarihi seçin'),
});

type HomeworkFormValues = z.infer<typeof homeworkSchema>;

export const TeacherAssignmentsPage: React.FC = () => {
  const { token, user, logout } = useAuth();
  const [students, setStudents] = useState<TeacherStudent[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [homeworks, setHomeworks] = useState<HomeworkItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<HomeworkFormValues>({
    resolver: zodResolver(homeworkSchema),
    defaultValues: {
      title: '',
      description: '',
      studentId: '',
      lessonId: '',
      dueDate: '',
    },
  });

  useEffect(() => {
    if (!token) return;
    setLoadingMeta(true);
    Promise.all([getTeacherStudents(token), getSubjectsList(token)])
      .then(([studentsRes, subjectsRes]) => {
        setStudents(studentsRes);
        setSubjects(subjectsRes);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Öğrenci/ders listesi yüklenemedi');
      })
      .finally(() => setLoadingMeta(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoadingList(true);
    getTeacherHomeworks(token)
      .then(setHomeworks)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Ödev listesi yüklenemedi');
      })
      .finally(() => setLoadingList(false));
  }, [token]);

  const onSubmit = async (values: HomeworkFormValues) => {
    if (!token) return;
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = {
        ...values,
        dueDate: new Date(values.dueDate).toISOString(),
      };
      const created = await createTeacherHomework(token, payload);
      setHomeworks((prev) => [created, ...prev]);
      setSuccessMessage('Ödev başarıyla atandı.');
      reset({
        title: '',
        description: '',
        studentId: values.studentId,
        lessonId: values.lessonId,
        dueDate: '',
      });
      setIsModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ödev atanamadı');
    }
  };

  const sidebarItems = useMemo(
    () => [
      {
        id: 'assignments',
        label: 'Bireysel Ödevler',
        icon: <ClipboardList size={18} />,
        description: 'Öğrenci bazlı ödev takibi',
        active: true,
        onClick: () => {},
      },
    ],
    [],
  );

  return (
    <DashboardLayout
      accent="indigo"
      brand="SKYTECH"
      tagline="Bireysel Öğrenci Ödevleri"
      title="Bireysel Ödev Sistemi"
      subtitle="Belirli öğrencilere ders bazlı ödev atayın ve ilerlemelerini takip edin."
      status={{
        label: 'Aktif',
        tone: 'success',
      }}
      breadcrumbs={[{ label: 'Öğretmen Paneli' }, { label: 'Bireysel Ödevler' }]}
      sidebarItems={sidebarItems}
      user={{
        initials: user?.name?.slice(0, 2).toUpperCase() ?? 'ÖG',
        name: user?.name ?? 'Öğretmen',
        subtitle: 'Öğretmen',
      }}
      headerActions={
        <button
          type="button"
          className="primary-btn"
          onClick={() => setIsModalOpen(true)}
        >
          <PlusCircle size={16} className="mr-1" />
          Yeni Ödev Ata
        </button>
      }
      onLogout={logout}
    >
      <div className="dual-grid">
        <GlassCard
          title="Yeni Ödev Ata"
          subtitle="Öğrenci ve ders seçerek bireysel ödev oluşturun"
          actions={
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setIsModalOpen(true)}
            >
              <PlusCircle size={16} className="mr-1" />
              Yeni Ödev
            </button>
          }
        >
          {loadingMeta && (
            <div className="empty-state">
              <Loader2 className="mr-2 inline-block animate-spin" size={16} />
              Öğrenci ve dersler yükleniyor...
            </div>
          )}
          {!loadingMeta && (
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="grid gap-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Öğrenci</label>
                  <select
                    className="form-select w-full"
                    {...register('studentId')}
                  >
                    <option value="">Öğrenci seçin</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.gradeLevel ? `· ${s.gradeLevel}. Sınıf` : ''}
                      </option>
                    ))}
                  </select>
                  {errors.studentId && (
                    <p className="form-error">{errors.studentId.message}</p>
                  )}
                </div>
                <div>
                  <label className="form-label">Ders</label>
                  <select
                    className="form-select w-full"
                    {...register('lessonId')}
                  >
                    <option value="">Ders seçin</option>
                    {subjects.map((subj) => (
                      <option key={subj.id} value={subj.id}>
                        {subj.name}
                      </option>
                    ))}
                  </select>
                  {errors.lessonId && (
                    <p className="form-error">{errors.lessonId.message}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="form-label">Başlık</label>
                <input
                  type="text"
                  className="form-input w-full"
                  placeholder="Örn: Çarpanlar ve Katlar"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="form-error">{errors.title.message}</p>
                )}
              </div>
              <div>
                <label className="form-label">Açıklama</label>
                <textarea
                  className="form-textarea w-full"
                  rows={3}
                  placeholder="Örn: Test kitabından 50 soru çöz"
                  {...register('description')}
                />
                {errors.description && (
                  <p className="form-error">{errors.description.message}</p>
                )}
              </div>
              <div>
                <label className="form-label">Son Teslim Tarihi</label>
                <input
                  type="datetime-local"
                  className="form-input w-full"
                  {...register('dueDate')}
                />
                {errors.dueDate && (
                  <p className="form-error">{errors.dueDate.message}</p>
                )}
              </div>
              {error && <div className="error mt-1">{error}</div>}
              {successMessage && (
                <div className="text-sm text-emerald-400 mt-1">{successMessage}</div>
              )}
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => reset()}
                  disabled={isSubmitting}
                >
                  Temizle
                </button>
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Ödev Ata'}
                </button>
              </div>
            </form>
          )}
        </GlassCard>

        <GlassCard
          title="Atadığım Ödevler"
          subtitle="Tüm bireysel ödevlerin listesi"
        >
          {loadingList && (
            <div className="empty-state">
              <Loader2 className="mr-2 inline-block animate-spin" size={16} />
              Ödevler yükleniyor...
            </div>
          )}
          {!loadingList && homeworks.length === 0 && (
            <div className="empty-state">Henüz bireysel ödev atamadınız.</div>
          )}
          <div className="list-stack">
            {homeworks.map((hw) => {
              const isLate =
                hw.status === 'LATE' ||
                (hw.status === 'PENDING' && dayjs(hw.dueDate).isBefore(dayjs()));
              return (
                <div
                  key={hw.id}
                  className="list-row"
                  style={{ alignItems: 'flex-start' }}
                >
                  <div className="flex flex-col gap-1 flex-1">
                    <div className="flex items-center gap-2">
                      <ClipboardList size={16} className="text-sky-400" />
                      <span className="font-semibold">{hw.title}</span>
                    </div>
                    {hw.description && (
                      <p className="text-xs text-slate-300">{hw.description}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-1 text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1">
                        <UserIcon size={12} />
                        {hw.studentName}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <BookOpen size={12} />
                        {hw.lessonName}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock size={12} />
                        {dayjs(hw.dueDate).format('DD MMM YYYY HH:mm')} ·{' '}
                        {dayjs(hw.dueDate).fromNow()}
                      </span>
                    </div>
                  </div>
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
              );
            })}
          </div>
        </GlassCard>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-lg shadow-xl relative">
            <button
              type="button"
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-100"
              onClick={() => setIsModalOpen(false)}
            >
              ×
            </button>
            <h2 className="text-lg font-semibold mb-1">Yeni Ödev Ata</h2>
            <p className="text-xs text-slate-400 mb-4">
              Bu form, sadece seçtiğiniz öğrenci ve ders için bireysel ödev oluşturur.
            </p>
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="grid gap-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Öğrenci</label>
                  <select
                    className="form-select w-full"
                    {...register('studentId')}
                  >
                    <option value="">Öğrenci seçin</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  {errors.studentId && (
                    <p className="form-error">{errors.studentId.message}</p>
                  )}
                </div>
                <div>
                  <label className="form-label">Ders</label>
                  <select
                    className="form-select w-full"
                    {...register('lessonId')}
                  >
                    <option value="">Ders seçin</option>
                    {subjects.map((subj) => (
                      <option key={subj.id} value={subj.id}>
                        {subj.name}
                      </option>
                    ))}
                  </select>
                  {errors.lessonId && (
                    <p className="form-error">{errors.lessonId.message}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="form-label">Başlık</label>
                <input
                  type="text"
                  className="form-input w-full"
                  placeholder="Örn: 100 Matematik Sorusu"
                  {...register('title')}
                />
                {errors.title && (
                  <p className="form-error">{errors.title.message}</p>
                )}
              </div>
              <div>
                <label className="form-label">Açıklama</label>
                <textarea
                  className="form-textarea w-full"
                  rows={3}
                  placeholder="Örn: Test kitabından 50 soru çöz"
                  {...register('description')}
                />
                {errors.description && (
                  <p className="form-error">{errors.description.message}</p>
                )}
              </div>
              <div>
                <label className="form-label">Son Teslim Tarihi</label>
                <input
                  type="datetime-local"
                  className="form-input w-full"
                  {...register('dueDate')}
                />
                {errors.dueDate && (
                  <p className="form-error">{errors.dueDate.message}</p>
                )}
              </div>
              {error && <div className="error mt-1">{error}</div>}
              <div className="flex justify-end gap-2 mt-3">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Ödevi Oluştur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};


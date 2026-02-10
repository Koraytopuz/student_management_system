import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { CalendarCheck, PlusCircle, Trash2, Edit2 } from 'lucide-react';
import { GlassCard, MetricCard, TagChip } from './components/DashboardPrimitives';
import {
  type TeacherStudent,
  type TeacherCoachingSession,
  type TeacherCoachingGoal,
  type TeacherCoachingNote,
  type TeacherStudentProfile,
  type TeacherTest,
  type CoachingGoalStatus,
  getTeacherCoachingSessions,
  getTeacherCoachingGoals,
  getTeacherCoachingNotes,
  createTeacherCoachingSession,
  updateTeacherCoachingSession,
  deleteTeacherCoachingSession,
  createTeacherCoachingGoal,
  updateTeacherCoachingGoal,
  createTeacherCoachingNote,
} from './api';

function toLocalInputValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function formatShortDate(iso?: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

const TEACHER_START_DEADLINE_MS = 10 * 60 * 1000;

function canTeacherStartSession(dateIso: string, now = Date.now()): boolean {
  const start = new Date(dateIso).getTime();
  if (Number.isNaN(start)) return false;
  return now <= start + TEACHER_START_DEADLINE_MS;
}

export const CoachingTab: React.FC<{
  token: string | null;
  students: TeacherStudent[];
  selectedStudentId: string;
  onSelectStudent: (id: string) => void;
  studentProfile: TeacherStudentProfile | null;
  profileLoading: boolean;
  tests: TeacherTest[];
}> = ({ token, students, selectedStudentId, onSelectStudent, studentProfile, profileLoading, tests }) => {
  const [sessions, setSessions] = useState<TeacherCoachingSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSession, setEditingSession] = useState<TeacherCoachingSession | null>(null);
  const [form, setForm] = useState<{
    date: string;
    durationMinutes: string;
    title: string;
    notes: string;
    mode: 'audio' | 'video';
    meetingUrl: string;
  }>({
    date: '',
    durationMinutes: '',
    title: '',
    notes: '',
    mode: 'audio',
    meetingUrl: '',
  });

  const [activeDetailTab, setActiveDetailTab] = useState<'goals' | 'notes'>('goals');
  const [goals, setGoals] = useState<TeacherCoachingGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [goalForm, setGoalForm] = useState<{ title: string; description: string; deadline: string }>({
    title: '',
    description: '',
    deadline: '',
  });

  const [notes, setNotes] = useState<TeacherCoachingNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [noteForm, setNoteForm] = useState<{ content: string; sharedWithParent: boolean }>({
    content: '',
    sharedWithParent: true,
  });

  const studentsWithPresence = useMemo(() => {
    const now = Date.now();
    return students.map((s) => {
      const last = s.lastSeenAt ? new Date(s.lastSeenAt).getTime() : NaN;
      const isOnline = !Number.isNaN(last) && now - last <= 2 * 60 * 1000;
      return { ...s, isOnline };
    });
  }, [students]);

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) ?? null,
    [students, selectedStudentId],
  );

  const resetForm = () => {
    setEditingSession(null);
    setForm({
      date: '',
      durationMinutes: '',
      title: '',
      notes: '',
      mode: 'audio',
      meetingUrl: '',
    });
  };

  const refreshGoals = async () => {
    if (!token || !selectedStudentId) {
      setGoals([]);
      return;
    }
    setGoalsLoading(true);
    setGoalsError(null);
    try {
      const data = await getTeacherCoachingGoals(token, selectedStudentId);
      setGoals(data);
    } catch (e) {
      setGoalsError(
        e instanceof Error ? e.message : 'Koçluk hedefleri yüklenemedi.',
      );
    } finally {
      setGoalsLoading(false);
    }
  };

  const refreshNotes = async () => {
    if (!token || !selectedStudentId) {
      setNotes([]);
      return;
    }
    setNotesLoading(true);
    setNotesError(null);
    try {
      const data = await getTeacherCoachingNotes(token, selectedStudentId);
      setNotes(data);
    } catch (e) {
      setNotesError(
        e instanceof Error ? e.message : 'Koçluk notları yüklenemedi.',
      );
    } finally {
      setNotesLoading(false);
    }
  };

  const refresh = async () => {
    if (!token || !selectedStudentId) {
      setSessions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getTeacherCoachingSessions(token, selectedStudentId);
      setSessions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Koçluk kayıtları yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    if (!selectedStudentId && students[0]) {
      onSelectStudent(students[0].id);
      return;
    }
    Promise.all([refresh(), refreshGoals(), refreshNotes()]).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedStudentId]);

  const handleOpenNew = () => {
    setError(null);
    const base = new Date();
    const local = new Date(base.getTime() - base.getTimezoneOffset() * 60 * 1000);
    const value = local.toISOString().slice(0, 16);
    setEditingSession(null);
    setForm((prev) => ({
      ...prev,
      date: prev.date || value,
      title: prev.title,
      notes: prev.notes,
      mode: prev.mode ?? 'audio',
    }));
    setFormOpen(true);
  };

  const handleEdit = (session: TeacherCoachingSession) => {
    setError(null);
    setEditingSession(session);
    setForm({
      date: toLocalInputValue(session.date),
      durationMinutes: session.durationMinutes != null ? String(session.durationMinutes) : '',
      title: session.title,
      notes: session.notes,
      mode: session.mode ?? 'audio',
      meetingUrl: session.meetingUrl ?? '',
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!token || !selectedStudentId) return;
    const title = form.title.trim();
    const notes = form.notes.trim();
    if (!form.date || !title || !notes) {
      setError('Lütfen tarih, başlık ve not alanlarını doldurun.');
      return;
    }
    if (form.meetingUrl.trim() && !/^https?:\/\//i.test(form.meetingUrl.trim())) {
      setError('Görüşme linki "http://" veya "https://" ile başlamalıdır.');
      return;
    }
    const parsedLocal = new Date(form.date);
    if (Number.isNaN(parsedLocal.getTime())) {
      setError('Geçersiz tarih formatı.');
      return;
    }
    const isoDate = parsedLocal.toISOString();
    const duration = form.durationMinutes ? Number(form.durationMinutes) : undefined;

    const payload: {
      date: string;
      durationMinutes?: number;
      title: string;
      notes: string;
      mode?: 'audio' | 'video';
      meetingUrl?: string;
    } = {
      date: isoDate,
      title,
      notes,
      mode: form.mode,
    };
    if (Number.isFinite(duration!)) {
      payload.durationMinutes = duration as number;
    }
    if (form.meetingUrl.trim()) {
      payload.meetingUrl = form.meetingUrl.trim();
    }

    setSaving(true);
    setError(null);
    try {
      if (editingSession) {
        await updateTeacherCoachingSession(token, editingSession.id, payload);
      } else {
        await createTeacherCoachingSession(token, selectedStudentId, payload);
      }
      setFormOpen(false);
      resetForm();
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Koçluk kaydı kaydedilirken bir hata oluştu.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (session: TeacherCoachingSession) => {
    if (!token) return;
    // eslint-disable-next-line no-alert
    const ok = window.confirm('Bu koçluk kaydını silmek istediğinize emin misiniz?');
    if (!ok) return;
    try {
      await deleteTeacherCoachingSession(token, session.id);
      if (editingSession?.id === session.id) {
        setFormOpen(false);
        resetForm();
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt silinemedi.');
    }
  };

  const handleCreateGoal = async () => {
    if (!token || !selectedStudentId) return;
    const title = goalForm.title.trim();
    if (!title || !goalForm.deadline) {
      setGoalsError('Lütfen başlık ve bitiş tarihini doldurun.');
      return;
    }
    const deadlineIso = new Date(goalForm.deadline).toISOString();
    setGoalsError(null);
    setGoalsLoading(true);
    try {
      await createTeacherCoachingGoal(token, selectedStudentId, {
        title,
        description: goalForm.description.trim() || undefined,
        deadline: deadlineIso,
      });
      setGoalForm({ title: '', description: '', deadline: '' });
      await refreshGoals();
    } catch (e) {
      setGoalsError(
        e instanceof Error ? e.message : 'Hedef kaydedilirken bir hata oluştu.',
      );
    } finally {
      setGoalsLoading(false);
    }
  };

  const handleToggleGoalStatus = async (goal: TeacherCoachingGoal) => {
    if (!token) return;
    const nextStatus: CoachingGoalStatus =
      goal.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateTeacherCoachingGoal(token, goal.id, { status: nextStatus });
      await refreshGoals();
    } catch (e) {
      setGoalsError(
        e instanceof Error ? e.message : 'Hedef güncellenemedi.',
      );
    }
  };

  const handleCreateNote = async () => {
    if (!token || !selectedStudentId) return;
    const content = noteForm.content.trim();
    if (!content) {
      setNotesError('Lütfen not içeriğini girin.');
      return;
    }
    setNotesError(null);
    setNotesLoading(true);
    try {
      await createTeacherCoachingNote(token, selectedStudentId, {
        content,
        visibility: noteForm.sharedWithParent
          ? 'shared_with_parent'
          : 'teacher_only',
      });
      setNoteForm({ content: '', sharedWithParent: true });
      await refreshNotes();
    } catch (e) {
      setNotesError(
        e instanceof Error ? e.message : 'Not kaydedilirken bir hata oluştu.',
      );
    } finally {
      setNotesLoading(false);
    }
  };

  const totalSessions = sessions.length;
  const lastSessionDate = sessions[0]?.date;

  const studentResults = useMemo(
    () => studentProfile?.results ?? [],
    [studentProfile],
  );
  const totalTests = studentResults.length;
  const aggregateStats = useMemo(() => {
    if (!studentResults.length) {
      return {
        totalCorrect: 0,
        totalIncorrect: 0,
        totalBlank: 0,
        avgScore: 0,
        totalMinutes: 0,
      };
    }
    const totals = studentResults.reduce(
      (acc, r) => {
        acc.totalCorrect += r.correctCount;
        acc.totalIncorrect += r.incorrectCount;
        acc.totalBlank += r.blankCount;
        acc.sumScore += r.scorePercent;
        acc.totalSeconds += r.durationSeconds;
        return acc;
      },
      { totalCorrect: 0, totalIncorrect: 0, totalBlank: 0, sumScore: 0, totalSeconds: 0 },
    );
    return {
      totalCorrect: totals.totalCorrect,
      totalIncorrect: totals.totalIncorrect,
      totalBlank: totals.totalBlank,
      avgScore: Math.round(totals.sumScore / studentResults.length),
      totalMinutes: Math.round(totals.totalSeconds / 60),
    };
  }, [studentResults]);

  const testTitleById = useMemo(() => {
    const map = new Map<string, string>();
    tests.forEach((t) => {
      map.set(t.id, t.title);
    });
    return map;
  }, [tests]);

  const activeAssignments = useMemo(
    () => studentProfile?.assignments ?? [],
    [studentProfile],
  );

  const recentWatchRecords = useMemo(
    () => (studentProfile?.watchRecords ?? []).slice(0, 3),
    [studentProfile],
  );

  return (
    <GlassCard
      title="Koçluk Takip"
      subtitle="Öğrencilerinizle yaptığınız birebir koçluk seanslarını kaydedin ve izleyin."
      actions={
        <button
          type="button"
          className="primary-btn"
          onClick={handleOpenNew}
          disabled={!token || !selectedStudentId}
        >
          <PlusCircle size={16} style={{ marginRight: 6 }} />
          Yeni Seans
        </button>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)',
          gap: '1.25rem',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.45rem' }}>
            Öğrenciler
          </div>
          <div className="list-stack" style={{ maxHeight: 260, overflow: 'auto' }}>
            {studentsWithPresence.length === 0 && (
              <div className="empty-state">Öğrenci bulunamadı.</div>
            )}
            {studentsWithPresence.map((student) => (
              <button
                key={student.id}
                type="button"
                className="list-row"
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  background:
                    student.id === selectedStudentId
                      ? 'var(--color-surface-strong)'
                      : undefined,
                }}
                onClick={() => onSelectStudent(student.id)}
              >
                <div style={{ flex: 1 }}>
                  <strong
                    style={{
                      display: 'block',
                      color: 'var(--color-text-main)',
                    }}
                  >
                    {student.name}{' '}
                    {student.gradeLevel ? `(${student.gradeLevel}. Sınıf)` : ''}
                  </strong>
                  <small
                    style={{
                      display: 'block',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    {student.isOnline
                      ? 'Çevrimiçi'
                      : student.lastSeenAt
                        ? `Son görülme: ${new Date(
                            student.lastSeenAt,
                          ).toLocaleString('tr-TR')}`
                        : 'Son görülme: -'}
                  </small>
                </div>
                <TagChip
                  label={student.isOnline ? 'Online' : 'Offline'}
                  tone={student.isOnline ? 'success' : 'warning'}
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ marginBottom: '0.75rem' }}>
            <div className="metric-grid">
              <MetricCard
                label="Toplam Seans"
                value={`${totalSessions}`}
                helper={selectedStudent ? selectedStudent.name : 'Tüm öğrenciler'}
                trendLabel="Koçluk"
                trendTone="positive"
              />
              <MetricCard
                label="Son Seans"
                value={lastSessionDate ? formatShortDate(lastSessionDate) : '-'}
                helper={lastSessionDate ? formatTime(lastSessionDate) : 'Kayıt yok'}
                trendLabel={lastSessionDate ? 'Güncel' : 'Beklemede'}
                trendTone={lastSessionDate ? 'neutral' : 'negative'}
              >
                <div className="metric-inline">
                  <CalendarCheck size={14} />
                </div>
              </MetricCard>
            </div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            {profileLoading ? (
              <div className="empty-state">Öğrenci performans verileri yükleniyor...</div>
            ) : !studentProfile || !studentResults.length ? (
              <div className="empty-state">
                Bu öğrenci için henüz sınav sonucu bulunmuyor. İlk test tamamlandığında burada özet
                performansını görebilirsiniz.
              </div>
            ) : (
              <div className="metric-grid">
                <MetricCard
                  label="Çözülen Test"
                  value={`${totalTests}`}
                  helper="Toplam bireysel test"
                  trendLabel="Koçluk için hazır veri"
                  trendTone="positive"
                />
                <MetricCard
                  label="Ortalama Başarı"
                  value={`${aggregateStats.avgScore}%`}
                  helper="Tüm testler"
                  trendLabel="Genel seviye"
                  trendTone="neutral"
                />
                <MetricCard
                  label="Doğru / Yanlış / Boş"
                  value={`${aggregateStats.totalCorrect} / ${aggregateStats.totalIncorrect} / ${aggregateStats.totalBlank}`}
                  helper="Toplam soru"
                  trendLabel="Detay için tabloyu incele"
                  trendTone="neutral"
                />
                <MetricCard
                  label="Toplam Süre"
                  value={`${aggregateStats.totalMinutes} dk`}
                  helper="Test çözme süresi"
                  trendLabel="Çalışma yoğunluğu"
                  trendTone="positive"
                />
              </div>
            )}
          </div>

          {formOpen && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.9rem 1rem 1rem',
                borderRadius: 18,
                background: 'var(--color-surface-strong)',
                border: '1px solid var(--color-border-subtle)',
                boxShadow: 'var(--shadow-soft)',
                display: 'grid',
                gap: '0.8rem',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)',
                  gap: '0.75rem',
                }}
              >
                <label
                  htmlFor="coaching-date"
                  style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
                >
                  Tarih / Saat
                  <input
                    id="coaching-date"
                    type="datetime-local"
                    value={form.date}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, date: e.target.value }))
                    }
                    style={{
                      width: '100%',
                      marginTop: '0.25rem',
                    }}
                  />
                </label>

                <label
                  htmlFor="coaching-duration"
                  style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
                >
                  Süre (dakika)
                  <input
                    id="coaching-duration"
                    type="number"
                    min={0}
                    value={form.durationMinutes}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        durationMinutes: e.target.value,
                      }))
                    }
                    placeholder="Opsiyonel"
                    style={{
                      width: '100%',
                      marginTop: '0.25rem',
                    }}
                  />
                </label>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: '0.65rem',
                }}
              >
                <div>
                  <label
                    htmlFor="coaching-title"
                    style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
                  >
                    Başlık
                  </label>
                  <input
                    id="coaching-title"
                    type="text"
                    value={form.title}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                    placeholder="Örn. Motivasyon görüşmesi"
                    style={{ width: '100%', marginTop: '0.25rem' }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--color-text-muted)',
                      marginBottom: '0.25rem',
                    }}
                  >
                    Görüşme türü
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {[
                      { id: 'audio' as const, label: 'Sesli Görüşme' },
                      { id: 'video' as const, label: 'Görüntülü Görüşme' },
                    ].map((option) => {
                      const isActive = form.mode === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={isActive ? 'primary-btn' : 'ghost-btn'}
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              mode: option.id,
                            }))
                          }
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="coaching-link"
                    style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
                  >
                    Görüşme linki
                  </label>
                  <input
                    id="coaching-link"
                    type="url"
                    value={form.meetingUrl}
                    placeholder="Zoom / Meet / Teams linki (opsiyonel)"
                    style={{ width: '100%', marginTop: '0.25rem' }}
                    onChange={(e) => {
                      setError(null);
                      setForm((prev) => ({
                        ...prev,
                        meetingUrl: e.target.value,
                      }));
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="coaching-notes"
                    style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
                  >
                    Notlar
                  </label>
                  <textarea
                    id="coaching-notes"
                    rows={4}
                    value={form.notes}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Görüşmenin içeriği, hedefler, aksiyon maddeleri..."
                    style={{
                      width: '100%',
                      marginTop: '0.25rem',
                      resize: 'vertical',
                    }}
                  />
                  <div
                    style={{
                      marginTop: '0.3rem',
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    Bu notlar sadece siz ve yetkili yöneticiler tarafından görülebilir.
                  </div>
                </div>
              </div>
              {error && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    fontSize: '0.8rem',
                    color: 'var(--color-danger)',
                    marginTop: '-0.25rem',
                  }}
                >
                  {error}
                </div>
              )}
              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.5rem',
                  marginTop: '0.35rem',
                }}
              >
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setFormOpen(false);
                    resetForm();
                  }}
                  disabled={saving}
                >
                  İptal
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleSubmit}
                  disabled={saving}
                >
                  {saving
                    ? 'Kaydediliyor...'
                    : editingSession
                      ? 'Seansı Güncelle'
                      : 'Seansı Kaydet'}
                </button>
              </div>
            </div>
          )}

          {/* Hedefler / Notlar sekmeleri */}
          <div style={{ marginBottom: '1rem' }}>
            <div
              style={{
                display: 'inline-flex',
                borderRadius: 999,
                padding: 4,
                background: 'var(--color-surface-strong)',
                border: '1px solid var(--color-border-subtle)',
                marginBottom: '0.75rem',
              }}
            >
              {[
                { id: 'goals' as const, label: 'Hedefler' },
                { id: 'notes' as const, label: 'Gelişim Notları' },
              ].map((tab) => {
                const isActive = activeDetailTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveDetailTab(tab.id)}
                    style={{
                      border: 'none',
                      borderRadius: 999,
                      padding: '0.35rem 0.9rem',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      background: isActive ? 'var(--color-primary-soft)' : 'transparent',
                      color: isActive ? 'var(--color-primary-strong)' : 'var(--color-text-muted)',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {activeDetailTab === 'goals' && (
              <GlassCard
                title="Koçluk Hedefleri"
                subtitle="Öğrenciniz için haftalık/okuma hedefleri belirleyin."
              >
                <div
                  style={{
                    display: 'grid',
                    gap: '0.75rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1.1fr)',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <label
                        htmlFor="goal-title"
                        style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
                      >
                        Hedef Başlığı
                      </label>
                      <input
                        id="goal-title"
                        type="text"
                        value={goalForm.title}
                        onChange={(e) =>
                          setGoalForm((prev) => ({ ...prev, title: e.target.value }))
                        }
                        placeholder='Örn. "Bu hafta 200 Matematik sorusu"'
                        style={{ width: '100%', marginTop: '0.25rem' }}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="goal-deadline"
                        style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
                      >
                        Bitiş Tarihi
                      </label>
                      <input
                        id="goal-deadline"
                        type="date"
                        value={goalForm.deadline}
                        onChange={(e) =>
                          setGoalForm((prev) => ({ ...prev, deadline: e.target.value }))
                        }
                        style={{ width: '100%', marginTop: '0.25rem' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="goal-desc"
                      style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
                    >
                      Açıklama (opsiyonel)
                    </label>
                    <textarea
                      id="goal-desc"
                      rows={2}
                      value={goalForm.description}
                      onChange={(e) =>
                        setGoalForm((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Detay veya kriterler"
                      style={{
                        width: '100%',
                        marginTop: '0.25rem',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                  {goalsError && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--color-danger)',
                      }}
                    >
                      {goalsError}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => handleCreateGoal().catch(() => {})}
                      disabled={goalsLoading || !token || !selectedStudentId}
                    >
                      {goalsLoading ? 'Kaydediliyor...' : 'Yeni Hedef Ekle'}
                    </button>
                  </div>
                </div>

                <div className="list-stack">
                  {goalsLoading && goals.length === 0 && (
                    <div className="empty-state">Hedefler yükleniyor...</div>
                  )}
                  {!goalsLoading && goals.length === 0 && (
                    <div className="empty-state">
                      Bu öğrenci için henüz koçluk hedefi yok.
                    </div>
                  )}
                  {goals.map((goal) => {
                    const deadlineLabel = dayjs(goal.deadline).format('DD MMM YYYY');
                    const isOverdue = goal.isOverdue;
                    return (
                      <div key={goal.id} className="list-row">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={goal.status === 'completed'}
                            onChange={() => handleToggleGoalStatus(goal)}
                            style={{ marginTop: 4 }}
                          />
                          <div style={{ flex: 1 }}>
                            <strong
                              style={{
                                display: 'block',
                                color:
                                  goal.status === 'completed'
                                    ? 'var(--color-text-muted)'
                                    : 'var(--color-text-main)',
                                textDecoration:
                                  goal.status === 'completed' ? 'line-through' : 'none',
                              }}
                            >
                              {goal.title}
                            </strong>
                            {goal.description && (
                              <small
                                style={{
                                  display: 'block',
                                  marginTop: 2,
                                  color: 'var(--color-text-muted)',
                                }}
                              >
                                {goal.description}
                              </small>
                            )}
                            <small
                              style={{
                                display: 'block',
                                marginTop: 4,
                                color: isOverdue
                                  ? 'var(--color-danger)'
                                  : 'var(--color-text-muted)',
                              }}
                            >
                              Bitiş: {deadlineLabel}{' '}
                              {isOverdue && goal.status === 'pending' ? '(Gecikmiş)' : ''}
                            </small>
                          </div>
                        </div>
                        <TagChip
                          label={
                            goal.status === 'completed'
                              ? 'Tamamlandı'
                              : goal.status === 'missed'
                                ? 'Kaçırıldı'
                                : isOverdue
                                  ? 'Overdue'
                                  : 'Devam ediyor'
                          }
                          tone={
                            goal.status === 'completed'
                              ? 'success'
                              : isOverdue || goal.status === 'missed'
                                ? 'warning'
                                : 'info'
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </GlassCard>
            )}

            {activeDetailTab === 'notes' && (
              <GlassCard
                title="Gelişim Notları"
                subtitle="Koçluk görüşmelerinizden kısa notlar alın."
              >
                <div
                  style={{
                    display: 'grid',
                    gap: '0.75rem',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div>
                    <label
                      htmlFor="note-content"
                      style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
                    >
                      Not
                    </label>
                    <textarea
                      id="note-content"
                      rows={3}
                      value={noteForm.content}
                      onChange={(e) =>
                        setNoteForm((prev) => ({ ...prev, content: e.target.value }))
                      }
                      placeholder="Bugünkü koçluk görüşmesi, öğrencinin modu, odaklanma durumu..."
                      style={{
                        width: '100%',
                        marginTop: '0.25rem',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.8rem',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={noteForm.sharedWithParent}
                      onChange={(e) =>
                        setNoteForm((prev) => ({
                          ...prev,
                          sharedWithParent: e.target.checked,
                        }))
                      }
                    />
                    Veli görebilsin mi?
                  </label>
                  {notesError && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--color-danger)',
                      }}
                    >
                      {notesError}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => handleCreateNote().catch(() => {})}
                      disabled={notesLoading || !token || !selectedStudentId}
                    >
                      {notesLoading ? 'Kaydediliyor...' : 'Not Ekle'}
                    </button>
                  </div>
                </div>

                <div className="list-stack">
                  {notesLoading && notes.length === 0 && (
                    <div className="empty-state">Notlar yükleniyor...</div>
                  )}
                  {!notesLoading && notes.length === 0 && (
                    <div className="empty-state">
                      Bu öğrenci için henüz gelişim notu yok.
                    </div>
                  )}
                  {notes.map((note) => (
                    <div key={note.id} className="list-row">
                      <div style={{ flex: 1 }}>
                        <small
                          style={{
                            display: 'block',
                            marginBottom: 4,
                            color: 'var(--color-text-muted)',
                          }}
                        >
                          {dayjs(note.date).format('DD MMM YYYY · HH:mm')}
                        </small>
                        <div
                          style={{
                            whiteSpace: 'pre-wrap',
                            fontSize: '0.9rem',
                            lineHeight: 1.5,
                          }}
                        >
                          {note.content}
                        </div>
                      </div>
                      <TagChip
                        label={
                          note.visibility === 'shared_with_parent'
                            ? 'Veli ile paylaşıldı'
                            : 'Sadece öğretmen'
                        }
                        tone={
                          note.visibility === 'shared_with_parent'
                            ? 'success'
                            : 'warning'
                        }
                      />
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </div>

          {loading ? (
            <div className="empty-state">Koçluk kayıtları yükleniyor...</div>
          ) : sessions.length === 0 ? (
            <div className="empty-state">
              {selectedStudent
                ? `${selectedStudent.name} için henüz koçluk kaydı yok.`
                : 'Koçluk kaydı bulunamadı.'}
            </div>
          ) : (
            <div className="list-stack">
              {sessions.map((session) => (
                <div key={session.id} className="list-row">
                  <div style={{ flex: 1 }}>
                    <strong
                      style={{
                        display: 'block',
                        color: 'var(--color-text-main)',
                      }}
                    >
                      {session.title}
                    </strong>
                    <small
                      style={{
                        display: 'block',
                        color: 'var(--color-text-muted)',
                        marginBottom: 4,
                      }}
                    >
                      {formatShortDate(session.date)} {formatTime(session.date)}{' '}
                      {session.durationMinutes != null
                        ? `• ${session.durationMinutes} dk`
                        : ''}
                    </small>
                    <div style={{ marginBottom: 4 }}>
                      <TagChip
                        label={
                          session.mode === 'video'
                            ? 'Görüntülü görüşme'
                            : 'Sesli görüşme'
                        }
                        tone={session.mode === 'video' ? 'info' : 'success'}
                      />
                    </div>
                    <small
                      style={{
                        display: 'block',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {session.notes.length > 140
                        ? `${session.notes.slice(0, 140)}…`
                        : session.notes}
                    </small>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      marginLeft: '0.75rem',
                    }}
                  >
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => handleEdit(session)}
                    >
                      <Edit2 size={14} style={{ marginRight: 4 }} />
                      Düzenle
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => handleDelete(session)}
                    >
                      <Trash2 size={14} style={{ marginRight: 4 }} />
                      Sil
                    </button>
                    {session.meetingId && canTeacherStartSession(session.date) && (
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent('teacher-start-live-meeting', {
                              detail: { meetingId: session.meetingId, title: session.title },
                            }),
                          );
                        }}
                      >
                        Canlı Başlat
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '1.25rem' }}>
            <GlassCard
              title="Sınav Performansı"
              subtitle="Koçluk yaptığınız öğrenciye ait test sonuçları"
            >
              {profileLoading && <div className="empty-state">Öğrenci verileri yükleniyor...</div>}
              {!profileLoading && !studentProfile && (
                <div className="empty-state">
                  Öğrenci seçerek koçluk için performans detaylarını görüntüleyin.
                </div>
              )}
              {!profileLoading && studentProfile && studentResults.length === 0 && (
                <div className="empty-state">Bu öğrenci için henüz test sonucu bulunmuyor.</div>
              )}
              {studentProfile && studentResults.length > 0 && (
                <div className="list-stack" style={{ maxHeight: 320, overflow: 'auto' }}>
                  {studentResults.map((result) => {
                    const testTitle = testTitleById.get(result.testId) ?? 'Test';
                    const minutes = Math.round(result.durationSeconds / 60);
                    return (
                      <div key={result.id} className="list-row">
                        <div style={{ flex: 1 }}>
                          <strong style={{ display: 'block' }}>{testTitle}</strong>
                          <small
                            style={{
                              display: 'block',
                              marginTop: '0.15rem',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            {formatShortDate(result.completedAt)} · {minutes} dk
                          </small>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: '0.25rem',
                            fontSize: '0.8rem',
                          }}
                        >
                          <span>
                            {result.correctCount} D / {result.incorrectCount} Y / {result.blankCount} B
                          </span>
                          <TagChip label={`${result.scorePercent}%`} tone="success" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </GlassCard>
          </div>

          {studentProfile && (
            <div
              style={{
                marginTop: '1.25rem',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                gap: '1rem',
              }}
            >
              <GlassCard
                title="Aktif Ödevler"
                subtitle="Yaklaşan veya devam eden görevler"
              >
                {activeAssignments.length === 0 ? (
                  <div className="empty-state">Bu öğrenci için aktif ödev bulunmuyor.</div>
                ) : (
                  <div className="list-stack">
                    {activeAssignments.slice(0, 5).map((a) => (
                      <div key={a.id} className="list-row">
                        <div style={{ flex: 1 }}>
                          <strong style={{ display: 'block' }}>{a.title}</strong>
                          <small
                            style={{
                              display: 'block',
                              marginTop: '0.15rem',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            Son teslim: {formatShortDate(a.dueDate)}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>

              <GlassCard
                title="Son Çalışmalar"
                subtitle="Video ve içerik izleme"
              >
                {recentWatchRecords.length === 0 ? (
                  <div className="empty-state">Son çalışma kaydı bulunmuyor.</div>
                ) : (
                  <div className="list-stack">
                    {recentWatchRecords.map((w) => (
                      <div key={w.contentId} className="list-row">
                        <div style={{ flex: 1 }}>
                          <strong style={{ display: 'block' }}>{w.contentId}</strong>
                          <small
                            style={{
                              display: 'block',
                              marginTop: '0.15rem',
                              color: 'var(--color-text-muted)',
                            }}
                          >
                            % {Math.round(w.watchedPercent)} tamamlandı ·{' '}
                            {w.completed ? 'Bitti' : 'Devam ediyor'}
                          </small>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
};


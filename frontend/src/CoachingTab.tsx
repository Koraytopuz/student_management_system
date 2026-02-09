import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, PlusCircle, Trash2, Edit2 } from 'lucide-react';
import { GlassCard, MetricCard, TagChip } from './components/DashboardPrimitives';
import {
  type TeacherStudent,
  type TeacherCoachingSession,
  type TeacherStudentProfile,
  type TeacherTest,
  getTeacherCoachingSessions,
  createTeacherCoachingSession,
  updateTeacherCoachingSession,
  deleteTeacherCoachingSession,
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
    refresh().catch(() => {});
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
                trendTone={lastSessionDate ? 'neutral' : 'warning'}
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


import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Loader2, Search, Users } from 'lucide-react';
import { GlassCard, MetricCard, TagChip } from './components/DashboardPrimitives';
import { resolveContentUrl } from './api';
import {
  getAdminAttendanceClasses,
  getAdminAttendanceClassStudents,
  getAdminAttendanceStudentHistory,
  type AdminAttendanceClassSummary,
  type AdminAttendanceClassStudentsResponse,
  type AdminAttendanceStudentHistoryResponse,
} from './api';

type DaysFilter = 7 | 30;
type AttendancePanel = 'summary' | 'students' | 'detail';

export const AdminAttendanceTab: React.FC<{ token: string }> = ({ token }) => {
  const [days, setDays] = useState<DaysFilter>(7);
  const [openPanels, setOpenPanels] = useState<Set<AttendancePanel>>(() => new Set());
  const detailRef = React.useRef<HTMLDivElement | null>(null);

  const [classesLoading, setClassesLoading] = useState(false);
  const [classes, setClasses] = useState<AdminAttendanceClassSummary[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  const [classStudentsLoading, setClassStudentsLoading] = useState(false);
  const [classStudents, setClassStudents] = useState<AdminAttendanceClassStudentsResponse | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');

  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<AdminAttendanceStudentHistoryResponse | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'present' | 'absent'>('all');

  useEffect(() => {
    if (!token) return;
    setClassesLoading(true);
    getAdminAttendanceClasses(token, days)
      .then((data) => {
        setClasses(data);
        if (!selectedClassId && data.length > 0) setSelectedClassId(data[0].id);
      })
      .catch(() => setClasses([]))
      .finally(() => setClassesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, days]);

  useEffect(() => {
    if (!token || !selectedClassId) return;
    setClassStudentsLoading(true);
    setClassStudents(null);
    setSelectedStudentId('');
    setHistory(null);
    getAdminAttendanceClassStudents(token, selectedClassId, days)
      .then((data) => {
        setClassStudents(data);
        if (data.students.length > 0) setSelectedStudentId(data.students[0].studentId);
      })
      .catch(() => setClassStudents(null))
      .finally(() => setClassStudentsLoading(false));
  }, [token, selectedClassId, days]);

  useEffect(() => {
    if (!token || !selectedStudentId) return;
    setHistoryLoading(true);
    setHistory(null);
    getAdminAttendanceStudentHistory(token, selectedStudentId, days)
      .then(setHistory)
      .catch(() => setHistory(null))
      .finally(() => setHistoryLoading(false));
  }, [token, selectedStudentId, days]);

  const sortedClasses = useMemo(() => {
    const order = ['MEZUN', '12', '11', '10', '9', '8', '7', '6', '5', '4'];
    return classes
      .filter((c) => {
        const name = (c.name || '').toLowerCase();
        // 9A sınıfını tamamen gizle
        return !name.includes('9a') && !name.includes('9/a') && !name.includes('9-a');
      })
      .sort((a, b) => {
        const ga = (a.gradeLevel || '').toUpperCase();
        const gb = (b.gradeLevel || '').toUpperCase();
        const ia = order.indexOf(ga);
        const ib = order.indexOf(gb);
        const sa = ia === -1 ? order.length : ia;
        const sb = ib === -1 ? order.length : ib;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name, 'tr-TR', { numeric: true });
      });
  }, [classes]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  const filteredStudents = useMemo(() => {
    let list = classStudents?.students ?? [];
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter((s) => s.studentName.toLowerCase().includes(q));
    }
    if (attendanceFilter === 'present') {
      list = list.filter((s) => s.presentCount > 0);
    } else if (attendanceFilter === 'absent') {
      list = list.filter((s) => s.absentCount > 0);
    }
    return list;
  }, [classStudents, searchTerm, attendanceFilter]);

  const selectedStudent = useMemo(() => {
    if (!classStudents || !selectedStudentId) return null;
    return classStudents.students.find((s) => s.studentId === selectedStudentId) ?? null;
  }, [classStudents, selectedStudentId]);

  const togglePanel = (panel: AttendancePanel) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panel)) next.delete(panel);
      else next.add(panel);
      return next;
    });
  };

  const openDetailAndScroll = () => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      next.add('detail');
      return next;
    });
    requestAnimationFrame(() => {
      // UI update + olası ölçüm gecikmeleri için küçük buffer
      setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    });
  };

  return (
    <div
      className="attendance-console"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
    >
      <div className="dual-grid">
        <GlassCard
          title="Devamsızlık"
          icon={<CalendarCheck size={18} />}
          className="attendance-card attendance-card--summary"
          collapsible
          collapsed={!openPanels.has('summary')}
          onToggleCollapsed={() => togglePanel('summary')}
          actions={
            <div
              className="attendance-period"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.5rem',
                alignItems: 'center',
                justifyContent: 'end',
                minWidth: 170,
              }}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setDays(7)}
                aria-pressed={days === 7}
                style={
                  days === 7
                    ? {
                        border: '1px solid color-mix(in srgb, var(--accent-color) 55%, rgba(148, 163, 184, 0.55))',
                        background:
                          'linear-gradient(135deg, color-mix(in srgb, var(--accent-color) 14%, rgba(248, 250, 252, 0.9)), rgba(248, 250, 252, 0.9))',
                        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
                      }
                    : undefined
                }
              >
                Son 7 gün
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setDays(30)}
                aria-pressed={days === 30}
                style={
                  days === 30
                    ? {
                        border: '1px solid color-mix(in srgb, var(--accent-color) 55%, rgba(148, 163, 184, 0.55))',
                        background:
                          'linear-gradient(135deg, color-mix(in srgb, var(--accent-color) 14%, rgba(248, 250, 252, 0.9)), rgba(248, 250, 252, 0.9))',
                        boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
                      }
                    : undefined
                }
              >
                Son 30 gün
              </button>
            </div>
          }
        >
          <div
            className="attendance-controls"
            style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
          >
            <div className="attendance-field" style={{ flex: 1, minWidth: 0 }}>
              <label
                className="attendance-label"
                style={{ display: 'block', fontSize: '0.85rem', opacity: 0.85, marginBottom: '0.35rem' }}
              >
                Sınıf
              </label>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                disabled={classesLoading}
                className="attendance-select"
                style={{
                  width: '100%',
                  maxWidth: '100%',
                  boxSizing: 'border-box',
                  display: 'block',
                  padding: '0.55rem 0.6rem',
                  borderRadius: 12,
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-surface-soft)',
                  color: 'var(--color-text-main)',
                }}
              >
                <option value="">Sınıf seçin...</option>
                {sortedClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            {classesLoading && <div className="empty-state">Özet yükleniyor...</div>}
            {!classesLoading && selectedClass && (
              <>
                <div
                  className="attendance-class-meta"
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}
                >
                  <TagChip
                    label={`${new Date().toLocaleDateString('tr-TR')} tarihindeki ${selectedClass.name} yoklama özeti`}
                    tone="neutral"
                  />
                </div>

                <div
                  className="metric-grid attendance-metric-grid"
                  style={{
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '0.85rem',
                  }}
                >
                  <MetricCard
                    label="Öğrenci"
                    value={`${selectedClass.studentCount}`}
                    trendLabel="Sınıf"
                  />
                  <div
                    role="button"
                    tabIndex={0}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      setAttendanceFilter((prev) => (prev === 'absent' ? 'all' : 'absent'))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setAttendanceFilter((prev) => (prev === 'absent' ? 'all' : 'absent'));
                      }
                    }}
                  >
                    <MetricCard
                      label="Devamsızlık"
                      value={`${selectedClass.absentCount}`}
                      trendLabel="Gelmedi"
                    />
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      setAttendanceFilter((prev) => (prev === 'present' ? 'all' : 'present'))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setAttendanceFilter((prev) => (prev === 'present' ? 'all' : 'present'));
                      }
                    }}
                  >
                    <MetricCard
                      label="Katılım"
                      value={`${selectedClass.presentCount}`}
                      trendLabel="Geldi"
                    />
                  </div>
                  <MetricCard
                    label="Toplam Kayıt"
                    value={`${selectedClass.totalRecords}`}
                    trendLabel="Kayıt"
                  />
                </div>
              </>
            )}
          </div>
        </GlassCard>

        <GlassCard
          title="Öğrenciler"
          subtitle="Devamsızlık sayısına göre sıralı"
          icon={<Users size={18} />}
          className="attendance-card"
          collapsible
          collapsed={!openPanels.has('students')}
          onToggleCollapsed={() => togglePanel('students')}
          actions={
            <div
              className="attendance-students-actions"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}
            >
              <TagChip label={`Son ${days} gün`} tone="info" />
              {classStudents && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <TagChip label={`Toplam: ${classStudents.students.length}`} tone="neutral" />
                  <TagChip label={`Gösterilen: ${filteredStudents.length}`} tone="neutral" />
                </div>
              )}
            </div>
          }
        >
          <div
            className="attendance-search"
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              padding: '0.45rem 0.55rem',
              borderRadius: 12,
              border: '1px solid var(--color-border-subtle)',
              background: 'var(--color-surface-soft)',
              marginBottom: '0.9rem',
            }}
          >
            <Search size={16} aria-hidden />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Öğrenci ara..."
              className="attendance-search-input"
              aria-label="Öğrenci ara"
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                color: 'var(--color-text-main)',
                width: '100%',
              }}
            />
          </div>

          {selectedStudent && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <TagChip label={`Seçili: ${selectedStudent.studentName}`} tone="success" />
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <TagChip label={`Gelmedi: ${selectedStudent.absentCount}`} tone={selectedStudent.absentCount > 0 ? 'warning' : 'neutral'} />
                <TagChip label={`Geldi: ${selectedStudent.presentCount}`} tone="neutral" />
              </div>
            </div>
          )}

          {classStudentsLoading && (
            <div className="empty-state">
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Yükleniyor...
            </div>
          )}

          {!classStudentsLoading && filteredStudents.length === 0 && (
            <div className="empty-state">Öğrenci bulunamadı.</div>
          )}

          {!classStudentsLoading && filteredStudents.length > 0 && (
            <div
              className="list-stack attendance-student-list"
              style={{
                maxHeight: 640,
                overflowY: 'auto',
                padding: '0.55rem',
                borderRadius: 14,
                background:
                  'linear-gradient(180deg, color-mix(in srgb, var(--accent-color) 9%, transparent), rgba(148, 163, 184, 0.06))',
                border: '1px solid color-mix(in srgb, var(--accent-color) 18%, rgba(148, 163, 184, 0.18))',
                boxShadow: '0 2px 14px rgba(15, 23, 42, 0.06)',
              }}
            >
              {filteredStudents.map((s) => {
                const active = s.studentId === selectedStudentId;
                const tone = s.absentCount > 0 ? 'warning' : 'success';
                return (
                  <button
                    key={s.studentId}
                    type="button"
                    onClick={() => {
                      setSelectedStudentId(s.studentId);
                      openDetailAndScroll();
                    }}
                    className={`list-row attendance-student-row${active ? ' active' : ''}`}
                    aria-pressed={active}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      justifyContent: 'space-between',
                      borderRadius: 12,
                      alignItems: 'center',
                      border: active ? '1px solid var(--accent-color)' : undefined,
                      borderLeft: active ? '6px solid var(--accent-color)' : undefined,
                      background: active
                        ? 'linear-gradient(145deg, color-mix(in srgb, var(--accent-color) 16%, transparent), rgba(59, 130, 246, 0.10))'
                        : undefined,
                      boxShadow: active ? '0 22px 46px rgba(15, 23, 42, 0.18)' : undefined,
                      transform: active ? 'translateY(-1px)' : undefined,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                      {s.profilePictureUrl ? (
                        <img
                          src={resolveContentUrl(s.profilePictureUrl)}
                          alt={s.studentName}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            objectFit: 'cover',
                            border: '1px solid var(--color-border-subtle)',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 12,
                            background: 'var(--color-surface-soft)',
                            border: '1px solid var(--color-border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                          aria-hidden
                        >
                          <Users size={16} />
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <strong
                          style={{
                            display: 'block',
                            whiteSpace: 'normal',
                            overflow: 'visible',
                            textOverflow: 'unset',
                          }}
                        >
                          {s.studentName}
                        </strong>
                        <small style={{ display: 'block', opacity: 0.8 }}>
                          Son kayıt:{' '}
                          {s.lastRecord ? new Date(s.lastRecord.date).toLocaleDateString('tr-TR') : '-'}
                        </small>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <TagChip label={`Gelmedi: ${s.absentCount}`} tone={tone} />
                      <TagChip label={`Geldi: ${s.presentCount}`} tone="success" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      <div ref={detailRef}>
        <GlassCard
          title="Öğrenci Detayı"
          subtitle="Geçmiş ve özet istatistikler"
          icon={<CalendarCheck size={18} />}
          className="attendance-card"
          collapsible
          collapsed={!openPanels.has('detail')}
          onToggleCollapsed={() => togglePanel('detail')}
        >
          {historyLoading && (
            <div className="empty-state">
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Yükleniyor...
            </div>
          )}

          {!historyLoading && !history && (
            <div className="empty-state">
              Öğrenci seçerek devamsızlık geçmişini görüntüleyin.
            </div>
          )}

          {!historyLoading && history && (
            <>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <TagChip label={history.student.name} tone="neutral" />
                <TagChip label={`Devamsızlık oranı: %${history.stats.absenceRate}`} tone={history.stats.absenceRate > 20 ? 'warning' : 'success'} />
                <TagChip label={`Son ${history.stats.days} gün`} tone="info" />
                <span style={{ opacity: 0.85, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CalendarCheck size={16} />
                  {history.stats.summaryText}
                </span>
              </div>

              <div className="metric-grid" style={{ marginTop: '1rem' }}>
                <MetricCard label="Geldi" value={`${history.stats.presentCount}`} helper="Seçili periyotta" trendLabel="Katılım" />
                <MetricCard label="Gelmedi" value={`${history.stats.absentCount}`} helper="Seçili periyotta" trendLabel="Devamsızlık" />
                <MetricCard label="Toplam" value={`${history.stats.total}`} helper="Yoklama satırı" trendLabel="Kayıt" />
              </div>

              <div style={{ marginTop: '1rem' }}>
                <div
                  className="attendance-records-header"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 14,
                    border: '1px solid rgba(148, 163, 184, 0.22)',
                    background: 'rgba(255, 255, 255, 0.04)',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>Son kayıtlar</strong>
                    <small style={{ display: 'block', opacity: 0.75 }}>
                      En fazla 60 kayıt gösterilir
                    </small>
                  </div>
                  <TagChip label={`${history.records.length} kayıt`} tone="neutral" />
                </div>

                {history.records.length === 0 ? (
                  <div className="empty-state">Seçili periyotta yoklama kaydı bulunamadı.</div>
                ) : (
                  <div className="list-stack" style={{ maxHeight: 420, overflowY: 'auto' }}>
                    {history.records.slice(0, 60).map((r) => (
                      <div
                        key={r.id}
                        className="list-row"
                        style={{
                          alignItems: 'flex-start',
                          borderRadius: 12,
                          border: `1px solid ${r.present ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                          background: 'rgba(255,255,255,0.02)',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <strong style={{ display: 'block' }}>
                            {new Date(r.date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </strong>
                          <small style={{ display: 'block', marginTop: '0.15rem', opacity: 0.85 }}>
                            {r.classGroupName} · Yoklamayı alan: {r.teacherName}
                          </small>
                          <small style={{ display: 'block', marginTop: '0.15rem', opacity: 0.7 }}>
                            Kaydedilme: {new Date(r.createdAt).toLocaleString('tr-TR')}
                          </small>
                          {r.notes && (
                            <small style={{ display: 'block', marginTop: '0.35rem', opacity: 0.85, fontStyle: 'italic' }}>
                              Not: {r.notes}
                            </small>
                          )}
                        </div>
                        <TagChip label={r.present ? 'Geldi' : 'Gelmedi'} tone={r.present ? 'success' : 'error'} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
};


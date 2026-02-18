/**
 * Ders Programı — Öğretmen sınıf/ders/öğrenci ve günlük/haftalık/aylık/dönemlik program oluşturur.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Pencil, Plus, Trash2, X } from 'lucide-react';
import { GlassCard } from './components/DashboardPrimitives';
import type { TeacherStudent } from './api';
import {
  getCurriculumSubjects,
  getTeacherLessonScheduleEntries,
  createTeacherLessonScheduleEntry,
  updateTeacherLessonScheduleEntry,
  deleteTeacherLessonScheduleEntry,
} from './api';

type Scope = 'class' | 'subject' | 'student';
type Period = 'daily' | 'weekly' | 'monthly' | 'term';

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
  term: 'Dönemlik',
};

const WEEKDAYS = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;
const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;
const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16];

export interface ScheduleEntry {
  id: string;
  gradeLevel: string;
  subjectId: string;
  subjectName: string;
  dayOfWeek: number;
  hour: number;
  topic?: string;
}

interface LessonScheduleTabProps {
  token: string | null;
  students: TeacherStudent[];
  /** Öğretmenin atanmış sınıfları (örn. ['9','10']) veya öğrencinin sınıfı */
  allowedGrades?: string[];
  /** Görünüm modu: öğretmen paneli veya öğrenci paneli */
  mode?: 'teacher' | 'student';
}

export function LessonScheduleTab({
  token,
  students,
  allowedGrades = [],
  mode = 'teacher',
}: LessonScheduleTabProps) {
  const isStudentMode = mode === 'student';
  const [scope, setScope] = useState<Scope>('class');
  const [gradeLevel, setGradeLevel] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [studentId, setStudentId] = useState<string>('');
  const [period, setPeriod] = useState<Period>('weekly');
  const [selectedDayIndex, setSelectedDayIndex] = useState(0); // Günlük görünümde seçilen gün (0–4)
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState({
    gradeLevel: '',
    subjectId: '',
    subjectName: '',
    dayOfWeek: 0,
    hour: 8,
    topic: '',
  });
  const [modalSubjects, setModalSubjects] = useState<Array<{ id: string; name: string }>>([]);

  // Tablo üzerinde satır/sütun bazlı hızlı ekleme için inline düzenleme durumu
  const [inlineAddMode, setInlineAddMode] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ hour: number; dayIndex: number } | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState('');
  const [editingTopicSlot, setEditingTopicSlot] = useState<{ hour: number; dayIndex: number } | null>(null);
  const [editingTopicValue, setEditingTopicValue] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const editModalRef = useRef<HTMLDivElement>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const scopeRef = useRef<Scope>(scope);

  // scope değiştiğinde ref'i güncelle
  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);

  useEffect(() => {
    if (editModalOpen && editModalRef.current) {
      editModalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editModalOpen]);

  // Öğretmen modunda: kapsam seçimi tamam olduğunda API'den programı yükle
  useEffect(() => {
    if (isStudentMode || !token) return;
    
    // Ref'ten scope'u al - bu closure sorununu önler
    const currentScope = scopeRef.current;
    const canLoad =
      (currentScope === 'class' && gradeLevel) ||
      (currentScope === 'subject' && gradeLevel && subjectId) ||
      (currentScope === 'student' && studentId);
    
    if (!canLoad) {
      setEntries([]);
      return;
    }
    
    setEntriesLoading(true);
    const params: { scope: string; gradeLevel?: string; subjectId?: string; studentId?: string } = { scope: currentScope };
    if (currentScope === 'class' || currentScope === 'subject') params.gradeLevel = gradeLevel || undefined;
    if (currentScope === 'subject') params.subjectId = subjectId || undefined;
    if (currentScope === 'student') params.studentId = studentId || undefined;
    
    getTeacherLessonScheduleEntries(token, params)
      .then((list) => setEntries(list.map((e) => ({ ...e, topic: e.topic }))))
      .catch(() => setEntries([]))
      .finally(() => setEntriesLoading(false));
  }, [isStudentMode, token, scope, gradeLevel, subjectId, studentId]);

  const grades = useMemo(() => {
    const base = allowedGrades.length ? allowedGrades : ['4', '5', '6', '7', '8', '9', '10', '11', '12'];
    // Sadece sayısal sınıfları al ve büyükten küçüğe sırala (12, 11, 10, 9, ...)
    return [...base]
      .filter((g) => !Number.isNaN(Number(g)))
      .sort((a, b) => Number(b) - Number(a));
  }, [allowedGrades]);

  // Öğrenci panelinde, sınıf filtresi otomatik olarak öğrencinin sınıfına ayarlanır
  React.useEffect(() => {
    if (!isStudentMode) return;
    if (!gradeLevel && grades.length > 0) {
      setGradeLevel(grades[0]);
    }
  }, [isStudentMode, gradeLevel, grades]);

  // Öğrenci panelinde dönemlik görünümü devre dışı bırak
  React.useEffect(() => {
    if (isStudentMode && period === 'term') {
      setPeriod('weekly');
    }
  }, [isStudentMode, period]);

  const loadSubjects = () => {
    if (!token || !gradeLevel) return;
    getCurriculumSubjects(token, gradeLevel).then(setSubjects).catch(() => setSubjects([]));
  };

  React.useEffect(() => {
    if (gradeLevel && scope === 'subject') {
      loadSubjects();
    } else {
      setSubjects([]);
    }
  }, [gradeLevel, scope, token]);

  const closeAddModal = () => {
    setAddModalOpen(false);
  };

  const handleAddFormChange = (field: keyof typeof addForm, value: string | number) => {
    if (field === 'gradeLevel') {
      setAddForm((prev) => ({ ...prev, gradeLevel: String(value), subjectId: '', subjectName: '' }));
      if (token) getCurriculumSubjects(token, String(value)).then(setModalSubjects).catch(() => setModalSubjects([]));
      return;
    }
    if (field === 'subjectId') {
      const name = modalSubjects.find((s) => s.id === value)?.name ?? '';
      setAddForm((prev) => ({ ...prev, subjectId: String(value), subjectName: name }));
      return;
    }
    setAddForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveEntry = async () => {
    const subj = modalSubjects.find((s) => s.id === addForm.subjectId);
    if (!addForm.gradeLevel || !addForm.subjectId || subj == null) return;
    if (isStudentMode) {
      setEntries((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          gradeLevel: addForm.gradeLevel,
          subjectId: addForm.subjectId,
          subjectName: subj.name,
          dayOfWeek: addForm.dayOfWeek,
          hour: addForm.hour,
          topic: addForm.topic || undefined,
        },
      ]);
      closeAddModal();
      return;
    }
    if (!token) return;
    try {
      const payload = {
        scope,
        gradeLevel: addForm.gradeLevel,
        subjectId: addForm.subjectId,
        studentId: scope === 'student' ? studentId || undefined : undefined,
        dayOfWeek: addForm.dayOfWeek,
        hour: addForm.hour,
        subjectName: subj.name,
        topic: addForm.topic || undefined,
      };
      const created = await createTeacherLessonScheduleEntry(token, payload);
      setEntries((prev) => [...prev, { ...created, topic: created.topic }]);
      closeAddModal();
    } catch {
      // Hata durumunda sessiz kal veya toast
    }
  };

  const openEditModal = (entry: ScheduleEntry) => {
    setAddForm({
      gradeLevel: entry.gradeLevel,
      subjectId: entry.subjectId,
      subjectName: entry.subjectName,
      dayOfWeek: entry.dayOfWeek,
      hour: entry.hour,
      topic: entry.topic || '',
    });
    setEditingEntryId(entry.id);
    setEditModalOpen(true);
    if (token && entry.gradeLevel) getCurriculumSubjects(token, entry.gradeLevel).then(setModalSubjects).catch(() => setModalSubjects([]));
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingEntryId(null);
  };

  const handleUpdateEntry = async () => {
    const subj = modalSubjects.find((s) => s.id === addForm.subjectId);
    if (!editingEntryId || !addForm.gradeLevel || !addForm.subjectId || subj == null) return;
    if (isStudentMode) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === editingEntryId
            ? {
                ...e,
                gradeLevel: addForm.gradeLevel,
                subjectId: addForm.subjectId,
                subjectName: subj.name,
                dayOfWeek: addForm.dayOfWeek,
                hour: addForm.hour,
                topic: addForm.topic || undefined,
              }
            : e
        )
      );
      closeEditModal();
      return;
    }
    if (!token) return;
    try {
      const updated = await updateTeacherLessonScheduleEntry(token, editingEntryId, {
        gradeLevel: addForm.gradeLevel,
        subjectId: addForm.subjectId,
        subjectName: subj.name,
        dayOfWeek: addForm.dayOfWeek,
        hour: addForm.hour,
        topic: addForm.topic || undefined,
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === editingEntryId ? { ...updated, topic: updated.topic } : e))
      );
      closeEditModal();
    } catch {
      // Hata durumunda sessiz kal
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!window.confirm('Bu ders saatini silmek istediğinize emin misiniz?')) return;
    if (isStudentMode) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      return;
    }
    if (!token) return;
    try {
      await deleteTeacherLessonScheduleEntry(token, id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {
      // Hata durumunda sessiz kal
    }
  };

  const sortedEntriesForList = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.gradeLevel !== b.gradeLevel) return a.gradeLevel.localeCompare(b.gradeLevel);
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.hour - b.hour;
    });
  }, [entries]);

  const entryAt = (hour: number, dayIndex: number) =>
    filteredEntries.find((e) => e.hour === hour && e.dayOfWeek === dayIndex);

  const filteredEntries = useMemo(() => {
    let list = entries;
    if (gradeLevel) list = list.filter((e) => e.gradeLevel === gradeLevel);
    if (subjectId) list = list.filter((e) => e.subjectId === subjectId);
    return list;
  }, [entries, gradeLevel, subjectId]);

  const handleInlineSave = async (opts?: { keepEditing?: boolean }) => {
    if (!editingSlot) return;
    const { hour, dayIndex } = editingSlot;
    const g = gradeLevel || grades[0] || '';
    const existing = entries.find(
      (e) => e.gradeLevel === g && e.hour === hour && e.dayOfWeek === dayIndex,
    );
    const name = editingSubjectName.trim();

    // İçerik tamamen silinip Enter'a basıldığında slot'ı boş bırak
    if (!name) {
      if (isStudentMode && existing) {
        // Öğrenci panelinde sadece local state'ten giriş silinir
        setEntries((prev) =>
          prev.filter(
            (e) =>
              !(
                e.gradeLevel === g &&
                e.hour === hour &&
                e.dayOfWeek === dayIndex
              ),
          ),
        );
      }
      if (!opts?.keepEditing) {
        setEditingSlot(null);
        setEditingSubjectName('');
      }
      return;
    }

    if (isStudentMode) {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.gradeLevel === g && e.hour === hour && e.dayOfWeek === dayIndex);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], subjectName: name };
          return copy;
        }
        return [
          ...prev,
          {
            id: `e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            gradeLevel: g,
            subjectId: '',
            subjectName: name,
            dayOfWeek: dayIndex,
            hour,
            topic: undefined,
          },
        ];
      });
      if (!opts?.keepEditing) {
        setEditingSlot(null);
        setEditingSubjectName('');
      }
      return;
    }
    if (!token) return;
    try {
      if (existing) {
        const updated = await updateTeacherLessonScheduleEntry(token, existing.id, { subjectName: name });
        setEntries((prev) => prev.map((e) => (e.id === existing.id ? { ...updated, topic: updated.topic } : e)));
      } else {
        const payload = {
          scope,
          gradeLevel: g,
          subjectId: '',
          studentId: scope === 'student' ? studentId || undefined : undefined,
          dayOfWeek: dayIndex,
          hour,
          subjectName: name,
        };
        const created = await createTeacherLessonScheduleEntry(token, payload);
        setEntries((prev) => [...prev, { ...created, topic: created.topic }]);
      }
    } catch {
      // Hata sessiz
    }
    if (!opts?.keepEditing) {
      setEditingSlot(null);
      setEditingSubjectName('');
    }
  };

  const handleInlineTopicSave = async (opts?: { keepEditing?: boolean }) => {
    if (!editingTopicSlot) return;
    const value = editingTopicValue.trim();
    const { hour, dayIndex } = editingTopicSlot;
    const g = gradeLevel || grades[0] || '';
    const existing = entries.find(
      (e) => e.gradeLevel === g && e.hour === hour && e.dayOfWeek === dayIndex,
    );
    if (isStudentMode) {
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.gradeLevel === g && e.hour === hour && e.dayOfWeek === dayIndex);
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], topic: value || undefined };
          return copy;
        }
        if (!value) return prev;
        return [
          ...prev,
          {
            id: `e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            gradeLevel: g,
            subjectId: '',
            subjectName: '',
            dayOfWeek: dayIndex,
            hour,
            topic: value,
          },
        ];
      });
      if (!opts?.keepEditing) {
        setEditingTopicSlot(null);
        setEditingTopicValue('');
      }
      return;
    }
    if (!token) return;
    try {
      if (existing) {
        const updated = await updateTeacherLessonScheduleEntry(token, existing.id, { topic: value || undefined });
        setEntries((prev) => prev.map((e) => (e.id === existing.id ? { ...updated, topic: updated.topic } : e)));
      } else if (value) {
        const payload = {
          scope,
          gradeLevel: g,
          subjectId: '',
          studentId: scope === 'student' ? studentId || undefined : undefined,
          dayOfWeek: dayIndex,
          hour,
          subjectName: '-',
          topic: value,
        };
        const created = await createTeacherLessonScheduleEntry(token, payload);
        setEntries((prev) => [...prev, { ...created, topic: created.topic }]);
      }
    } catch {
      // Hata sessiz
    }
    if (!opts?.keepEditing) {
      setEditingTopicSlot(null);
      setEditingTopicValue('');
    }
  };

  const moveInlineCursor = (
    direction: 'up' | 'down' | 'left' | 'right',
    currentHour: number,
    currentDayIndex: number,
  ) => {
    const hourIndex = HOURS.indexOf(currentHour);
    if (hourIndex === -1) return;
    let newHourIndex = hourIndex;
    let newDayIndex = currentDayIndex;

    if (direction === 'up') {
      newHourIndex = Math.max(0, hourIndex - 1);
    } else if (direction === 'down') {
      newHourIndex = Math.min(HOURS.length - 1, hourIndex + 1);
    } else if (direction === 'left') {
      newDayIndex = Math.max(0, currentDayIndex - 1);
    } else if (direction === 'right') {
      newDayIndex = Math.min(WEEKDAYS.length - 1, currentDayIndex + 1);
    }

    const newHour = HOURS[newHourIndex];
    setEditingSlot({ hour: newHour, dayIndex: newDayIndex });
    const g = gradeLevel || grades[0] || '';
    const existing = entries.find(
      (e) =>
        e.gradeLevel === g &&
        e.hour === newHour &&
        e.dayOfWeek === newDayIndex,
    );
    setEditingSubjectName(existing?.subjectName ?? '');
  };

  // Haftalık görünüm için imleç hareketi (günler satır, saatler sütun)
  const moveInlineCursorWeekly = (
    direction: 'up' | 'down' | 'left' | 'right',
    currentHour: number,
    currentDayIndex: number,
  ) => {
    const hourIndex = HOURS.indexOf(currentHour);
    if (hourIndex === -1) return;
    let newHourIndex = hourIndex;
    let newDayIndex = currentDayIndex;

    if (direction === 'up') {
      newDayIndex = Math.max(0, currentDayIndex - 1);
    } else if (direction === 'down') {
      newDayIndex = Math.min(WEEKDAYS.length - 1, currentDayIndex + 1);
    } else if (direction === 'left') {
      newHourIndex = Math.max(0, hourIndex - 1);
    } else if (direction === 'right') {
      newHourIndex = Math.min(HOURS.length - 1, hourIndex + 1);
    }

    const newHour = HOURS[newHourIndex];
    setEditingSlot({ hour: newHour, dayIndex: newDayIndex });
    const g = gradeLevel || grades[0] || '';
    const existing = entries.find(
      (e) =>
        e.gradeLevel === g &&
        e.hour === newHour &&
        e.dayOfWeek === newDayIndex,
    );
    setEditingSubjectName(existing?.subjectName ?? '');
  };

  const getSummaryEntryStyle = (text: string): React.CSSProperties => {
    const len = (text ?? '').trim().length;
    if (len <= 8) return { fontSize: '0.8rem' };
    if (len <= 14) return { fontSize: '0.75rem' };
    if (len <= 20) return { fontSize: '0.7rem' };
    return { fontSize: '0.65rem' };
  };

  const openSummaryPdfWindow = () => {
    // Haftalık özet tablosunu yeni bir sekmede sade bir HTML olarak aç
    const title = 'Haftalık Program Özeti';
    const headDays = WEEKDAYS.map((d) => `<th>${d}</th>`).join('');
    const bodyRows = HOURS.map((hour) => {
      const cells = WEEKDAYS.map((_, dayIndex) => {
        const entry = entryAt(hour, dayIndex);
        const text = entry ? entry.subjectName : '—';
        return `<td>${text || ''}</td>`;
      }).join('');
      return `<tr><td>${hour}:00</td>${cells}</tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif; }
    body { margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
    h1 { font-size: 20px; margin: 0 0 16px; }
    .subtitle { font-size: 12px; color: #64748b; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; background: #ffffff; border-radius: 8px; overflow: hidden; }
    thead { background: #e2e8f0; }
    th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; vertical-align: top; }
    th:first-child, td:first-child { background: #f8fafc; font-weight: 600; white-space: nowrap; }
    tr:nth-child(even) td { background: #f9fafb; }
    @page { size: A4 landscape; margin: 1.2cm; }
    @media print {
      body { padding: 0; }
      table { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="subtitle">Saatlere göre haftalık ders programı özeti</div>
  <table>
    <thead>
      <tr>
        <th>Saat</th>
        ${headDays}
      </tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
  </table>
  <p style="margin-top:12px;font-size:11px;color:#64748b;">
    Bu sayfayı PDF olarak kaydetmek için tarayıcınızın yazdır menüsünden (Ctrl+P) &quot;PDF olarak kaydet&quot; seçeneğini kullanabilirsiniz.
  </p>
</body>
</html>`;
    try {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      // Eski tarayıcı / kısıtlı ortamlar için son çare
      const encoded = encodeURIComponent(html);
      window.open(`data:text/html;charset=utf-8,${encoded}`, '_blank');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <CalendarDays className="w-5 h-5 text-gray-500" />
        <span className="font-medium text-gray-800">Ders Programı</span>
      </div>

      <GlassCard className="p-5 schedule-filters-card">
        <div className="schedule-filters">
          {/* Kapsam: Sınıf / Ders / Öğrenci (sadece öğretmen modu) */}
          {!isStudentMode && (
            <div className="schedule-filter-block">
              <label className="schedule-filter-label">Kapsam</label>
              <div className="schedule-filter-buttons">
                {[
                  { value: 'class' as Scope, label: 'Sınıfa göre' },
                  { value: 'subject' as Scope, label: 'Derse göre' },
                  { value: 'student' as Scope, label: 'Öğrenciye göre' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScope(value)}
                    className={scope === value ? 'primary-btn' : 'ghost-btn'}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sınıf / Ders / Öğrenci seçimi (öğretmen modu) */}
          {!isStudentMode && (
            <div className="schedule-filter-block">
              {(scope === 'class' || scope === 'subject') && (
                <div className="schedule-filter-selects">
                  <select
                    value={gradeLevel}
                    onChange={(e) => {
                      setGradeLevel(e.target.value);
                      setSubjectId('');
                      setStudentId('');
                    }}
                    className="schedule-select"
                  >
                    <option value="">Sınıf Seçin</option>
                    {grades.map((g) => (
                      <option key={g} value={g}>{g}. Sınıf</option>
                    ))}
                  </select>
                  {scope === 'subject' && (
                    <select
                      value={subjectId}
                      onChange={(e) => setSubjectId(e.target.value)}
                      disabled={!gradeLevel}
                      className="schedule-select schedule-select--wide disabled:opacity-60"
                    >
                      <option value="">Ders Seçin</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {scope === 'student' && (
                <div className="schedule-filter-selects">
                  <select
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="schedule-select schedule-select--wide"
                  >
                    <option value="">Öğrenci Seçin</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} {s.gradeLevel ? `(${s.gradeLevel}. Sınıf)` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Dönem: Günlük / Haftalık / Aylık / (öğretmen için Dönemlik) */}
          <div className="schedule-filter-block">
            <label className="schedule-filter-label">Program periyodu</label>
            <div className="schedule-filter-buttons">
              {(Object.keys(PERIOD_LABELS) as Period[])
                .filter((p) => (isStudentMode ? p !== 'term' : true))
                .map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={period === p ? 'primary-btn' : 'ghost-btn'}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Program içeriği alanı */}
      <GlassCard className="p-4 relative">
        {!isStudentMode && entriesLoading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Yükleniyor...</span>
          </div>
        )}
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-gray-700">
            {period === 'daily' && 'Günlük program'}
            {period === 'weekly' && 'Haftalık program'}
            {period === 'monthly' && 'Aylık program'}
            {period === 'term' && 'Dönemlik program'}
          </span>
          {!isStudentMode && (
            <div className="flex items-center gap-2" dir="ltr">
              <button
                type="button"
                onClick={() => {
                  setInlineAddMode((prev) => {
                    const next = !prev;
                    if (!next) {
                      setEditingSlot(null);
                      setEditingSubjectName('');
                      return next;
                    }
                    // Tablo ekleme modu açılırken ilk hücreyi odakla
                    const baseHour = HOURS[0];
                    const baseDayIndex = period === 'daily' ? selectedDayIndex : 0;
                    setEditingSlot({ hour: baseHour, dayIndex: baseDayIndex });
                    setEditingSubjectName('');
                    return next;
                  });
                }}
                className="primary-btn inline-flex items-center justify-center shrink-0 w-9 h-9 p-0"
                title={inlineAddMode ? 'Tablodan eklemeyi kapat' : 'Tablodan ders ekle'}
              >
                <Plus className="w-5 h-5" />
              </button>
              {inlineAddMode && (
                <button
                  type="button"
                  className="ghost-btn text-xs px-2 py-1"
                  onClick={() => {
                    handleInlineSave();
                    setEditingSlot(null);
                    setEditingSubjectName('');
                    setInlineAddMode(false);
                  }}
                >
                  Kaydet
                </button>
              )}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm overflow-hidden schedule-table-wrapper">
          {/* Günlük program: gün seçici + tek günün saatlik listesi */}
          {period === 'daily' && (
            <div className="schedule-daily-view">
              <div className="schedule-daily-day-selector">
                <label className="schedule-filter-label">Gün</label>
                <div className="schedule-filter-buttons">
                  {WEEKDAYS.map((name, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedDayIndex(i)}
                      className={selectedDayIndex === i ? 'primary-btn' : 'ghost-btn'}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              <table className="w-full text-sm text-left border-collapse schedule-table schedule-table--daily">
                <thead>
                  <tr>
                    <th className="schedule-table-hour-header">Saat</th>
                    <th className="schedule-table-day-header">Ders</th>
                    <th className="schedule-table-day-header">Konu / Not</th>
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((hour, rowIndex) => {
                    const entry = entryAt(hour, selectedDayIndex);
                    const isEditing =
                      inlineAddMode &&
                      editingSlot &&
                      editingSlot.hour === hour &&
                      editingSlot.dayIndex === selectedDayIndex;
                    return (
                      <tr key={hour} className={rowIndex % 2 === 0 ? 'schedule-table-row-even' : 'schedule-table-row-odd'}>
                        <td className="schedule-table-hour-cell">{hour}:00</td>
                        <td className="schedule-table-cell">
                          {isEditing ? (
                            <input
                              className="schedule-inline-input"
                              value={editingSubjectName}
                              onChange={(e) => setEditingSubjectName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleInlineSave({ keepEditing: true });
                                  moveInlineCursor('down', hour, selectedDayIndex);
                                }
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  handleInlineSave({ keepEditing: true });
                                  moveInlineCursor('up', hour, selectedDayIndex);
                                }
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  handleInlineSave({ keepEditing: true });
                                  moveInlineCursor('down', hour, selectedDayIndex);
                                }
                                if (e.key === 'ArrowLeft') {
                                  e.preventDefault();
                                  // Günlük görünümde sola/sağa hareket yok
                                }
                                if (e.key === 'ArrowRight') {
                                  e.preventDefault();
                                  // Aynı satırdaki "Konu / Not" hücresine geç
                                  handleInlineSave({ keepEditing: true });
                                  setEditingTopicSlot({
                                    hour,
                                    dayIndex: selectedDayIndex,
                                  });
                                  setEditingTopicValue(entry?.topic ?? '');
                                }
                                if (e.key === 'Escape') {
                                  setEditingSlot(null);
                                  setEditingSubjectName('');
                                }
                              }}
                              autoFocus
                              placeholder="Ders adı"
                            />
                          ) : entry ? (
                            <span className="schedule-table-entry" title={entry.topic}>{entry.subjectName}</span>
                          ) : (
                            <span
                              className="schedule-table-empty"
                              onClick={() => {
                                if (!inlineAddMode) return;
                                setEditingSlot({ hour, dayIndex: selectedDayIndex });
                                setEditingSubjectName('');
                              }}
                            >
                              —
                            </span>
                          )}
                        </td>
                        <td className="schedule-table-cell">
                          {entry?.topic ? (
                            editingTopicSlot &&
                            editingTopicSlot.hour === hour &&
                            editingTopicSlot.dayIndex === selectedDayIndex ? (
                              <input
                                className="schedule-inline-input"
                                value={editingTopicValue}
                                onChange={(e) => setEditingTopicValue(e.target.value)}
                                onBlur={() => handleInlineTopicSave()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleInlineTopicSave({ keepEditing: true });
                                    // Aynı satırda ders hücresine geri dön
                                    setEditingTopicSlot(null);
                                    setEditingTopicValue('');
                                    setEditingSlot({ hour, dayIndex: selectedDayIndex });
                                    setEditingSubjectName(entry?.subjectName ?? '');
                                  }
                                  if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    handleInlineTopicSave({ keepEditing: true });
                                    const newHour = HOURS[Math.max(0, HOURS.indexOf(hour) - 1)];
                                    setEditingTopicSlot({ hour: newHour, dayIndex: selectedDayIndex });
                                    const aboveEntry = entryAt(newHour, selectedDayIndex);
                                    setEditingTopicValue(aboveEntry?.topic ?? '');
                                  }
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    handleInlineTopicSave({ keepEditing: true });
                                    const newHour = HOURS[Math.min(HOURS.length - 1, HOURS.indexOf(hour) + 1)];
                                    setEditingTopicSlot({ hour: newHour, dayIndex: selectedDayIndex });
                                    const belowEntry = entryAt(newHour, selectedDayIndex);
                                    setEditingTopicValue(belowEntry?.topic ?? '');
                                  }
                                  if (e.key === 'ArrowLeft') {
                                    e.preventDefault();
                                    handleInlineTopicSave({ keepEditing: true });
                                    setEditingTopicSlot(null);
                                    setEditingTopicValue('');
                                    setEditingSlot({ hour, dayIndex: selectedDayIndex });
                                    setEditingSubjectName(entry?.subjectName ?? '');
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingTopicSlot(null);
                                    setEditingTopicValue('');
                                  }
                                }}
                                autoFocus
                                placeholder="Konu / not"
                              />
                            ) : (
                              <span
                                className="schedule-table-topic-text"
                                onClick={() => {
                                  setEditingTopicSlot({ hour, dayIndex: selectedDayIndex });
                                  setEditingTopicValue(entry.topic ?? '');
                                }}
                              >
                                {entry.topic}
                              </span>
                            )
                          ) : (
                            editingTopicSlot &&
                            editingTopicSlot.hour === hour &&
                            editingTopicSlot.dayIndex === selectedDayIndex ? (
                              <input
                                className="schedule-inline-input"
                                value={editingTopicValue}
                                onChange={(e) => setEditingTopicValue(e.target.value)}
                                onBlur={() => handleInlineTopicSave()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleInlineTopicSave({ keepEditing: true });
                                    setEditingTopicSlot(null);
                                    setEditingTopicValue('');
                                    setEditingSlot({ hour, dayIndex: selectedDayIndex });
                                    const currentEntry = entryAt(hour, selectedDayIndex);
                                    setEditingSubjectName(currentEntry?.subjectName ?? '');
                                  }
                                  if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    handleInlineTopicSave({ keepEditing: true });
                                    const newHour = HOURS[Math.max(0, HOURS.indexOf(hour) - 1)];
                                    setEditingTopicSlot({ hour: newHour, dayIndex: selectedDayIndex });
                                    const aboveEntry = entryAt(newHour, selectedDayIndex);
                                    setEditingTopicValue(aboveEntry?.topic ?? '');
                                  }
                                  if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    handleInlineTopicSave({ keepEditing: true });
                                    const newHour = HOURS[Math.min(HOURS.length - 1, HOURS.indexOf(hour) + 1)];
                                    setEditingTopicSlot({ hour: newHour, dayIndex: selectedDayIndex });
                                    const belowEntry = entryAt(newHour, selectedDayIndex);
                                    setEditingTopicValue(belowEntry?.topic ?? '');
                                  }
                                  if (e.key === 'ArrowLeft') {
                                    e.preventDefault();
                                    handleInlineTopicSave({ keepEditing: true });
                                    setEditingTopicSlot(null);
                                    setEditingTopicValue('');
                                    setEditingSlot({ hour, dayIndex: selectedDayIndex });
                                    const currentEntry = entryAt(hour, selectedDayIndex);
                                    setEditingSubjectName(currentEntry?.subjectName ?? '');
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingTopicSlot(null);
                                    setEditingTopicValue('');
                                  }
                                }}
                                autoFocus
                                placeholder="Konu / not"
                              />
                            ) : (
                              <span
                                className="schedule-table-empty"
                                onClick={() => {
                                  setEditingTopicSlot({ hour, dayIndex: selectedDayIndex });
                                  setEditingTopicValue('');
                                }}
                              >
                                —
                              </span>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Haftalık program: sol tarafta günler, üstte saatler */}
          {period === 'weekly' && (
            <table className="w-full text-sm text-left border-collapse schedule-table schedule-table--weekly">
              <thead>
                <tr>
                  <th className="schedule-table-day-header">Gün</th>
                  {HOURS.map((hour) => (
                    <th key={hour} className="schedule-table-hour-header">
                      {hour}:00
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEEKDAYS.map((day, dayIndex) => (
                  <tr
                    key={day}
                    className={
                      dayIndex % 2 === 0
                        ? 'schedule-table-row-even'
                        : 'schedule-table-row-odd'
                    }
                  >
                    <td className="schedule-table-day-header">{day}</td>
                    {HOURS.map((hour) => {
                      const entry = entryAt(hour, dayIndex);
                      const isEditing =
                        inlineAddMode &&
                        editingSlot &&
                        editingSlot.hour === hour &&
                        editingSlot.dayIndex === dayIndex;
                      return (
                        <td key={hour} className="schedule-table-cell">
                          {isEditing ? (
                            <input
                              className="schedule-inline-input"
                              value={editingSubjectName}
                              onChange={(e) =>
                                setEditingSubjectName(e.target.value)
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleInlineSave({ keepEditing: true });
                                  // Enter ile bir sonraki hücreye geç
                                  moveInlineCursorWeekly('right', hour, dayIndex);
                                }
                                if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  handleInlineSave({ keepEditing: true });
                                  moveInlineCursorWeekly('up', hour, dayIndex);
                                }
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  handleInlineSave({ keepEditing: true });
                                  moveInlineCursorWeekly('down', hour, dayIndex);
                                }
                                if (e.key === 'ArrowLeft') {
                                  e.preventDefault();
                                  handleInlineSave({ keepEditing: true });
                                  moveInlineCursorWeekly('left', hour, dayIndex);
                                }
                                if (e.key === 'ArrowRight') {
                                  e.preventDefault();
                                  handleInlineSave({ keepEditing: true });
                                  moveInlineCursorWeekly('right', hour, dayIndex);
                                }
                                if (e.key === 'Escape') {
                                  setEditingSlot(null);
                                  setEditingSubjectName('');
                                }
                              }}
                              autoFocus
                              placeholder="Ders adı"
                            />
                          ) : entry ? (
                            <span
                              className="schedule-table-entry"
                              title={entry.topic}
                            >
                              {entry.subjectName}
                            </span>
                          ) : (
                            <span
                              className="schedule-table-empty"
                              onClick={() => {
                                if (!inlineAddMode) return;
                                setEditingSlot({ hour, dayIndex });
                                setEditingSubjectName('');
                              }}
                            >
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Aylık program: ayın 4 haftası, her biri haftalık şema */}
          {period === 'monthly' && (
            <div className="schedule-monthly-view">
              {[1, 2, 3, 4].map((weekNum) => (
                <div key={weekNum} className="schedule-monthly-week">
                  <h4 className="schedule-monthly-week-title">Ayın {weekNum}. Haftası</h4>
                  <table className="w-full text-sm text-left border-collapse schedule-table schedule-table--compact">
                    <thead>
                      <tr>
                        <th className="schedule-table-hour-header">Saat</th>
                        {WEEKDAYS_SHORT.map((name) => (
                          <th key={name} className="schedule-table-day-header">
                            {name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {HOURS.map((hour, rowIndex) => (
                        <tr key={hour} className={rowIndex % 2 === 0 ? 'schedule-table-row-even' : 'schedule-table-row-odd'}>
                          <td className="schedule-table-hour-cell">{hour}:00</td>
                          {WEEKDAYS.map((_, dayIndex) => {
                            const entry = entryAt(hour, dayIndex);
                            return (
                              <td key={dayIndex} className="schedule-table-cell">
                                {entry ? (
                                  <span className="schedule-table-entry" title={entry.topic}>{entry.subjectName}</span>
                                ) : (
                                  <span className="schedule-table-empty">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* Dönemlik program: haftalık şema + açıklama */}
          {period === 'term' && (
            <div className="schedule-term-view">
              <p className="schedule-term-note">Dönem boyunca haftalık tekrarlanan program. Aşağıdaki tablo her hafta için geçerlidir.</p>
              <table className="w-full text-sm text-left border-collapse schedule-table">
                <thead>
                  <tr>
                    <th className="schedule-table-hour-header">Saat</th>
                    {WEEKDAYS.map((d) => (
                      <th key={d} className="schedule-table-day-header">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((hour, rowIndex) => (
                    <tr key={hour} className={rowIndex % 2 === 0 ? 'schedule-table-row-even' : 'schedule-table-row-odd'}>
                      <td className="schedule-table-hour-cell">{hour}:00</td>
                      {WEEKDAYS.map((_, dayIndex) => {
                        const entry = entryAt(hour, dayIndex);
                        return (
                          <td key={dayIndex} className="schedule-table-cell">
                            {entry ? (
                              <span className="schedule-table-entry" title={entry.topic}>{entry.subjectName}</span>
                            ) : (
                              <span className="schedule-table-empty">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Eklenen programlar – önizleme ve düzenleme */}
      <GlassCard className="p-5 schedule-list-card" title="Eklenen programlar" subtitle="Kayıtlı ders saatlerini önizleyin ve düzenleyin">
        <div className="schedule-list-header-actions">
          <button
            type="button"
            className="ghost-btn text-xs"
            onClick={() => setSummaryOpen(true)}
            disabled={sortedEntriesForList.length === 0}
          >
            Programı özet tabloda görüntüle
          </button>
        </div>
        <div className="schedule-list">
          {sortedEntriesForList.length === 0 ? (
            <div className="schedule-list-empty">
              Henüz ders saati eklenmedi. Yukarıdaki &quot;Ekle&quot; butonu ile ekleyebilirsiniz.
            </div>
          ) : (
            <ul className="schedule-list-ul">
              {sortedEntriesForList.map((entry) => (
                <li key={entry.id} className="schedule-list-item">
                  <div className="schedule-list-item-info">
                    <span className="schedule-list-badge schedule-list-badge--grade">{entry.gradeLevel}. Sınıf</span>
                    <span className="schedule-list-badge schedule-list-badge--subject">{entry.subjectName}</span>
                    <span className="schedule-list-meta">{WEEKDAYS[entry.dayOfWeek]} · {entry.hour}:00</span>
                    {entry.topic && <span className="schedule-list-topic" title={entry.topic}>{entry.topic}</span>}
                  </div>
                  <div className="schedule-list-item-actions">
                    <button type="button" onClick={() => openEditModal(entry)} className="schedule-list-btn schedule-list-btn--edit" title="Düzenle">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => handleDeleteEntry(entry.id)} className="schedule-list-btn schedule-list-btn--delete" title="Sil">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </GlassCard>

      {summaryOpen && (
        <div className="schedule-modal-overlay" onClick={() => setSummaryOpen(false)}>
          <div className="schedule-modal schedule-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="schedule-modal-header">
              <h3 className="schedule-modal-title">Haftalık Program Özeti</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={openSummaryPdfWindow}
                >
                  PDF ile indir
                </button>
                <button
                  type="button"
                  className="schedule-modal-close"
                  onClick={() => setSummaryOpen(false)}
                >
                  Kapat
                </button>
              </div>
            </div>
            <div className="schedule-modal-body">
              <table className="w-full text-sm text-left border-collapse schedule-table schedule-table--summary">
                <thead>
                  <tr>
                    <th className="schedule-table-hour-header">Saat</th>
                    {WEEKDAYS.map((d) => (
                      <th key={d} className="schedule-table-day-header">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOURS.map((hour, rowIndex) => (
                    <tr
                      key={hour}
                      className={
                        rowIndex % 2 === 0 ? 'schedule-table-row-even' : 'schedule-table-row-odd'
                      }
                    >
                      <td className="schedule-table-hour-cell">{hour}:00</td>
                      {WEEKDAYS.map((_, dayIndex) => {
                        const entry = entryAt(hour, dayIndex);
                        return (
                          <td key={dayIndex} className="schedule-table-cell">
                            {entry ? (
                              <span
                                className="schedule-table-entry schedule-table-entry--summary"
                                title={entry.topic}
                                style={getSummaryEntryStyle(entry.subjectName)}
                              >
                                {entry.subjectName}
                              </span>
                            ) : (
                              <span className="schedule-table-empty">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Program ekleme modal */}
      {addModalOpen && (
        <div className="schedule-modal-overlay" onClick={closeAddModal}>
          <div className="schedule-modal" onClick={(e) => e.stopPropagation()}>
            <div className="schedule-modal-header">
              <h3 className="schedule-modal-title">Ders saati ekle</h3>
              <button type="button" onClick={closeAddModal} className="schedule-modal-close" aria-label="Kapat">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="schedule-modal-body">
              <div className="schedule-modal-block">
                <label className="schedule-filter-label">Sınıf</label>
                <select
                  value={addForm.gradeLevel}
                  onChange={(e) => handleAddFormChange('gradeLevel', e.target.value)}
                  className="schedule-select w-full"
                >
                  <option value="">Sınıf Seçin</option>
                  {grades.map((g) => (
                    <option key={g} value={g}>{g}. Sınıf</option>
                  ))}
                </select>
              </div>
              <div className="schedule-modal-block">
                <label className="schedule-filter-label">Ders</label>
                <select
                  value={addForm.subjectId}
                  onChange={(e) => handleAddFormChange('subjectId', e.target.value)}
                  disabled={!addForm.gradeLevel}
                  className="schedule-select w-full disabled:opacity-60"
                >
                  <option value="">Ders Seçin</option>
                  {modalSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="schedule-modal-row">
                <div className="schedule-modal-block flex-1">
                  <label className="schedule-filter-label">Gün</label>
                  <select
                    value={addForm.dayOfWeek}
                    onChange={(e) => handleAddFormChange('dayOfWeek', Number(e.target.value))}
                    className="schedule-select w-full"
                  >
                    {WEEKDAYS.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="schedule-modal-block flex-1">
                  <label className="schedule-filter-label">Saat</label>
                  <select
                    value={addForm.hour}
                    onChange={(e) => handleAddFormChange('hour', Number(e.target.value))}
                    className="schedule-select w-full"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="schedule-modal-block">
                <label className="schedule-filter-label">Konu / Not (isteğe bağlı)</label>
                <input
                  type="text"
                  value={addForm.topic}
                  onChange={(e) => handleAddFormChange('topic', e.target.value)}
                  placeholder="Örn. Ünite 3 tekrar"
                  className="schedule-modal-input"
                />
              </div>
            </div>
            <div className="schedule-modal-footer">
              <button type="button" onClick={closeAddModal} className="ghost-btn flex-1">
                İptal
              </button>
              <button
                type="button"
                onClick={handleSaveEntry}
                disabled={!addForm.gradeLevel || !addForm.subjectId}
                className="primary-btn flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Düzenleme modal */}
      {editModalOpen && (
        <div className="schedule-modal-overlay" onClick={closeEditModal}>
          <div ref={editModalRef} className="schedule-modal" onClick={(e) => e.stopPropagation()}>
            <div className="schedule-modal-header">
              <h3 className="schedule-modal-title">Ders saatini düzenle</h3>
              <button type="button" onClick={closeEditModal} className="schedule-modal-close" aria-label="Kapat">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="schedule-modal-body">
              <div className="schedule-modal-block">
                <label className="schedule-filter-label">Sınıf</label>
                <select
                  value={addForm.gradeLevel}
                  onChange={(e) => handleAddFormChange('gradeLevel', e.target.value)}
                  className="schedule-select w-full"
                >
                  <option value="">Sınıf Seçin</option>
                  {grades.map((g) => (
                    <option key={g} value={g}>{g}. Sınıf</option>
                  ))}
                </select>
              </div>
              <div className="schedule-modal-block">
                <label className="schedule-filter-label">Ders</label>
                <select
                  value={addForm.subjectId}
                  onChange={(e) => handleAddFormChange('subjectId', e.target.value)}
                  disabled={!addForm.gradeLevel}
                  className="schedule-select w-full disabled:opacity-60"
                >
                  <option value="">Ders Seçin</option>
                  {modalSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="schedule-modal-row">
                <div className="schedule-modal-block flex-1">
                  <label className="schedule-filter-label">Gün</label>
                  <select
                    value={addForm.dayOfWeek}
                    onChange={(e) => handleAddFormChange('dayOfWeek', Number(e.target.value))}
                    className="schedule-select w-full"
                  >
                    {WEEKDAYS.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="schedule-modal-block flex-1">
                  <label className="schedule-filter-label">Saat</label>
                  <select
                    value={addForm.hour}
                    onChange={(e) => handleAddFormChange('hour', Number(e.target.value))}
                    className="schedule-select w-full"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="schedule-modal-block">
                <label className="schedule-filter-label">Konu / Not (isteğe bağlı)</label>
                <input
                  type="text"
                  value={addForm.topic}
                  onChange={(e) => handleAddFormChange('topic', e.target.value)}
                  placeholder="Örn. Ünite 3 tekrar"
                  className="schedule-modal-input"
                />
              </div>
            </div>
            <div className="schedule-modal-footer">
              <button type="button" onClick={closeEditModal} className="ghost-btn flex-1">
                İptal
              </button>
              <button
                type="button"
                onClick={handleUpdateEntry}
                disabled={!addForm.gradeLevel || !addForm.subjectId}
                className="primary-btn flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Güncelle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

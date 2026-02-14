/**
 * Ders Programı — Öğretmen sınıf/ders/öğrenci ve günlük/haftalık/aylık/dönemlik program oluşturur.
 */
import React, { useMemo, useState } from 'react';
import { CalendarDays, Plus, X } from 'lucide-react';
import { GlassCard } from './components/DashboardPrimitives';
import type { TeacherStudent } from './api';
import { getCurriculumSubjects } from './api';

type Scope = 'class' | 'subject' | 'student';
type Period = 'daily' | 'weekly' | 'monthly' | 'term';

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Günlük',
  weekly: 'Haftalık',
  monthly: 'Aylık',
  term: 'Dönemlik',
};

const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'] as const;
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
  /** Öğretmenin atanmış sınıfları (örn. ['9','10']) */
  allowedGrades?: string[];
}

export function LessonScheduleTab({ token, students, allowedGrades = [] }: LessonScheduleTabProps) {
  const [scope, setScope] = useState<Scope>('class');
  const [gradeLevel, setGradeLevel] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [studentId, setStudentId] = useState<string>('');
  const [period, setPeriod] = useState<Period>('weekly');
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([]);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    gradeLevel: '',
    subjectId: '',
    subjectName: '',
    dayOfWeek: 0,
    hour: 8,
    topic: '',
  });
  const [modalSubjects, setModalSubjects] = useState<Array<{ id: string; name: string }>>([]);

  const grades = useMemo(() => {
    const g = allowedGrades.length ? allowedGrades : ['4', '5', '6', '7', '8', '9', '10', '11', '12'];
    return g;
  }, [allowedGrades]);

  const studentsInGrade = useMemo(() => {
    if (!gradeLevel) return students;
    return students.filter((s) => s.gradeLevel === gradeLevel);
  }, [students, gradeLevel]);

  const loadSubjects = () => {
    if (!token || !gradeLevel) return;
    getCurriculumSubjects(token, gradeLevel).then(setSubjects).catch(() => setSubjects([]));
  };

  React.useEffect(() => {
    if (gradeLevel && scope === 'subject') loadSubjects();
    else setSubjects([]);
  }, [gradeLevel, scope, token]);

  const openAddModal = () => {
    const g = gradeLevel || grades[0] || '';
    setAddForm({
      gradeLevel: g,
      subjectId: subjectId || '',
      subjectName: subjects.find((s) => s.id === subjectId)?.name || '',
      dayOfWeek: 0,
      hour: 8,
      topic: '',
    });
    setAddModalOpen(true);
    if (token && g) getCurriculumSubjects(token, g).then(setModalSubjects).catch(() => setModalSubjects([]));
    else setModalSubjects(subjects);
  };

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

  const handleSaveEntry = () => {
    const subj = modalSubjects.find((s) => s.id === addForm.subjectId);
    if (!addForm.gradeLevel || !addForm.subjectId || subj == null) return;
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
  };

  const entryAt = (hour: number, dayIndex: number) =>
    filteredEntries.find((e) => e.hour === hour && e.dayOfWeek === dayIndex);

  const filteredEntries = useMemo(() => {
    let list = entries;
    if (gradeLevel) list = list.filter((e) => e.gradeLevel === gradeLevel);
    if (subjectId) list = list.filter((e) => e.subjectId === subjectId);
    return list;
  }, [entries, gradeLevel, subjectId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        <CalendarDays className="w-5 h-5 text-gray-500" />
        <span className="font-medium text-gray-800">Ders Programı</span>
      </div>

      <GlassCard className="p-4">
        <div className="space-y-4">
          {/* Kapsam: Sınıf / Ders / Öğrenci */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Kapsam</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'class' as Scope, label: 'Sınıfa göre' },
                { value: 'subject' as Scope, label: 'Derse göre' },
                { value: 'student' as Scope, label: 'Öğrenciye göre' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm ${scope === value ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sınıf / Ders / Öğrenci seçimi */}
          <div className="flex flex-wrap items-center gap-3">
            {(scope === 'class' || scope === 'subject') && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sınıf</label>
                <select
                  value={gradeLevel}
                  onChange={(e) => {
                    setGradeLevel(e.target.value);
                    setSubjectId('');
                    setStudentId('');
                  }}
                  className="px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-700 bg-white min-w-[120px]"
                >
                  <option value="">Seçin</option>
                  {grades.map((g) => (
                    <option key={g} value={g}>{g}. Sınıf</option>
                  ))}
                </select>
              </div>
            )}
            {scope === 'subject' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ders</label>
                <select
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  disabled={!gradeLevel}
                  className="px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-700 bg-white min-w-[140px] disabled:opacity-60"
                >
                  <option value="">Seçin</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            {scope === 'student' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Öğrenci</label>
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-700 bg-white min-w-[180px]"
                >
                  <option value="">Seçin</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} {s.gradeLevel ? `(${s.gradeLevel}. Sınıf)` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Dönem: Günlük / Haftalık / Aylık / Dönemlik */}
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Program periyodu</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm ${period === p ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Program içeriği alanı */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-sm font-medium text-gray-700">
            {period === 'daily' && 'Günlük program'}
            {period === 'weekly' && 'Haftalık program'}
            {period === 'monthly' && 'Aylık program'}
            {period === 'term' && 'Dönemlik program'}
          </span>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 transition-all shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Ekle
          </button>
        </div>
        <div className="border border-gray-200 rounded-md overflow-hidden">
          {period === 'weekly' ? (
            <table className="w-full text-sm text-left text-gray-700">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 font-medium w-24">Saat</th>
                  <th className="px-3 py-2 font-medium">Pazartesi</th>
                  <th className="px-3 py-2 font-medium">Salı</th>
                  <th className="px-3 py-2 font-medium">Çarşamba</th>
                  <th className="px-3 py-2 font-medium">Perşembe</th>
                  <th className="px-3 py-2 font-medium">Cuma</th>
                </tr>
              </thead>
              <tbody>
                {HOURS.map((hour) => (
                  <tr key={hour} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-3 py-2 text-gray-500 w-24">{hour}:00</td>
                    {WEEKDAYS.map((_, dayIndex) => {
                      const entry = entryAt(hour, dayIndex);
                      return (
                        <td key={dayIndex} className="px-3 py-2">
                          {entry ? (
                            <span className="text-sm text-gray-800 font-medium" title={entry.topic}>{entry.subjectName}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center text-gray-500 text-sm">
              {period === 'daily' && 'Günlük programı burada düzenleyebilirsiniz.'}
              {period === 'monthly' && 'Aylık programı burada düzenleyebilirsiniz.'}
              {period === 'term' && 'Dönemlik programı burada düzenleyebilirsiniz.'}
              <p className="mt-1">Yukarıdaki &quot;Ekle&quot; ile ders saati ekleyin.</p>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Program ekleme modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeAddModal}>
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Ders saati ekle</h3>
              <button type="button" onClick={closeAddModal} className="p-1 rounded-full hover:bg-gray-100 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sınıf</label>
                <select
                  value={addForm.gradeLevel}
                  onChange={(e) => handleAddFormChange('gradeLevel', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
                >
                  <option value="">Seçin</option>
                  {grades.map((g) => (
                    <option key={g} value={g}>{g}. Sınıf</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ders</label>
                <select
                  value={addForm.subjectId}
                  onChange={(e) => handleAddFormChange('subjectId', e.target.value)}
                  disabled={!addForm.gradeLevel}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white disabled:opacity-60"
                >
                  <option value="">Seçin</option>
                  {modalSubjects.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Gün</label>
                <select
                  value={addForm.dayOfWeek}
                  onChange={(e) => handleAddFormChange('dayOfWeek', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
                >
                  {WEEKDAYS.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Saat</label>
                <select
                  value={addForm.hour}
                  onChange={(e) => handleAddFormChange('hour', Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>{h}:00</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Konu / Not (isteğe bağlı)</label>
                <input
                  type="text"
                  value={addForm.topic}
                  onChange={(e) => handleAddFormChange('topic', e.target.value)}
                  placeholder="Örn. Ünite 3 tekrar"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={closeAddModal}
                className="flex-1 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSaveEntry}
                disabled={!addForm.gradeLevel || !addForm.subjectId}
                className="flex-1 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

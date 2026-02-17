import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock3,
  Flag,
  Loader2,
  PenSquare,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  downloadStudentStudyPlanPdf,
  getStudentStudyPlan,
  getStudentStudyPlans,
  getStudentQuestionBankMeta,
} from '../api';
import type {
  StudentAssignment,
  StudentContent,
  StudentTodo,
  TodoPriority,
  TodoStatus,
  StudentStudyPlan,
  StudentQuestionBankSubjectMeta,
} from '../api';

export type PlannerCreatePayload = {
  title: string;
  description?: string;
  priority?: TodoPriority;
  plannedDate?: string;
  relatedAssignmentId?: string;
  relatedContentId?: string;
};

type MutationState = {
  creating: boolean;
  updatingId: string | null;
  deletingId: string | null;
};

type StudentPlannerProps = {
  todos: StudentTodo[];
  assignments: StudentAssignment[];
  contents: StudentContent[];
  loading: boolean;
  mutationState: MutationState;
  onCreate: (payload: PlannerCreatePayload) => Promise<void>;
  onUpdate: (id: string, updates: Partial<StudentTodo>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  token?: string | null;
  defaultGradeLevel?: string;
};

const COLUMN_CONFIG: Array<{
  status: TodoStatus;
  title: string;
  helper: string;
}> = [
  {
    status: 'pending',
    title: 'Yapılacak',
    helper: 'Odaklanmanız gereken görevler',
  },
  {
    status: 'in_progress',
    title: 'Devam Eden',
    helper: 'Üzerinde çalıştıklarınız',
  },
  {
    status: 'completed',
    title: 'Tamamlanan',
    helper: 'Bitirdiğiniz görevler',
  },
];

const PRIORITY_LABEL: Record<TodoPriority, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
};

const priorityAccent: Record<TodoPriority, string> = {
  low: '#0ea5e9',
  medium: '#f97316',
  high: '#ef4444',
};

const statusAccent: Record<TodoStatus, string> = {
  pending: '#f59e0b',
  in_progress: '#2563eb',
  completed: '#16a34a',
};

const todayKey = new Date().toISOString().slice(0, 10);

export const StudentPlanner: React.FC<StudentPlannerProps> = ({
  todos,
  assignments,
  contents,
  loading,
  mutationState,
  onCreate,
  onUpdate,
  onDelete,
  token,
  defaultGradeLevel,
}) => {
  const [searchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TodoPriority>('all');
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [studyPlanOpen, setStudyPlanOpen] = useState(false);
  const [studyPlanLoading, setStudyPlanLoading] = useState(false);
  const [studyPlanResult, setStudyPlanResult] = useState<string | null>(null);
  const [studyPlanFocusTopic, setStudyPlanFocusTopic] = useState('');
  const [studyPlanWeeklyHours, setStudyPlanWeeklyHours] = useState(5);
  const [studyPlanGradeLevel] = useState(defaultGradeLevel ?? '9');
  // Çalışma planı için seçilen ders (subjectId) ve müfredat verileri
  const [studyPlanSubject, setStudyPlanSubject] = useState(''); // subjectId
  const [studyPlanSubjectName, setStudyPlanSubjectName] = useState(''); // serbest metin ders adı
  const [studyPlanSubjects, setStudyPlanSubjects] = useState<
    StudentQuestionBankSubjectMeta[]
  >([]);
  const [, setStudyPlanSubjectsLoading] = useState(false);
  const [studyPlanTopics, setStudyPlanTopics] = useState<string[]>([]);
  const [studyPlans, setStudyPlans] = useState<StudentStudyPlan[]>([]);
  const [selectedStudyPlanId, setSelectedStudyPlanId] = useState<string | null>(null);
  const [studyPlanModalOpen, setStudyPlanModalOpen] = useState(false);

  // Planner sütunları ve detay kartı için genişlet/daralt halleri
  const [expandedColumns, setExpandedColumns] = useState<Record<TodoStatus, boolean>>({
    pending: false,
    in_progress: false,
    completed: false,
  });
  const [detailExpanded, setDetailExpanded] = useState(false);

  const [createDraft, setCreateDraft] = useState<{
    title: string;
    description: string;
    priority: TodoPriority;
    plannedDate: string;
    relatedAssignmentId: string;
    relatedContentId: string;
  }>({
    title: '',
    description: '',
    priority: 'medium',
    plannedDate: '',
    relatedAssignmentId: '',
    relatedContentId: '',
  });

  const selectedTodo = useMemo(
    () => todos.find((todo) => todo.id === selectedTodoId) ?? null,
    [todos, selectedTodoId],
  );

  const [detailDraft, setDetailDraft] = useState<{
    description: string;
    plannedDate: string;
    priority: TodoPriority;
  }>({
    description: '',
    plannedDate: '',
    priority: 'medium',
  });

  useEffect(() => {
    if (todos.length === 0) {
      setSelectedTodoId(null);
      return;
    }
    setSelectedTodoId((prev) => {
      if (prev && todos.some((todo) => todo.id === prev)) {
        return prev;
      }
      return todos[0].id;
    });
  }, [todos]);

  useEffect(() => {
    if (!selectedTodo) {
      setDetailDraft({
        description: '',
        plannedDate: '',
        priority: 'medium',
      });
      return;
    }
    setDetailDraft({
      description: selectedTodo.description ?? '',
      plannedDate: selectedTodo.plannedDate
        ? selectedTodo.plannedDate.slice(0, 10)
        : '',
      priority: selectedTodo.priority,
    });
  }, [selectedTodo]);

  // Çalışma planı modalı açıldığında öğrencinin sınıfına ait soru bankası derslerini yükle
  useEffect(() => {
    if (!token || !studyPlanOpen || !studyPlanGradeLevel) {
      setStudyPlanSubjects([]);
      setStudyPlanSubject('');
      setStudyPlanTopics([]);
      return;
    }
    setStudyPlanSubjectsLoading(true);
    getStudentQuestionBankMeta(token, studyPlanGradeLevel)
      .then((meta) => {
        const list = meta?.subjects ?? [];
        setStudyPlanSubjects(list);

        if (list.length === 0) {
          setStudyPlanSubject('');
          setStudyPlanSubjectName('');
          setStudyPlanTopics([]);
          setStudyPlanFocusTopic('');
          return;
        }

        // Mevcut seçim hala geçerliyse koru, aksi halde ilk dersi öneri olarak doldur
        setStudyPlanSubject((prev) => {
          if (prev && list.some((s) => s.subjectId === prev)) return prev;
          return list[0].subjectId;
        });
        setStudyPlanSubjectName((prev) => {
          if (prev && prev.trim().length > 0) return prev;
          return list[0].subjectName;
        });
      })
      .catch(() => {
        setStudyPlanSubjects([]);
        setStudyPlanTopics([]);
      })
      .finally(() => {
        setStudyPlanSubjectsLoading(false);
      });
  }, [token, studyPlanOpen, studyPlanGradeLevel]);

  // Seçilen derse göre müfredat konularını yükle
  useEffect(() => {
    if (
      !studyPlanOpen ||
      !studyPlanSubject ||
      studyPlanSubjects.length === 0
    ) {
      setStudyPlanTopics([]);
      return;
    }

    const selected = studyPlanSubjects.find(
      (s) => s.subjectId === studyPlanSubject,
    );
    if (!selected) {
      setStudyPlanTopics([]);
      return;
    }

    const topics = selected.topics ?? [];
    const prettyTopics = topics.map(
      (t) => `${t.topic} (${t.questionCount})`,
    );
    setStudyPlanTopics(prettyTopics);

    if (prettyTopics.length === 0) {
      setStudyPlanFocusTopic('');
      return;
    }

    setStudyPlanFocusTopic((prev) => {
      if (prev && prettyTopics.includes(prev)) return prev;
      return prettyTopics[0];
    });
  }, [
    studyPlanOpen,
    studyPlanSubject,
    studyPlanSubjects,
  ]);

  useEffect(() => {
    const loadPlans = async () => {
      if (!token) return;
      try {
        const data = await getStudentStudyPlans(token);
        setStudyPlans(data);
        if (data.length > 0 && !selectedStudyPlanId) {
          setSelectedStudyPlanId(data[0].id);
        }
      } catch {
        // sessizce yut, planlar opsiyonel
      }
    };
    loadPlans().catch(() => {});
  }, [token]);

  const filteredTodos = useMemo(() => {
    return todos.filter((todo) => {
      if (
        searchTerm &&
        !`${todo.title} ${todo.description ?? ''}`
          .toLowerCase()
          .includes(searchTerm.toLowerCase())
      ) {
        return false;
      }
      if (priorityFilter !== 'all' && todo.priority !== priorityFilter) {
        return false;
      }
      return true;
    });
  }, [todos, searchTerm, priorityFilter]);

  const summary = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter((todo) => todo.status === 'completed').length;
    const overdue = todos.filter((todo) => {
      if (!todo.plannedDate || todo.status === 'completed') return false;
      return new Date(todo.plannedDate) < new Date(todayKey);
    }).length;
    const today = todos.filter((todo) => {
      if (!todo.plannedDate || todo.status === 'completed') return false;
      return todo.plannedDate.slice(0, 10) === todayKey;
    }).length;

    return { total, completed, overdue, today };
  }, [todos]);

  const handleCreateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!createDraft.title.trim()) {
      setFeedback('Lütfen bir görev başlığı girin.');
      return;
    }
    setFeedback(null);
    try {
      await onCreate({
        title: createDraft.title.trim(),
        description: createDraft.description.trim() || undefined,
        priority: createDraft.priority,
        plannedDate: createDraft.plannedDate || undefined,
        relatedAssignmentId: createDraft.relatedAssignmentId || undefined,
        relatedContentId: createDraft.relatedContentId || undefined,
      });
      setCreateDraft({
        title: '',
        description: '',
        priority: 'medium',
        plannedDate: '',
        relatedAssignmentId: '',
        relatedContentId: '',
      });
      setIsCreateOpen(false);
      setFeedback('Görev oluşturuldu.');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Görev oluşturulamadı.',
      );
    }
  };

  const handleDetailSave = async () => {
    if (!selectedTodo) return;
    setFeedback(null);
    try {
      await onUpdate(selectedTodo.id, {
        description: detailDraft.description.trim() || undefined,
        plannedDate: detailDraft.plannedDate || undefined,
        priority: detailDraft.priority,
      });
      setFeedback('Görev güncellendi.');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Güncelleme başarısız.',
      );
    }
  };

  const handleStatusChange = async (todo: StudentTodo, status: TodoStatus) => {
    if (todo.status === status) return;
    setFeedback(null);
    try {
      await onUpdate(todo.id, { status });
      setFeedback('Görev durumu güncellendi.');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Durum güncellenemedi.',
      );
    }
  };

  const handleDelete = async (todoId: string) => {
    setFeedback(null);
    try {
      await onDelete(todoId);
      setFeedback('Görev silindi.');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Görev silinemedi.',
      );
    }
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>, status: TodoStatus) => {
    event.preventDefault();
    const todoId = event.dataTransfer.getData('text/plain');
    setDraggingId(null);
    if (!todoId) return;
    const todo = todos.find((item) => item.id === todoId);
    if (!todo || todo.status === status) return;
    await handleStatusChange(todo, status);
  };

  const handleGetStudyPlan = async () => {
    if (!token) return;
    setStudyPlanLoading(true);
    setStudyPlanResult(null);
    try {
      const selectedSubject = studyPlanSubjects.find(
        (s) => s.subjectId === studyPlanSubject,
      );
      const subjectFromMeta = selectedSubject?.subjectName;
      const subjectName =
        studyPlanSubjectName.trim() || subjectFromMeta || undefined;

      const res = await getStudentStudyPlan(token, {
        focusTopic: studyPlanFocusTopic.trim() || undefined,
        weeklyHours: studyPlanWeeklyHours,
        gradeLevel: studyPlanGradeLevel,
        subject: subjectName,
        subjectId: selectedSubject?.subjectId,
      });
      setStudyPlanResult(res.studyPlan);
      setStudyPlanModalOpen(true);
      // Yeni planı listeye ekle
      setStudyPlans((prev) => [
        {
          id: res.planId,
          studentId: undefined,
          focusTopic: studyPlanFocusTopic.trim() || undefined,
          weeklyHours: studyPlanWeeklyHours,
          content: res.studyPlan,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setSelectedStudyPlanId(res.planId);
    } catch (err) {
      setStudyPlanResult(
        err instanceof Error ? err.message : 'Çalışma planı oluşturulamadı.',
      );
    } finally {
      setStudyPlanLoading(false);
    }
  };

  const handleDownloadStudyPlanPdf = async (planId: string) => {
    if (!token) return;
    try {
      const res = await downloadStudentStudyPlanPdf(token, planId);
      const blob = new Blob(
        [Uint8Array.from(atob(res.data), (c) => c.charCodeAt(0))],
        { type: res.mimeType },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setFeedback('Çalışma planı PDF olarak indirilemedi.');
    }
  };

  return (
    <div className="planner-layout">
      <div className="planner-main">
        <div className="planner-summary-grid">
          <div className="planner-summary-card">
            <span className="planner-summary-label">Toplam Görev</span>
            <strong>{summary.total}</strong>
          </div>
          <div className="planner-summary-card">
            <span className="planner-summary-label">Bugün</span>
            <strong>{summary.today}</strong>
          </div>
          <div className="planner-summary-card">
            <span className="planner-summary-label">Tamamlanan</span>
            <strong>{summary.completed}</strong>
          </div>
        </div>

        <div className="planner-controls">
          <select
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(event.target.value as 'all' | TodoPriority)
            }
          >
            <option value="all">Tüm Öncelikler</option>
            <option value="high">Yüksek Öncelik</option>
            <option value="medium">Orta Öncelik</option>
            <option value="low">Düşük Öncelik</option>
          </select>

          {token && (
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                setStudyPlanOpen(true);
                setStudyPlanResult(null);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.85rem',
              }}
            >
              <Sparkles size={16} /> AI Çalışma Planı
            </button>
          )}
          {!isCreateOpen ? (
            <button
              type="button"
              className="primary-btn"
              onClick={() => setIsCreateOpen(true)}
              disabled={mutationState.creating}
            >
              <Plus size={16} /> Yeni Görev
            </button>
          ) : null}
        </div>

        {isCreateOpen && (
          <form className="planner-create-card" onSubmit={handleCreateSubmit}>
            <div className="planner-create-header">
              <h3>Yeni Görev</h3>
              <button
                type="button"
                aria-label="Kapat"
                onClick={() => {
                  setIsCreateOpen(false);
                  setFeedback(null);
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="planner-create-grid">
              <label>
                Başlık
                <input
                  type="text"
                  value={createDraft.title}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({
                      ...draft,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Örn. Deneme sınavı analizi"
                />
              </label>
              <label>
                Açıklama
                <textarea
                  value={createDraft.description}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({
                      ...draft,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Kısa açıklama girin"
                  rows={3}
                />
              </label>
              <label>
                Öncelik
                <select
                  value={createDraft.priority}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({
                      ...draft,
                      priority: event.target.value as TodoPriority,
                    }))
                  }
                >
                  <option value="high">Yüksek</option>
                  <option value="medium">Orta</option>
                  <option value="low">Düşük</option>
                </select>
              </label>
              <label>
                Planlanan Tarih
                <input
                  type="date"
                  value={createDraft.plannedDate}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({
                      ...draft,
                      plannedDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                İlişkili Ödev
                <select
                  value={createDraft.relatedAssignmentId}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({
                      ...draft,
                      relatedAssignmentId: event.target.value,
                    }))
                  }
                >
                  <option value="">Seçim Yok</option>
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                İlişkili İçerik
                <select
                  value={createDraft.relatedContentId}
                  onChange={(event) =>
                    setCreateDraft((draft) => ({
                      ...draft,
                      relatedContentId: event.target.value,
                    }))
                  }
                >
                  <option value="">Seçim Yok</option>
                  {contents.map((content) => (
                    <option key={content.id} value={content.id}>
                      {content.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="planner-create-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setIsCreateOpen(false)}
              >
                Vazgeç
              </button>
              <button type="submit" className="primary-btn" disabled={mutationState.creating}>
                {mutationState.creating ? <Loader2 size={16} className="spinner" /> : <Plus size={16} />}
                Kaydet
              </button>
            </div>
          </form>
        )}

        {/* AI Çalışma Planları - Kart listesi */}
        {token && studyPlans.length > 0 && (
          <section className="planner-studyplans-section">
            <h3 className="planner-studyplans-title">AI Çalışma Planları</h3>
            <p className="planner-studyplans-subtitle">
              Önceden oluşturduğun çalışma planlarına buradan hızlıca ulaş.
            </p>
            <div className="planner-studyplans-grid">
              {studyPlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`planner-studyplan-card${
                    selectedStudyPlanId === plan.id ? ' planner-studyplan-card-active' : ''
                  }`}
                >
                  <div className="planner-studyplan-header">
                    <div>
                      <div className="planner-studyplan-topic">
                        {plan.focusTopic && plan.focusTopic.trim()
                          ? plan.focusTopic
                          : 'Genel çalışma planı'}
                      </div>
                      <div className="planner-studyplan-meta">
                        Haftalık hedef: {plan.weeklyHours} saat
                        {plan.gradeLevel && (
                          <> • {plan.gradeLevel}. Sınıf</>
                        )}
                        {plan.subject && (
                          <> • {plan.subject}</>
                        )}
                      </div>
                    </div>
                    <div className="planner-studyplan-date">
                      {new Date(plan.createdAt).toLocaleDateString('tr-TR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                  <div className="planner-studyplan-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        setSelectedStudyPlanId(plan.id);
                        setStudyPlanResult(plan.content);
                        setStudyPlanModalOpen(true);
                      }}
                    >
                      İçeriği görüntüle
                    </button>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={() => handleDownloadStudyPlanPdf(plan.id)}
                    >
                      PDF ile indir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="planner-board">
          {COLUMN_CONFIG.map((column) => {
            const columnTodos = filteredTodos.filter(
              (todo) => todo.status === column.status,
            );
            return (
              <div
                key={column.status}
                className={`planner-column${
                  draggingId ? ' planner-column-droppable' : ''
                }${!expandedColumns[column.status] ? ' planner-column--collapsed' : ''}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, column.status)}
              >
                <button
                  type="button"
                  className="planner-column-header-btn"
                  onClick={() =>
                    setExpandedColumns((prev) => ({
                      ...prev,
                      [column.status]: !prev[column.status],
                    }))
                  }
                >
                  <div className="planner-column-header">
                    <div>
                      <h3>{column.title}</h3>
                      <span>{column.helper}</span>
                    </div>
                    {columnTodos.length > 0 && (
                      <span className="planner-column-count">{columnTodos.length}</span>
                    )}
                  </div>
                </button>
                <div className="planner-column-body">
                  {loading && !todos.length ? (
                    <div className="planner-empty">Görevler yükleniyor...</div>
                  ) : null}
                  {!loading && columnTodos.length === 0 ? (
                    <div className="planner-empty">Görev bulunmuyor.</div>
                  ) : null}
                  {columnTodos.map((todo) => {
                    const isUpdating = mutationState.updatingId === todo.id;
                    const isActive = selectedTodoId === todo.id;
                    const plannedDate = todo.plannedDate
                      ? new Date(todo.plannedDate).toLocaleDateString('tr-TR', {
                          day: '2-digit',
                          month: 'short',
                        })
                      : 'Planlanmadı';
                    return (
                      <div
                        key={todo.id}
                        className={`planner-card${isActive ? ' is-active' : ''}${
                          isUpdating ? ' is-busy' : ''
                        }`}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', todo.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDraggingId(todo.id);
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onClick={() => setSelectedTodoId(todo.id)}
                      >
                        <div className="planner-card-title">{todo.title}</div>
                        <div className="planner-card-meta">
                          <span
                            className="planner-chip"
                            style={{ background: `${priorityAccent[todo.priority]}1A`, color: priorityAccent[todo.priority] }}
                          >
                            <Flag size={12} /> {PRIORITY_LABEL[todo.priority]}
                          </span>
                          <span className="planner-card-date">
                            <Calendar size={12} />
                            {plannedDate}
                          </span>
                        </div>
                        {todo.description && (
                          <p className="planner-card-desc">{todo.description}</p>
                        )}
                        {isUpdating && <Loader2 size={16} className="spinner" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <aside className={`planner-detail${detailExpanded ? '' : ' planner-detail--collapsed'}`}>
        <header className="planner-detail-header">
          <h3>Görev Detayları</h3>
          {selectedTodo && (
            <span
              className="planner-chip"
              style={{
                background: `${statusAccent[selectedTodo.status]}1A`,
                color: statusAccent[selectedTodo.status],
              }}
            >
              <CheckCircle2 size={14} />
              {COLUMN_CONFIG.find((col) => col.status === selectedTodo.status)?.title}
            </span>
          )}
          <button
            type="button"
            className="ghost-btn"
            onClick={() => setDetailExpanded((prev) => !prev)}
          >
            {detailExpanded ? 'Daralt' : 'Genişlet'}
          </button>
        </header>

        {selectedTodo ? (
          <div className="planner-detail-body">
            <label>
              Başlık
              <input type="text" value={selectedTodo.title} disabled />
            </label>

            <label>
              Açıklama
              <textarea
                value={detailDraft.description}
                rows={4}
                onChange={(event) =>
                  setDetailDraft((draft) => ({
                    ...draft,
                    description: event.target.value,
                  }))
                }
              />
            </label>

            <div className="planner-detail-grid">
              <label>
                Öncelik
                <select
                  value={detailDraft.priority}
                  onChange={(event) =>
                    setDetailDraft((draft) => ({
                      ...draft,
                      priority: event.target.value as TodoPriority,
                    }))
                  }
                >
                  <option value="high">Yüksek</option>
                  <option value="medium">Orta</option>
                  <option value="low">Düşük</option>
                </select>
              </label>
              <label>
                Planlanan Tarih
                <input
                  type="date"
                  value={detailDraft.plannedDate}
                  onChange={(event) =>
                    setDetailDraft((draft) => ({
                      ...draft,
                      plannedDate: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="planner-detail-meta">
              <span>
                <Clock3 size={14} />{' '}
                {new Date(selectedTodo.createdAt).toLocaleDateString('tr-TR', {
                  day: '2-digit',
                  month: 'short',
                })}
              </span>
              {selectedTodo.completedAt && (
                <span>
                  <CheckCircle2 size={14} />{' '}
                  {new Date(selectedTodo.completedAt).toLocaleDateString(
                    'tr-TR',
                    { day: '2-digit', month: 'short' },
                  )}
                </span>
              )}
            </div>

            <div className="planner-detail-actions">
              <button
                type="button"
                className="ghost-btn"
                onClick={handleDetailSave}
                disabled={mutationState.updatingId === selectedTodo.id}
              >
                <PenSquare size={14} /> Detayı Kaydet
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => handleStatusChange(selectedTodo, 'pending')}
                disabled={
                  selectedTodo.status === 'pending' ||
                  mutationState.updatingId === selectedTodo.id
                }
              >
                Beklemeye Al
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => handleStatusChange(selectedTodo, 'in_progress')}
                disabled={
                  selectedTodo.status === 'in_progress' ||
                  mutationState.updatingId === selectedTodo.id
                }
              >
                Devam Ediyor
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => handleStatusChange(selectedTodo, 'completed')}
                disabled={
                  selectedTodo.status === 'completed' ||
                  mutationState.updatingId === selectedTodo.id
                }
              >
                Tamamlandı
              </button>
              <button
                type="button"
                className="danger-btn"
                onClick={() => handleDelete(selectedTodo.id)}
                disabled={mutationState.deletingId === selectedTodo.id}
              >
                {mutationState.deletingId === selectedTodo.id ? (
                  <Loader2 size={14} className="spinner" />
                ) : (
                  <Trash2 size={14} />
                )}
                Sil
              </button>
            </div>
          </div>
        ) : (
          <div className="planner-empty">Görev seçiniz.</div>
        )}

        {feedback && <div className="planner-feedback">{feedback}</div>}
      </aside>
      {studyPlanOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.8)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
          onClick={() => setStudyPlanOpen(false)}
        >
          <div
            style={{
              width: 'min(560px, 100%)',
              maxHeight: '85vh',
              background: 'var(--color-surface-strong)',
              borderRadius: 18,
              border: '1px solid rgba(99,102,241,0.5)',
              boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '1rem 1.2rem',
                borderBottom: '1px solid rgba(51,65,85,0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: 'var(--color-text-main)',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                }}
              >
                <Sparkles size={18} />
                <strong>AI Çalışma Planı Önerisi</strong>
              </div>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setStudyPlanOpen(false)}
                style={{ padding: '0.35rem' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Sınıf
                <input
                  type="text"
                  value={studyPlanGradeLevel ? `${studyPlanGradeLevel}. Sınıf` : ''}
                  readOnly
                  style={{
                    display: 'block',
                    marginTop: '0.25rem',
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 10,
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-main)',
                    opacity: 0.8,
                  }}
                />
              </label>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Ders
                <input
                  type="text"
                  value={studyPlanSubjectName}
                  onChange={(e) => setStudyPlanSubjectName(e.target.value)}
                  placeholder="Örn. Matematik, Türkçe..."
                  style={{
                    display: 'block',
                    marginTop: '0.25rem',
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 10,
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-main)',
                  }}
                />
              </label>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Odak konu (isteğe bağlı)
                <input
                  type="text"
                  value={studyPlanFocusTopic}
                  onChange={(e) => setStudyPlanFocusTopic(e.target.value)}
                  placeholder={
                    studyPlanTopics.length > 0
                      ? `Örn. ${studyPlanTopics[0]}`
                      : 'Örn. Problemler, Paragraf, Fonksiyonlar...'
                  }
                  style={{
                    display: 'block',
                    marginTop: '0.25rem',
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 10,
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-main)',
                  }}
                />
              </label>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Haftalık hedef saat
                <select
                  value={studyPlanWeeklyHours}
                  onChange={(e) => setStudyPlanWeeklyHours(Number(e.target.value))}
                  style={{
                    display: 'block',
                    marginTop: '0.25rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 10,
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-main)',
                  }}
                >
                  {[3, 5, 7, 10, 14].map((h) => (
                    <option key={h} value={h}>{h} saat</option>
                  ))}
                </select>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleGetStudyPlan}
                  disabled={studyPlanLoading}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {studyPlanLoading ? (
                    <><Loader2 size={16} className="spinner" /> Oluşturuluyor...</>
                  ) : (
                    <><Sparkles size={16} /> Plan Oluştur</>
                  )}
                </button>
                {studyPlanResult && (
                  <>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        if (selectedStudyPlanId) handleDownloadStudyPlanPdf(selectedStudyPlanId);
                      }}
                      disabled={!selectedStudyPlanId}
                      style={{
                        border: '1px solid rgba(148,163,184,0.9)',
                        background: 'rgba(15,23,42,0.9)',
                        color: '#e2e8f0',
                      }}
                    >
                      PDF Olarak İndir
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => setStudyPlanModalOpen(true)}
                    >
                      Ayrı pencerede aç
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {studyPlanResult && studyPlanModalOpen && (
        <div
          className="ui-modal-overlay ui-modal-overlay--strong"
          style={{ zIndex: 96 }}
          onClick={() => setStudyPlanModalOpen(false)}
        >
          <div
            className="ui-modal ui-modal--xl"
            style={{ width: 'min(900px, 96vw)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ui-modal-header">
              <div className="ui-modal-title">AI Çalışma Planı</div>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setStudyPlanModalOpen(false)}
              >
                Kapat
              </button>
            </div>
            <div
              className="ui-modal-body"
              style={{ maxHeight: '72vh', overflowY: 'auto' }}
            >
              <div className="planner-studyplan-result">
                <div className="planner-studyplan-result-card">
                  <div className="planner-studyplan-result-title">
                    AI Çalışma Planı
                  </div>
                  <div className="planner-studyplan-result-body">
                    {studyPlanResult}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

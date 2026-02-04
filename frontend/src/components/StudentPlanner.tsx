import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock3,
  Flag,
  Loader2,
  PenSquare,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  StudentAssignment,
  StudentContent,
  StudentTodo,
  TodoPriority,
  TodoStatus,
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
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TodoPriority>('all');
  const [selectedTodoId, setSelectedTodoId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

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
          <div className="planner-summary-card">
            <span className="planner-summary-label">Riski Görev</span>
            <strong>{summary.overdue}</strong>
          </div>
        </div>

        <div className="planner-controls">
          <div className="planner-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Görev ara..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

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
                }`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(event, column.status)}
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

      <aside className="planner-detail">
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
    </div>
  );
};

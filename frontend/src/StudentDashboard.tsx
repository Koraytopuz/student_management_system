import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';
import { CalendarView } from './CalendarView';

interface LastWatchedContent {
  contentId: string;
  title: string;
  lastPositionSeconds: number;
}

interface StudentDashboardSummary {
  pendingAssignmentsCount: number;
  testsSolvedThisWeek: number;
  totalQuestionsThisWeek: number;
  averageScorePercent: number;
  lastWatchedContents: LastWatchedContent[];
}

interface Assignment {
  id: string;
  title: string;
  description?: string;
  testId?: string;
  contentId?: string;
  dueDate: string;
  points: number;
}

interface ContentItem {
  id: string;
  title: string;
  description?: string;
  type: string;
  topic: string;
  gradeLevel: string;
  durationMinutes?: number;
}

interface Message {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: string;
}

interface Meeting {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
}

interface TodoItem {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  plannedDate?: string;
  completedAt?: string;
  relatedAssignmentId?: string;
  relatedContentId?: string;
}

interface TopicProgress {
  topic: string;
  subjectName: string;
  completionPercent: number;
  testsCompleted: number;
  testsTotal: number;
  averageScorePercent: number;
  lastActivityDate?: string;
  strengthLevel: 'weak' | 'average' | 'strong';
}

interface ProgressOverview {
  topics: TopicProgress[];
  overallCompletionPercent: number;
  totalTestsCompleted: number;
  totalQuestionsSolved: number;
  averageScorePercent: number;
}

interface TimeSeriesPoint {
  date: string;
  questionsSolved: number;
  testsCompleted: number;
  averageScore: number;
  studyMinutes: number;
}

interface ProgressCharts {
  dailyData: TimeSeriesPoint[];
}

interface Goal {
  id: string;
  type: 'weekly_questions' | 'weekly_tests' | 'topic_completion' | 'score_percent';
  targetValue: number;
  topic?: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  currentValue?: number;
  progressPercent?: number;
}

interface Question {
  id: string;
  text: string;
  type: 'multiple_choice' | 'true_false' | 'open_ended';
  choices?: string[];
  correctAnswer?: string;
  solutionExplanation?: string;
}

interface TestDetail {
  id: string;
  title: string;
  questionIds: string[];
}

interface AssignmentDetail {
  assignment: Assignment;
  test?: TestDetail;
  questions?: Question[];
}

type TabKey =
  | 'overview'
  | 'assignments'
  | 'contents'
  | 'todos'
  | 'goals'
  | 'progress'
  | 'messages'
  | 'meetings'
  | 'notifications'
  | 'calendar';

export const StudentDashboard: React.FC = () => {
  const { token, user } = useAuth();
  const [summary, setSummary] = useState<StudentDashboardSummary | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [error, setError] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] =
    useState<number>(0);

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [progressOverview, setProgressOverview] =
    useState<ProgressOverview | null>(null);
  const [progressCharts, setProgressCharts] =
    useState<ProgressCharts | null>(null);

  const [selectedAssignment, setSelectedAssignment] =
    useState<AssignmentDetail | null>(null);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(
    null,
  );
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [testAnswers, setTestAnswers] = useState<
    Record<string, { answer: string; isCorrect?: boolean }>
  >({});
  const [testStartTime, setTestStartTime] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    id: string;
    correctCount: number;
    incorrectCount: number;
    blankCount: number;
    scorePercent: number;
    durationSeconds: number;
    answers: Array<{
      questionId: string;
      answer: string;
      isCorrect: boolean;
    }>;
  } | null>(null);
  const [testResultQuestions, setTestResultQuestions] = useState<Question[]>(
    [],
  );
  const [contentWatchSeconds, setContentWatchSeconds] = useState<number>(0);

  const [newMessage, setNewMessage] = useState({
    toUserId: '',
    text: '',
  });

  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [newTodo, setNewTodo] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    plannedDate: '',
  });

  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);

  const [newGoal, setNewGoal] = useState({
    type: 'weekly_questions' as Goal['type'],
    targetValue: '',
    topic: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    if (!token) return;
    setError(null);

    apiRequest<StudentDashboardSummary>('/student/dashboard', {}, token)
      .then(setSummary)
      .catch((e) => setError(e.message));

    Promise.all([
      apiRequest<Assignment[]>('/student/assignments', {}, token),
      apiRequest<ContentItem[]>('/student/contents', {}, token),
      apiRequest<Message[]>('/student/messages', {}, token),
      apiRequest<Meeting[]>('/student/meetings', {}, token),
      apiRequest<NotificationItem[]>('/student/notifications', {}, token),
      apiRequest<{ count: number }>(
        '/student/notifications/unread-count',
        {},
        token,
      ),
      apiRequest<TodoItem[]>('/student/todos', {}, token),
      apiRequest<Goal[]>('/student/goals', {}, token),
      apiRequest<ProgressOverview>('/student/progress/topics', {}, token),
      apiRequest<ProgressCharts>('/student/progress/charts', {}, token),
      apiRequest<Teacher[]>('/student/teachers', {}, token),
    ])
      .then(([a, c, m, mt, n, unread, td, g, pov, pcharts, tchs]) => {
        setAssignments(a);
        setContents(c);
        setMessages(m);
        setMeetings(mt);
        setNotifications(n);
        setUnreadNotificationCount(unread.count);
        setTodos(td);
        setGoals(g);
        setProgressOverview(pov);
        setProgressCharts(pcharts);
        setTeachers(tchs);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  if (!token || !user) {
    return <div>Önce giriş yapmalısınız.</div>;
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<Message>(
        '/student/messages',
        {
          method: 'POST',
          body: JSON.stringify({
            toUserId: newMessage.toUserId,
            text: newMessage.text,
          }),
        },
        token,
      );
      setMessages((prev) => [...prev, created]);
      setNewMessage({ toUserId: '', text: '' });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleMarkAllNotificationsRead() {
    if (!token) return;
    try {
      await apiRequest(
        '/student/notifications/read-all',
        {
          method: 'PUT',
        },
        token,
      );
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          read: true,
        })),
      );
      setUnreadNotificationCount(0);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleCreateTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<TodoItem>(
        '/student/todos',
        {
          method: 'POST',
          body: JSON.stringify({
            title: newTodo.title,
            description: newTodo.description || undefined,
            priority: newTodo.priority,
            plannedDate: newTodo.plannedDate || undefined,
          }),
        },
        token,
      );
      setTodos((prev) => [...prev, created]);
      setNewTodo({
        title: '',
        description: '',
        priority: 'medium',
        plannedDate: '',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleUpdateTodoStatus(
    todoId: string,
    status: TodoItem['status'],
  ) {
    if (!token) return;
    try {
      const updated = await apiRequest<TodoItem>(
        `/student/todos/${todoId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ status }),
        },
        token,
      );
      setTodos((prev) =>
        prev.map((t) => (t.id === todoId ? updated : t)),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteTodo(todoId: string) {
    if (!token) return;
    try {
      await apiRequest(`/student/todos/${todoId}`, { method: 'DELETE' }, token);
      setTodos((prev) => prev.filter((t) => t.id !== todoId));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<Goal>(
        '/student/goals',
        {
          method: 'POST',
          body: JSON.stringify({
            type: newGoal.type,
            targetValue: Number(newGoal.targetValue),
            topic: newGoal.topic || undefined,
            startDate: newGoal.startDate,
            endDate: newGoal.endDate,
          }),
        },
        token,
      );
      setGoals((prev) => [...prev, created]);
      setNewGoal({
        type: 'weekly_questions',
        targetValue: '',
        topic: '',
        startDate: '',
        endDate: '',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleViewAssignment(assignmentId: string) {
    if (!token) return;
    try {
      const detail = await apiRequest<AssignmentDetail>(
        `/student/assignments/${assignmentId}`,
        {},
        token,
      );
      setSelectedAssignment(detail);
      if (detail.test && detail.questions) {
        setTestQuestions(detail.questions);
        setTestStartTime(Date.now());
        setTestAnswers({});
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSubmitTest(assignmentId: string) {
    if (!token || !selectedAssignment?.test) return;
    try {
      // Önce cevapları doğru/yanlış kontrolü ile hazırla
      const answers = testQuestions.map((q) => {
        const studentAnswer = testAnswers[q.id]?.answer || '';
        let isCorrect = false;

        if (q.type === 'multiple_choice' || q.type === 'true_false') {
          isCorrect = studentAnswer === q.correctAnswer;
        } else if (q.type === 'open_ended') {
          // Açık uçlu sorular için şimdilik false (manuel kontrol gerekir)
          isCorrect = false;
        }

        return {
          questionId: q.id,
          answer: studentAnswer,
          isCorrect,
        };
      });

      const durationSeconds = testStartTime
        ? Math.floor((Date.now() - testStartTime) / 1000)
        : 0;

      const result = await apiRequest<{
        id: string;
        correctCount: number;
        incorrectCount: number;
        blankCount: number;
        scorePercent: number;
        durationSeconds: number;
        answers: Array<{
          questionId: string;
          answer: string;
          isCorrect: boolean;
        }>;
      }>(
        `/student/assignments/${assignmentId}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({
            answers,
            durationSeconds,
          }),
        },
        token,
      );

      // Test sonucunu göster (soruları sakla)
      setTestResult(result);
      setTestResultQuestions([...testQuestions]);
      setTestQuestions([]);
      setTestAnswers({});
      setTestStartTime(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleViewContent(contentId: string) {
    const content = contents.find((c) => c.id === contentId);
    if (content) {
      setSelectedContent(content);
      setContentWatchSeconds(0);
    }
  }

  async function handleUpdateWatchProgress(
    contentId: string,
    watchedSeconds: number,
    completed: boolean,
  ) {
    if (!token) return;
    try {
      await apiRequest(
        `/student/contents/${contentId}/watch`,
        {
          method: 'POST',
          body: JSON.stringify({
            watchedSeconds,
            completed,
          }),
        },
        token,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="panel">
      <h2>Öğrenci Paneli</h2>
      {error && <div className="error">{error}</div>}

      <div className="role-selector" style={{ marginBottom: '1rem' }}>
        {[
          { key: 'overview', label: 'Genel Bakış' },
          { key: 'assignments', label: 'Görevlerim' },
          { key: 'contents', label: 'Ders İçerikleri' },
          { key: 'todos', label: 'To-Do Listem' },
          { key: 'goals', label: 'Hedeflerim' },
          { key: 'progress', label: 'İlerlemem' },
          { key: 'messages', label: 'Mesajlaşma' },
          { key: 'meetings', label: 'Toplantılar' },
          {
            key: 'notifications',
            label:
              unreadNotificationCount > 0
                ? `Bildirimler (${unreadNotificationCount})`
                : 'Bildirimler',
          },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? 'role-btn active' : 'role-btn'}
            onClick={() => setTab(t.key as TabKey)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {!summary && !error && <div>Yükleniyor...</div>}
          {summary && (
            <>
              <div className="stats-grid">
                <div
                  className="stat-card stat-clickable"
                  role="button"
                  onClick={() => setTab('assignments')}
                >
                  <span className="stat-label">Bekleyen Görevler / To-Do</span>
                  <span className="stat-value">
                    {summary.pendingAssignmentsCount}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Bu Hafta Çözülen Test</span>
                  <span className="stat-value">
                    {summary.testsSolvedThisWeek}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Bu Hafta Çözülen Soru</span>
                  <span className="stat-value">
                    {summary.totalQuestionsThisWeek}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Ortalama Başarı</span>
                  <span className="stat-value">
                    %{summary.averageScorePercent}
                  </span>
                </div>
              </div>

              <div className="card">
                <h3>Son İzlenen İçerikler</h3>
                {summary.lastWatchedContents.length === 0 ? (
                  <p>Henüz içerik izlenmemiş.</p>
                ) : (
                  <ul>
                    {summary.lastWatchedContents.map((c) => (
                      <li key={c.contentId}>
                        <strong>{c.title}</strong> –{' '}
                        {(c.lastPositionSeconds / 60).toFixed(1)} dk
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'assignments' && (
        <div className="cards-grid">
          {testResult ? (
            <div className="card" style={{ maxWidth: '800px', width: '100%' }}>
              <h3>
                Test Sonuçları
                  <button
                    type="button"
                    onClick={() => {
                      setTestResult(null);
                      setTestResultQuestions([]);
                      setSelectedAssignment(null);
                    }}
                    style={{ marginLeft: '1rem' }}
                  >
                    Kapat
                  </button>
              </h3>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: 'white',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                    Doğru
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    {testResult.correctCount}
                  </div>
                </div>
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: 'white',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                    Yanlış
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    {testResult.incorrectCount}
                  </div>
                </div>
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    background: 'linear-gradient(135deg, #6b7280, #4b5563)',
                    color: 'white',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Boş</div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    {testResult.blankCount}
                  </div>
                </div>
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: 'white',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                    Başarı %
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    %{testResult.scorePercent}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <strong>Süre:</strong>{' '}
                {Math.floor(testResult.durationSeconds / 60)}:
                {String(testResult.durationSeconds % 60).padStart(2, '0')}
              </div>

              <div>
                <h4 style={{ marginTop: '1.5rem', marginBottom: '0.75rem' }}>
                  Soru Detayları
                </h4>
                {testResultQuestions.map((q, idx) => {
                  const answerData = testResult.answers.find(
                    (a) => a.questionId === q.id,
                  );
                  const isCorrect = answerData?.isCorrect ?? false;
                  const studentAnswer = answerData?.answer || '(Boş)';

                  return (
                    <div
                      key={q.id}
                      style={{
                        marginBottom: '1rem',
                        padding: '1rem',
                        borderRadius: '0.75rem',
                        border: `2px solid ${
                          isCorrect ? '#10b981' : '#ef4444'
                        }`,
                        background: isCorrect
                          ? 'rgba(16, 185, 129, 0.1)'
                          : 'rgba(239, 68, 68, 0.1)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          marginBottom: '0.5rem',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: isCorrect ? '#10b981' : '#ef4444',
                            color: 'white',
                            textAlign: 'center',
                            lineHeight: '24px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                          }}
                        >
                          {isCorrect ? '✓' : '✗'}
                        </span>
                        <strong>
                          Soru {idx + 1}: {q.text}
                        </strong>
                      </div>
                      <div style={{ marginLeft: '2rem', fontSize: '0.9rem' }}>
                        <div>
                          <strong>Senin Cevabın:</strong>{' '}
                          <span
                            style={{
                              color: isCorrect ? '#10b981' : '#ef4444',
                              fontWeight: '600',
                            }}
                          >
                            {studentAnswer}
                          </span>
                        </div>
                        {!isCorrect && q.correctAnswer && (
                          <div style={{ marginTop: '0.25rem' }}>
                            <strong>Doğru Cevap:</strong>{' '}
                            <span style={{ color: '#10b981', fontWeight: '600' }}>
                              {q.correctAnswer}
                            </span>
                          </div>
                        )}
                        {q.solutionExplanation && (
                          <div
                            style={{
                              marginTop: '0.5rem',
                              padding: '0.5rem',
                              background: 'rgba(59, 130, 246, 0.1)',
                              borderRadius: '0.5rem',
                              fontSize: '0.85rem',
                            }}
                          >
                            <strong>Çözüm:</strong> {q.solutionExplanation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : selectedAssignment ? (
            <>
              <div className="card">
                <h3>
                  {selectedAssignment.assignment.title}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAssignment(null);
                      setTestQuestions([]);
                      setTestAnswers({});
                      setTestStartTime(null);
                    }}
                    style={{ marginLeft: '1rem' }}
                  >
                    Geri
                  </button>
                </h3>
                <p>
                  <strong>Açıklama:</strong>{' '}
                  {selectedAssignment.assignment.description || 'Yok'}
                </p>
                <p>
                  <strong>Bitiş Tarihi:</strong>{' '}
                  {new Date(selectedAssignment.assignment.dueDate).toLocaleString()}
                </p>
                <p>
                  <strong>Puan:</strong> {selectedAssignment.assignment.points}
                </p>
                {selectedAssignment.test && (
                  <div>
                    <h4>Test: {selectedAssignment.test.title}</h4>
                    <p>
                      Toplam {selectedAssignment.test.questionIds.length} soru
                    </p>
                    {testQuestions.length > 0 ? (
                      <div>
                        <h4>Test Soruları</h4>
                        {testQuestions.map((q, idx) => (
                          <div key={q.id} style={{ marginBottom: '1rem' }}>
                            <p>
                              <strong>
                                Soru {idx + 1}: {q.text}
                              </strong>
                            </p>
                            {q.type === 'multiple_choice' && q.choices && (
                              <div>
                                {q.choices.map((choice, ci) => (
                                  <label key={ci} style={{ display: 'block' }}>
                                    <input
                                      type="radio"
                                      name={`q-${q.id}`}
                                      value={choice}
                                      checked={testAnswers[q.id]?.answer === choice}
                                      onChange={() => {
                                        setTestAnswers((prev) => ({
                                          ...prev,
                                          [q.id]: { answer: choice },
                                        }));
                                      }}
                                    />
                                    {choice}
                                  </label>
                                ))}
                              </div>
                            )}
                            {q.type === 'true_false' && (
                              <div>
                                <label style={{ display: 'block' }}>
                                  <input
                                    type="radio"
                                    name={`q-${q.id}`}
                                    value="true"
                                    checked={testAnswers[q.id]?.answer === 'true'}
                                    onChange={() => {
                                      setTestAnswers((prev) => ({
                                        ...prev,
                                        [q.id]: { answer: 'true' },
                                      }));
                                    }}
                                  />
                                  Doğru
                                </label>
                                <label style={{ display: 'block' }}>
                                  <input
                                    type="radio"
                                    name={`q-${q.id}`}
                                    value="false"
                                    checked={testAnswers[q.id]?.answer === 'false'}
                                    onChange={() => {
                                      setTestAnswers((prev) => ({
                                        ...prev,
                                        [q.id]: { answer: 'false' },
                                      }));
                                    }}
                                  />
                                  Yanlış
                                </label>
                              </div>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            handleSubmitTest(selectedAssignment.assignment.id)
                          }
                        >
                          Testi Gönder
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleViewAssignment(selectedAssignment.assignment.id)
                        }
                      >
                        Testi Başlat
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card">
              <h3>Görevlerim</h3>
              <ul>
                {assignments.map((a) => (
                  <li key={a.id}>
                    <strong>{a.title}</strong> – bitiş:{' '}
                    {new Date(a.dueDate).toLocaleString()} – {a.points} puan
                    <button
                      type="button"
                      onClick={() => handleViewAssignment(a.id)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      Detay
                    </button>
                  </li>
                ))}
                {assignments.length === 0 && (
                  <p>Henüz atanmış görev yok.</p>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'contents' && (
        <div className="cards-grid">
          {selectedContent ? (
            <div className="card">
              <h3>
                {selectedContent.title}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedContent(null);
                    if (selectedContent.durationMinutes) {
                      handleUpdateWatchProgress(
                        selectedContent.id,
                        contentWatchSeconds,
                        contentWatchSeconds >=
                          (selectedContent.durationMinutes || 0) * 60,
                      );
                    }
                  }}
                  style={{ marginLeft: '1rem' }}
                >
                  Geri
                </button>
              </h3>
              <p>
                <strong>Tür:</strong> {selectedContent.type}
              </p>
              <p>
                <strong>Konu:</strong> {selectedContent.topic}
              </p>
              <p>
                <strong>Açıklama:</strong>{' '}
                {selectedContent.description || 'Yok'}
              </p>
              {selectedContent.type === 'video' && (
                <div>
                  <p>
                    <strong>Video URL:</strong>{' '}
                    <a
                      href={selectedContent.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {selectedContent.url}
                    </a>
                  </p>
                  <p>
                    İzlenen süre:{' '}
                    {Math.floor(contentWatchSeconds / 60)}:
                    {String(contentWatchSeconds % 60).padStart(2, '0')} /{' '}
                    {selectedContent.durationMinutes || 0} dakika
                  </p>
                  <div style={{ marginTop: '1rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        const newSeconds = Math.min(
                          contentWatchSeconds + 60,
                          (selectedContent.durationMinutes || 0) * 60,
                        );
                        setContentWatchSeconds(newSeconds);
                        handleUpdateWatchProgress(
                          selectedContent.id,
                          newSeconds,
                          newSeconds >=
                            (selectedContent.durationMinutes || 0) * 60,
                        );
                      }}
                    >
                      İzle
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const completed =
                          contentWatchSeconds >=
                          (selectedContent.durationMinutes || 0) * 60;
                        handleUpdateWatchProgress(
                          selectedContent.id,
                          (selectedContent.durationMinutes || 0) * 60,
                          true,
                        );
                        setContentWatchSeconds(
                          (selectedContent.durationMinutes || 0) * 60,
                        );
                        if (completed) {
                          alert('İçerik tamamlandı!');
                        }
                      }}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      Tamamlandı Olarak İşaretle
                    </button>
                  </div>
                </div>
              )}
              {selectedContent.type === 'document' && (
                <div>
                  <p>
                    <strong>Doküman:</strong>{' '}
                    <a
                      href={selectedContent.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      İndir/Görüntüle
                    </a>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="card">
              <h3>Ders İçeriklerim</h3>
              <ul>
                {contents.map((c) => (
                  <li key={c.id}>
                    <strong>{c.title}</strong> – {c.type} – {c.topic} (
                    {c.gradeLevel}. sınıf)
                    <button
                      type="button"
                      onClick={() => handleViewContent(c.id)}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      Aç
                    </button>
                  </li>
                ))}
                {contents.length === 0 && (
                  <p>Henüz atanmış içerik yok.</p>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'todos' && (
        <div className="cards-grid">
          <div className="card">
            <h3>Yeni To-Do Ekle</h3>
            <form onSubmit={handleCreateTodo} className="form">
              <div className="field">
                <span>Başlık</span>
                <input
                  value={newTodo.title}
                  onChange={(e) =>
                    setNewTodo((t) => ({ ...t, title: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Açıklama</span>
                <textarea
                  value={newTodo.description}
                  onChange={(e) =>
                    setNewTodo((t) => ({ ...t, description: e.target.value }))
                  }
                  rows={2}
                />
              </div>
              <div className="field">
                <span>Öncelik</span>
                <select
                  value={newTodo.priority}
                  onChange={(e) =>
                    setNewTodo((t) => ({
                      ...t,
                      priority: e.target.value as 'low' | 'medium' | 'high',
                    }))
                  }
                >
                  <option value="low">Düşük</option>
                  <option value="medium">Orta</option>
                  <option value="high">Yüksek</option>
                </select>
              </div>
              <div className="field">
                <span>Planlanan Tarih</span>
                <input
                  type="date"
                  value={newTodo.plannedDate}
                  onChange={(e) =>
                    setNewTodo((t) => ({ ...t, plannedDate: e.target.value }))
                  }
                />
              </div>
              <button type="submit">Ekle</button>
            </form>
          </div>

          <div className="card">
            <h3>To-Do Listem</h3>
            <ul>
              {todos
                .filter((t) => t.status !== 'completed')
                .map((t) => (
                  <li key={t.id} style={{ marginBottom: '0.5rem' }}>
                    <strong>[{t.status}]</strong> {t.title}{' '}
                    {t.plannedDate && (
                      <span style={{ fontSize: '0.8rem' }}>
                        (Planlanan:{' '}
                        {new Date(t.plannedDate).toLocaleDateString()})
                      </span>
                    )}
                    <div style={{ marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateTodoStatus(
                            t.id,
                            t.status === 'pending'
                              ? 'in_progress'
                              : 'completed',
                          )
                        }
                        style={{ marginRight: '0.25rem' }}
                      >
                        {t.status === 'pending'
                          ? 'Başlat'
                          : t.status === 'in_progress'
                          ? 'Tamamla'
                          : ''}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTodo(t.id)}
                      >
                        Sil
                      </button>
                    </div>
                  </li>
                ))}
              {todos.filter((t) => t.status !== 'completed').length === 0 && (
                <p>Henüz aktif to-do yok.</p>
              )}
            </ul>
            {todos.filter((t) => t.status === 'completed').length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <h4>Tamamlananlar</h4>
                <ul>
                  {todos
                    .filter((t) => t.status === 'completed')
                    .map((t) => (
                      <li key={t.id} style={{ opacity: 0.7 }}>
                        <s>{t.title}</s> –{' '}
                        {t.completedAt &&
                          new Date(t.completedAt).toLocaleDateString()}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'goals' && (
        <div className="cards-grid">
          <div className="card card-form">
            <h3>Yeni Hedef Oluştur</h3>
            <form onSubmit={handleCreateGoal} className="form">
              <div className="field">
                <span>Hedef Tipi</span>
                <select
                  value={newGoal.type}
                  onChange={(e) =>
                    setNewGoal((g) => ({
                      ...g,
                      type: e.target.value as Goal['type'],
                    }))
                  }
                >
                  <option value="weekly_questions">
                    Haftalık Soru Sayısı
                  </option>
                  <option value="weekly_tests">Haftalık Test Sayısı</option>
                  <option value="topic_completion">Konu Tamamlama</option>
                  <option value="score_percent">Başarı Yüzdesi</option>
                </select>
              </div>
              <div className="field">
                <span>Hedef Değeri</span>
                <input
                  type="number"
                  value={newGoal.targetValue}
                  onChange={(e) =>
                    setNewGoal((g) => ({ ...g, targetValue: e.target.value }))
                  }
                  required
                />
              </div>
              {newGoal.type === 'topic_completion' && (
                <div className="field">
                  <span>Konu</span>
                  <input
                    value={newGoal.topic}
                    onChange={(e) =>
                      setNewGoal((g) => ({ ...g, topic: e.target.value }))
                    }
                    required
                  />
                </div>
              )}
              <div className="field">
                <span>Başlangıç Tarihi</span>
                <input
                  type="date"
                  value={newGoal.startDate}
                  onChange={(e) =>
                    setNewGoal((g) => ({ ...g, startDate: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Bitiş Tarihi</span>
                <input
                  type="date"
                  value={newGoal.endDate}
                  onChange={(e) =>
                    setNewGoal((g) => ({ ...g, endDate: e.target.value }))
                  }
                  required
                />
              </div>
              <button type="submit">Hedef Oluştur</button>
            </form>
          </div>

          <div className="card">
            <h3>Hedeflerim</h3>
            <ul>
              {goals.map((g) => (
                <li key={g.id} style={{ marginBottom: '0.5rem' }}>
                  <strong>
                    {g.type === 'weekly_questions'
                      ? 'Haftalık Soru'
                      : g.type === 'weekly_tests'
                      ? 'Haftalık Test'
                      : g.type === 'topic_completion'
                      ? 'Konu Tamamlama'
                      : 'Başarı Yüzdesi'}
                  </strong>
                  : {g.currentValue || 0} / {g.targetValue} (
                  {g.progressPercent || 0}%)
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Durum: {g.status === 'active' ? 'Aktif' : g.status === 'completed' ? 'Tamamlandı' : g.status === 'failed' ? 'Başarısız' : 'İptal'}
                    {g.topic && ` - Konu: ${g.topic}`}
                  </div>
                </li>
              ))}
              {goals.length === 0 && <p>Henüz hedef oluşturmadınız.</p>}
            </ul>
          </div>
        </div>
      )}

      {tab === 'progress' && (
        <div className="cards-grid">
          <div className="card">
            <h3>Genel İlerleme Özeti</h3>
            {!progressOverview && <p>Yükleniyor...</p>}
            {progressOverview && (
              <>
                <p>
                  <strong>Genel Tamamlama:</strong>{' '}
                  %{progressOverview.overallCompletionPercent}
                </p>
                <p>
                  <strong>Toplam Çözülen Test:</strong>{' '}
                  {progressOverview.totalTestsCompleted}
                </p>
                <p>
                  <strong>Toplam Çözülen Soru:</strong>{' '}
                  {progressOverview.totalQuestionsSolved}
                </p>
                <p>
                  <strong>Ortalama Başarı:</strong>{' '}
                  %{progressOverview.averageScorePercent}
                </p>
              </>
            )}
          </div>

          <div className="card">
            <h3>Konu Bazlı İlerleme</h3>
            {progressOverview && progressOverview.topics.length === 0 && (
              <p>Henüz ilerleme verisi yok.</p>
            )}
            {progressOverview && progressOverview.topics.length > 0 && (
              <ul>
                {progressOverview.topics.map((t) => (
                  <li key={t.topic}>
                    <strong>
                      {t.subjectName} – {t.topic}
                    </strong>{' '}
                    (%{t.completionPercent} tamamlandı, ortalama
                    %{t.averageScorePercent},{' '}
                    {t.strengthLevel === 'weak'
                      ? 'Zayıf'
                      : t.strengthLevel === 'strong'
                      ? 'Güçlü'
                      : 'Orta'}
                    )
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3>Son 7 Gün Aktivite</h3>
            {!progressCharts && <p>Yükleniyor...</p>}
            {progressCharts && (
              <ul>
                {progressCharts.dailyData.map((d) => (
                  <li key={d.date}>
                    {d.date}: {d.questionsSolved} soru, {d.testsCompleted}{' '}
                    test, ort. skor %{d.averageScore}, çalışma süresi{' '}
                    {d.studyMinutes} dk
                  </li>
                ))}
                {progressCharts.dailyData.length === 0 && (
                  <p>Henüz aktivite verisi yok.</p>
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'messages' && (
        <div className="cards-grid">
          <div className="card">
            <h3>Mesaj Gönder</h3>
            <form onSubmit={handleSendMessage} className="form">
              <div className="field">
                <span>Öğretmen</span>
                <select
                  value={newMessage.toUserId}
                  onChange={(e) =>
                    setNewMessage((m) => ({
                      ...m,
                      toUserId: e.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Öğretmen Seçin</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span>Mesaj</span>
                <textarea
                  value={newMessage.text}
                  onChange={(e) =>
                    setNewMessage((m) => ({ ...m, text: e.target.value }))
                  }
                  rows={3}
                  style={{ resize: 'vertical' }}
                  required
                />
              </div>
              <button type="submit">Gönder</button>
            </form>
          </div>

          <div className="card">
            <h3>Mesaj Geçmişi</h3>
            <ul>
              {messages.map((m) => (
                <li key={m.id}>
                  <strong>{m.fromUserId}</strong> → {m.toUserId} : {m.text}
                </li>
              ))}
              {messages.length === 0 && <p>Henüz mesaj yok.</p>}
            </ul>
          </div>
        </div>
      )}

      {tab === 'meetings' && (
        <div className="card">
          <h3>Toplantılarım</h3>
          <ul>
            {meetings.map((mt) => (
              <li key={mt.id}>
                <strong>{mt.title}</strong> –{' '}
                {new Date(mt.scheduledAt).toLocaleString()} –{' '}
                {mt.durationMinutes} dk –{' '}
                <a href={mt.meetingUrl} target="_blank" rel="noreferrer">
                  Katıl
                </a>
              </li>
            ))}
            {meetings.length === 0 && <p>Henüz toplantı yok.</p>}
          </ul>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
            }}
          >
            <h3>Bildirimlerim</h3>
            <button
              type="button"
              onClick={handleMarkAllNotificationsRead}
              disabled={unreadNotificationCount === 0}
            >
              Tümünü okundu işaretle
            </button>
          </div>
          <ul>
            {notifications.map((n) => (
              <li
                key={n.id}
                style={{
                  opacity: n.read ? 0.7 : 1,
                  fontWeight: n.read ? 'normal' : 'bold',
                }}
              >
                <span>
                  {n.title} – {n.body}
                </span>
                <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
            {notifications.length === 0 && <p>Henüz bildirim yok.</p>}
          </ul>
        </div>
      )}

      {tab === 'calendar' && <CalendarView role="student" />}
    </div>
  );
};


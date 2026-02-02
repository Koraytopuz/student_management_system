import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';
import { CalendarView } from './CalendarView';

interface TeacherDashboardSummary {
  totalStudents: number;
  testsAssignedThisWeek: number;
  averageScoreLast7Days: number;
  recentActivity: string[];
}

interface ContentItem {
  id: string;
  title: string;
  type: string;
  topic: string;
  gradeLevel: string;
}

interface TestItem {
  id: string;
  title: string;
  topic: string;
}

interface Assignment {
  id: string;
  title: string;
  dueDate: string;
  points: number;
  testId?: string;
  contentId?: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
}

interface StudentDetail {
  student: Student;
  assignments: Assignment[];
  results: {
    id: string;
    testId: string;
    scorePercent: number;
    completedAt: string;
  }[];
  watchRecords: {
    id: string;
    contentId: string;
    watchedSeconds: number;
    completed: boolean;
  }[];
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
}

type TabKey =
  | 'overview'
  | 'contents'
  | 'tests'
  | 'students'
  | 'messages'
  | 'meetings'
  | 'calendar';

export const TeacherDashboard: React.FC = () => {
  const { token } = useAuth();
  const [summary, setSummary] = useState<TeacherDashboardSummary | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [error, setError] = useState<string | null>(null);

  const [contents, setContents] = useState<ContentItem[]>([]);
  const [tests, setTests] = useState<TestItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [parents, setParents] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentDetail | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showStudentList, setShowStudentList] = useState(false);
  const [showParentList, setShowParentList] = useState(false);

  const [newContent, setNewContent] = useState({
    title: '',
    type: 'video',
    topic: '',
    gradeLevel: '',
    subjectId: 'sub1',
    url: '',
    tags: '',
  });

  const [newTest, setNewTest] = useState({
    title: '',
    topic: '',
    subjectId: 'sub1',
  });

  const [newAssignment, setNewAssignment] = useState({
    title: '',
    testId: '',
    dueDate: '',
    points: 100,
  });

  const [newMessage, setNewMessage] = useState({
    toUserId: '',
    text: '',
  });

  const [newMeeting, setNewMeeting] = useState({
    title: '',
    scheduledAt: '',
    durationMinutes: 45,
    meetingUrl: '',
  });

  useEffect(() => {
    if (!token) return;
    setError(null);

    apiRequest<TeacherDashboardSummary>('/teacher/dashboard', {}, token)
      .then(setSummary)
      .catch((e) => setError(e.message));

    // Öğretmenin tüm yardımcı verilerini paralel çekelim
    Promise.all([
      apiRequest<ContentItem[]>('/teacher/contents', {}, token),
      apiRequest<TestItem[]>('/teacher/tests', {}, token),
      apiRequest<Assignment[]>('/teacher/assignments', {}, token),
      apiRequest<Student[]>('/teacher/students', {}, token),
      apiRequest<Message[]>('/teacher/messages', {}, token),
      apiRequest<Meeting[]>('/teacher/meetings', {}, token),
      apiRequest<{ id: string; name: string; email: string }[]>('/teacher/parents', {}, token),
    ])
      .then(([c, t, a, s, m, mt, p]) => {
        setContents(c);
        setTests(t);
        setAssignments(a);
        setStudents(s);
        setMessages(m);
        setMeetings(mt);
        setParents(p);
      })
      .catch((e) => setError(e.message));
  }, [token]);

  async function refreshStudents() {
    if (!token) return;
    const s = await apiRequest<Student[]>('/teacher/students', {}, token);
    setStudents(s);
  }

  async function handleSelectStudent(id: string) {
    if (!token) return;
    try {
      const detail = await apiRequest<StudentDetail>(
        `/teacher/students/${id}`,
        {},
        token,
      );
      setSelectedStudent(detail);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddContent(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<ContentItem>(
        '/teacher/contents',
        {
          method: 'POST',
          body: JSON.stringify({
            title: newContent.title,
            type: newContent.type,
            subjectId: newContent.subjectId,
            topic: newContent.topic,
            gradeLevel: newContent.gradeLevel,
            url: newContent.url,
            tags: newContent.tags,
          }),
        },
        token,
      );
      setContents((prev) => [...prev, created]);
      setNewContent({
        title: '',
        type: 'video',
        topic: '',
        gradeLevel: '',
        subjectId: 'sub1',
        url: '',
        tags: '',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddTest(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<TestItem>(
        '/teacher/tests',
        {
          method: 'POST',
          body: JSON.stringify({
            title: newTest.title,
            subjectId: newTest.subjectId,
            topic: newTest.topic,
          }),
        },
        token,
      );
      setTests((prev) => [...prev, created]);
      setNewTest({
        title: '',
        topic: '',
        subjectId: 'sub1',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleAddAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<Assignment>(
        '/teacher/assignments',
        {
          method: 'POST',
          body: JSON.stringify({
            title: newAssignment.title,
            testId: newAssignment.testId,
            dueDate: newAssignment.dueDate,
            points: Number(newAssignment.points),
          }),
        },
        token,
      );
      setAssignments((prev) => [...prev, created]);
      setNewAssignment({
        title: '',
        testId: '',
        dueDate: '',
        points: 100,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<Message>(
        '/teacher/messages',
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

  async function handleCreateMeeting(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const created = await apiRequest<Meeting>(
        '/teacher/meetings',
        {
          method: 'POST',
          body: JSON.stringify({
            type: 'class',
            title: newMeeting.title,
            scheduledAt: newMeeting.scheduledAt,
            durationMinutes: Number(newMeeting.durationMinutes),
            meetingUrl: newMeeting.meetingUrl,
          }),
        },
        token,
      );
      setMeetings((prev) => [...prev, created]);
      setNewMeeting({
        title: '',
        scheduledAt: '',
        durationMinutes: 45,
        meetingUrl: '',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!token) {
    return <div>Önce giriş yapmalısınız.</div>;
  }

  return (
    <div className="panel">
      <h2>Öğretmen Paneli</h2>
      {error && <div className="error">{error}</div>}

      <div className="role-selector" style={{ marginBottom: '1rem' }}>
        {[
          { key: 'overview', label: 'Genel Bakış' },
          { key: 'contents', label: 'Ders İçeriği' },
          { key: 'tests', label: 'Test / Görev' },
          { key: 'students', label: 'Öğrenci İzleme' },
          { key: 'messages', label: 'Mesajlaşma' },
          { key: 'meetings', label: 'Toplantılar' },
          { key: 'calendar', label: 'Takvim' },
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
                <div className="stat-card">
                  <span className="stat-label">Toplam Öğrenci</span>
                  <span className="stat-value">{summary.totalStudents}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Bu Hafta Atanan Test</span>
                  <span className="stat-value">
                    {summary.testsAssignedThisWeek}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Son 7 Gün Ortalama Skor</span>
                  <span className="stat-value">
                    %{summary.averageScoreLast7Days}
                  </span>
                </div>
              </div>

              <div className="card">
                <h3>Son Etkinlikler</h3>
                {summary.recentActivity.length === 0 ? (
                  <p>Henüz etkinlik yok.</p>
                ) : (
                  <ul>
                    {summary.recentActivity.map((a, idx) => (
                      <li key={idx}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'contents' && (
        <div className="cards-grid">
          <div className="card">
            <h3>Yeni Ders İçeriği Oluştur</h3>
            <form onSubmit={handleAddContent} className="form">
              <div className="field">
                <span>Başlık</span>
                <input
                  value={newContent.title}
                  onChange={(e) =>
                    setNewContent((c) => ({ ...c, title: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Tür</span>
                <select
                  value={newContent.type}
                  onChange={(e) =>
                    setNewContent((c) => ({ ...c, type: e.target.value }))
                  }
                >
                  <option value="video">Video</option>
                  <option value="audio">Ses</option>
                  <option value="document">Doküman</option>
                </select>
              </div>
              <div className="field">
                <span>Konu</span>
                <input
                  value={newContent.topic}
                  onChange={(e) =>
                    setNewContent((c) => ({ ...c, topic: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Sınıf Düzeyi</span>
                <input
                  value={newContent.gradeLevel}
                  onChange={(e) =>
                    setNewContent((c) => ({
                      ...c,
                      gradeLevel: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>URL</span>
                <input
                  value={newContent.url}
                  onChange={(e) =>
                    setNewContent((c) => ({ ...c, url: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Etiketler (virgülle)</span>
                <input
                  value={newContent.tags}
                  onChange={(e) =>
                    setNewContent((c) => ({ ...c, tags: e.target.value }))
                  }
                />
              </div>
              <button type="submit">İçerik Oluştur</button>
            </form>
          </div>

          <div className="card">
            <h3>Ders İçerikleri</h3>
            <ul>
              {contents.map((c) => (
                <li key={c.id}>
                  <strong>{c.title}</strong> – {c.type} – {c.topic} (
                  {c.gradeLevel}. sınıf)
                </li>
              ))}
              {contents.length === 0 && <p>Henüz içerik yok.</p>}
            </ul>
          </div>
        </div>
      )}

      {tab === 'tests' && (
        <div className="cards-grid">
          <div className="card">
            <h3>Yeni Test Oluştur</h3>
            <form onSubmit={handleAddTest} className="form">
              <div className="field">
                <span>Başlık</span>
                <input
                  value={newTest.title}
                  onChange={(e) =>
                    setNewTest((t) => ({ ...t, title: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Konu</span>
                <input
                  value={newTest.topic}
                  onChange={(e) =>
                    setNewTest((t) => ({ ...t, topic: e.target.value }))
                  }
                  required
                />
              </div>
              <button type="submit">Test Oluştur</button>
            </form>
          </div>

          <div className="card">
            <h3>Yeni Görev / Assignment</h3>
            <form onSubmit={handleAddAssignment} className="form">
              <div className="field">
                <span>Başlık</span>
                <input
                  value={newAssignment.title}
                  onChange={(e) =>
                    setNewAssignment((a) => ({ ...a, title: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Test</span>
                <select
                  value={newAssignment.testId}
                  onChange={(e) =>
                    setNewAssignment((a) => ({
                      ...a,
                      testId: e.target.value,
                    }))
                  }
                  required
                >
                  <option value="">Seçin</option>
                  {tests.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span>Bitiş Tarihi</span>
                <input
                  type="datetime-local"
                  value={newAssignment.dueDate}
                  onChange={(e) =>
                    setNewAssignment((a) => ({
                      ...a,
                      dueDate: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Puan</span>
                <input
                  type="number"
                  value={newAssignment.points}
                  onChange={(e) =>
                    setNewAssignment((a) => ({
                      ...a,
                      points: Number(e.target.value),
                    }))
                  }
                  required
                />
              </div>
              <button type="submit">Görev Oluştur</button>
            </form>
          </div>

          <div className="card">
            <h3>Görevler</h3>
            <ul>
              {assignments.map((a) => (
                <li key={a.id}>
                  <strong>{a.title}</strong> – bitiş:{' '}
                  {new Date(a.dueDate).toLocaleString()} – {a.points} puan
                </li>
              ))}
              {assignments.length === 0 && <p>Henüz görev yok.</p>}
            </ul>
          </div>
        </div>
      )}

      {tab === 'students' && (
        <div className="cards-grid">
          <div className="card">
            <h3>Öğrenci Listesi</h3>
            <button
              type="button"
              onClick={refreshStudents}
              style={{ marginBottom: '0.5rem' }}
            >
              Yenile
            </button>
            <ul>
              {students.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="role-btn"
                    onClick={() => handleSelectStudent(s.id)}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
              {students.length === 0 && <p>Henüz öğrenci yok.</p>}
            </ul>
          </div>

          <div className="card">
            <h3>Öğrenci Detayı</h3>
            {!selectedStudent && <p>Soldan bir öğrenci seçin.</p>}
            {selectedStudent && (
              <>
                <p>
                  <strong>{selectedStudent.student.name}</strong> –{' '}
                  {selectedStudent.student.email}
                </p>
                <h4>Test Sonuçları</h4>
                <ul>
                  {selectedStudent.results.map((r) => (
                    <li key={r.id}>
                      Test {r.testId}: %{r.scorePercent} –{' '}
                      {new Date(r.completedAt).toLocaleString()}
                    </li>
                  ))}
                  {selectedStudent.results.length === 0 && (
                    <p>Bu öğrenci için henüz test sonucu yok.</p>
                  )}
                </ul>

                <h4>İzlenen İçerikler</h4>
                <ul>
                  {selectedStudent.watchRecords.map((w) => (
                    <li key={w.id}>
                      İçerik {w.contentId}: {(w.watchedSeconds / 60).toFixed(1)}{' '}
                      dk – {w.completed ? 'Tamamlandı' : 'Devam ediyor'}
                    </li>
                  ))}
                  {selectedStudent.watchRecords.length === 0 && (
                    <p>Henüz izlenme kaydı yok.</p>
                  )}
                </ul>
              </>
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
                <span>Hedef Kullanıcı</span>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowStudentList(!showStudentList);
                      setShowParentList(false);
                    }}
                    className={showStudentList ? 'role-btn active' : 'role-btn'}
                    style={{ flex: 1 }}
                  >
                    Öğrenci
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowParentList(!showParentList);
                      setShowStudentList(false);
                    }}
                    className={showParentList ? 'role-btn active' : 'role-btn'}
                    style={{ flex: 1 }}
                  >
                    Veli
                  </button>
                </div>
                {showStudentList && (
                  <div
                    style={{
                      border: '1px solid var(--color-border, #ddd)',
                      borderRadius: '4px',
                      padding: '0.5rem',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: 'var(--color-bg, white)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {students.length === 0 ? (
                      <p style={{ margin: 0, color: 'var(--color-text-muted, #666)' }}>
                        Öğrenci bulunamadı.
                      </p>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {students.map((student) => (
                          <li key={student.id} style={{ marginBottom: '0.25rem' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setNewMessage((m) => ({ ...m, toUserId: student.id }));
                                setShowStudentList(false);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '0.75rem',
                                background: newMessage.toUserId === student.id ? 'var(--color-primary-light, #e3f2fd)' : 'transparent',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                whiteSpace: 'normal',
                                wordBreak: 'break-word',
                                overflow: 'visible',
                                fontSize: '0.875rem',
                                lineHeight: '1.5',
                              }}
                            >
                              <div style={{ fontWeight: '500' }}>{student.name}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #666)', marginTop: '0.25rem' }}>
                                {student.email}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {showParentList && (
                  <div
                    style={{
                      border: '1px solid var(--color-border, #ddd)',
                      borderRadius: '4px',
                      padding: '0.5rem',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      background: 'var(--color-bg, white)',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {parents.length === 0 ? (
                      <p style={{ margin: 0, color: 'var(--color-text-muted, #666)' }}>
                        Veli bulunamadı.
                      </p>
                    ) : (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {parents.map((parent) => (
                          <li key={parent.id} style={{ marginBottom: '0.25rem' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setNewMessage((m) => ({ ...m, toUserId: parent.id }));
                                setShowParentList(false);
                              }}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '0.75rem',
                                background: newMessage.toUserId === parent.id ? 'var(--color-primary-light, #e3f2fd)' : 'transparent',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                whiteSpace: 'normal',
                                wordBreak: 'break-word',
                                overflow: 'visible',
                                fontSize: '0.875rem',
                                lineHeight: '1.5',
                              }}
                            >
                              <div style={{ fontWeight: '500' }}>{parent.name}</div>
                              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #666)', marginTop: '0.25rem' }}>
                                {parent.email}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {newMessage.toUserId && (
                  <div
                    style={{
                      padding: '0.75rem',
                      background: 'var(--color-bg-secondary, #f5f5f5)',
                      borderRadius: '4px',
                      marginBottom: '0.5rem',
                      fontSize: '0.875rem',
                      wordBreak: 'break-word',
                      overflow: 'visible',
                    }}
                  >
                    <div style={{ marginBottom: '0.25rem' }}>
                      <strong>Seçilen:</strong>{' '}
                      {students.find((s) => s.id === newMessage.toUserId)?.name ||
                        parents.find((p) => p.id === newMessage.toUserId)?.name ||
                        newMessage.toUserId}
                    </div>
                    {(students.find((s) => s.id === newMessage.toUserId)?.email ||
                      parents.find((p) => p.id === newMessage.toUserId)?.email) && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #666)' }}>
                        {students.find((s) => s.id === newMessage.toUserId)?.email ||
                          parents.find((p) => p.id === newMessage.toUserId)?.email}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setNewMessage((m) => ({ ...m, toUserId: '' }))}
                      style={{
                        marginTop: '0.5rem',
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-error, #e74c3c)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        fontSize: '0.875rem',
                      }}
                    >
                      Temizle
                    </button>
                  </div>
                )}
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
              <button type="submit" disabled={!newMessage.toUserId}>Gönder</button>
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
        <div className="cards-grid">
          <div className="card">
            <h3>Toplantı Planla</h3>
            <form onSubmit={handleCreateMeeting} className="form">
              <div className="field">
                <span>Başlık</span>
                <input
                  value={newMeeting.title}
                  onChange={(e) =>
                    setNewMeeting((m) => ({ ...m, title: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Tarih / Saat</span>
                <input
                  type="datetime-local"
                  value={newMeeting.scheduledAt}
                  onChange={(e) =>
                    setNewMeeting((m) => ({
                      ...m,
                      scheduledAt: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Süre (dk)</span>
                <input
                  type="number"
                  value={newMeeting.durationMinutes}
                  onChange={(e) =>
                    setNewMeeting((m) => ({
                      ...m,
                      durationMinutes: Number(e.target.value),
                    }))
                  }
                  required
                />
              </div>
              <div className="field">
                <span>Toplantı Linki</span>
                <input
                  value={newMeeting.meetingUrl}
                  onChange={(e) =>
                    setNewMeeting((m) => ({
                      ...m,
                      meetingUrl: e.target.value,
                    }))
                  }
                  required
                />
              </div>
              <button type="submit">Toplantı Oluştur</button>
            </form>
          </div>

          <div className="card">
            <h3>Toplantılar</h3>
            <ul>
              {meetings.map((mt) => (
                <li key={mt.id}>
                  <strong>{mt.title}</strong> –{' '}
                  {new Date(mt.scheduledAt).toLocaleString()} –{' '}
                  {mt.durationMinutes} dk
                </li>
              ))}
              {meetings.length === 0 && <p>Henüz toplantı yok.</p>}
            </ul>
          </div>
        </div>
      )}

      {tab === 'calendar' && <CalendarView role="teacher" />}
    </div>
  );
};


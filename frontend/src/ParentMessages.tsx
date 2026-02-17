import React, { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { useAuth } from './AuthContext';

interface Message {
  id: string;
  fromUserId: string;
  toUserId: string;
  studentId?: string;
  subject?: string;
  text: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
}

interface Conversation {
  userId: string;
  userName: string;
  userRole: string;
  studentId?: string;
  studentName?: string;
  lastMessage?: Message;
  unreadCount: number;
}

interface ParentDashboardSummaryStudentCard {
  studentId: string;
  studentName: string;
}

export const ParentMessages: React.FC = () => {
  const { token, user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [students, setStudents] = useState<ParentDashboardSummaryStudentCard[]>([]);
  const [newMessage, setNewMessage] = useState({
    toUserId: '',
    text: '',
    studentId: '',
    subject: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageFeedback, setMessageFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    // Öğrenci listesini al
    apiRequest<{ children: ParentDashboardSummaryStudentCard[] }>('/parent/dashboard', {}, token)
      .then((data) => setStudents(data.children))
      .catch((e) => setError(e.message));

    // Konuşmaları al
    apiRequest<Conversation[]>('/parent/messages/conversations', {}, token)
      .then(setConversations)
      .catch((e) => setError(e.message));
  }, [token]);

  useEffect(() => {
    if (!token || !selectedConversation) return;
    // Seçili konuşmanın mesajlarını al
    apiRequest<Message[]>(
      `/parent/messages/conversation/${selectedConversation}`,
      {},
      token,
    )
      .then((msgs) => {
        setMessages(msgs);
        // Okunmamış mesajları okundu olarak işaretle
        msgs
          .filter((m) => !m.read && m.toUserId === user?.id)
          .forEach((m) => {
            apiRequest(
              `/parent/messages/${m.id}/read`,
              { method: 'PUT' },
              token,
            ).catch(() => {});
          });
      })
      .catch((e) => setError(e.message));
  }, [token, selectedConversation, user]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newMessage.toUserId || !newMessage.text) return;

    setLoading(true);
    setError(null);

    try {
      const created = await apiRequest<Message>(
        '/parent/messages',
        {
          method: 'POST',
          body: JSON.stringify({
            toUserId: newMessage.toUserId,
            text: newMessage.text,
            studentId: newMessage.studentId || undefined,
            subject: newMessage.subject || undefined,
          }),
        },
        token,
      );
      setMessages((prev) => [...prev, created]);
      setNewMessage({ toUserId: '', text: '', studentId: '', subject: '' });
      setMessageFeedback('Mesaj iletildi.');
      window.setTimeout(() => setMessageFeedback(null), 4000);
      apiRequest<Conversation[]>('/parent/messages/conversations', {}, token)
        .then(setConversations)
        .catch(() => {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const selectedConversationData = conversations.find(
    (c) => c.userId === selectedConversation,
  );

  if (!token) {
    return <div>Önce giriş yapmalısınız.</div>;
  }

  return (
    <div className="panel">
      <h2>Mesajlar</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '300px 1fr',
          gap: '1.5rem',
          height: '600px',
        }}
      >
        {/* Konuşma Listesi */}
        <div
          className="card"
          style={{
            overflowY: 'auto',
            padding: '0',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '1rem',
              borderBottom: '1px solid var(--color-border-subtle)',
              position: 'sticky',
              top: 0,
              background: 'var(--color-surface)',
            }}
          >
            <h3 style={{ margin: 0 }}>Konuşmalar</h3>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <p style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                Henüz konuşma yok
              </p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.userId}
                  onClick={() => setSelectedConversation(conv.userId)}
                  style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    cursor: 'pointer',
                    background:
                      selectedConversation === conv.userId
                        ? 'var(--color-primary-soft)'
                        : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{conv.userName}</div>
                      {conv.studentName && (
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                          {conv.studentName}
                        </div>
                      )}
                      {conv.lastMessage && (
                        <div
                          style={{
                            fontSize: '0.875rem',
                            color: 'var(--color-text-muted)',
                            marginTop: '0.25rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {conv.lastMessage.text.substring(0, 50)}
                          {conv.lastMessage.text.length > 50 ? '...' : ''}
                        </div>
                      )}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span
                        className="badge badge-error"
                        style={{
                          minWidth: '20px',
                          textAlign: 'center',
                          padding: '0.25rem 0.5rem',
                        }}
                      >
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Mesaj Görüntüleme ve Gönderme */}
        <div
          className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '0',
          }}
        >
          {selectedConversation ? (
            <>
              <div
                style={{
                  padding: '1rem',
                  borderBottom: '1px solid var(--color-border-subtle)',
                }}
              >
                <h3 style={{ margin: 0 }}>
                  {selectedConversationData?.userName}
                  {selectedConversationData?.studentName && (
                    <span style={{ fontSize: '0.875rem', fontWeight: 'normal', color: 'var(--color-text-muted)' }}>
                      {' '}
                      - {selectedConversationData.studentName}
                    </span>
                  )}
                </h3>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                {messages.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Henüz mesaj yok
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isFromMe = msg.fromUserId === user?.id;
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: 'flex',
                          justifyContent: isFromMe ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '70%',
                            padding: '0.75rem 1rem',
                            borderRadius: '12px',
                            background: isFromMe
                              ? 'var(--color-primary)'
                              : 'var(--color-surface-soft)',
                            color: isFromMe ? 'white' : 'var(--color-text-main)',
                          }}
                        >
                          {msg.subject && (
                            <div
                              style={{
                                fontSize: '0.875rem',
                                fontWeight: 600,
                                marginBottom: '0.25rem',
                                opacity: 0.9,
                              }}
                            >
                              {msg.subject}
                            </div>
                          )}
                          <div>{msg.text}</div>
                          <div
                            style={{
                              fontSize: '0.75rem',
                              marginTop: '0.25rem',
                              opacity: 0.7,
                            }}
                          >
                            {new Date(msg.createdAt).toLocaleString('tr-TR')}
                            {msg.read && isFromMe && (
                              <span style={{ marginLeft: '0.5rem' }}>✓</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div
                style={{
                  padding: '1rem',
                  borderTop: '1px solid var(--color-border-subtle)',
                }}
              >
                {error && <div className="error" style={{ marginBottom: '0.5rem' }}>{error}</div>}
                {messageFeedback && (
                  <div
                    role="status"
                    style={{
                      marginBottom: '0.5rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 8,
                      fontSize: '0.875rem',
                      background: 'var(--color-surface-soft)',
                      color: 'var(--color-text-main)',
                      border: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {messageFeedback}
                  </div>
                )}
                <form onSubmit={handleSendMessage}>
                  {students.length > 0 && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
                        Hangi öğrenci için:
                      </label>
                      <select
                        value={newMessage.studentId}
                        onChange={(e) => setNewMessage({ ...newMessage, studentId: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        <option value="">Genel</option>
                        {students.map((s) => (
                          <option key={s.studentId} value={s.studentId}>
                            {s.studentName}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{ marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Konu (opsiyonel)"
                      value={newMessage.subject}
                      onChange={(e) => setNewMessage({ ...newMessage, subject: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <textarea
                      value={newMessage.text}
                      onChange={(e) => setNewMessage({ ...newMessage, text: e.target.value })}
                      placeholder="Mesajınızı yazın..."
                      required
                      rows={3}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border-subtle)',
                        resize: 'vertical',
                      }}
                    />
                    <button type="submit" className="primary-btn" disabled={loading || !newMessage.text}>
                      {loading ? 'Gönderiliyor...' : 'Gönder'}
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-muted)',
              }}
            >
              Bir konuşma seçin
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

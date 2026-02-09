import React, { useEffect, useState } from 'react';
import { CalendarCheck, MessageCircle, Send, Users } from 'lucide-react';
import {
  createTeacherFeedback,
  getTeacherParents,
  sendTeacherMessage,
  type TeacherStudent,
} from './api';
import { GlassCard } from './components/DashboardPrimitives';

type ParentOperationsTabProps = {
  token: string | null;
  students: TeacherStudent[];
};

export const ParentOperationsTab: React.FC<ParentOperationsTabProps> = ({ token, students }) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id ?? '');

  // Veli notu taslağı
  const [feedbackDraft, setFeedbackDraft] = useState({
    type: 'general_feedback',
    title: '',
    content: '',
  });
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Veli mesajı durumu
  const [parents, setParents] = useState<
    { id: string; name: string; email: string; role: 'parent'; studentIds: string[] }[]
  >([]);
  const [parentLoading, setParentLoading] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [parentMessageText, setParentMessageText] = useState('');
  const [sendingParentMessage, setSendingParentMessage] = useState(false);

  // Öğrenci listesi değiştiğinde varsayılan seçim
  useEffect(() => {
    if (!selectedStudentId && students[0]) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  // Velileri yükle
  useEffect(() => {
    if (!token) return;
    setParentLoading(true);
    getTeacherParents(token)
      .then((data) => setParents(data))
      .catch(() => {})
      .finally(() => setParentLoading(false));
  }, [token]);

  useEffect(() => {
    // Öğrenci değişince seçili veli ve mesajı sıfırla
    setSelectedParentId('');
    setParentMessageText('');
  }, [selectedStudentId]);

  const handleCreateFeedback = async () => {
    if (!token || !selectedStudentId) return;
    const title = feedbackDraft.title.trim();
    const content = feedbackDraft.content.trim();
    if (!title || !content) {
      setFeedbackError('Lütfen başlık ve içerik girin.');
      return;
    }
    setFeedbackSaving(true);
    setFeedbackError(null);
    try {
      await createTeacherFeedback(token, {
        studentId: selectedStudentId,
        type: feedbackDraft.type,
        title,
        content,
      });
      setFeedbackDraft({ type: 'general_feedback', title: '', content: '' });
      // eslint-disable-next-line no-alert
      alert('Değerlendirme kaydedildi. Sadece veli panelinde görüntülenir.');
    } catch (e) {
      setFeedbackError(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setFeedbackSaving(false);
    }
  };

  const handleSendParentMessage = async () => {
    if (!token || !selectedStudentId || !selectedParentId || !parentMessageText.trim()) return;
    setSendingParentMessage(true);
    try {
      const studentName = students.find((s) => s.id === selectedStudentId)?.name ?? 'Öğrenci';
      await sendTeacherMessage(token, {
        toUserId: selectedParentId,
        text: parentMessageText.trim(),
        studentId: selectedStudentId,
        subject: `Öğrenci hakkında mesaj (${studentName})`,
      });
      setParentMessageText('');
      setSelectedParentId('');
      // eslint-disable-next-line no-alert
      alert('Veliye mesaj gönderildi.');
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e instanceof Error ? e.message : 'Mesaj gönderilemedi.');
    } finally {
      setSendingParentMessage(false);
    }
  };

  const parentsOfStudent = parents.filter((p) => p.studentIds.includes(selectedStudentId));

  return (
    <div className="page-grid">
      <div className="page-main">
        <GlassCard
          title="Veli İşlemleri"
          subtitle="Veliye özel değerlendirmeler ve birebir mesajlar"
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1.6fr)',
              gap: '1.25rem',
            }}
          >
            {/* Sol: Öğrenci seçimi ve veli notu */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ marginBottom: '0.25rem' }}>
                <div
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: 'var(--color-text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.25rem',
                  }}
                >
                  <Users size={16} />
                  <span>Öğrenci seçin</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  Veli işlemleri bu öğrenci ile ilişkilendirilecektir.
                </div>
              </div>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.9rem',
                  fontSize: '0.9rem',
                  borderRadius: 8,
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-main)',
                  cursor: 'pointer',
                }}
              >
                <option value="">
                  {students.length === 0 ? 'Öğrenci bulunamadı' : 'Öğrenci seçin'}
                </option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.gradeLevel ? `— ${s.gradeLevel}. Sınıf` : ''}
                  </option>
                ))}
              </select>

              <div
                style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  borderRadius: 8,
                  background: 'var(--color-surface-subtle, rgba(255,255,255,0.04))',
                  border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
                }}
              >
                <div
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: 'var(--color-text-main)',
                    marginBottom: '0.25rem',
                  }}
                >
                  Veliye Özel Notlar
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--color-text-muted)',
                    marginBottom: '0.75rem',
                  }}
                >
                  Sadece veli panelinde görünür; öğrenci bu notları görmez.
                </div>
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  <select
                    value={feedbackDraft.type}
                    onChange={(e) =>
                      setFeedbackDraft((p) => ({
                        ...p,
                        type: e.target.value,
                      }))
                    }
                  >
                    <option value="general_feedback">Genel değerlendirme</option>
                    <option value="performance_note">Performans notu</option>
                    <option value="test_feedback">Test değerlendirmesi</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Başlık"
                    value={feedbackDraft.title}
                    onChange={(e) =>
                      setFeedbackDraft((p) => ({
                        ...p,
                        title: e.target.value,
                      }))
                    }
                  />
                  <textarea
                    placeholder="Değerlendirme içeriği (veli görecek)"
                    value={feedbackDraft.content}
                    onChange={(e) =>
                      setFeedbackDraft((p) => ({
                        ...p,
                        content: e.target.value,
                      }))
                    }
                    rows={4}
                    style={{ resize: 'vertical', minHeight: 100 }}
                  />
                  {feedbackError && (
                    <div style={{ color: '#f97316', fontSize: '0.85rem' }}>{feedbackError}</div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="primary-btn"
                      onClick={handleCreateFeedback}
                      disabled={feedbackSaving || !selectedStudentId}
                    >
                      {feedbackSaving ? 'Kaydediliyor...' : 'Değerlendirmeyi Kaydet'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Sağ: Veliye mesaj gönder */}
            <div
              style={{
                padding: '1rem',
                borderRadius: 8,
                background: 'var(--color-surface-subtle, rgba(255,255,255,0.04))',
                border: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.25rem',
                }}
              >
                <MessageCircle size={18} style={{ color: 'var(--color-primary)' }} />
                <span
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: 'var(--color-text-main)',
                  }}
                >
                  Veliye mesaj gönder
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                Mesaj otomatik olarak seçili öğrenci ile ilişkilendirilir.
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    color: 'var(--color-text-muted)',
                    marginBottom: '0.4rem',
                  }}
                >
                  Veli seçin
                </label>
                <select
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  disabled={parentLoading || parentsOfStudent.length === 0 || !selectedStudentId}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.9rem',
                    fontSize: '0.9rem',
                    borderRadius: 8,
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-main)',
                    cursor: 'pointer',
                    marginBottom: '0.5rem',
                  }}
                >
                  <option value="">
                    {!selectedStudentId
                      ? 'Önce öğrenci seçin'
                      : parentLoading
                      ? 'Veliler yükleniyor...'
                      : parentsOfStudent.length === 0
                      ? 'Bu öğrenciye bağlı veli bulunamadı'
                      : 'Veli seçin'}
                  </option>
                  {parentsOfStudent.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.email})
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                placeholder="Veliyi bilgilendireceğiniz mesaj..."
                value={parentMessageText}
                onChange={(e) => setParentMessageText(e.target.value)}
                rows={5}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9rem',
                  borderRadius: 10,
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text-main)',
                  resize: 'vertical',
                  minHeight: 120,
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={
                    !token ||
                    !selectedStudentId ||
                    !selectedParentId ||
                    !parentMessageText.trim() ||
                    sendingParentMessage
                  }
                  onClick={handleSendParentMessage}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem 1.25rem',
                  }}
                >
                  <Send size={16} />
                  {sendingParentMessage ? 'Gönderiliyor...' : 'Veliyi Bilgilendir'}
                </button>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <aside className="page-aside">
        <GlassCard
          title="Hızlı özet"
          subtitle="Veli işlemlerine bağlı öğrenciler"
          icon={<CalendarCheck size={18} />}
        >
          <div className="list-stack">
            {students.length === 0 && (
              <div className="empty-state">Sistemde kayıtlı öğrenci bulunamadı.</div>
            )}
            {students.map((student) => (
              <button
                key={student.id}
                type="button"
                className="list-row"
                onClick={() => setSelectedStudentId(student.id)}
                style={{
                  textAlign: 'left',
                  cursor: 'pointer',
                  background:
                    student.id === selectedStudentId
                      ? 'var(--color-surface-strong)'
                      : undefined,
                }}
              >
                <div>
                  <strong>{student.name}</strong>
                  {student.gradeLevel && (
                    <small style={{ display: 'block', color: 'var(--color-text-muted)' }}>
                      {student.gradeLevel}. Sınıf
                    </small>
                  )}
                </div>
              </button>
            ))}
          </div>
        </GlassCard>
      </aside>
    </div>
  );
};


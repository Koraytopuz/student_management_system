import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Search, Send, Users } from 'lucide-react';
import {
  getTeacherParents,
  sendTeacherMessage,
  type TeacherStudent,
} from './api';
import { GlassCard } from './components/DashboardPrimitives';
import { sortGradeLevelsDescending } from './lib/utils';

type ParentOperationsTabProps = {
  token: string | null;
  students: TeacherStudent[];
  /** Öğretmenin yetkili olduğu sınıf seviyeleri (\"4\"–\"12\", \"Mezun\" vb.) */
  allowedGrades: string[];
};

export const ParentOperationsTab: React.FC<ParentOperationsTabProps> = ({
  token,
  students,
  allowedGrades,
}) => {
  // Kademeli filtreleme durumu
  const [selectedGradeLevel, setSelectedGradeLevel] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Detay ve mesaj alanı için seçimler
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id ?? '');

  // Veli mesajı durumu
  const [parents, setParents] = useState<
    { id: string; name: string; email: string; role: 'parent'; studentIds: string[] }[]
  >([]);
  const [parentLoading, setParentLoading] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [parentMessageText, setParentMessageText] = useState('');
  const [sendingParentMessage, setSendingParentMessage] = useState(false);
  const [parentMessageError, setParentMessageError] = useState<string | null>(null);
  const [parentMessageSuccess, setParentMessageSuccess] = useState(false);

  // Velileri, sınıf seçildiğinde yükle (öğrenci seçildiğinde veli listesi için)
  useEffect(() => {
    if (!token || !selectedGradeLevel) return;
    setParentLoading(true);
    getTeacherParents(token)
      .then((data) => setParents(data))
      .catch(() => {})
      .finally(() => setParentLoading(false));
  }, [token, selectedGradeLevel]);

  // Seçili sınıftaki öğrenci listesi
  const studentsInSelectedClass = useMemo(
    () =>
      selectedGradeLevel
        ? students.filter((s) => s.gradeLevel === selectedGradeLevel)
        : [],
    [students, selectedGradeLevel],
  );
  const visibleStudents = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return studentsInSelectedClass;
    return studentsInSelectedClass.filter((s) =>
      s.name.toLocaleLowerCase('tr-TR').includes(q),
    );
  }, [studentsInSelectedClass, searchQuery]);

  // Seçili öğrenci, seçili sınıftaki listede yoksa temizle (sınıf değişince vb.)
  useEffect(() => {
    if (
      selectedStudentId &&
      !studentsInSelectedClass.some((s) => s.id === selectedStudentId)
    ) {
      setSelectedStudentId('');
      setSelectedParentId('');
    }
  }, [selectedStudentId, studentsInSelectedClass]);

  // Sadece sınıf seçildiyse ve henüz öğrenci seçilmemişse listedeki ilk öğrenciyi varsayılan yap (döngüyü önlemek için sadece sınıf listesinden seç)
  useEffect(() => {
    if (!selectedGradeLevel || selectedStudentId) return;
    const firstInClass = studentsInSelectedClass[0];
    if (firstInClass) setSelectedStudentId(firstInClass.id);
  }, [selectedGradeLevel, selectedStudentId, studentsInSelectedClass]);

  // Öğrenci veya sınıf değişince seçili veli ve mesajı sıfırla
  useEffect(() => {
    setSelectedParentId('');
    setParentMessageText('');
  }, [selectedStudentId, selectedGradeLevel]);

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
      setParentMessageSuccess(true);
      setParentMessageError(null);
      window.setTimeout(() => setParentMessageSuccess(false), 5000);
    } catch (e) {
      setParentMessageError(e instanceof Error ? e.message : 'Mesaj gönderilemedi.');
      window.setTimeout(() => setParentMessageError(null), 5000);
    } finally {
      setSendingParentMessage(false);
    }
  };

  const parentsOfStudent = parents.filter((p) => p.studentIds.includes(selectedStudentId));

  // Öğrencileri hızlı erişim için map’e çevir
  const isClassSelected = selectedGradeLevel !== '';
  const selectedStudent = students.find((s) => s.id === selectedStudentId);

  const uniqueAllowedGrades = useMemo(() => {
    // Sadece öğretmenin yetkili olduğu sınıf seviyelerini göster
    const raw = Array.from(
      new Set(allowedGrades.filter(Boolean) as string[]),
    );
    return sortGradeLevelsDescending(raw);
  }, [allowedGrades]);

  return (
    <div className="page-grid">
      <div className="page-main">
        <GlassCard
          title="Veli İşlemleri"
          subtitle="Sınıf ve öğrenci seçerek veliye not veya mesaj gönderin"
        >
          {/* Filtre ve arama çubuğu */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'flex-end',
              marginBottom: '1rem',
            }}
          >
            <div style={{ minWidth: 200, flex: '0 0 auto' }}>
              <div style={{ fontSize: '0.8rem', marginBottom: 4, color: 'var(--color-text-muted)' }}>
                Sınıf Seçiniz
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={16} />
                <select
                  value={selectedGradeLevel}
                  onChange={(e) => {
                    setSelectedGradeLevel(e.target.value);
                    setSelectedStudentId('');
                    setSelectedParentId('');
                  }}
                  style={{
                    flex: 1,
                    padding: '0.55rem 0.85rem',
                    borderRadius: 999,
                    border: '1px solid var(--color-border-subtle)',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-main)',
                    fontSize: '0.9rem',
                  }}
                >
                  <option value="">
                    {uniqueAllowedGrades.length === 0 ? 'Yetkili sınıf yok' : 'Sınıf seçiniz'}
                  </option>
                  {uniqueAllowedGrades.map((g) => (
                    <option key={g} value={g}>
                      {g === 'TYT' || g === 'AYT' || g === 'LGS'
                        ? g
                        : g === 'Mezun'
                          ? 'Mezun Sınıfı'
                          : `${g}. Sınıf`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ minWidth: 220, flex: '1 1 220px' }}>
              <div style={{ fontSize: '0.8rem', marginBottom: 4, color: 'var(--color-text-muted)' }}>
                Öğrenci Ara
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: 999,
                  border: '1px solid var(--color-border-subtle)',
                  background: 'var(--color-surface)',
                }}
              >
                <Search size={16} style={{ color: 'var(--color-text-muted)' }} />
                <input
                  type="text"
                  placeholder="Öğrenci adı ile ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    color: 'var(--color-text-main)',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Başlangıç boş durumu */}
          {!isClassSelected && (
            <div
              className="empty-state"
              style={{ marginBottom: '0.75rem', borderRadius: 16, padding: '1rem' }}
            >
              Öğrenci listesini görmek için lütfen bir <strong>sınıf</strong> seçiniz.
            </div>
          )}

          {/* Öğrenci listesi (Öğrenciler menüsüyle aynı mantık) */}
          {isClassSelected && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--color-text-muted)',
                  marginBottom: '0.45rem',
                }}
              >
                Öğrenci listesi
              </div>
              <div className="students-table-wrapper" style={{ maxHeight: 320, overflow: 'auto' }}>
                {visibleStudents.length === 0 ? (
                  <div className="empty-state">Bu sınıfta öğrenci bulunamadı.</div>
                ) : (
                  <table className="students-table">
                    <thead>
                      <tr>
                        <th>Ad Soyad</th>
                        <th>Sınıf</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStudents.map((student) => {
                        const isSelected = student.id === selectedStudentId;
                        return (
                          <tr
                            key={student.id}
                            className={isSelected ? 'students-table-row--active' : undefined}
                            onClick={() => {
                              setSelectedStudentId(student.id);
                              setSelectedParentId('');
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>{student.name}</td>
                            <td>
                              {student.gradeLevel ? `${student.gradeLevel}. Sınıf` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Detay alanı: seçili öğrenci + veli seçimi + veli notu ve mesaj */}
          {!selectedStudentId && isClassSelected && visibleStudents.length > 0 && (
            <div
              className="empty-state"
              style={{ marginTop: '1rem', borderRadius: 16, padding: '1rem' }}
            >
              Listeden bir <strong>öğrenci</strong> seçerek veli işlemlerini yapabilirsiniz.
            </div>
          )}
          {selectedStudentId && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              marginTop: '1.25rem',
            }}
          >
            {/* Seçili öğrenci (sadece okunur) + Bu öğrencinin velileri */}
            <div
              style={{
                padding: '1rem',
                borderRadius: 12,
                background: 'var(--color-surface-soft, #f9fafb)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--color-text-main)',
                  marginBottom: '0.5rem',
                }}
              >
                Seçili öğrenci
              </div>
              <div
                style={{
                  fontSize: '1rem',
                  marginBottom: '1rem',
                  color: 'var(--color-text-muted)',
                }}
              >
                {selectedStudent
                  ? `${selectedStudent.name}${selectedStudent.gradeLevel ? ` · ${selectedStudent.gradeLevel}. Sınıf` : ''}`
                  : '—'}
              </div>
              <div style={{ marginBottom: '0.4rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    color: 'var(--color-text-muted)',
                    marginBottom: '0.35rem',
                  }}
                >
                  Bu öğrencinin velileri
                </label>
                <select
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  disabled={parentLoading || parentsOfStudent.length === 0}
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
                    {parentLoading
                      ? 'Veliler yükleniyor...'
                      : parentsOfStudent.length === 0
                      ? 'Bu öğrenciye bağlı veli bulunamadı'
                      : 'Veli seçin'}
                  </option>
                  {parentsOfStudent.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.email ? `(${p.email})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Veliye mesaj gönder – premium kart */}
            <div className="parent-message-card">
              <div className="parent-message-card-header">
                <MessageCircle size={20} className="parent-message-card-icon" />
                <div>
                  <h3 className="parent-message-card-title">Veliye mesaj gönder</h3>
                  <p className="parent-message-card-subtitle">
                    Mesaj, üstte seçtiğiniz veliye ve seçili öğrenci ile ilişkili olarak iletilir.
                  </p>
                </div>
              </div>
              <textarea
                placeholder="Veliyi bilgilendireceğiniz mesaj..."
                value={parentMessageText}
                onChange={(e) => setParentMessageText(e.target.value)}
                rows={6}
                className="parent-message-textarea"
              />
              {parentMessageSuccess && (
                <div className="parent-message-success" role="status">
                  Mesaj iletildi.
                </div>
              )}
              {parentMessageError && (
                <div
                  className="error"
                  role="alert"
                  style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 8 }}
                >
                  {parentMessageError}
                </div>
              )}
              <div className="parent-message-actions">
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
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 1.5rem',
                  }}
                >
                  <Send size={18} />
                  {sendingParentMessage ? 'Gönderiliyor...' : 'Veliyi Bilgilendir'}
                </button>
              </div>
            </div>
          </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
};


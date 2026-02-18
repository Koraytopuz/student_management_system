import React, { useEffect, useState, useMemo } from 'react';
import { Check, X, Save, Loader2, Calendar } from 'lucide-react';
import { GlassCard, TagChip } from './components/DashboardPrimitives';
import {
  getAttendanceClasses,
  getAttendanceClassStudents,
  submitClassAttendance,
  getAttendanceRecords,
  type ClassGroupForAttendance,
  type AttendanceClassGroupData,
  type AttendanceRecord,
} from './api';

interface AttendanceTabProps {
  token: string | null;
  /** Öğretmenin admin panelinden atanmış sınıf seviyeleri (örn. ['12']) */
  allowedGrades?: string[];
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({ token, allowedGrades }) => {
  const [classes, setClasses] = useState<ClassGroupForAttendance[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [classStudents, setClassStudents] = useState<AttendanceClassGroupData | null>(null);
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [attendanceNotes, setAttendanceNotes] = useState<Record<string, string>>({});
  const [attendanceDate, setAttendanceDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [showRecords, setShowRecords] = useState(false);

  // Sınıfları yükle
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    getAttendanceClasses(token)
      .then((data) => {
        setClasses(data);
      })
      .catch((err) => {
        console.error('Sınıflar yüklenemedi:', err);
        setError('Sınıflar yüklenemedi.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Admin panelinden atanmış sınıf seviyelerine göre görünür sınıflar
  const visibleClasses: ClassGroupForAttendance[] = useMemo(() => {
    if (!allowedGrades || allowedGrades.length === 0) return classes;
    const set = new Set(allowedGrades);
    return classes.filter((c) => set.has(c.gradeLevel));
  }, [classes, allowedGrades?.join(',')]);

  // İlk uygun sınıfı otomatik seç
  useEffect(() => {
    if (!selectedClassId && visibleClasses.length > 0) {
      setSelectedClassId(visibleClasses[0].id);
    } else if (
      selectedClassId &&
      visibleClasses.length > 0 &&
      !visibleClasses.some((c) => c.id === selectedClassId)
    ) {
      // Seçili sınıf görünür listede değilse (yetkiler değişmiş olabilir), ilkine düş
      setSelectedClassId(visibleClasses[0].id);
    } else if (visibleClasses.length === 0 && selectedClassId) {
      // Hiç görünür sınıf yoksa seçimi temizle
      setSelectedClassId('');
    }
  }, [visibleClasses, selectedClassId]);

  // Seçili sınıfın öğrencilerini yükle
  useEffect(() => {
    if (!token) return;
    if (!selectedClassId) return;
    setLoading(true);
    getAttendanceClassStudents(token, selectedClassId)
      .then((data) => {
        setClassStudents(data);
        // Varsayılan olarak tüm öğrenciler "Geldi" olarak işaretlenir
        const initialAttendance: Record<string, boolean> = {};
        data.students.forEach((s) => {
          initialAttendance[s.id] = true;
        });
        setAttendance(initialAttendance);
        setAttendanceNotes({});
      })
      .catch((err) => {
        console.error('Öğrenciler yüklenemedi:', err);
        setError('Öğrenciler yüklenemedi.');
      })
      .finally(() => setLoading(false));
  }, [token, selectedClassId]);

  // Yoklama kayıtlarını yükle
  const loadRecords = () => {
    if (!token) return;
    if (!selectedClassId) return;
    getAttendanceRecords(token, {
      classGroupId: selectedClassId,
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    })
      .then((data) => {
        setRecords(data);
      })
      .catch((err) => {
        console.error('Yoklama kayıtları yüklenemedi:', err);
      });
  };

  const handleSubmit = async () => {
    if (!token) return;
    if (!selectedClassId || !classStudents) return;

    setSaving(true);
    setError(null);
    setSaveSuccessMessage(null);

    try {
      const attendanceList = classStudents.students.map((s) => ({
        studentId: s.id,
        present: attendance[s.id] ?? true,
        notes: attendanceNotes[s.id]?.trim() || undefined,
      }));

      await submitClassAttendance(token, selectedClassId, attendanceDate, attendanceList);
      setError(null);
      setSaveSuccessMessage('Yoklama başarıyla kaydedildi.');
      loadRecords();
    } catch (err: any) {
      console.error('Yoklama kaydedilemedi:', err);
      const apiDetails = err?.response?.data?.details as string | undefined;
      const apiError = err?.response?.data?.error as string | undefined;
      setError(apiDetails ? `${apiError || err?.message || 'Yoklama kaydedilemedi.'}\n${apiDetails}` : (apiError || err?.message || 'Yoklama kaydedilemedi.'));
    } finally {
      setSaving(false);
    }
  };

  // Başarı mesajını otomatik gizle
  useEffect(() => {
    if (!saveSuccessMessage) return;
    const t = window.setTimeout(() => setSaveSuccessMessage(null), 3500);
    return () => window.clearTimeout(t);
  }, [saveSuccessMessage]);

  const toggleStudentAttendance = (studentId: string) => {
    setAttendance((prev) => ({
      ...prev,
      [studentId]: !(prev[studentId] ?? true),
    }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <GlassCard>
        <div style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>
            Devamsızlık Yönetimi
          </h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Sınıf seçerek öğrencilere yoklama alabilirsiniz.
          </p>
        </div>

        {!token && (
          <div className="empty-state">
            Oturum bulunamadı. Lütfen tekrar giriş yapın.
          </div>
        )}

        {/* Sınıf Seçimi */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.9rem',
              fontWeight: 500,
              color: 'var(--color-text-main)',
            }}
          >
            Sınıf Seçin
          </label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            disabled={loading || !token || visibleClasses.length === 0}
            style={{
              width: '100%',
              padding: '0.6rem 0.9rem',
              borderRadius: 999,
              border:
                '1px solid color-mix(in srgb, var(--accent-color) 48%, var(--ui-control-border))',
              background:
                'radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent-color) 18%, transparent), transparent 55%), var(--glass-bg)',
              color: 'var(--color-text-main)',
              fontSize: '0.9rem',
              boxShadow: '0 16px 42px rgba(15,23,42,0.45)',
              backdropFilter: 'blur(18px)',
            }}
          >
            <option value="">
              {visibleClasses.length === 0 ? 'Yetkili sınıf bulunamadı' : 'Sınıf seçin...'}
            </option>
            {visibleClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.gradeLevel}. sınıf) - {c.studentCount} öğrenci
              </option>
            ))}
          </select>
        </div>

        {/* Tarih Seçimi */}
        {selectedClassId && (
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: 500,
                color: 'var(--color-text-main)',
              }}
            >
              Yoklama Tarihi
            </label>
            <input
              type="date"
              value={attendanceDate}
              onChange={(e) => setAttendanceDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.9rem',
                borderRadius: 999,
                border:
                  '1px solid color-mix(in srgb, var(--accent-color) 48%, var(--ui-control-border))',
                background:
                  'radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent-color) 18%, transparent), transparent 55%), var(--glass-bg)',
                color: 'var(--color-text-main)',
                fontSize: '0.9rem',
                boxShadow: '0 16px 42px rgba(15,23,42,0.18)',
                backdropFilter: 'blur(18px)',
              }}
            />
          </div>
        )}

        {/* Öğrenci Listesi */}
        {loading && selectedClassId && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
            <p style={{ marginTop: '0.5rem' }}>Öğrenciler yükleniyor...</p>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '0.75rem',
              borderRadius: '0.5rem',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              fontSize: '0.9rem',
              marginBottom: '1rem',
            }}
          >
            {error}
          </div>
        )}

        {!loading && classStudents && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>
                {classStudents.classGroup.name} - Öğrenci Listesi
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {classStudents.students.map((student) => (
                  <div
                    key={student.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${
                        attendance[student.id] === false ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)'
                      }`,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onClick={() => toggleStudentAttendance(student.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                      <div
                        style={{
                          width: '2.5rem',
                          height: '2.5rem',
                          borderRadius: '50%',
                          background: attendance[student.id] === false ? '#ef4444' : '#22c55e',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '1.25rem',
                          fontWeight: 600,
                        }}
                      >
                        {attendance[student.id] === false ? <X size={20} /> : <Check size={20} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{student.name}</div>
                        {student.gradeLevel && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {student.gradeLevel}. sınıf
                          </div>
                        )}
                      </div>
                    </div>
                    <TagChip
                      label={attendance[student.id] === false ? 'Gelmedi' : 'Geldi'}
                      tone={attendance[student.id] === false ? 'error' : 'success'}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Kaydet Butonu */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowRecords(!showRecords)}
                className="ghost-btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.55rem 1.15rem',
                  borderRadius: 999,
                  border: '1px solid rgba(37, 99, 235, 0.6)',
                  background: 'var(--color-primary, #2563eb)',
                  color: '#fff',
                  boxShadow: '0 14px 32px rgba(37,99,235,0.45)',
                }}
              >
                <Calendar size={16} />
                {showRecords ? 'Kayıtları Gizle' : 'Kayıtları Göster'}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="primary-btn"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  minWidth: '140px',
                  justifyContent: 'center',
                  padding: '0.6rem 1.6rem',
                  borderRadius: 999,
                  border: '1px solid rgba(37, 99, 235, 0.6)',
                  background: 'var(--color-primary, #2563eb)',
                  color: '#fff',
                  boxShadow: '0 14px 32px rgba(37,99,235,0.45)',
                }}
              >
                {saving ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    Kaydediliyor...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Kaydet
                  </>
                )}
              </button>
            </div>

            {saveSuccessMessage && (
              <div
                style={{
                  marginTop: '0.75rem',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <div style={{ color: 'var(--success)', fontSize: '0.85rem', fontWeight: 700 }}>
                  {saveSuccessMessage}
                </div>
              </div>
            )}
          </>
        )}
      </GlassCard>

      {/* Yoklama Kayıtları */}
      {showRecords && selectedClassId && (
        <GlassCard>
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 600 }}>
              Son Yoklama Kayıtları
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Son 30 günün yoklama kayıtları
            </p>
          </div>
          {records.length === 0 ? (
            <div className="empty-state">Henüz yoklama kaydı bulunmuyor.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {records.map((record) => (
                <div
                  key={record.id}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${
                      !record.present ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)'
                    }`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{record.studentName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      {new Date(record.date).toLocaleDateString('tr-TR')} · {record.classGroupName}
                    </div>
                    {record.notes && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                        Not: {record.notes}
                      </div>
                    )}
                  </div>
                  <TagChip
                    label={record.present ? 'Geldi' : 'Gelmedi'}
                    tone={record.present ? 'success' : 'error'}
                  />
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
};

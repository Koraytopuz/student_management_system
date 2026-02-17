import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronDown, ChevronUp, FileText, Check, Calendar, Users, Trash2, ClipboardList } from 'lucide-react';
import { GlassCard, MetricCard, TagChip } from '../../components/DashboardPrimitives';

interface ClassGroup {
  id: string;
  name: string;
  gradeLevel: string;
  stream?: 'SAYISAL' | 'SOZEL' | 'ESIT_AGIRLIK' | null;
  section?: string | null;
}

interface Exam {
  id: number;
  name: string;
  type: string;
  date: string;
  questionCount: number;
  description?: string;
  examAssignments?: { classGroup: ClassGroup }[];
  _count?: { results: number };
}

interface ExamManagementProps {
  token: string;
}

const GRADE_ORDER = ['MEZUN', '12', '11', '10', '9', '8', '7', '6', '5', '4'];
const STREAM_ORDER = ['SAYISAL', 'ESIT_AGIRLIK', 'SOZEL'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ExamManagement: React.FC<ExamManagementProps> = ({ token }) => {
  const [classGroups, setClassGroups] = useState<ClassGroup[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingExamId, setEditingExamId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [examSearch] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'TYT' as 'TYT' | 'AYT' | 'LGS' | 'ARA_SINIF',
    date: '',
    examFile: null as File | null,
  });
  
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchExams = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:4000/api/exams', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      const list = Array.isArray((data as { exams?: Exam[] }).exams)
        ? (data as { exams: Exam[] }).exams
        : [];
      setExams(list);
    } catch (err) {
      console.error('Error fetching exams:', err);
    }
  }, [token]);

  // Sınıf gruplarını ve sınavları çek
  useEffect(() => {
    fetchClassGroups();
    fetchExams();
  }, [fetchExams]);

  // Dropdown dışına tıklanınca kapat
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchClassGroups = async () => {
    try {
      const response = await fetch('http://localhost:4000/admin/class-groups', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      
      // 9/A sınıfını filtrele
      const filtered = data.filter((cg: ClassGroup) => {
        const name = cg.name.toLowerCase();
        return !name.includes('9/a') && !name.includes('9-a') && !name.includes('9\\a');
      });
      
      setClassGroups(filtered);
    } catch (error) {
      console.error('Error fetching class groups:', error);
      setError('Sınıf grupları yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  // Sınıfları sırala
  const sortedClassGroups = useMemo(() => {
    const grouped = new Map<string, ClassGroup[]>();

    classGroups.forEach((cg) => {
      // 9A sınıfını tamamen gizle
      const lowerName = (cg.name || '').toLowerCase();
      if (lowerName.includes('9a') || lowerName.includes('9/a') || lowerName.includes('9-a')) {
        return;
      }
      const key = cg.gradeLevel || 'OTHER';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(cg);
    });

    const result: ClassGroup[] = [];

    GRADE_ORDER.forEach((grade) => {
      if (!grouped.has(grade)) return;

      const groups = grouped.get(grade)!;

      if (grade === 'MEZUN' || grade === '12' || grade === '11') {
        // Stream'e göre sırala
        STREAM_ORDER.forEach((stream) => {
          const streamGroups = groups.filter((g) => g.stream === stream);
          result.push(...streamGroups);
        });
      } else {
        // Stream olmayan sınıflar
        result.push(...groups);
      }
    });

    return result;
  }, [classGroups]);

  // Sınav türüne göre katılabilecek sınıfları filtrele
  const eligibleClassGroups = useMemo(() => {
    return sortedClassGroups.filter((cg) => {
      const grade = (cg.gradeLevel || '').toUpperCase();
      switch (formData.type) {
        case 'TYT':
          // TYT: 9, 10, 11, 12 ve Mezun
          return (
            grade === '9' ||
            grade === '10' ||
            grade === '11' ||
            grade === '12' ||
            grade === 'MEZUN'
          );
        case 'AYT':
          // AYT: 11, 12 ve Mezun
          return grade === '11' || grade === '12' || grade === 'MEZUN';
        case 'LGS':
          // LGS: sadece 8. sınıf
          return grade === '8';
        case 'ARA_SINIF':
        default:
          // Ara Sınıf: diğer tüm sınıflar gösterilebilir (4–7 gibi)
          return grade !== '8' && grade !== '9' && grade !== '10' && grade !== '11' && grade !== '12' && grade !== 'MEZUN';
      }
    });
  }, [sortedClassGroups, formData.type]);

  // Tür değişince, artık uygun olmayan sınıfları seçimden çıkar
  useEffect(() => {
    setSelectedClasses((prev) =>
      prev.filter((id) => {
        const cg = eligibleClassGroups.find((g) => g.id === id);
        return !!cg;
      }),
    );
  }, [eligibleClassGroups]);

  const examsFiltered = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    if (!q) return exams;
    return exams.filter((e) => (e.name || '').toLowerCase().includes(q));
  }, [exams, examSearch]);

  const stats = useMemo(() => {
    const total = exams.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = exams.filter((e) => new Date(e.date).getTime() >= today.getTime()).length;
    const totalAssignments = exams.reduce((acc, e) => acc + (e.examAssignments?.length ?? 0), 0);
    return { total, upcoming, totalAssignments };
  }, [exams]);

  // Belirli bir sınıf seçimi için, aynı akıştaki (Sayısal / EA / Sözel) tüm şubeleri çözer.
  // 12. ve 11. sınıflar için aynı akıştaki tüm classGroup'ları; TYT / AYT ise mezun akışlarını da ekler.
  const resolveClassIdsForSelection = (classId: string): string[] => {
    const base = eligibleClassGroups.find((g) => g.id === classId);
    if (!base) return [classId];

    const grade = (base.gradeLevel || '').toUpperCase();
    const stream = base.stream;

    // Sadece akış tanımlı (SAYISAL / EA / SOZEL) gruplar için genişletme yap
    if (!stream) return [classId];

    const resultIds: string[] = [];

    // 11 ve 12. sınıflarda, aynı akıştaki tüm şubeleri ekle
    if (grade === '11' || grade === '12') {
      eligibleClassGroups.forEach((g) => {
        const gGrade = (g.gradeLevel || '').toUpperCase();
        if (gGrade === grade && g.stream === stream) {
          resultIds.push(g.id);
        }
      });

      // TYT / AYT sınavlarında, aynı akıştaki mezun sınıflarını da ekle
      if (formData.type === 'TYT' || formData.type === 'AYT') {
        eligibleClassGroups.forEach((g) => {
          const gGrade = (g.gradeLevel || '').toUpperCase();
          if (gGrade === 'MEZUN' && g.stream === stream) {
            resultIds.push(g.id);
          }
        });
      }

      return Array.from(new Set(resultIds));
    }

    // Mezun seçiminde, aynı akıştaki tüm mezun gruplarını ekle
    if (grade === 'MEZUN') {
      eligibleClassGroups.forEach((g) => {
        const gGrade = (g.gradeLevel || '').toUpperCase();
        if (gGrade === 'MEZUN' && g.stream === stream) {
          resultIds.push(g.id);
        }
      });
      return Array.from(new Set(resultIds));
    }

    return [classId];
  };

  const toggleClass = (classId: string) => {
    setSelectedClasses((prev) => {
      const ids = resolveClassIdsForSelection(classId);
      const allSelected = ids.every((id) => prev.includes(id));
      if (allSelected) {
        // Tümü zaten seçiliyse, bu akıştaki tüm şubeleri kaldır
        return prev.filter((id) => !ids.includes(id));
      }
      // Aksi halde, bu akıştaki tüm şubeleri ekle
      return Array.from(new Set([...prev, ...ids]));
    });
  };

  const removeClass = (classId: string) => {
    setSelectedClasses((prev) => prev.filter((id) => id !== classId));
  };

  const handleFileSelect = (file: File | null) => {
    setFormData((prev) => ({ ...prev, examFile: file }));
  };

  const startEditExam = (exam: Exam) => {
    setEditingExamId(exam.id);
    setFormData({
      name: exam.name,
      type: exam.type as any,
      date: exam.date ? exam.date.slice(0, 10) : '',
      examFile: null,
    });
    const assignedClassIds =
      exam.examAssignments?.map((a) => a.classGroup.id) ?? [];
    setSelectedClasses(assignedClassIds);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validasyon
    if (!formData.name.trim()) {
      setError('Sınav adı gereklidir');
      return;
    }

    if (!formData.date) {
      setError('Tarih gereklidir');
      return;
    }

    if (selectedClasses.length === 0) {
      setError('En az bir sınıf seçmelisiniz');
      return;
    }

    setSubmitting(true);

    try {
      // 1) Eğer kitapçık dosyası seçildiyse önce sunucuya yükle
      let uploadedFileUrl: string | undefined;
      let uploadedFileName: string | undefined;

      if (formData.examFile) {
        const uploadData = new FormData();
        uploadData.append('file', formData.examFile);

        const uploadResponse = await fetch('http://localhost:4000/teacher/test-assets/upload', {
          method: 'POST',
          headers: {
            // Content-Type form-data için otomatik ayarlanır; sadece auth ekliyoruz
            Authorization: `Bearer ${token}`,
          },
          body: uploadData,
        });

        if (!uploadResponse.ok) {
          const errBody = await uploadResponse.json().catch(() => ({}));
          throw new Error(errBody.error || 'Kitapçık yüklenirken hata oluştu');
        }

        const uploaded = await uploadResponse.json() as { url: string; fileName: string };
        uploadedFileUrl = uploaded.url;
        uploadedFileName = uploaded.fileName;
      }

      // 2) Sınav kaydı oluştur / güncelle
      const url = editingExamId
        ? `http://localhost:4000/api/exams/${editingExamId}`
        : 'http://localhost:4000/api/exams';
      const method = editingExamId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          date: formData.date,
          questionCount: 0,
          description: '',
          classGroupIds: selectedClasses,
          // PDF kitapçığı yüklenmişse, sınava iliştir
          fileUrl: uploadedFileUrl,
          fileName: uploadedFileName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sınav oluşturulurken hata oluştu');
      }

      // Başarılı
      setSuccess(
        editingExamId
          ? 'Sınav başarıyla güncellendi ve öğrencilere bildirim gönderildi'
          : 'Sınav başarıyla oluşturuldu ve öğrencilere bildirim gönderildi',
      );
      
      // Formu temizle, düzenleme modundan çık ve sınav listesini yenile
      setFormData({
        name: '',
        type: 'TYT',
        date: '',
        examFile: null,
      });
      setSelectedClasses([]);
      setEditingExamId(null);
      fetchExams();
      
      // Success mesajını 5 saniye sonra kaldır
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sınav oluşturulurken hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="empty-state">Yükleniyor...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <GlassCard
        title="Sınav Yönetimi"
        subtitle="Deneme sınavlarını tek ekrandan oluşturun, sınıflara atayın ve yönetin."
        icon={<ClipboardList size={18} />}
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <TagChip label={`Toplam: ${stats.total}`} tone="neutral" />
            <TagChip label={`Yaklaşan: ${stats.upcoming}`} tone="info" />
          </div>
        }
      >
        {(success || error) && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {success && <TagChip label={success} tone="success" />}
            {error && <TagChip label={error} tone="error" />}
          </div>
        )}

        <div className="metric-grid" style={{ marginTop: '1rem', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <MetricCard label="Sınav" value={`${stats.total}`} helper="Kayıtlı" trendLabel="Liste" />
          <MetricCard label="Atama" value={`${stats.totalAssignments}`} helper="Sınıf eşleştirmesi" trendLabel="Dağıtım" />
          <MetricCard label="Yaklaşan" value={`${stats.upcoming}`} helper="Bugün ve sonrası" trendLabel="Takvim" />
        </div>
      </GlassCard>

      <div className="dual-grid" style={{ alignItems: 'flex-start' }}>
        <GlassCard
          title="Yeni Sınav"
          subtitle="3 adımda sınavı oluşturun ve sınıflara atayın."
          icon={<FileText size={18} />}
          className="exam-management-form-card"
        >
          <form onSubmit={handleSubmit} className="form" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                opacity: 0.8,
              }}
            >
              1. Sınav Bilgileri
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', opacity: 0.85 }}>Sınav Adı *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="teacher-content-input"
                placeholder="Örn: 2026 TYT Deneme 1"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', opacity: 0.85 }}>Sınav Türü *</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value as any }))}
                  className="attendance-select"
                  style={{ padding: '0.65rem 0.85rem' }}
                  required
                >
                  <option value="TYT">TYT</option>
                  <option value="AYT">AYT</option>
                  <option value="LGS">LGS</option>
                  <option value="ARA_SINIF">Ara Sınıf</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.85rem', opacity: 0.85 }}>Tarih *</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  className="attendance-select"
                  style={{ padding: '0.65rem 0.85rem' }}
                  required
                />
              </div>
            </div>

            <div
              style={{
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                opacity: 0.8,
                marginTop: '0.25rem',
              }}
            >
              2. Sınıf Seçimi
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.85rem', opacity: 0.85 }}>Sınıflar *</label>
              <div className="relative inline-block" style={{ minWidth: 240 }} ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="ghost-btn"
                  style={{ width: '100%', justifyContent: 'space-between', height: '2.5rem', borderRadius: 12 }}
                >
                  <span style={{ opacity: selectedClasses.length === 0 ? 0.7 : 1 }}>
                    {selectedClasses.length === 0 ? 'Sınıf seçin...' : `${selectedClasses.length} sınıf seçildi`}
                  </span>
                  {dropdownOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {dropdownOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      zIndex: 50,
                      marginTop: 8,
                      width: '80%',
                      maxWidth: 420,
                      maxHeight: 360,
                      overflowY: 'auto',
                      borderRadius: 14,
                      border: '1px solid var(--glass-border)',
                      background: 'var(--glass-bg)',
                      boxShadow: '0 30px 70px rgba(15, 23, 42, 0.10)',
                      padding: '0.35rem',
                    }}
                  >
                    {eligibleClassGroups.map((classGroup) => {
                      const isSelected = selectedClasses.includes(classGroup.id);
                      return (
                        <label
                          key={classGroup.id}
                          className="list-row"
                          style={{ alignItems: 'center', borderRadius: 12, cursor: 'pointer', padding: '0.65rem 0.75rem' }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleClass(classGroup.id)}
                            style={{ width: 16, height: 16 }}
                          />
                          <span style={{ flex: 1, fontSize: '0.85rem' }}>{classGroup.name}</span>
                          {isSelected && <Check size={16} />}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedClasses.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {selectedClasses
                    .map((id) => classGroups.find((cg) => cg.id === id))
                    .filter((cg): cg is ClassGroup => Boolean(cg))
                    .map((cg) => (
                      <span key={cg.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <TagChip label={cg.name} tone="info" />
                        <button type="button" className="ghost-btn" style={{ height: '1.75rem' }} onClick={() => removeClass(cg.id)}>
                          <X size={14} />
                        </button>
                      </span>
                    ))}
                </div>
              )}
            </div>

            <div
              style={{
                fontSize: '0.78rem',
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                opacity: 0.8,
              }}
            >
              3. Sınav Dosyası (Opsiyonel)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', position: 'relative' }}>
              <label style={{ fontSize: '0.85rem', opacity: 0.85 }}>Sınav Dosyası (opsiyonel)</label>
              {/* Gerçek input: görünmez ama tıklanabilir */}
              <input
                ref={fileInputRef}
                id="exam-file-input"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,application/pdf,image/*"
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  cursor: 'pointer',
                }}
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <label
                  htmlFor="exam-file-input"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.4rem 0.9rem',
                    borderRadius: 999,
                    border: '1px solid rgba(148,163,184,0.6)',
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9), rgba(241,245,249,0.95))',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: 'var(--color-text-main)',
                    boxShadow: '0 8px 20px rgba(15,23,42,0.08)',
                  }}
                >
                  Dosya Seç
                </label>
                {!formData.examFile && (
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Henüz dosya seçilmedi (PDF / Word / Excel / görsel)</span>
                )}
                {formData.examFile && (
                  <div className="list-row" style={{ alignItems: 'center', borderRadius: 12, flex: 1, minWidth: 0 }}>
                    <FileText size={18} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {formData.examFile.name}
                      </strong>
                      <small style={{ display: 'block', opacity: 0.75 }}>{formatFileSize(formData.examFile.size)}</small>
                    </div>
                    <button type="button" className="ghost-btn" onClick={() => handleFileSelect(null)}>
                      Kaldır
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setFormData({ name: '', type: 'TYT', date: '', examFile: null });
                  setSelectedClasses([]);
                  setEditingExamId(null);
                  setError(null);
                  setSuccess(null);
                }}
              >
                {editingExamId ? 'Düzenlemeyi İptal Et' : 'Temizle'}
              </button>
              <button type="submit" disabled={submitting} className="primary-btn">
                {submitting
                  ? 'Kaydediliyor...'
                  : editingExamId
                    ? 'Sınavı Güncelle'
                    : 'Sınavı Kaydet'}
              </button>
            </div>
          </form>
        </GlassCard>

        <GlassCard
          title="Sınavlar"
          subtitle="Oluşturulan sınavlar ve hızlı işlemler"
          icon={<Calendar size={18} />}
          className="exam-management-list-card"
        >
          {examsFiltered.length === 0 ? (
            <div className="empty-state">Henüz sınav yok veya aramanıza uygun sonuç bulunamadı.</div>
          ) : (
            <div className="list-stack">
              {examsFiltered
                .slice()
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((exam) => (
                  <div key={exam.id} className="list-row" style={{ alignItems: 'flex-start', borderRadius: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{exam.name}</strong>
                      <small style={{ display: 'block', marginTop: 4, opacity: 0.85 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 10 }}>
                          <Calendar size={14} /> {new Date(exam.date).toLocaleDateString('tr-TR')}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Users size={14} /> {exam.examAssignments?.length ?? 0} sınıf · {exam._count?.results ?? 0} sonuç
                        </span>
                      </small>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        <TagChip label={exam.type} tone="info" />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={() => startEditExam(exam)}
                        title="Düzenle"
                      >
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="ghost-btn"
                        onClick={async () => {
                          if (!window.confirm(`"${exam.name}" sınavını silmek istediğinize emin misiniz?`)) return;
                          try {
                            const res = await fetch(`http://localhost:4000/api/exams/${exam.id}`, {
                              method: 'DELETE',
                              headers: { Authorization: `Bearer ${token}` },
                            });
                            if (res.ok) fetchExams();
                          } catch (e) {
                            console.error(e);
                          }
                        }}
                        style={{ borderColor: 'rgba(239,68,68,0.35)', color: '#b91c1c' }}
                        title="Sil"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
};

export default ExamManagement;

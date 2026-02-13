import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronDown, ChevronUp, Upload, FileText, Check, Calendar, Users, Trash2 } from 'lucide-react';

interface ClassGroup {
  id: string;
  name: string;
  gradeLevel: string;
  stream?: 'SAYISAL' | 'SOZEL' | 'ESIT_AGIRLIK' | null;
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'TYT' as 'TYT' | 'AYT' | 'LGS' | 'ARA_SINIF',
    date: '',
    examFile: null as File | null,
  });
  
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
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
  const sortedClassGroups = React.useMemo(() => {
    const grouped = new Map<string, ClassGroup[]>();
    
    classGroups.forEach((cg) => {
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

  const toggleClass = (classId: string) => {
    setSelectedClasses((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId]
    );
  };

  const removeClass = (classId: string) => {
    setSelectedClasses((prev) => prev.filter((id) => id !== classId));
  };

  const handleFileSelect = (file: File | null) => {
    setFormData((prev) => ({ ...prev, examFile: file }));
  };

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFileSelect(file);
  }, []);

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
      const response = await fetch('http://localhost:4000/api/exams', {
        method: 'POST',
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sınav oluşturulurken hata oluştu');
      }

      // Başarılı
      setSuccess('Sınav başarıyla oluşturuldu ve öğrencilere bildirim gönderildi');
      
      // Formu temizle ve sınav listesini yenile
      setFormData({
        name: '',
        type: 'TYT',
        date: '',
        examFile: null,
      });
      setSelectedClasses([]);
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="text-slate-600 dark:text-slate-300">Yükleniyor...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Sınav Yönetimi
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Kurumdaki tüm deneme sınavlarını tek ekrandan oluşturun, sınıflara atayın ve yönetin.
          </p>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-200">
            {success}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {/* Sınav Adı */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Sınav Adı <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-blue-400"
                placeholder="Örn: 2025 TYT Deneme Sınavı 1"
                required
              />
            </div>

            {/* Sınav Türü ve Tarih */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Sınav Türü <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, type: e.target.value as any }))
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-blue-400"
                  required
                >
                  <option value="TYT">TYT</option>
                  <option value="AYT">AYT</option>
                  <option value="LGS">LGS</option>
                  <option value="ARA_SINIF">Ara Sınıf</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Tarih <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:focus:border-blue-400"
                  required
                />
              </div>
            </div>

            {/* Sınıf Seçimi */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Sınıflar <span className="text-red-500">*</span>
              </label>
              
              {/* Dropdown */}
              <div className="relative inline-block min-w-[220px]" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full flex items-center justify-between rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 shadow-sm transition hover:border-blue-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-50 dark:hover:border-blue-400 dark:focus:border-blue-400"
                >
                  <span className={selectedClasses.length === 0 ? 'text-slate-400' : ''}>
                    {selectedClasses.length === 0
                      ? 'Sınıf seçin...'
                      : `${selectedClasses.length} sınıf seçildi`}
                  </span>
                  {dropdownOpen ? (
                    <ChevronUp className="h-5 w-5 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-slate-500" />
                  )}
                </button>

                {dropdownOpen && (
                  <div className="absolute z-50 mt-2 w-full max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    <div className="py-2">
                      {sortedClassGroups.map((classGroup) => {
                        const isSelected = selectedClasses.includes(classGroup.id);
                        return (
                          <label
                            key={classGroup.id}
                            className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleClass(classGroup.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 dark:border-slate-600"
                            />
                            <span className="flex-1 text-xs text-slate-700 dark:text-slate-300">
                              {classGroup.name}
                            </span>
                            {isSelected && (
                              <Check className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Seçilen Sınıflar Önizlemesi */}
              {selectedClasses.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedClasses
                    .map((id) => classGroups.find((cg) => cg.id === id))
                    .filter((cg): cg is ClassGroup => Boolean(cg))
                    .map((cg) => (
                      <div
                        key={cg.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-[11px] text-white shadow-sm"
                      >
                        <span className="truncate max-w-[140px]">{cg.name}</span>
                        <button
                          type="button"
                          onClick={() => removeClass(cg.id)}
                          className="ml-1 rounded-full p-0.5 hover:bg-blue-500/80 transition"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Dosya Yükleme */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Sınav Dosyası (Opsiyonel)
              </label>

              {formData.examFile ? (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <FileText className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-50">
                      {formData.examFile.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatFileSize(formData.examFile.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleFileSelect(null)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-300 transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    if (e.currentTarget === e.target) {
                      setIsDragging(false);
                    }
                  }}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 cursor-pointer transition ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50 dark:border-slate-600 dark:hover:border-blue-500 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                  />
                  <Upload className={`h-10 w-10 mb-3 ${isDragging ? 'text-blue-600' : 'text-slate-400'}`} />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Dosya seçin veya sürükleyip bırakın
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    PDF, Word, Excel veya görsel dosyaları
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Butonlar */}
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setFormData({
                  name: '',
                  type: 'TYT',
                  date: '',
                  examFile: null,
                });
                setSelectedClasses([]);
                setError(null);
                setSuccess(null);
              }}
              className="px-4 py-2 rounded-full border border-slate-300 bg-white text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-xs font-semibold text-white shadow-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {submitting ? 'Kaydediliyor...' : 'Sınavı Kaydet'}
            </button>
          </div>
        </form>

        {/* Kaydedilen Sınavlar Listesi */}
        <div className="mt-12">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 mb-4">
            Kaydedilen Sınavlar
          </h2>
          {exams.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 py-12 text-center dark:border-slate-700 dark:bg-slate-800/30">
              <FileText className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500" />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Henüz sınav oluşturulmamış.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {exams.map((exam) => (
                <div
                  key={exam.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-slate-900 dark:text-slate-50">
                        {exam.name}
                      </h3>
                      <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                        {exam.type}
                      </span>
                    </div>
                    <button
                      type="button"
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
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-slate-700 dark:hover:text-red-400 transition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-col gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(exam.date).toLocaleDateString('tr-TR')}
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" />
                      {exam.examAssignments?.length ?? 0} sınıf · {exam._count?.results ?? 0} sonuç
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamManagement;

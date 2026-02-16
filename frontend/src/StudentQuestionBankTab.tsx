import { useRef, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Brain,
  Loader2,
  PlayCircle,
  Camera,
  Upload,
  MessageSquare,
  Send,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  type StudentAssignmentDetail,
  type StudentQuestionBankMetaResponse,
  type StudentQuestionBankSubjectMeta,
  type TeacherListItem,
  getStudentQuestionBankMeta,
  startStudentQuestionBankTest,
  createStudentHelpRequest,
  getStudentTeachers,
} from './api';
import { GlassCard } from './components/DashboardPrimitives';

interface StudentQuestionBankTabProps {
  token: string;
  defaultGradeLevel?: string;
  onTestStarted: (detail: StudentAssignmentDetail) => void;
}

export function StudentQuestionBankTab({
  token,
  defaultGradeLevel,
  onTestStarted,
}: StudentQuestionBankTabProps) {
  const parseStudentGrade = (value?: string | null): string | null => {
    if (!value) return null;
    const match = value.match(/\d{1,2}/);
    if (match) return match[0];
    return value.trim();
  };

  const baseGrade = parseStudentGrade(defaultGradeLevel);
  const initialGrade = baseGrade ?? '9';

  const [meta, setMeta] = useState<StudentQuestionBankMetaResponse | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [gradeLevel, setGradeLevel] = useState<string>(initialGrade);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [creatingTest, setCreatingTest] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Öğretmene Sor State
  const [askTeacherMessage, setAskTeacherMessage] = useState('');
  const [askTeacherFile, setAskTeacherFile] = useState<File | null>(null);
  const [askTeacherPreview, setAskTeacherPreview] = useState<string | null>(null);
  const [askTeacherSending, setAskTeacherSending] = useState(false);
  const [askTeacherSuccess, setAskTeacherSuccess] = useState(false);
  const [askTeacherError, setAskTeacherError] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [teachersLoading, setTeachersLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setMetaLoading(true);
      setMetaError(null);
      try {
        const data = await getStudentQuestionBankMeta(token, gradeLevel);
        if (cancelled) return;
        setMeta(data);
        if (!selectedSubjectId && data.subjects.length > 0) {
          setSelectedSubjectId(data.subjects[0].subjectId);
        }
      } catch (error) {
        if (cancelled) return;
        setMetaError(
          error instanceof Error
            ? error.message
            : 'Soru havuzu bilgileri yüklenemedi',
        );
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    };
    load().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, gradeLevel]);

  useEffect(() => {
    let cancelled = false;
    const fetchTeachers = async () => {
      setTeachersLoading(true);
      try {
        const list = await getStudentTeachers(token);
        if (cancelled) return;
        setTeachers(list);
        if (list.length > 0) {
          setSelectedTeacherId(list[0].id);
        }
      } catch (err) {
        console.error('Öğretmenler yüklenemedi:', err);
      } finally {
        if (!cancelled) setTeachersLoading(false);
      }
    };
    fetchTeachers();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Öğrenci sadece kendi sınıfına (ve gerekirse TYT/AYT içeriklerine) göre test oluşturabilsin
  const gradeLevels = useMemo(() => {
    if (!baseGrade) return ['9'];
    const grades: string[] = [baseGrade];
    // 9–12 arası öğrenciler için TYT/AYT de göster
    if (['9', '10', '11', '12'].includes(baseGrade)) {
      grades.push('TYT', 'AYT');
    }
    return grades;
  }, [baseGrade]);

  const subjects: StudentQuestionBankSubjectMeta[] = meta?.subjects ?? [];
  const currentSubject = subjects.find(
    (s) => s.subjectId === selectedSubjectId,
  );
  const topics = currentSubject?.topics ?? [];
  const currentTopic = topics.find((t) => t.topic === selectedTopic);

  useEffect(() => {
    if (!currentSubject && subjects.length > 0) {
      setSelectedSubjectId(subjects[0].subjectId);
      setSelectedTopic('');
      setSelectedSubtopic('');
    }
  }, [subjects.length, currentSubject]);

  // Eğer seçili sınıf, izin verilen sınıflar dışında kalırsa en yakın geçerli sınıfa zorla
  useEffect(() => {
    if (!gradeLevels.includes(gradeLevel)) {
      setGradeLevel(gradeLevels[0] ?? '9');
    }
  }, [gradeLevels.join(','), gradeLevel]);

  const handleStartTest = async () => {
    if (!selectedSubjectId || !selectedTopic) {
      setCreateError('Lütfen ders ve konu seçin.');
      return;
    }
    setCreateError(null);
    setCreatingTest(true);
    try {
      const detail = await startStudentQuestionBankTest(token, {
        subjectId: selectedSubjectId,
        topic: selectedTopic,
        subtopic: selectedSubtopic || undefined,
        gradeLevel,
        questionCount,
      });
      onTestStarted(detail);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Test başlatılamadı',
      );
    } finally {
      setCreatingTest(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAskTeacherFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAskTeacherPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
  };

  const handleCloseCamera = () => {
    stopCamera();
    setCameraOpen(false);
  };

  const handleOpenCamera = async () => {
    setCameraError(null);

    // Tarayıcı getUserMedia desteklemiyorsa eski input davranışına düş
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraOpen(true);

      // Video elementine stream'i bağla
      window.setTimeout(() => {
        const video = cameraVideoRef.current;
        if (video) {
          // eslint-disable-next-line no-param-reassign
          (video as any).srcObject = stream;
          void video.play().catch(() => {
            // ignore play errors
          });
        }
      }, 0);
    } catch (err) {
      const message =
        err instanceof Error
          ? `Kameraya erişilemedi: ${err.message}`
          : 'Kameraya erişim izni verilmedi veya desteklenmiyor.';
      setCameraError(message);
      stopCamera();
    }
  };

  const handleCapturePhoto = () => {
    const video = cameraVideoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `soru-${Date.now()}.jpg`, { type: 'image/jpeg' });
        setAskTeacherFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setAskTeacherPreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      },
      'image/jpeg',
      0.9,
    );

    handleCloseCamera();
  };

  useEffect(
    () => () => {
      stopCamera();
    },
    [],
  );

  const handleAskTeacher = async () => {
    if (!askTeacherFile && !askTeacherMessage.trim()) {
      setAskTeacherError('Lütfen bir fotoğraf ekleyin veya bir mesaj yazın.');
      return;
    }

    setAskTeacherSending(true);
    setAskTeacherError(null);
    try {
      await createStudentHelpRequest(token, {
        message: askTeacherMessage.trim() || undefined,
        image: askTeacherFile || undefined,
        teacherId: selectedTeacherId || undefined,
      });
      setAskTeacherSuccess(true);
      setAskTeacherMessage('');
      setAskTeacherFile(null);
      setAskTeacherPreview(null);
      setTimeout(() => setAskTeacherSuccess(false), 5000);
    } catch (error) {
      setAskTeacherError(
        error instanceof Error ? error.message : 'İstek gönderilemedi',
      );
    } finally {
      setAskTeacherSending(false);
    }
  };

  return (
    <div className="space-y-6 sqb-page">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold sqb-title flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Soru Havuzu
        </h2>
        <div className="flex items-center gap-2 text-sm sqb-subtitle">
          <Brain className="w-4 h-4 text-indigo-400" />
          <span>Pratik yap veya takıldığın soruları sor.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-medium sqb-section-title flex items-center gap-2 px-1">
            <PlayCircle className="w-4 h-4 text-indigo-400" />
            Hızlı Test Oluştur
          </h3>
          <GlassCard className="p-5 space-y-5 sqb-card sqb-card--filters">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs sqb-label mb-1.5 uppercase tracking-wider font-semibold">
                  Sınıf
                </label>
                <select
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full sqb-control"
                >
                  {gradeLevels.map((g) => (
                    <option key={g} value={g}>
                      {g}. Sınıf
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs sqb-label mb-1.5 uppercase tracking-wider font-semibold">
                  Ders
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => {
                    setSelectedSubjectId(e.target.value);
                    setSelectedTopic('');
                    setSelectedSubtopic('');
                  }}
                  className="w-full sqb-control"
                >
                  <option value="">Seçin</option>
                  {subjects.map((s) => (
                    <option key={s.subjectId} value={s.subjectId}>
                      {s.subjectName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs sqb-label mb-1.5 uppercase tracking-wider font-semibold">
                  Konu
                </label>
                <select
                  value={selectedTopic}
                  onChange={(e) => {
                    setSelectedTopic(e.target.value);
                    setSelectedSubtopic('');
                  }}
                  className="w-full sqb-control"
                >
                  <option value="">Seçin</option>
                  {topics.map((t) => (
                    <option key={t.topic} value={t.topic}>
                      {t.topic} ({t.questionCount})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 sqb-divider">
              <div className="flex items-center gap-3">
                <label className="text-xs sqb-label uppercase tracking-wider font-semibold">
                  Soru Sayısı
                </label>
                <input
                  type="number"
                  min={3}
                  max={40}
                  value={questionCount}
                  onChange={(e) =>
                    setQuestionCount(
                      Number.isNaN(Number(e.target.value))
                        ? 10
                        : Number(e.target.value),
                    )
                  }
                  className="w-20 sqb-control text-center"
                />
              </div>

              <button
                type="button"
                onClick={handleStartTest}
                disabled={
                  creatingTest ||
                  metaLoading ||
                  !selectedSubjectId ||
                  !selectedTopic
                }
                className="primary-btn gap-2 px-6"
              >
                {creatingTest ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Hazırlanıyor...
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-4 h-4" />
                    Testi Başlat
                  </>
                )}
              </button>
            </div>

            {metaError && (
              <p className="text-xs text-red-400 font-medium px-1">{metaError}</p>
            )}
            {createError && (
              <p className="text-xs text-red-400 font-medium px-1">{createError}</p>
            )}
          </GlassCard>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium sqb-section-title flex items-center gap-2 px-1">
            <Camera className="w-4 h-4 text-indigo-400" />
            Öğretmene Sor
          </h3>
          <GlassCard className="p-5 space-y-4 sqb-card sqb-card--ask relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none group-hover:bg-indigo-500/10 transition-colors" />

            <div className="space-y-3">
              <p className="text-xs sqb-muted leading-relaxed">
                Çözemediğin bir soru mu var? Fotoğrafını çek veya galeriden yükle, öğretmenin anında görsün!
              </p>

              <div
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  marginTop: '0.25rem',
                }}
              >
                <button
                  type="button"
                  onClick={handleOpenCamera}
                  className="ghost-btn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 1rem',
                    fontSize: '0.8rem',
                    borderRadius: 999,
                    border: '1px solid rgba(59,130,246,0.9)',
                    background: 'rgba(219,234,254,0.95)', // mavi, açık tema için belirgin
                    color: '#1d4ed8', // koyu mavi metin
                    boxShadow: '0 6px 18px rgba(37,99,235,0.35)',
                  }}
                >
                  <Camera className="w-4 h-4" />
                  <span>Kamera</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="ghost-btn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.45rem 1rem',
                    fontSize: '0.8rem',
                    borderRadius: 999,
                    border: '1px solid rgba(59,130,246,0.85)',
                    background: 'rgba(15,23,42,0.9)',
                    color: '#e0f2fe',
                    boxShadow: '0 6px 16px rgba(15,23,42,0.7)',
                  }}
                >
                  <Upload className="w-4 h-4" />
                  <span>Dosya</span>
                </button>
              </div>

              <div style={{ marginTop: '0.75rem' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-muted)',
                    marginBottom: '0.25rem',
                    fontWeight: 700,
                  }}
                >
                  Soru Sormak İstediğin Öğretmen
                </label>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="sqb-control"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    fontSize: '0.85rem',
                  }}
                  disabled={teachersLoading}
                >
                  {teachers.length === 0 && !teachersLoading ? (
                    <option value="">Öğretmen bulunamadı</option>
                  ) : (
                    teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.subjectAreas && t.subjectAreas.length > 0 ? `(${t.subjectAreas.join(', ')})` : ''}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              {askTeacherPreview && (
                <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video bg-black/20">
                  <img
                    src={askTeacherPreview}
                    alt="Soru önizleme"
                    className="w-full h-full object-contain"
                  />
                  <button
                    onClick={() => {
                      setAskTeacherFile(null);
                      setAskTeacherPreview(null);
                    }}
                    className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-full text-white/80 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="flex items-start gap-2">
                <div className="mt-1">
                  <MessageSquare className="w-4 h-4 sqb-icon-muted" />
                </div>
                <textarea
                  value={askTeacherMessage}
                  onChange={(e) => setAskTeacherMessage(e.target.value)}
                  placeholder="Sorunla ilgili eklemek istediğin bir not var mı?"
                  rows={2}
                  className="w-full px-3 py-2.5 sqb-control text-xs resize-none"
                />
              </div>

              <button
                onClick={handleAskTeacher}
                disabled={askTeacherSending || (!askTeacherFile && !askTeacherMessage.trim())}
                className="primary-btn w-full justify-center gap-2"
              >
                {askTeacherSending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Öğretmene Gönder
                  </>
                )}
              </button>

              {askTeacherSuccess && (
                <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg animate-in fade-in slide-in-from-bottom-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-[11px] text-green-400 font-medium">Soru başarıyla gönderildi! Öğretmenine bildirim gitti.</span>
                </div>
              )}

              {askTeacherError && (
                <p className="text-[11px] text-red-400 font-medium px-1">{askTeacherError}</p>
              )}
            </div>
          </GlassCard>

          {cameraOpen && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 80,
                background: 'var(--ui-modal-backdrop-strong)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 480,
                  background: 'var(--ui-modal-surface)',
                  borderRadius: 16,
                  padding: '1rem',
                  border: '1px solid var(--ui-modal-border)',
                  color: 'var(--color-text-main)',
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Kamera ile Fotoğraf Çek</div>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--color-text-muted)',
                    margin: '0 0 0.75rem 0',
                  }}
                >
                  Lütfen çözmek istediğin soruyu kameraya göster ve &quot;Fotoğraf Çek&quot; tuşuna bas.
                </p>
                <div
                  style={{
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: '#000',
                    marginBottom: '0.75rem',
                  }}
                >
                  <video
                    ref={cameraVideoRef}
                    autoPlay
                    playsInline
                    style={{ width: '100%', maxHeight: 320, display: 'block' }}
                  />
                </div>
                {cameraError && (
                  <p style={{ fontSize: '0.8rem', color: '#f87171', marginBottom: '0.5rem' }}>
                    {cameraError}
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={handleCloseCamera}
                    style={{ flex: 1 }}
                  >
                    İptal
                  </button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleCapturePhoto}
                    style={{ flex: 1 }}
                  >
                    Fotoğraf Çek
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



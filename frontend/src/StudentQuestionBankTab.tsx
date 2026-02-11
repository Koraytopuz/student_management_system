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
  getStudentQuestionBankMeta,
  startStudentQuestionBankTest,
  createStudentHelpRequest,
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
  const [meta, setMeta] = useState<StudentQuestionBankMetaResponse | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [gradeLevel, setGradeLevel] = useState<string>(defaultGradeLevel ?? '9');
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  const gradeLevels = useMemo(
    () => ['4', '5', '6', '7', '8', '9', '10', '11', '12'],
    [],
  );

  const subjects: StudentQuestionBankSubjectMeta[] = meta?.subjects ?? [];
  const currentSubject = subjects.find(
    (s) => s.subjectId === selectedSubjectId,
  );
  const topics = currentSubject?.topics ?? [];
  const currentTopic = topics.find((t) => t.topic === selectedTopic);
  const subtopics = currentTopic?.subtopics ?? [];

  useEffect(() => {
    if (!currentSubject && subjects.length > 0) {
      setSelectedSubjectId(subjects[0].subjectId);
      setSelectedTopic('');
      setSelectedSubtopic('');
    }
  }, [subjects.length, currentSubject]);

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
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Soru Havuzu
        </h2>
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Brain className="w-4 h-4 text-indigo-400" />
          <span>Pratik yap veya takıldığın soruları sor.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-medium text-white/80 flex items-center gap-2 px-1">
            <PlayCircle className="w-4 h-4 text-indigo-400" />
            Hızlı Test Oluştur
          </h3>
          <GlassCard className="p-5 space-y-5 border-white/5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wider font-semibold">
                  Sınıf
                </label>
                <select
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                >
                  {gradeLevels.map((g) => (
                    <option key={g} value={g} className="bg-slate-900">
                      {g}. Sınıf
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wider font-semibold">
                  Ders
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => {
                    setSelectedSubjectId(e.target.value);
                    setSelectedTopic('');
                    setSelectedSubtopic('');
                  }}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                >
                  <option value="" className="bg-slate-900">Seçin</option>
                  {subjects.map((s) => (
                    <option key={s.subjectId} value={s.subjectId} className="bg-slate-900">
                      {s.subjectName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wider font-semibold">
                  Konu
                </label>
                <select
                  value={selectedTopic}
                  onChange={(e) => {
                    setSelectedTopic(e.target.value);
                    setSelectedSubtopic('');
                  }}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                >
                  <option value="" className="bg-slate-900">Seçin</option>
                  {topics.map((t) => (
                    <option key={t.topic} value={t.topic} className="bg-slate-900">
                      {t.topic} ({t.questionCount})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wider font-semibold">
                  Alt Konu
                </label>
                <select
                  value={selectedSubtopic}
                  onChange={(e) => setSelectedSubtopic(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
                >
                  <option value="" className="bg-slate-900">Tümü</option>
                  {subtopics.map((st) => (
                    <option key={st} value={st} className="bg-slate-900">
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/5">
              <div className="flex items-center gap-3">
                <label className="text-xs text-white/50 uppercase tracking-wider font-semibold">
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
                  className="w-20 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm text-center focus:outline-none focus:border-indigo-500/50"
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
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
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
          <h3 className="text-sm font-medium text-white/80 flex items-center gap-2 px-1">
            <Camera className="w-4 h-4 text-rose-400" />
            Öğretmene Sor
          </h3>
          <GlassCard className="p-5 space-y-4 border-white/5 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none group-hover:bg-rose-500/10 transition-colors" />

            <div className="space-y-3">
              <p className="text-xs text-white/60 leading-relaxed">
                Çözemediğin bir soru mu var? Fotoğrafını çek veya galeriden yükle, öğretmenin anında görsün!
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-2 p-3 bg-white/5 border border-dashed border-white/10 rounded-2xl hover:bg-white/10 hover:border-rose-500/30 transition-all group/btn"
                >
                  <Camera className="w-5 h-5 text-rose-400 group-hover/btn:scale-110 transition-transform" />
                  <span className="text-[10px] text-white/70 uppercase tracking-widest font-bold">Kamera</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex flex-col items-center justify-center gap-2 p-3 bg-white/5 border border-dashed border-white/10 rounded-2xl hover:bg-white/10 hover:border-indigo-500/30 transition-all group/btn"
                >
                  <Upload className="w-5 h-5 text-indigo-400 group-hover/btn:scale-110 transition-transform" />
                  <span className="text-[10px] text-white/70 uppercase tracking-widest font-bold">Dosya</span>
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
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

              <div className="relative">
                <div className="absolute top-3 left-3 pointer-events-none">
                  <MessageSquare className="w-4 h-4 text-white/30" />
                </div>
                <textarea
                  value={askTeacherMessage}
                  onChange={(e) => setAskTeacherMessage(e.target.value)}
                  placeholder="Sorunla ilgili eklemek istediğin bir not var mı?"
                  rows={2}
                  className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/30 transition-all resize-none"
                />
              </div>

              <button
                onClick={handleAskTeacher}
                disabled={askTeacherSending || (!askTeacherFile && !askTeacherMessage.trim())}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-white/5 text-white text-sm font-bold rounded-xl shadow-lg shadow-rose-900/20 transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
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
        </div>
      </div>
    </div>
  );
}



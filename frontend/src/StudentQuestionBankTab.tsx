import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Brain,
  Loader2,
  PlayCircle,
} from 'lucide-react';
import {
  type StudentAssignmentDetail,
  type StudentQuestionBankMetaResponse,
  type StudentQuestionBankSubjectMeta,
  getStudentQuestionBankMeta,
  startStudentQuestionBankTest,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5" />
          Soru Havuzu Pratik Testi
        </h2>
        <div className="flex items-center gap-2 text-sm text-white/70">
          <Brain className="w-4 h-4 text-indigo-400" />
          <span>Konuna göre hızlı test oluştur.</span>
        </div>
      </div>

      <GlassCard className="p-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-white/60 mb-1">
              Sınıf
            </label>
            <select
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              {gradeLevels.map((g) => (
                <option key={g} value={g}>
                  {g}. Sınıf
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">
              Ders
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => {
                setSelectedSubjectId(e.target.value);
                setSelectedTopic('');
                setSelectedSubtopic('');
              }}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
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
            <label className="block text-xs text-white/60 mb-1">
              Konu
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => {
                setSelectedTopic(e.target.value);
                setSelectedSubtopic('');
              }}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Seçin</option>
              {topics.map((t) => (
                <option key={t.topic} value={t.topic}>
                  {t.topic} ({t.questionCount})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-white/60 mb-1">
              Alt Konu (isteğe bağlı)
            </label>
            <select
              value={selectedSubtopic}
              onChange={(e) => setSelectedSubtopic(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Tümü</option>
              {subtopics.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/10 mt-2">
          <div>
            <label className="block text-xs text-white/60 mb-1">
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
              className="w-24 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {creatingTest ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Test oluşturuluyor...
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                Testi Oluştur ve Başlat
              </>
            )}
          </button>

          {metaLoading && (
            <div className="inline-flex items-center gap-2 text-xs text-white/60">
              <Loader2 className="w-3 h-3 animate-spin" />
              Soru havuzu yükleniyor...
            </div>
          )}
        </div>

        {metaError && (
          <p className="text-xs text-red-400 mt-2">{metaError}</p>
        )}
        {createError && (
          <p className="text-xs text-red-400 mt-1">{createError}</p>
        )}
      </GlassCard>
    </div>
  );
}


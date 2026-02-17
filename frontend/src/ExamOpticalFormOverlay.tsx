import React, { useEffect, useState } from 'react';
import { Loader2, FileText, ChevronLeft, ChevronRight, ListChecks, PenTool } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { Breadcrumb } from './components/DashboardPrimitives';
import { getApiBaseUrl } from './api';

export interface ExamSimple {
  id: number;
  name: string;
  fileUrl?: string | null;
  questionCount: number;
}

interface AiQuestionRaw {
  questionNumber?: number | string;
  question_text?: string;
  options?: string[];
  correct_option?: string | null;
  difficulty?: string;
  topic?: string;
  originalPage?: number;
  imageUrl?: string;
}

interface StudentQuestion {
  questionNumber: number;
  text: string;
  options: string[];
  imageUrl?: string;
  originalPage?: number;
}

interface ExamOpticalFormOverlayProps {
  exam: ExamSimple;
  token: string;
  onClose: () => void;
  onSubmit: (answers: Record<number, string>) => Promise<void>;
  submitting?: boolean;
}

const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E'] as const;

export const ExamOpticalFormOverlay: React.FC<ExamOpticalFormOverlayProps> = ({
  exam,
  token,
  onClose,
  onSubmit,
  submitting = false,
}) => {
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawingEnabled, setDrawingEnabled] = useState(true);
  const [scratchpads, setScratchpads] = useState<Record<number, string>>({});

  useEffect(() => {
    const run = async () => {
      if (!exam.fileUrl || !token) return;
      setLoading(true);
      setError(null);
      try {
        const pdfResp = await fetch(exam.fileUrl);
        if (!pdfResp.ok) {
          throw new Error('PDF indirilemedi.');
        }
        const blob = await pdfResp.blob();
        const form = new FormData();
        form.append('file', blob, 'exam.pdf');

        const resp = await fetch(`${getApiBaseUrl()}/api/ai/extract-questions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: form,
        });
        if (!resp.ok) {
          throw new Error('Sorular otomatik çıkarılamadı.');
        }
        const data = (await resp.json()) as { success?: boolean; questions?: AiQuestionRaw[]; error?: string };
        if (data.success === false || !data.questions || data.questions.length === 0) {
          throw new Error(data.error || 'Sorular otomatik çıkarılamadı. Lütfen PDF üzerinden soruya bakın.');
        }

        const normalized: StudentQuestion[] = data.questions.map((q, idx) => {
          const rawNum = q.questionNumber;
          const qNum =
            typeof rawNum === 'number'
              ? rawNum
              : typeof rawNum === 'string' && /^\d+$/.test(rawNum)
              ? parseInt(rawNum, 10)
              : idx + 1;
          const opts = Array.isArray(q.options) && q.options.length > 0 ? q.options.map((s) => String(s)) : [];
          const safeOptions =
            opts.length > 0
              ? opts.slice(0, CHOICE_LETTERS.length)
              : CHOICE_LETTERS.map((letter) => `${letter})`);

          return {
            questionNumber: qNum,
            text: q.question_text ? String(q.question_text) : '',
            options: safeOptions,
            imageUrl: q.imageUrl && q.imageUrl.length > 0 ? q.imageUrl : undefined,
            originalPage: q.originalPage,
          };
        });

        setQuestions(normalized);
        setCurrentIndex(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Sorular otomatik çıkarılamadı.');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [exam.fileUrl, token]);

  const currentQuestion = questions[currentIndex] ?? null;

  const handleSelect = (letter: string) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.questionNumber]: letter,
    }));
  };

  const handleSubmit = async () => {
    await onSubmit(answers);
  };

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < questions.length - 1;

  const currentScratch = currentQuestion ? scratchpads[currentQuestion.questionNumber] : undefined;

  const imageSrc =
    currentQuestion && currentQuestion.imageUrl
      ? currentQuestion.imageUrl.startsWith('http')
        ? currentQuestion.imageUrl
        : `${getApiBaseUrl()}${currentQuestion.imageUrl}`
      : undefined;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900 px-6 py-4">
        <div className="flex items-center gap-4">
          <Breadcrumb
            items={[
              { label: 'Sınavlar' },
              { label: exam.name },
            ]}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-500 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:border-slate-300 hover:bg-slate-800"
          >
            Kapat
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-lg transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Loader2 className="animate-spin" size={16} /> : null}
            Sınavı Tamamla
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 justify-center px-4 py-4">
        <div className="flex w-full max-w-5xl flex-col gap-4 rounded-2xl border border-slate-700 bg-slate-900/90 p-4 shadow-2xl">
          {/* Loading / error */}
          {loading && (
            <div className="flex flex-1 items-center justify-center gap-2 text-slate-300">
              <Loader2 className="animate-spin" /> Sorular PDF’ten çıkarılıyor...
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-slate-200">
              <FileText size={40} className="text-red-400" />
              <div className="text-sm text-red-200">{error}</div>
              <div className="max-w-md text-xs text-slate-400">
                Lütfen kitapçıktaki soruları PDF üzerinden takip edin ve cevaplarınızı optik formdan
                işaretleyin.
              </div>
            </div>
          )}

          {!loading && !error && currentQuestion && (
            <>
              {/* Top bar: question navigation */}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-xs font-semibold text-slate-100">
                    {currentQuestion.questionNumber}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Aktif Soru
                    </span>
                    <span className="text-xs font-semibold text-slate-100">
                      Soru {currentIndex + 1} / {questions.length}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => hasPrev && setCurrentIndex((i) => Math.max(0, i - 1))}
                    disabled={!hasPrev}
                    className="flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                    Önceki
                  </button>
                  <button
                    type="button"
                    onClick={() => hasNext && setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                    disabled={!hasNext}
                    className="flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Sonraki
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              {/* Main content */}
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                {/* Left: question (image + text) with drawing */}
                <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/90 p-3">
                  {imageSrc && (
                    <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-1">
                      <DrawingCanvas
                        width={560}
                        height={360}
                        backgroundImageUrl={imageSrc}
                        initialImageDataUrl={currentScratch}
                        onChange={(dataUrl) => {
                          setScratchpads((prev) => ({
                            ...prev,
                            [currentQuestion.questionNumber]: dataUrl,
                          }));
                        }}
                        tool="pen"
                        color="#38bdf8"
                        lineWidth={2}
                        eraserWidth={20}
                        readonly={!drawingEnabled}
                      />
                    </div>
                  )}
                  {!imageSrc && (
                    <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-3 text-sm leading-relaxed text-slate-100">
                      {currentQuestion.text || (
                        <span className="text-slate-400">
                          Bu soru için metin otomatik çıkarılamadı. Lütfen PDF üzerinden soruyu okuyun.
                        </span>
                      )}
                    </div>
                  )}
                  {!imageSrc && (
                    <div className="mt-2 rounded-xl border border-slate-700 bg-slate-900/90 p-1">
                      <DrawingCanvas
                        width={560}
                        height={220}
                        backgroundImageUrl={undefined}
                        initialImageDataUrl={currentScratch}
                        onChange={(dataUrl) => {
                          setScratchpads((prev) => ({
                            ...prev,
                            [currentQuestion.questionNumber]: dataUrl,
                          }));
                        }}
                        tool="pen"
                        color="#38bdf8"
                        lineWidth={2}
                        eraserWidth={20}
                        readonly={!drawingEnabled}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setDrawingEnabled((v) => !v)}
                    className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-600 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <PenTool size={12} />
                    Çizim {drawingEnabled ? 'açık' : 'kapalı'}
                  </button>
                </div>

                {/* Right: options (optik/test biçimi) */}
                <div className="space-y-3 rounded-2xl border border-slate-700 bg-slate-950/90 p-3">
                  {currentQuestion.text && imageSrc && (
                    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2 text-xs leading-relaxed text-slate-100">
                      {currentQuestion.text}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Cevabı işaretle
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {currentQuestion.options.map((opt, idx) => {
                        const letter = CHOICE_LETTERS[idx] ?? String.fromCharCode(65 + idx);
                        const selected = answers[currentQuestion.questionNumber] === letter;
                        return (
                          <button
                            key={letter}
                            type="button"
                            onClick={() => handleSelect(letter)}
                            className={[
                              'flex items-center justify-between rounded-xl border px-3 py-2 text-xs font-semibold transition',
                              selected
                                ? 'border-blue-400 bg-blue-600 text-white shadow-md'
                                : 'border-slate-600 bg-slate-900 text-slate-100 hover:border-blue-400 hover:bg-slate-800',
                            ].join(' ')}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={[
                                  'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold',
                                  selected
                                    ? 'bg-white/90 text-blue-700'
                                    : 'border border-slate-600 bg-slate-900 text-slate-100',
                                ].join(' ')}
                              >
                                {letter}
                              </div>
                              <span className="text-left">
                                {opt || `${letter})`}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick question index */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {questions.map((q, idx) => {
                      const active = idx === currentIndex;
                      const answered = !!answers[q.questionNumber];
                      return (
                        <button
                          key={q.questionNumber}
                          type="button"
                          onClick={() => setCurrentIndex(idx)}
                          className={[
                            'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition',
                            active
                              ? 'border border-blue-400 bg-blue-600 text-white'
                              : answered
                              ? 'border border-emerald-500 bg-slate-900 text-emerald-400'
                              : 'border border-slate-700 bg-slate-900 text-slate-300 hover:border-blue-400',
                          ].join(' ')}
                          title={answered ? 'Cevaplandı' : 'Cevapsız'}
                        >
                          {q.questionNumber}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};


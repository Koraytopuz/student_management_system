import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, FileText, Loader2, Maximize2, PenTool, X } from 'lucide-react';
import axios from 'axios';
import { DrawingCanvas } from './DrawingCanvas';
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
const EXTRACT_TIMEOUT_MS = 300000;

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
  const [extractError, setExtractError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [drawingEnabled, setDrawingEnabled] = useState(true);
  const [scratchpads, setScratchpads] = useState<Record<number, string>>({});
  const [pdfPage, setPdfPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const run = async () => {
      if (!token) return;
      setLoading(true);
      setExtractError(null);
      const fallbackCount = Math.max(1, exam.questionCount || 1);
      const makePlaceholderQuestions = (): StudentQuestion[] =>
        Array.from({ length: fallbackCount }, (_, i) => ({
          questionNumber: i + 1,
          text: '',
          options: CHOICE_LETTERS.map((letter) => `${letter})`),
        }));

      try {
        if (exam.fileUrl) {
          const pdfResp = await fetch(exam.fileUrl, { mode: 'cors' });
          if (!pdfResp.ok) throw new Error('PDF indirilemedi.');

          const blob = await pdfResp.blob();
          const file = new File([blob], 'exam.pdf', { type: 'application/pdf' });
          const formData = new FormData();
          formData.append('file', file);

          const baseUrl = getApiBaseUrl();
          const response = await axios.post<{
            success?: boolean;
            questions?: AiQuestionRaw[];
            count?: number;
            error?: string;
          }>(`${baseUrl}/api/ai/extract-questions`, formData, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: EXTRACT_TIMEOUT_MS,
          });

          if (!response.data.success || !Array.isArray(response.data.questions)) {
            setExtractError(
              response.data.error ||
                'Sorular otomatik çıkarılamadı. Kitapçıktaki soru sayısına göre form açıldı.',
            );
            setQuestions(makePlaceholderQuestions());
            return;
          }

          const rawQuestions = response.data.questions;
          if (rawQuestions.length === 0) {
            setExtractError("PDF'ten soru bulunamadı. Kitapçıktaki soru sayısına göre form açıldı.");
            setQuestions(makePlaceholderQuestions());
            return;
          }

          const normalized: StudentQuestion[] = rawQuestions.map((q, idx) => {
            const rawNum = q.questionNumber;
            const qNum =
              typeof rawNum === 'number'
                ? rawNum
                : typeof rawNum === 'string' && /^\d+$/.test(rawNum)
                  ? parseInt(rawNum, 10)
                  : idx + 1;
            const opts =
              Array.isArray(q.options) && q.options.length > 0
                ? q.options
                    .slice(0, CHOICE_LETTERS.length)
                    .map((s, i) => String(s).trim() || `${CHOICE_LETTERS[i] ?? 'A'})`)
                : [];
            return {
              questionNumber: qNum,
              text: q.question_text ? String(q.question_text) : '',
              options: opts.length > 0 ? opts : CHOICE_LETTERS.map((l) => `${l})`),
              imageUrl: q.imageUrl && q.imageUrl.length > 0 ? q.imageUrl : undefined,
              originalPage: q.originalPage,
            };
          });

          setQuestions(normalized);
          return;
        }
        setQuestions(makePlaceholderQuestions());
      } catch (e) {
        const msg = axios.isAxiosError(e)
          ? (e.response?.data as { error?: string })?.error ?? e.message
          : e instanceof Error
            ? e.message
            : 'Sorular otomatik çıkarılamadı.';
        setExtractError(msg);
        setQuestions(makePlaceholderQuestions());
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [exam.fileUrl, exam.questionCount, token]);

  const currentQuestion = questions[currentIndex] ?? null;

  const handleSelect = (letter: string) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.questionNumber]: letter }));
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(answers);
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Gönderim başarısız. Lütfen tekrar deneyin.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < questions.length - 1;
  const currentScratch = currentQuestion ? scratchpads[currentQuestion.questionNumber] : undefined;
  const answeredCount = Object.keys(answers).length;

  const imageSrc = currentQuestion?.imageUrl
    ? currentQuestion.imageUrl.startsWith('http')
      ? currentQuestion.imageUrl
      : `${getApiBaseUrl()}${currentQuestion.imageUrl}`
    : undefined;

  const pdfViewerUrl = exam.fileUrl ? `${exam.fileUrl}#page=${pdfPage}` : undefined;

  // ─── Success Screen ───────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-slate-950 text-white">
        <div className="flex max-w-md flex-col items-center gap-6 text-center px-6">
          <div className="flex size-24 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-500/30">
            <CheckCircle2 className="size-12 text-emerald-400" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Sınav Tamamlandı!</h1>
            <p className="mt-2 text-slate-400">
              <span className="font-semibold text-slate-200">{exam.name}</span> sınavındaki
              cevaplarınız başarıyla kaydedildi.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Toplam Soru</span>
              <span className="font-semibold text-white">{questions.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Cevaplanmış</span>
              <span className="font-semibold text-emerald-400">{answeredCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Boş Bırakılan</span>
              <span className="font-semibold text-amber-400">
                {questions.length - answeredCount}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Sonuçlarınız öğretmeniniz tarafından değerlendirilecek ve analiz raporunuz hazırlandıktan
            sonra bildirim alacaksınız.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-linear-to-r from-indigo-600 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-indigo-400 active:scale-[0.98]"
          >
            Panele Dön
          </button>
        </div>
      </div>
    );
  }

  // ─── Main Exam Screen ─────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-100 flex flex-col bg-slate-950 text-white">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-slate-700/60 bg-slate-900/95 px-4 py-2.5 backdrop-blur-sm md:px-6 md:py-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium text-slate-500 shrink-0">Sınav</span>
            <span className="text-slate-600">/</span>
            <span className="truncate text-sm font-semibold text-slate-100">{exam.name}</span>
          </div>
          {questions.length > 0 && (
            <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-400">
              {currentIndex + 1} / {questions.length}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => setDrawingEnabled((v) => !v)}
            className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition md:flex ${
              drawingEnabled
                ? 'bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/40'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <PenTool size={13} />
            {drawingEnabled ? 'Çizim Açık' : 'Çizim Kapalı'}
          </button>

          <button
            type="button"
            onClick={onClose}
            title="Sınavı Kapat"
            className="flex items-center gap-1.5 rounded-lg border border-slate-600/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
          >
            <X size={14} />
            <span className="hidden sm:inline">Kapat</span>
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || submitting}
            className="flex items-center gap-2 rounded-xl bg-linear-to-r from-indigo-600 to-indigo-500 px-4 py-1.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50 active:scale-95"
          >
            {isSubmitting || submitting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            Sınavı Bitir
          </button>
        </div>
      </header>

      {/* Submit error banner */}
      {submitError && (
        <div className="flex shrink-0 items-center gap-3 bg-red-950/60 px-4 py-2.5 border-b border-red-800/50">
          <span className="text-sm text-red-300">{submitError}</span>
          <button
            type="button"
            onClick={() => setSubmitError(null)}
            className="ml-auto text-red-400 hover:text-red-200"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main content */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Loading state */}
        {loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-slate-400">
            <div className="relative">
              <Loader2 className="size-14 animate-spin text-indigo-400" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-300">Sorular hazırlanıyor…</p>
              <p className="mt-1 text-xs text-slate-500">
                PDF'ten sorular çıkarılıyor, bu birkaç dakika sürebilir.
              </p>
            </div>
          </div>
        )}

        {/* No questions fallback */}
        {!loading && questions.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <FileText className="size-14 text-amber-500" strokeWidth={1.5} />
            <p className="text-slate-200">{extractError ?? 'Sınav yüklenemedi.'}</p>
            <p className="max-w-sm text-xs text-slate-500">
              Lütfen kitapçıktaki soruları takip ederek cevaplarınızı aşağıdan işaretleyin.
            </p>
          </div>
        )}

        {/* Active question */}
        {!loading && currentQuestion && (
          <div className="flex min-h-0 flex-1 flex-col gap-0 md:flex-row">
            {/* ── Question area (left) ── */}
            <section className="flex min-w-0 flex-1 flex-col overflow-hidden md:border-r md:border-slate-700/60">
              {/* Extraction warning banner */}
              {extractError && (
                <div className="flex shrink-0 items-center gap-2 border-b border-amber-700/40 bg-amber-950/30 px-4 py-2">
                  <FileText className="size-4 shrink-0 text-amber-400" />
                  <span className="flex-1 text-xs text-amber-300">{extractError}</span>
                  {exam.fileUrl && (
                    <a
                      href={exam.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-800/50 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-700/60 transition"
                    >
                      <Maximize2 size={11} />
                      PDF Aç
                    </a>
                  )}
                </div>
              )}

              {/* Question display */}
              {imageSrc ? (
                <div className="relative flex flex-1 flex-col overflow-hidden">
                  <div className="flex flex-1 items-center justify-center overflow-hidden p-3">
                    <DrawingCanvas
                      width={820}
                      height={520}
                      backgroundImageUrl={imageSrc}
                      initialImageDataUrl={currentScratch}
                      onChange={(dataUrl) => {
                        if (currentQuestion) {
                          setScratchpads((prev) => ({
                            ...prev,
                            [currentQuestion.questionNumber]: dataUrl,
                          }));
                        }
                      }}
                      tool="pen"
                      color="#38bdf8"
                      lineWidth={2}
                      eraserWidth={24}
                      readonly={!drawingEnabled}
                    />
                  </div>
                  {currentQuestion.text && (
                    <div className="shrink-0 border-t border-slate-700/60 bg-slate-900/80 px-4 py-3 text-sm leading-relaxed text-slate-200">
                      {currentQuestion.text}
                    </div>
                  )}
                </div>
              ) : exam.fileUrl ? (
                <div className="flex flex-1 flex-col overflow-hidden">
                  {/* PDF nav toolbar */}
                  <div className="flex shrink-0 items-center justify-between border-b border-slate-700/60 bg-slate-900/60 px-4 py-1.5">
                    <span className="text-xs text-slate-400">
                      Kitapçıktan soruyu okuyup cevabı sağdan işaretleyin
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                        className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition"
                      >
                        ‹ Önceki
                      </button>
                      <span className="text-xs text-slate-500">Sayfa {pdfPage}</span>
                      <button
                        type="button"
                        onClick={() => setPdfPage((p) => p + 1)}
                        className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition"
                      >
                        Sonraki ›
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <iframe
                      src={pdfViewerUrl}
                      title="Sınav PDF"
                      className="h-full w-full border-0"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                  {/* Drawing area below PDF */}
                  <div className="shrink-0 border-t border-slate-700/60 bg-slate-900/60 p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                        Karalama Alanı
                      </span>
                      <button
                        type="button"
                        onClick={() => setDrawingEnabled((v) => !v)}
                        className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition ${
                          drawingEnabled ? 'text-sky-400' : 'text-slate-500'
                        }`}
                      >
                        <PenTool size={11} />
                        {drawingEnabled ? 'Kalem' : 'Kapalı'}
                      </button>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/80">
                      <DrawingCanvas
                        width={620}
                        height={140}
                        backgroundImageUrl={undefined}
                        initialImageDataUrl={currentScratch}
                        onChange={(dataUrl) => {
                          if (currentQuestion) {
                            setScratchpads((prev) => ({
                              ...prev,
                              [currentQuestion.questionNumber]: dataUrl,
                            }));
                          }
                        }}
                        tool="pen"
                        color="#38bdf8"
                        lineWidth={2}
                        eraserWidth={20}
                        readonly={!drawingEnabled}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Text-only question (no PDF, no image) */
                <div className="flex flex-1 flex-col overflow-hidden p-4 gap-4">
                  <div className="rounded-xl border border-slate-700/80 bg-slate-900/70 p-5 text-slate-200 leading-relaxed">
                    {currentQuestion.text ? (
                      currentQuestion.text
                    ) : (
                      <span className="text-slate-500 italic">
                        Bu soru için metin otomatik çıkarılamadı. Lütfen kitapçıktan soruyu okuyun.
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                        Karalama / Çizim
                      </span>
                      <button
                        type="button"
                        onClick={() => setDrawingEnabled((v) => !v)}
                        className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs transition ${
                          drawingEnabled ? 'text-sky-400' : 'text-slate-500'
                        }`}
                      >
                        <PenTool size={11} />
                        {drawingEnabled ? 'Kalem Açık' : 'Kalem Kapalı'}
                      </button>
                    </div>
                    <div className="rounded-xl border border-slate-700 bg-slate-950/80">
                      <DrawingCanvas
                        width={620}
                        height={220}
                        backgroundImageUrl={undefined}
                        initialImageDataUrl={currentScratch}
                        onChange={(dataUrl) => {
                          if (currentQuestion) {
                            setScratchpads((prev) => ({
                              ...prev,
                              [currentQuestion.questionNumber]: dataUrl,
                            }));
                          }
                        }}
                        tool="pen"
                        color="#38bdf8"
                        lineWidth={2}
                        eraserWidth={20}
                        readonly={!drawingEnabled}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* ── Answer panel (right) ── */}
            <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto p-3 md:w-72 md:p-4">
              {/* Answer options */}
              <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-3">
                <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Cevabı İşaretle
                </h3>
                <div className="flex flex-col gap-1.5">
                  {currentQuestion.options.map((opt, idx) => {
                    const letter = CHOICE_LETTERS[idx] ?? String.fromCharCode(65 + idx);
                    const selected = answers[currentQuestion.questionNumber] === letter;
                    return (
                      <button
                        key={letter}
                        type="button"
                        onClick={() => handleSelect(letter)}
                        className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left text-sm font-medium transition-all active:scale-[0.98] ${
                          selected
                        ? 'border-indigo-500 bg-linear-to-r from-indigo-600/90 to-indigo-500/90 text-white shadow-lg shadow-indigo-500/20'
                            : 'border-slate-700/60 bg-slate-800/60 text-slate-200 hover:border-indigo-500/40 hover:bg-slate-800'
                        }`}
                      >
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all ${
                            selected
                              ? 'bg-white text-indigo-700 shadow-sm'
                              : 'border border-slate-600 bg-slate-900 text-slate-400'
                          }`}
                        >
                          {letter}
                        </span>
                        {(opt && String(opt).trim() !== `${letter})`) ? (
                          <span className="truncate text-sm">{opt}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 p-2">
                <button
                  type="button"
                  onClick={() => hasPrev && setCurrentIndex((i) => Math.max(0, i - 1))}
                  disabled={!hasPrev}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                  Önceki
                </button>
                <div className="h-6 w-px bg-slate-700" />
                <button
                  type="button"
                  onClick={() =>
                    hasNext && setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
                  }
                  disabled={!hasNext}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Sonraki
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Question grid */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Soru Durumu
                  </p>
                  <span className="text-[11px] text-slate-500">
                    {answeredCount}/{questions.length} cevaplandı
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {questions.map((q, idx) => {
                    const active = idx === currentIndex;
                    const answered = !!answers[q.questionNumber];
                    return (
                      <button
                        key={q.questionNumber}
                        type="button"
                        onClick={() => setCurrentIndex(idx)}
                        title={answered ? `Soru ${q.questionNumber}: Cevaplandı` : `Soru ${q.questionNumber}: Cevapsız`}
                        className={`flex size-8 items-center justify-center rounded-lg text-xs font-semibold transition ${
                          active
                            ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-1 ring-offset-slate-900'
                            : answered
                              ? 'bg-emerald-600/25 text-emerald-400 ring-1 ring-emerald-500/40'
                              : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
                        }`}
                      >
                        {q.questionNumber}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Submit button (repeated at bottom for easy access) */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-indigo-600 to-indigo-500 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition hover:from-indigo-500 hover:to-violet-500 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
              >
                {isSubmitting || submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Sınavı Tamamla
              </button>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};

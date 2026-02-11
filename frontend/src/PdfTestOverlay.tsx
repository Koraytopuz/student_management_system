import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { HelpCircle, Camera, Image, Trash2, Loader2 } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { Breadcrumb } from './components/DashboardPrimitives';
import { getStudentTeachers } from './api';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const BASE_SCALE = 5;
const CHOICES = ['A', 'B', 'C', 'D', 'E'] as const;

export interface PdfTestAssignment {
  id: string;
  title: string;
  testAsset: {
    id: string;
    fileUrl: string;
    fileName: string;
    title: string;
    mimeType: string;
  };
}

interface PdfTestOverlayProps {
  assignment: PdfTestAssignment;
  fileUrl: string;
  timeLimitMinutes?: number;
  answerKey?: Record<string, string>;
  remainingSeconds?: number | null;
  onTimeUp?: (answers: Record<number, string>) => void;
  onClose: () => void;
  onSubmit: (answers: Record<number, string>) => Promise<void>;
  onAskTeacher?: (questionId: string, message?: string, studentAnswer?: string, image?: File, teacherId?: string) => Promise<void>;
  submitting?: boolean;
  token?: string | null;
}

interface TeacherListItem {
  id: string;
  name: string;
  subjectAreas?: string[];
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const PdfTestOverlay: React.FC<PdfTestOverlayProps> = ({
  assignment,
  fileUrl,
  timeLimitMinutes: _timeLimitMinutes,
  answerKey,
  remainingSeconds,
  onTimeUp,
  onClose,
  onSubmit,
  onAskTeacher,
  submitting = false,
  token,
}) => {
  const [numPages, setNumPages] = useState(0);
  const [pageImages, setPageImages] = useState<Record<number, string>>({});
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDrawing, setShowDrawing] = useState(false);
  const [annotations, setAnnotations] = useState<Record<number, string>>({});
  const [scratchpads, setScratchpads] = useState<Record<number, string>>({});
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [drawingTool, setDrawingTool] = useState<'pen' | 'line' | 'rect' | 'triangle' | 'eraser'>('pen');
  const [drawingColor, setDrawingColor] = useState<string>('#1d4ed8');
  const [askTeacherOpen, setAskTeacherOpen] = useState(false);
  const [askTeacherMessage, setAskTeacherMessage] = useState('');
  const [askTeacherSending, setAskTeacherSending] = useState(false);
  const [askTeacherFile, setAskTeacherFile] = useState<File | null>(null);
  const [askTeacherPreview, setAskTeacherPreview] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<TeacherListItem[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
  const [teachersLoading, setTeachersLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const drawingLineWidth = 3;
  const eraserWidth = 18;
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const timeUpFiredRef = useRef(false);

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
  const canvasMaxWidth = Math.min(viewportWidth - 48, 1800);
  const canvasMaxHeight = Math.max(450, Math.floor(viewportHeight * 0.58));
  const drawingAreaHeight = Math.max(380, Math.floor(viewportHeight * 0.42));
  const canvasPixelWidth = Math.round(canvasMaxWidth * dpr);
  const canvasPixelHeight = Math.round(canvasMaxHeight * dpr);

  const renderPageToImage = useCallback(async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<string> => {
    const page = await pdfDoc.getPage(pageNum);
    const scale = BASE_SCALE * dpr;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');

    const w = Math.min(viewport.width, canvasMaxWidth * dpr);
    const h = (viewport.height * w) / viewport.width;
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);

    const scaledViewport = page.getViewport({ scale: (scale * w) / viewport.width });
    await page.render({
      canvas,
      canvasContext: context,
      viewport: scaledViewport,
      intent: 'display',
      background: 'rgb(255,255,255)',
    }).promise;

    return canvas.toDataURL('image/png');
  }, [canvasMaxWidth, dpr]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          url: fileUrl,
          withCredentials: false,
        });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        docRef.current = pdfDoc;
        const n = pdfDoc.numPages;
        setNumPages(n);

        const images: Record<number, string> = {};
        for (let i = 1; i <= n; i++) {
          if (cancelled) return;
          images[i] = await renderPageToImage(pdfDoc, i);
        }
        if (!cancelled) setPageImages(images);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'PDF yüklenemedi.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      docRef.current = null;
    };
  }, [fileUrl, renderPageToImage]);

  const pageKey = currentPageIndex + 1;
  const currentPageImage = pageImages[pageKey];
  const correctAnswer = answerKey?.[String(pageKey)];
  const selectedAnswer = answers[pageKey];
  const showAnswerFeedback =
    correctAnswer && selectedAnswer && correctAnswer.length > 0;
  const isCorrect = showAnswerFeedback && selectedAnswer === correctAnswer;

  useEffect(() => {
    if (
      typeof remainingSeconds === 'number' &&
      remainingSeconds <= 0 &&
      onTimeUp &&
      !timeUpFiredRef.current
    ) {
      timeUpFiredRef.current = true;
      onTimeUp(answers);
    }
  }, [remainingSeconds, onTimeUp, answers]);
  const hasPrev = currentPageIndex > 0;
  const hasNext = currentPageIndex < numPages - 1;
  const pdfQuestionId = `pdf-page-${pageKey}`;

  const handlePrev = () => {
    if (hasPrev) setCurrentPageIndex((i) => i - 1);
  };

  const handleNext = () => {
    if (hasNext) setCurrentPageIndex((i) => i + 1);
  };

  const handleAnnotationChange = (dataUrl: string) => {
    setAnnotations((prev) => ({ ...prev, [pageKey]: dataUrl }));
  };

  const handleScratchpadChange = (dataUrl: string) => {
    setScratchpads((prev) => ({ ...prev, [pageKey]: dataUrl }));
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

  const clearFile = () => {
    setAskTeacherFile(null);
    setAskTeacherPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const triggerCamera = () => {
    cameraInputRef.current?.click();
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  useEffect(() => {
    let cancelled = false;
    const fetchTeachers = async () => {
      if (!token || !askTeacherOpen) return;
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
  }, [token, askTeacherOpen]);

  const handleAskTeacher = async () => {
    if (!onAskTeacher) return;
    setAskTeacherSending(true);
    try {
      await onAskTeacher(
        pdfQuestionId,
        askTeacherMessage.trim() || undefined,
        answers[pageKey] || undefined,
        askTeacherFile || undefined,
        selectedTeacherId || undefined,
      );
      setAskTeacherOpen(false);
      setAskTeacherMessage('');
      clearFile();
    } finally {
      setAskTeacherSending(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.95)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 60,
          color: '#e5e7eb',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1rem' }}>PDF yükleniyor...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.95)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 60,
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            background: '#0b1220',
            borderRadius: 16,
            padding: '1.5rem',
            border: '1px solid rgba(239,68,68,0.5)',
            color: '#e5e7eb',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#fca5a5' }}>
            Yükleme hatası
          </div>
          <p style={{ margin: '0 0 1rem 0', opacity: 0.9 }}>{error}</p>
          <button
            type="button"
            className="ghost-btn"
            onClick={onClose}
            style={{
              border: '1px solid rgba(148,163,184,0.9)',
              background: 'rgba(15,23,42,0.9)',
              color: '#e5e7eb',
            }}
          >
            Kapat
          </button>
        </div>
      </div>
    );
  }

  if (numPages === 0) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.95)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 60,
        }}
      >
        <div style={{ color: '#e5e7eb', textAlign: 'center' }}>
          <p>Bu PDF dosyasında sayfa bulunamadı.</p>
          <button type="button" className="ghost-btn" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    );
  }

  const mainContent = (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          display: 'flex',
          flexDirection: 'column',
          background: '#0b1220',
          color: '#e5e7eb',
        }}
      >
        <div
          style={{
            padding: '0.75rem 1rem',
            borderBottom: '1px solid rgba(55,65,81,0.8)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <Breadcrumb
            items={[
              { label: 'Ödevler' },
              { label: assignment.title },
              { label: `Soru ${currentPageIndex + 1} / ${numPages}` },
            ]}
            variant="default"
          />
          {typeof remainingSeconds === 'number' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                marginRight: '0.5rem',
              }}
            >
              <div style={{ fontSize: '0.7rem', opacity: 0.7, textTransform: 'uppercase' }}>
                Kalan süre
              </div>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: remainingSeconds <= 60 ? '#fb7185' : '#e5e7eb',
                }}
              >
                {formatCountdown(remainingSeconds)}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ghost-btn"
            style={{
              border: '1px solid rgba(148,163,184,0.9)',
              background: 'rgba(15,23,42,0.9)',
              color: '#e5e7eb',
            }}
          >
            Kapat
          </button>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '1rem 1.5rem',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: canvasMaxWidth,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            {onAskTeacher && (
              <button
                type="button"
                onClick={() => setAskTeacherOpen(true)}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  zIndex: 10,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: 999,
                  border: '1px solid rgba(59,130,246,0.9)',
                  background: 'rgba(30,58,138,0.6)',
                  color: '#93c5fd',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                <HelpCircle size={16} />
                Öğretmene Sor
              </button>
            )}

            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                {['Serbest', 'Çizgi', 'Dikdörtgen', 'Silgi'].map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    className={drawingTool === (['pen', 'line', 'rect', 'eraser'] as const)[i] ? 'primary-btn' : 'ghost-btn'}
                    onClick={() => setDrawingTool((['pen', 'line', 'rect', 'eraser'] as const)[i])}
                    style={
                      drawingTool !== (['pen', 'line', 'rect', 'eraser'] as const)[i]
                        ? {
                            border: '1px solid rgba(55,65,81,0.9)',
                            background: 'rgba(15,23,42,0.9)',
                            color: '#e5e7eb',
                          }
                        : undefined
                    }
                  >
                    {label}
                  </button>
                ))}
                {['#1d4ed8', '#be123c', '#047857', '#eab308'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDrawingColor(c)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '999px',
                      border: drawingColor === c ? '2px solid #e5e7eb' : '1px solid rgba(148,163,184,0.8)',
                      background: c,
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <DrawingCanvas
                key={`anno-${pageKey}`}
                width={canvasPixelWidth}
                height={canvasPixelHeight}
                canvasDisplayWidth={canvasMaxWidth}
                canvasDisplayHeight={canvasMaxHeight}
                backgroundImageUrl={annotations[pageKey] ? undefined : currentPageImage}
                initialImageDataUrl={annotations[pageKey] ?? undefined}
                onChange={handleAnnotationChange}
                onClearToBackground={() =>
                  setAnnotations((prev) => {
                    const next = { ...prev };
                    delete next[pageKey];
                    return next;
                  })
                }
                tool={drawingTool}
                color={drawingColor}
                lineWidth={drawingLineWidth}
                eraserWidth={eraserWidth}
              />
            </div>

            <div
              style={{
                marginTop: '1rem',
                width: '100%',
                maxWidth: canvasMaxWidth,
              }}
            >
              <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem', opacity: 0.9 }}>
                Cevabını seç:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                {CHOICES.map((choice) => {
                  const isSelected = answers[pageKey] === choice;
                  const showAsCorrect = showAnswerFeedback && isSelected && isCorrect;
                  const showAsIncorrect = showAnswerFeedback && isSelected && !isCorrect;
                  return (
                    <button
                      key={choice}
                      type="button"
                      onClick={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [pageKey]: prev[pageKey] === choice ? '' : choice,
                        }))
                      }
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: 12,
                        border:
                          showAsCorrect
                            ? '2px solid #22c55e'
                            : showAsIncorrect
                              ? '2px solid #ef4444'
                              : isSelected
                                ? '2px solid #6366f1'
                                : '1px solid rgba(71,85,105,0.9)',
                        background: showAsCorrect
                          ? 'rgba(34,197,94,0.2)'
                          : showAsIncorrect
                            ? 'rgba(239,68,68,0.2)'
                            : isSelected
                              ? 'rgba(99,102,241,0.2)'
                              : 'rgba(15,23,42,0.8)',
                        color: showAsCorrect
                          ? '#4ade80'
                          : showAsIncorrect
                            ? '#f87171'
                            : isSelected
                              ? '#a5b4fc'
                              : '#e5e7eb',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {choice}
                      {showAsCorrect && ' ✓'}
                      {showAsIncorrect && ' ✗'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                marginTop: '1.25rem',
                width: '100%',
                maxWidth: canvasMaxWidth,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={handlePrev}
                  disabled={!hasPrev}
                  style={{
                    border: '1px solid rgba(148,163,184,0.9)',
                    background: 'rgba(15,23,42,0.9)',
                    color: '#e5e7eb',
                    opacity: hasPrev ? 1 : 0.5,
                  }}
                >
                  Önceki
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={handleNext}
                  disabled={!hasNext}
                  style={{
                    border: '1px solid rgba(148,163,184,0.9)',
                    background: 'rgba(15,23,42,0.9)',
                    color: '#e5e7eb',
                    opacity: hasNext ? 1 : 0.5,
                  }}
                >
                  Sonraki
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => setShowDrawing(true)}
                  style={{
                    border: '1px solid rgba(59,130,246,0.9)',
                    background: 'rgba(30,58,138,0.5)',
                    color: '#93c5fd',
                  }}
                >
                  Çizim Alanını Aç
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => onSubmit(answers)}
                  disabled={submitting}
                >
                  {submitting ? 'Gönderiliyor...' : 'Teslim Et'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showDrawing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            display: 'flex',
            flexDirection: 'column',
            background: '#0b1220',
            color: '#e5e7eb',
          }}
        >
          <div
            style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid rgba(55,65,81,0.8)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7, textTransform: 'uppercase' }}>
                Çizim Alanı
              </div>
              <div style={{ fontSize: '1rem' }}>Soru {currentPageIndex + 1} – Çözüm</div>
            </div>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => setShowDrawing(false)}
              style={{
                border: '1px solid rgba(148,163,184,0.9)',
                background: 'rgba(15,23,42,0.9)',
                color: '#e5e7eb',
              }}
            >
              Kapat
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: '1rem 1.5rem',
              gap: '1rem',
            }}
          >
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '0.5rem',
                background: 'rgba(15,23,42,0.6)',
                borderRadius: 12,
              }}
            >
              <img
                src={currentPageImage}
                alt={`Soru ${pageKey}`}
                style={{
                  maxWidth: '100%',
                  maxHeight: Math.floor(viewportHeight * 0.48),
                  objectFit: 'contain',
                }}
              />
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {[
                  { id: 'pen', label: 'Serbest' },
                  { id: 'line', label: 'Çizgi' },
                  { id: 'rect', label: 'Dikdörtgen' },
                  { id: 'triangle', label: 'Üçgen' },
                  { id: 'eraser', label: 'Silgi' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={drawingTool === t.id ? 'primary-btn' : 'ghost-btn'}
                    onClick={() => setDrawingTool(t.id as any)}
                    style={
                      drawingTool !== t.id
                        ? { border: '1px solid rgba(55,65,81,0.9)', background: 'rgba(15,23,42,0.9)', color: '#e5e7eb' }
                        : undefined
                    }
                  >
                    {t.label}
                  </button>
                ))}
                {['#111827', '#1d4ed8', '#be123c', '#047857'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDrawingColor(c)}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '999px',
                      border: drawingColor === c ? '2px solid #e5e7eb' : '1px solid rgba(148,163,184,0.8)',
                      background: c,
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem', opacity: 0.9 }}>
                Boş çizim alanı – Soruyu burada çözebilirsin
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
              <DrawingCanvas
                key={`scratch-${pageKey}`}
                width={canvasMaxWidth}
                height={drawingAreaHeight}
                initialImageDataUrl={scratchpads[pageKey]}
                onChange={handleScratchpadChange}
                tool={drawingTool}
                color={drawingColor}
                lineWidth={drawingLineWidth}
                eraserWidth={eraserWidth}
              />
              </div>
            </div>
          </div>
        </div>
      )}

      {askTeacherOpen && onAskTeacher && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '1.5rem',
          }}
          onClick={() => !askTeacherSending && setAskTeacherOpen(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: '#0b1220',
              borderRadius: 16,
              padding: '1.25rem',
              border: '1px solid rgba(55,65,81,0.9)',
              color: '#e5e7eb',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>
              Öğretmene Sor – Soru {pageKey}
            </div>
            <p style={{ fontSize: '0.9rem', opacity: 0.85, margin: '0 0 1rem 0' }}>
              Öğretmeniniz hangi test ve hangi soruda takıldığınızı görecek. Sesli veya görüntülü çözüm gönderebilir.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.25rem', fontWeight: 600 }}>
                Hangi Öğretmene Sormak İstiyorsun?
              </label>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: 8,
                  background: '#1a2234',
                  color: '#e5e7eb',
                  border: '1px solid rgba(148,163,184,0.4)',
                  fontSize: '0.9rem',
                }}
                disabled={teachersLoading}
              >
                {teachers.length === 0 && !teachersLoading ? (
                  <option value="">Öğretmen bulunamadı</option>
                ) : (
                  teachers.map((t) => (
                    <option key={t.id} value={t.id} style={{ background: '#0b1220' }}>
                      {t.name} {t.subjectAreas && t.subjectAreas.length > 0 ? `(${t.subjectAreas.join(', ')})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
            <textarea
              placeholder="Ek not (isteğe bağlı)"
              value={askTeacherMessage}
              onChange={(e) => setAskTeacherMessage(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: 8,
                background: '#1a2234',
                color: '#e5e7eb',
                border: '1px solid rgba(148,163,184,0.4)',
                fontSize: '0.9rem',
                marginBottom: '1rem',
                resize: 'none',
              }}
            />

            {/* Fotoğraf Seçenekleri */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button
                  type="button"
                  onClick={triggerCamera}
                  className="ghost-btn"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem',
                    borderRadius: 10,
                    border: '1px solid rgba(99,102,241,0.4)',
                    background: 'rgba(99,102,241,0.05)',
                    color: '#c7d2fe',
                  }}
                >
                  <Camera size={18} />
                  Foto Çek
                </button>
                <button
                  type="button"
                  onClick={triggerFileInput}
                  className="ghost-btn"
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem',
                    borderRadius: 10,
                    border: '1px solid rgba(148,163,184,0.3)',
                    background: 'rgba(15,23,42,0.4)',
                    color: '#94a3b8',
                  }}
                >
                  <Image size={18} />
                  Galeriden Seç
                </button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleFileChange}
              />
              <input
                type="file"
                ref={cameraInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
              />

              {askTeacherPreview && (
                <div style={{ position: 'relative', marginTop: '0.5rem', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.3)' }}>
                  <img
                    src={askTeacherPreview}
                    alt="Önizleme"
                    style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }}
                  />
                  <button
                    type="button"
                    onClick={clearFile}
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      background: 'rgba(239,68,68,0.85)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setAskTeacherOpen(false)}
                disabled={askTeacherSending}
                style={{
                  border: '1px solid rgba(148,163,184,0.3)',
                  color: '#94a3b8',
                }}
              >
                Vazgeç
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleAskTeacher}
                disabled={askTeacherSending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.5rem 1.25rem',
                }}
              >
                {askTeacherSending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Gönderiliyor...
                  </>
                ) : (
                  'Soruyu Gönder'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return mainContent;
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Loader2, FileText, ChevronLeft, ChevronRight, PenTool, CheckCircle, ListChecks } from 'lucide-react';
import { DrawingCanvas } from './DrawingCanvas';
import { Breadcrumb } from './components/DashboardPrimitives';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const BASE_SCALE = 1.5; // Adjusted scale for better reading
const CHOICES = ['A', 'B', 'C', 'D', 'E'] as const;

export interface ExamSimple {
  id: number;
  name: string;
  fileUrl?: string | null;
  questionCount: number;
}

interface ExamOpticalFormOverlayProps {
  exam: ExamSimple;
  onClose: () => void;
  onSubmit: (answers: Record<number, string>) => Promise<void>;
  submitting?: boolean;
}

export const ExamOpticalFormOverlay: React.FC<ExamOpticalFormOverlayProps> = ({
  exam,
  onClose,
  onSubmit,
  submitting = false,
}) => {
  const [numPages, setNumPages] = useState(0);
  const [pageImages, setPageImages] = useState<Record<number, string>>({});
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [loading, setLoading] = useState(false); // Only true if fileUrl exists
  const [error, setError] = useState<string | null>(null);
  const [showDrawing, setShowDrawing] = useState(false);
  const [annotations, setAnnotations] = useState<Record<number, string>>({});
  const [answers, setAnswers] = useState<Record<number, string>>({});
  
  // Drawing state
  const [drawingTool] = useState<'pen' | 'line' | 'rect' | 'eraser'>('pen');
  const [drawingColor] = useState<string>('#1d4ed8');
  
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Unused: viewportWidth, dpr
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const canvasMaxWidth = Math.min(viewportWidth - 400, 1200); // Reserve space for optical form
  
  const renderPageToImage = useCallback(async (pdfDoc: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<string> => {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: BASE_SCALE });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');

    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    await page.render({
      canvasContext: context,
      viewport: viewport,
      intent: 'display',
      background: 'rgb(255,255,255)',
    } as any).promise;

    return canvas.toDataURL('image/png');
  }, []);

  useEffect(() => {
    if (!exam.fileUrl) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({
          url: exam.fileUrl!,
          withCredentials: false,
        });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;

        docRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);

        const images: Record<number, string> = {};
        for (let i = 1; i <= pdfDoc.numPages; i++) {
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
  }, [exam.fileUrl, renderPageToImage]);

  const pageKey = currentPageIndex + 1;
  const currentPageImage = pageImages[pageKey];
  const hasPrev = currentPageIndex > 0;
  const hasNext = currentPageIndex < numPages - 1;

  const handleAnnotationChange = (dataUrl: string) => {
    setAnnotations((prev) => ({ ...prev, [pageKey]: dataUrl }));
  };

  const questionCount = exam.questionCount > 0 ? exam.questionCount : 20; // Default to 20 if 0
  const questions = Array.from({ length: questionCount }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 bg-slate-900/95 z-50 flex flex-col text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-900">
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
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 transition"
          >
            Kapat
          </button>
          <button
            onClick={() => onSubmit(answers)}
            disabled={submitting}
            className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 font-bold transition disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle size={20} />}
            Sınavı Tamamla
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* Left Side: PDF Viewer */}
        <div className="flex-1 bg-slate-800/50 relative flex flex-col items-center overflow-hidden">
          {exam.fileUrl ? (
            loading ? (
              <div className="flex items-center justify-center h-full text-slate-400 gap-2">
                <Loader2 className="animate-spin" /> PDF Yükleniyor...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-400 gap-2">
                <FileText /> {error}
              </div>
            ) : (
              <>
                <div className="flex-1 w-full overflow-auto flex justify-center p-8">
                   <div className="relative shadow-2xl">
                     {currentPageImage && (
                       <DrawingCanvas
                         width={Math.round(canvasMaxWidth)} 
                         height={Math.round((canvasMaxWidth / 0.707))} // A4 ratio approx
                         backgroundImageUrl={currentPageImage}
                         initialImageDataUrl={annotations[pageKey]}
                         onChange={handleAnnotationChange}
                         tool={drawingTool}
                         color={drawingColor}
                         lineWidth={2}
                         eraserWidth={20}
                         readonly={!showDrawing}
                       />
                     )}
                   </div>
                </div>
                
                {/* PDF Controls */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-full px-4 py-2 flex items-center gap-4 shadow-xl">
                  <button onClick={() => setCurrentPageIndex(p => Math.max(0, p - 1))} disabled={!hasPrev} className="p-2 hover:bg-slate-800 rounded-full disabled:opacity-50">
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-sm font-medium tabular-nums">{pageKey} / {numPages}</span>
                  <button onClick={() => setCurrentPageIndex(p => Math.min(numPages - 1, p + 1))} disabled={!hasNext} className="p-2 hover:bg-slate-800 rounded-full disabled:opacity-50">
                    <ChevronRight size={20} />
                  </button>
                  <div className="w-px h-6 bg-slate-700 mx-2" />
                  <button 
                    onClick={() => setShowDrawing(!showDrawing)}
                    className={`p-2 rounded-full ${showDrawing ? 'bg-blue-600' : 'hover:bg-slate-800'}`}
                    title="Çizim Modu"
                  >
                    <PenTool size={18} />
                  </button>
                </div>
              </>
            )
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
              <FileText size={64} className="mb-4 opacity-20" />
              <h3 className="text-lg font-medium text-white mb-2">Dijital Soru Kitapçığı Bulunamadı</h3>
              <p className="max-w-md">
                Bu sınav için sisteme yüklenmiş bir PDF dosyası bulunmamaktadır. Lütfen size dağıtılan basılı kitapçığı kullanın ve cevaplarınızı sağdaki optik forma işaretleyin.
              </p>
            </div>
          )}
        </div>

        {/* Right Side: Optical Form */}
        <div className="w-80 bg-slate-900 border-l border-slate-700 flex flex-col">
          <div className="p-4 border-b border-slate-700 bg-slate-800">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <ListChecks size={20} className="text-blue-400" />
              Optik Form
            </h3>
            <p className="text-xs text-slate-400 mt-1">Cevaplarınızı aşağıya işaretleyin.</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {questions.map((qNum) => (
               <div key={qNum} className="flex items-center justify-between p-2 rounded hover:bg-slate-800/50 transition">
                 <span className="w-8 text-sm font-bold text-slate-400 text-right mr-3">{qNum}.</span>
                 <div className="flex gap-1.5 flex-1 justify-end">
                   {CHOICES.map((choice) => {
                     const isSelected = answers[qNum] === choice;
                     return (
                       <button
                         key={choice}
                         onClick={() => setAnswers(prev => ({ ...prev, [qNum]: choice }))}
                         className={`
                           w-8 h-8 rounded-full text-xs font-bold transition-all
                           ${isSelected 
                             ? 'bg-blue-600 text-white shadow-lg scale-110 ring-2 ring-blue-400/50' 
                             : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'}
                         `}
                       >
                         {choice}
                       </button>
                     );
                   })}
                 </div>
               </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

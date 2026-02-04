import React, { useEffect, useRef, useState } from 'react';

interface DrawingCanvasProps {
  width?: number;
  height?: number;
  backgroundImageUrl?: string;
  initialImageDataUrl?: string;
  onChange?: (dataUrl: string) => void;
  tool?: 'pen' | 'line' | 'rect' | 'triangle' | 'eraser';
  color?: string;
  lineWidth?: number;
  eraserWidth?: number;
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  width = 800,
  height = 500,
  backgroundImageUrl,
  initialImageDataUrl,
  onChange,
  tool = 'pen',
  color = '#111827',
  lineWidth,
  eraserWidth,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const baseImageRef = useRef<ImageData | null>(null);
  const defaultLineWidthRef = useRef(3);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.lineWidth = 3;
    context.strokeStyle = '#111827';

    setCtx(context);

    if (initialImageDataUrl) {
      const img = new Image();
      img.src = initialImageDataUrl;
      img.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
    }
    defaultLineWidthRef.current = context.lineWidth;
  }, [initialImageDataUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ctx || !backgroundImageUrl) return;

    const img = new Image();
    img.src = backgroundImageUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
  }, [backgroundImageUrl, ctx]);

  const getPos = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ctx) return;
    if (event.pointerType === 'mouse' && event.buttons !== 1) return;

    const { x, y } = getPos(event);
    ctx.strokeStyle = color || '#111827';

    if (!canvasRef.current) return;
    baseImageRef.current = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);

    if (tool === 'pen' || tool === 'eraser') {
      if (tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = eraserWidth ?? 18;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = lineWidth ?? defaultLineWidthRef.current;
      }
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
    setStartPoint({ x, y });
    setIsDrawing(true);
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !ctx) return;
    const { x, y } = getPos(event);
    if (tool === 'pen' || tool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
      return;
    }

    if (!canvasRef.current || !baseImageRef.current || !startPoint) return;

    // Şekiller için önizleme: önce eski görüntüyü geri yükle
    ctx.putImageData(baseImageRef.current, 0, 0);

    if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === 'rect') {
      const w = x - startPoint.x;
      const h = y - startPoint.y;
      ctx.strokeRect(startPoint.x, startPoint.y, w, h);
    } else if (tool === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(x, startPoint.y);
      ctx.lineTo(startPoint.x, y);
      ctx.closePath();
      ctx.stroke();
    }
  };

  const finishDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !ctx) return;
    const { x, y } = getPos(event);
    if (tool === 'line' && startPoint) {
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === 'rect' && startPoint) {
      const w = x - startPoint.x;
      const h = y - startPoint.y;
      ctx.strokeRect(startPoint.x, startPoint.y, w, h);
    } else if (tool === 'triangle' && startPoint) {
      ctx.beginPath();
      ctx.moveTo(startPoint.x, startPoint.y);
      ctx.lineTo(x, startPoint.y);
      ctx.lineTo(startPoint.x, y);
      ctx.closePath();
      ctx.stroke();
    }

    setIsDrawing(false);
    setStartPoint(null);
    baseImageRef.current = null;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = defaultLineWidthRef.current;
    (event.target as HTMLCanvasElement).releasePointerCapture(event.pointerId);

    if (onChange && canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      onChange(dataUrl);
    }
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (onChange) {
      onChange(canvas.toDataURL('image/png'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{
          touchAction: 'none',
          borderRadius: 12,
          border: '1px solid rgba(148,163,184,0.6)',
          background: '#ffffff',
          boxShadow: '0 18px 40px rgba(15,23,42,0.25)',
          maxWidth: '100%',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrawing}
        onPointerLeave={finishDrawing}
      />
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="ghost-btn"
          onClick={handleClear}
          style={{
            border: '1px solid rgba(148,163,184,0.9)',
            background: 'rgba(15,23,42,0.9)',
            color: '#e5e7eb',
          }}
        >
          Temizle
        </button>
      </div>
    </div>
  );
};


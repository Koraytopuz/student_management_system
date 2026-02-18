import React, { useEffect, useRef, useState } from 'react';

interface DrawingCanvasProps {
  width?: number;
  height?: number;
  /** When set, canvas displays at these dimensions (for high-DPI: width/height are pixel res, these are logical size) */
  canvasDisplayWidth?: number;
  canvasDisplayHeight?: number;
  backgroundImageUrl?: string;
  initialImageDataUrl?: string;
  onChange?: (dataUrl: string) => void;
  /** When set, Temizle will call this instead of clearing to blank - lets parent restore background (e.g. PDF question) */
  onClearToBackground?: () => void;
  tool?: 'pen' | 'line' | 'rect' | 'triangle' | 'eraser';
  color?: string;
  lineWidth?: number;
  eraserWidth?: number;
  readonly?: boolean;
  transparent?: boolean;
  className?: string; // Add className prop
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  width = 800,
  height = 500,
  canvasDisplayWidth,
  canvasDisplayHeight,
  backgroundImageUrl,
  initialImageDataUrl,
  onChange,
  tool = 'pen',
  color = '#111827',
  lineWidth,
  eraserWidth,
  readonly = false,
  transparent = false,
  className = '',
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
    if (readonly || !ctx) return;
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
 
  // Remove internal 'Temizle' button and container div if it's meant to be just a raw canvas component
  // Or keep it but style it to be transparent/hidden if transparent prop logic dictates.
  // For this refactor, I'll remove the wrapper div if transparent is true, or just ensure canvas has no bg.

  return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={className}
        style={{
          touchAction: 'none',
          // If transparent, no background. Else white.
          background: transparent ? 'transparent' : '#ffffff',
          pointerEvents: readonly ? 'none' : 'auto',
          ...(canvasDisplayWidth != null && canvasDisplayHeight != null
            ? { width: canvasDisplayWidth, height: canvasDisplayHeight }
            : {}),
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrawing}
        onPointerLeave={finishDrawing}
      />
  );
};

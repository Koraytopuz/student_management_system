import React, { useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, RotateCcw, Loader2, AlertCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface QuestionViewerProps {
  /** URL of the question image */
  imageUrl: string;
  /** Question number to display */
  questionNumber: number;
  /** Currently selected option (A, B, C, D, or E) */
  selectedOption: string | null;
  /** Callback when an option is selected */
  onOptionSelect: (option: string) => void;
  /** Whether the question is marked for review */
  isMarked?: boolean;
  /** Callback to toggle the mark for review state */
  onToggleMark?: () => void;
}

/**
 * QuestionViewer Component
 * 
 * A professional component for displaying exam questions as images with zoom/pan capabilities
 * and an answer selection panel. Designed for serious exam platforms.
 */
export const QuestionViewer: React.FC<QuestionViewerProps> = ({
  imageUrl,
  questionNumber,
  selectedOption,
  onOptionSelect,
  isMarked = false,
  onToggleMark,
}) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  const options = ['A', 'B', 'C', 'D', 'E'];

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  const handleClearSelection = () => {
    onOptionSelect('');
  };

  return (
    <div className="w-full h-[600px] bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col md:flex-row">
      {/* Image Viewer Section - Left Side (Desktop) / Top (Mobile) */}
      <div className="relative flex-1 md:flex-[0.65] bg-gray-50 border-r border-gray-200 md:border-r md:border-b-0 border-b">
        {imageError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
            <p className="text-gray-600 font-medium">Failed to load question</p>
            <p className="text-sm text-gray-500 mt-2">
              The image could not be loaded. Please check the URL or try again later.
            </p>
          </div>
        ) : (
          <>
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                  <p className="text-sm text-gray-500">Loading question...</p>
                </div>
              </div>
            )}
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={4}
              centerOnInit
              wheel={{ step: 0.1 }}
              doubleClick={{ disabled: true }}
            >
              {({
                zoomIn,
                zoomOut,
                resetTransform,
              }: {
                zoomIn: () => void;
                zoomOut: () => void;
                resetTransform: () => void;
              }) => (
                <>
                  <TransformComponent
                    wrapperClass="w-full h-full"
                    contentClass="w-full h-full flex items-center justify-center"
                  >
                    <img
                      src={imageUrl}
                      alt={`Question ${questionNumber}`}
                      className="max-w-full max-h-full object-contain"
                      onLoad={handleImageLoad}
                      onError={handleImageError}
                      style={{ display: imageLoading ? 'none' : 'block' }}
                    />
                  </TransformComponent>
                  {/* Floating Controls Overlay */}
                  <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-2">
                    <button
                      onClick={() => zoomIn()}
                      className="p-2 rounded-md hover:bg-gray-100 transition-colors text-gray-700 hover:text-gray-900"
                      aria-label="Zoom In"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => zoomOut()}
                      className="p-2 rounded-md hover:bg-gray-100 transition-colors text-gray-700 hover:text-gray-900"
                      aria-label="Zoom Out"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-5 h-5" />
                    </button>
                    <div className="border-t border-gray-200 my-1" />
                    <button
                      onClick={() => resetTransform()}
                      className="p-2 rounded-md hover:bg-gray-100 transition-colors text-gray-700 hover:text-gray-900"
                      aria-label="Reset View"
                      title="Reset View"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  </div>
                </>
              )}
            </TransformWrapper>
          </>
        )}
      </div>

      {/* Answer Panel Section - Right Side (Desktop) / Bottom (Mobile) */}
      <div className="flex-1 md:flex-[0.35] bg-white p-6 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Question #{questionNumber}
          </h2>
          {onToggleMark && (
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={isMarked}
                onChange={onToggleMark}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                Mark for Review
              </span>
            </label>
          )}
        </div>

        {/* Answer Options */}
        <div className="flex-1 space-y-3">
          {options.map((option) => {
            const isSelected = selectedOption === option;
            return (
              <button
                key={option}
                onClick={() => onOptionSelect(option)}
                className={cn(
                  'w-full p-4 rounded-lg border-2 text-left transition-all duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2',
                  isSelected
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                    : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50 hover:border-gray-400',
                  'font-medium'
                )}
                aria-pressed={isSelected}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm',
                      isSelected
                        ? 'bg-white text-blue-600'
                        : 'bg-gray-100 text-gray-700'
                    )}
                  >
                    {option}
                  </span>
                  <span>Option {option}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Clear Selection Button */}
        {selectedOption && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={handleClearSelection}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors font-medium"
            >
              <X className="w-4 h-4" />
              Clear Selection
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionViewer;

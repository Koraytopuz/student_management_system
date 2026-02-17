/**
 * Result of extracting a question from a PDF page
 */
export interface ExtractedQuestion {
    /** Question number (detected from image or auto-incremented) */
    questionNumber: number;
    /** URL/path to the cropped question image */
    imageUrl: string;
    /** Original page number (1-indexed) */
    originalPage: number;
    /** Bounding box coordinates used for cropping */
    boundingBox?: {
        ymin: number;
        xmin: number;
        ymax: number;
        xmax: number;
    };
}
/**
 * Configuration for PDF extraction
 */
export interface PdfExtractionConfig {
    /** Output directory for extracted question images */
    outputDir?: string;
    /** Scale factor for PDF rendering (higher = better quality, default: 2.0) */
    scale?: number;
    /** Gemini API key */
    apiKey: string;
    /** Gemini model name (default: gemini-2.0-flash) */
    modelName?: string;
    /** Whether to skip pages with no questions detected */
    skipEmptyPages?: boolean;
}
/**
 * Main service function: Extract questions from PDF
 */
export declare function extractQuestionsFromPdf(pdfBuffer: Buffer, config: PdfExtractionConfig): Promise<ExtractedQuestion[]>;
/**
 * Alternative: Extract questions using a simpler approach (without canvas)
 * This uses pdf-lib to extract pages and then sends to Gemini
 * Note: This is less efficient but doesn't require canvas
 */
export declare function extractQuestionsFromPdfSimple(pdfBuffer: Buffer, config: PdfExtractionConfig): Promise<ExtractedQuestion[]>;
//# sourceMappingURL=pdfExtractor.service.d.ts.map
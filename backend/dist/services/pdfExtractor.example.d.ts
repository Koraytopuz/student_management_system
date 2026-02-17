/**
 * Example usage of the PDF Question Extractor Service
 *
 * This file demonstrates how to use the extractQuestionsFromPdf service
 * in an Express route handler.
 */
import { Request, Response } from 'express';
/**
 * Example route handler for PDF question extraction
 *
 * POST /api/ai/extract-questions
 *
 * Body: multipart/form-data with 'file' field containing PDF
 *
 * Response: {
 *   success: boolean;
 *   questions?: ExtractedQuestion[];
 *   error?: string;
 * }
 */
export declare function extractQuestionsHandler(req: Request, res: Response): Promise<void>;
/**
 * To use this handler in your routes file:
 *
 * import { extractQuestionsHandler } from './services/pdfExtractor.example';
 * import multer from 'multer';
 *
 * const upload = multer({ storage: multer.memoryStorage() });
 *
 * router.post(
 *   '/extract-questions',
 *   authenticateMultiple(['admin', 'teacher']),
 *   upload.single('file'),
 *   extractQuestionsHandler
 * );
 */
//# sourceMappingURL=pdfExtractor.example.d.ts.map
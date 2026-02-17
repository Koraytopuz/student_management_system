/**
 * Example usage of the PDF Question Extractor Service
 * 
 * This file demonstrates how to use the extractQuestionsFromPdf service
 * in an Express route handler.
 */

import { Request, Response } from 'express';
import multer from 'multer';
import { extractQuestionsFromPdf, type ExtractedQuestion } from './pdfExtractor.service';
import { authenticateMultiple, type AuthenticatedRequest } from '../auth';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 }, // 250 MB
});

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
export async function extractQuestionsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  
  try {
    // 1. Validate file upload
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'Please upload a PDF file',
      });
      return;
    }

    if (req.file.mimetype !== 'application/pdf') {
      res.status(400).json({
        success: false,
        error: 'Only PDF files are supported',
      });
      return;
    }

    const fileBuffer = (req.file as Express.Multer.File & { buffer?: Buffer }).buffer;
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      res.status(400).json({
        success: false,
        error: 'Failed to read PDF file',
      });
      return;
    }

    // 2. Get API key from environment
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        success: false,
        error: 'Gemini API key not configured',
      });
      return;
    }

    // 3. Extract questions using the service
    const questions = await extractQuestionsFromPdf(fileBuffer, {
      apiKey,
      modelName: process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
      scale: 2.0, // Higher quality
      skipEmptyPages: true, // Skip cover pages, etc.
    });

    // 4. Return results
    res.json({
      success: true,
      questions,
      count: questions.length,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[Extract Questions] Error:', err.message, err.stack);
    
    res.status(500).json({
      success: false,
      error: `Extraction failed: ${err.message}`,
    });
  }
}

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

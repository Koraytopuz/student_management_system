import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

// Polyfill for Node.js DOM APIs required by pdfjs-dist
if (typeof globalThis.DOMMatrix === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DOMMatrix, DOMPoint } = require('canvas');
  globalThis.DOMMatrix = DOMMatrix;
  globalThis.DOMPoint = DOMPoint;
}

// Import pdfjs-dist (use standard import, polyfills handle DOM APIs)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// For pdfjs-dist to work in Node.js, we need canvas
// Canvas factory implementation for pdfjs-dist
let NodeCanvasFactory: any = null;
let canvasAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createCanvas } = require('canvas');
  canvasAvailable = true;

  NodeCanvasFactory = class {
    create(width: number, height: number) {
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d');
      return {
        canvas,
        context,
      };
    }
    reset(canvasAndContext: any, width: number, height: number) {
      canvasAndContext.canvas.width = width;
      canvasAndContext.canvas.height = height;
    }
    destroy(canvasAndContext: any) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  };
} catch (error) {
  // Canvas not available
  console.warn(
    '[PDF Extractor] Canvas package not found. PDF to image conversion requires canvas.',
  );
  console.warn('[PDF Extractor] Install with: npm install canvas');
  canvasAvailable = false;
}

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
 * Bounding box detected by Gemini
 */
interface GeminiBoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  questionNumber?: number | string;
}

/**
 * Response structure from Gemini
 */
interface GeminiDetectionResponse {
  questions: Array<{
    boundingBox: GeminiBoundingBox;
    questionNumber?: number | string;
  }>;
  pageNumber?: number;
}

/**
 * Convert a PDF buffer to images (one per page)
 * Uses pdfjs-dist with canvas for rendering
 */
async function pdfToImages(
  pdfBuffer: Buffer,
  scale: number = 2.0,
): Promise<Array<{ pageNumber: number; imageBuffer: Buffer }>> {
  if (!canvasAvailable || !NodeCanvasFactory) {
    throw new Error(
      'Canvas package is required for PDF to image conversion.\n' +
      'Install it with: npm install canvas\n' +
      'Note: On Windows, you may need Visual Studio Build Tools with C++ workload.\n' +
      'Alternatively, use a different PDF-to-image service or convert PDFs to images beforehand.',
    );
  }

  // Set up pdfjs-dist worker (required for Node.js)
  // On Windows, we need to convert absolute path to file:// URL
  try {
    const workerPath = require.resolve('pdfjs-dist/build/pdf.worker.mjs');
    // Convert Windows absolute path to file:// URL
    const fileUrl = path.isAbsolute(workerPath)
      ? `file:///${workerPath.replace(/\\/g, '/')}`
      : workerPath;
    pdfjsLib.GlobalWorkerOptions.workerSrc = fileUrl;
  } catch {
    // Fallback: disable worker (slower but works, but may cause issues)
    // Better to use a CDN worker URL as fallback
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.mjs';
  }

  // Convert Buffer to Uint8Array (pdfjs-dist requires Uint8Array, not Buffer)
  const uint8Array = new Uint8Array(pdfBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
    verbosity: 0, // Suppress warnings
  });

  const pdfDocument = await loadingTask.promise;
  const numPages = pdfDocument.numPages;
  const images: Array<{ pageNumber: number; imageBuffer: Buffer }> = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    const canvasFactory = new NodeCanvasFactory();
    const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);

    const renderContext = {
      canvasContext: canvasAndContext.context,
      viewport,
    };

    await page.render(renderContext).promise;

    // Convert canvas to PNG buffer
    const imageBuffer = (canvasAndContext.canvas as any).toBuffer('image/png');

    images.push({
      pageNumber: pageNum,
      imageBuffer,
    });

    canvasFactory.destroy(canvasAndContext);
  }

  return images;
}

/**
 * Detect question bounding boxes using Gemini Vision API
 */
async function detectQuestionBoundingBoxes(
  imageBuffer: Buffer,
  pageNumber: number,
  apiKey: string,
  modelName: string = 'gemini-2.0-flash',
): Promise<GeminiDetectionResponse> {
  const genAi = new GoogleGenAI({ apiKey });

  // Convert image to base64
  const imageBase64 = imageBuffer.toString('base64');

  // System instruction for Gemini
  const systemInstruction = [
    'You are an expert at analyzing exam question papers and identifying distinct questions on a page.',
    '',
    'Your task:',
    '1. Analyze the provided PDF page image.',
    '2. Identify ALL distinct questions on the page (including multi-column layouts).',
    '3. For each question, detect its bounding box coordinates.',
    '4. If a question number is visible (e.g., "1.", "2.", "Question 3"), include it.',
    '',
    'CRITICAL RULES:',
    '- Use normalized coordinates (0-1000) where:',
    '  * (0, 0) is the top-left corner',
    '  * (1000, 1000) is the bottom-right corner',
    '- Bounding box format: { ymin, xmin, ymax, xmax }',
    '- ymin/xmin = top-left corner',
    '- ymax/xmax = bottom-right corner',
    '- Include the ENTIRE question including:',
    '  * Question text/stem',
    '  * All answer options (A, B, C, D, E)',
    '  * Any diagrams, tables, or context above the question',
    '- Handle multi-column layouts correctly',
    '- If no questions are found, return empty questions array',
    '',
    'Response format (JSON only, no markdown, no code blocks):',
    '{',
    '  "questions": [',
    '    {',
    '      "boundingBox": { "ymin": 100, "xmin": 50, "ymax": 400, "xmax": 950 },',
    '      "questionNumber": 1',
    '    }',
    '  ],',
    '  "pageNumber": 1',
    '}',
  ].join('\n');

  const userPrompt = `Analyze page ${pageNumber} and identify all distinct questions with their bounding boxes. Return ONLY valid JSON, no markdown formatting.`;

  try {
    const response = await genAi.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: imageBase64,
                mimeType: 'image/png',
              },
            },
            { text: userPrompt },
          ],
        },
      ],
      config: {
        systemInstruction,
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Empty response from Gemini');
    }

    // Clean JSON response (remove markdown code blocks if any)
    let cleanedJson = responseText.trim();
    if (cleanedJson.startsWith('```json')) {
      cleanedJson = cleanedJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedJson.startsWith('```')) {
      cleanedJson = cleanedJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(cleanedJson) as GeminiDetectionResponse;
    return parsed;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Gemini detection failed: ${err.message}`);
  }
}

/**
 * Crop an image using Sharp based on bounding box coordinates
 * Coordinates are normalized (0-1000), need to convert to pixels
 */
async function cropImage(
  imageBuffer: Buffer,
  boundingBox: GeminiBoundingBox,
  outputPath: string,
): Promise<void> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('Could not read image dimensions');
  }

  // Convert normalized coordinates (0-1000) to pixels
  const left = Math.round((boundingBox.xmin / 1000) * metadata.width);
  const top = Math.round((boundingBox.ymin / 1000) * metadata.height);
  const width = Math.round(((boundingBox.xmax - boundingBox.xmin) / 1000) * metadata.width);
  const height = Math.round(((boundingBox.ymax - boundingBox.ymin) / 1000) * metadata.height);

  // Ensure coordinates are within bounds
  const safeLeft = Math.max(0, Math.min(left, metadata.width - 1));
  const safeTop = Math.max(0, Math.min(top, metadata.height - 1));
  const safeWidth = Math.min(width, metadata.width - safeLeft);
  const safeHeight = Math.min(height, metadata.height - safeTop);

  await image
    .extract({
      left: safeLeft,
      top: safeTop,
      width: safeWidth,
      height: safeHeight,
    })
    .png()
    .toFile(outputPath);
}

/**
 * Main service function: Extract questions from PDF
 */
export async function extractQuestionsFromPdf(
  pdfBuffer: Buffer,
  config: PdfExtractionConfig,
): Promise<ExtractedQuestion[]> {
  const {
    outputDir = path.join(__dirname, '../../uploads/question-images'),
    scale = 2.0,
    apiKey,
    modelName = 'gemini-2.0-flash',
    skipEmptyPages = true,
  } = config;

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const extractedQuestions: ExtractedQuestion[] = [];
  let globalQuestionCounter = 1;

  try {
    // Step 1: Convert PDF pages to images
    console.log('[PDF Extractor] Converting PDF to images...');
    const pageImages = await pdfToImages(pdfBuffer, scale);
    console.log(`[PDF Extractor] Converted ${pageImages.length} pages to images`);

    // Step 2: Process each page
    for (const { pageNumber, imageBuffer } of pageImages) {
      try {
        console.log(`[PDF Extractor] Processing page ${pageNumber}...`);

        // Step 3: Detect question bounding boxes using Gemini
        const detection = await detectQuestionBoundingBoxes(
          imageBuffer,
          pageNumber,
          apiKey,
          modelName,
        );

        if (!detection.questions || detection.questions.length === 0) {
          if (skipEmptyPages) {
            console.log(`[PDF Extractor] No questions detected on page ${pageNumber}, skipping...`);
            continue;
          }
          throw new Error(`No questions detected on page ${pageNumber}`);
        }

        console.log(
          `[PDF Extractor] Detected ${detection.questions.length} questions on page ${pageNumber}`,
        );

        // Step 4: Crop each question and save
        for (const questionData of detection.questions) {
          const boundingBox = questionData.boundingBox;

          // Determine question number
          let questionNumber: number;
          if (questionData.questionNumber !== undefined) {
            const parsed = parseInt(String(questionData.questionNumber), 10);
            questionNumber = isNaN(parsed) ? globalQuestionCounter : parsed;
          } else {
            questionNumber = globalQuestionCounter;
          }

          // Ensure question number is positive
          if (questionNumber <= 0) {
            questionNumber = globalQuestionCounter;
          }

          // Crop and save the question image
          const fileName = `question-${questionNumber}-page-${pageNumber}-${Date.now()}.png`;
          const outputPath = path.join(outputDir, fileName);
          await cropImage(imageBuffer, boundingBox, outputPath);

          // Generate relative URL (assuming /uploads is served statically)
          const imageUrl = `/uploads/question-images/${fileName}`;

          extractedQuestions.push({
            questionNumber,
            imageUrl,
            originalPage: pageNumber,
            boundingBox: {
              ymin: boundingBox.ymin,
              xmin: boundingBox.xmin,
              ymax: boundingBox.ymax,
              xmax: boundingBox.xmax,
            },
          });

          globalQuestionCounter++;
        }
      } catch (pageError) {
        const err = pageError instanceof Error ? pageError : new Error(String(pageError));
        console.error(`[PDF Extractor] Error processing page ${pageNumber}:`, err.message);

        if (!skipEmptyPages) {
          throw err;
        }
        // Continue to next page if skipEmptyPages is true
      }
    }

    console.log(`[PDF Extractor] Successfully extracted ${extractedQuestions.length} questions`);
    return extractedQuestions;
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[PDF Extractor] Fatal error:', err.message, err.stack);
    throw new Error(`PDF extraction failed: ${err.message}`);
  }
}

/**
 * Alternative: Extract questions using a simpler approach (without canvas)
 * This uses pdf-lib to extract pages and then sends to Gemini
 * Note: This is less efficient but doesn't require canvas
 */
export async function extractQuestionsFromPdfSimple(
  pdfBuffer: Buffer,
  config: PdfExtractionConfig,
): Promise<ExtractedQuestion[]> {
  // This is a placeholder for an alternative implementation
  // that doesn't require canvas. For now, we recommend using
  // the main extractQuestionsFromPdf function with canvas installed.
  throw new Error(
    'Simple extraction not yet implemented. Please install canvas package: npm install canvas',
  );
}

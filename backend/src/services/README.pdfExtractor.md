# PDF Question Extractor Service

A professional service for extracting individual questions from PDF exam files using Google Gemini Vision API.

## Features

- **PDF to Image Conversion**: Converts PDF pages to high-quality PNG images
- **AI-Powered Detection**: Uses Gemini 2.0 Flash to detect question bounding boxes
- **Smart Cropping**: Automatically crops each question using Sharp
- **Multi-column Support**: Handles complex layouts with multiple columns
- **Error Handling**: Gracefully skips pages with no questions (e.g., cover pages)

## Installation

### Required Packages

```bash
npm install sharp @google/genai pdfjs-dist
```

### Canvas Dependency (for PDF rendering)

The service requires the `canvas` package for PDF to image conversion:

```bash
npm install canvas
```

**Windows Note**: Canvas requires native compilation. You may need:
- Visual Studio Build Tools with C++ workload
- Or use a pre-built binary: `npm install canvas --build-from-source=false`

**Alternative**: If canvas installation fails, you can:
1. Pre-convert PDFs to images using an external tool
2. Use a cloud service for PDF rendering
3. Modify the service to accept pre-rendered images

## Usage

### Basic Example

```typescript
import { extractQuestionsFromPdf } from './services/pdfExtractor.service';

const pdfBuffer = fs.readFileSync('exam.pdf');
const apiKey = process.env.GEMINI_API_KEY;

const questions = await extractQuestionsFromPdf(pdfBuffer, {
  apiKey,
  modelName: 'gemini-2.0-flash',
  scale: 2.0, // Higher = better quality
  skipEmptyPages: true,
});

// questions is an array of ExtractedQuestion objects
questions.forEach(q => {
  console.log(`Question ${q.questionNumber} from page ${q.originalPage}: ${q.imageUrl}`);
});
```

### Express Route Example

See `pdfExtractor.example.ts` for a complete Express route handler example.

## Configuration Options

```typescript
interface PdfExtractionConfig {
  /** Output directory for extracted question images (default: uploads/question-images) */
  outputDir?: string;
  
  /** Scale factor for PDF rendering (default: 2.0, higher = better quality) */
  scale?: number;
  
  /** Gemini API key (required) */
  apiKey: string;
  
  /** Gemini model name (default: gemini-2.0-flash) */
  modelName?: string;
  
  /** Skip pages with no questions detected (default: true) */
  skipEmptyPages?: boolean;
}
```

## Output Format

```typescript
interface ExtractedQuestion {
  /** Question number (detected or auto-incremented) */
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
```

## How It Works

1. **PDF Conversion**: Each page is rendered to a PNG image using pdfjs-dist + canvas
2. **AI Detection**: Gemini Vision API analyzes each page image and returns bounding boxes
3. **Cropping**: Sharp crops each detected question region from the original page image
4. **Storage**: Cropped images are saved to the output directory

## Gemini Prompt Engineering

The service uses a carefully crafted system prompt that:
- Instructs Gemini to identify ALL questions on a page
- Uses normalized coordinates (0-1000) for bounding boxes
- Handles multi-column layouts
- Includes question numbers when visible
- Returns strict JSON format

## Error Handling

- **Canvas Missing**: Clear error message with installation instructions
- **No Questions Found**: Optionally skips empty pages (cover pages, etc.)
- **API Failures**: Logs errors and continues processing other pages
- **Invalid Coordinates**: Validates and clamps bounding boxes to image bounds

## Performance Considerations

- **Scale Factor**: Higher scale (e.g., 3.0) = better quality but slower processing
- **API Rate Limits**: Be aware of Gemini API quotas (free tier: 20 requests/day per model)
- **Memory Usage**: Large PDFs may consume significant memory during conversion

## Troubleshooting

### Canvas Installation Fails (Windows)

1. Install Visual Studio Build Tools: https://visualstudio.microsoft.com/downloads/
2. Select "Desktop development with C++" workload
3. Retry: `npm install canvas`

### PDF Rendering Issues

- Ensure pdfjs-dist worker is accessible (check worker path)
- Try reducing scale factor if memory issues occur
- Check PDF is not corrupted or password-protected

### Gemini API Errors

- Verify `GEMINI_API_KEY` is set in environment
- Check API quota limits
- Ensure model name is correct (e.g., `gemini-2.0-flash`)

## Future Enhancements

- Support for alternative PDF rendering (without canvas)
- Batch processing with progress callbacks
- Question number detection improvements
- Support for answer key extraction
- Caching of rendered page images

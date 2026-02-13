# Standard OMR System - Setup Guide

## Quick Start

### 1. Install Python Dependencies

```bash
cd backend/python-scripts
pip install -r requirements.txt
```

### 2. Test Python Script

```bash
python standard_omr.py test-image.jpg YKS_STANDARD omr_config.json ./output
```

### 3. Integrate Frontend Component

Add to `AdminDashboard.tsx`:

```tsx
import OMRUpload from './components/admin/OMRUpload';

// In your component
<OMRUpload examId={selectedExamId} onComplete={handleResults} />
```

## API Endpoints

- `POST /api/admin/omr/upload` - Upload single form
- `POST /api/admin/omr/process-batch` - Upload multiple forms
- `GET /api/admin/omr/status/:jobId` - Check processing status
- `POST /api/admin/omr/validate` - Manual validation
- `GET /api/admin/omr/templates` - List form templates

## Form Templates

Currently supported:
- **YKS_STANDARD**: 120 questions (Türkçe, Mat, Fen, Sosyal)
- **LGS_STANDARD**: 90 questions (Türkçe, Mat, Fen, Sosyal)

## Configuration

Edit `omr_config.json` to:
- Add custom form templates
- Adjust ROI coordinates
- Tune detection thresholds

## Troubleshooting

**Python not found:**
- Ensure Python 3.8+ is in PATH
- Try `python3` instead of `python`

**Low accuracy:**
- Increase scan DPI (recommended: 300 DPI)
- Adjust `bubble_fill_threshold` in config
- Ensure forms are properly aligned

**Processing timeout:**
- Increase timeout in `opticalService.ts`
- Check Python script logs for errors

## Next Steps

1. Test with sample scanned forms
2. Calibrate detection thresholds
3. Train administrators on scanning best practices
4. Monitor accuracy and adjust as needed

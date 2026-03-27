# OCR/AI-Based Scientific PDF Conversion Plan

## Overview

Shift from heuristic-based PDF text extraction to OCR and AI-powered document understanding for more consistent and accurate conversion of scientific papers. This approach will work entirely client-side in the browser.

## Problem Statement

The current `ScientificPdfConverter` uses heuristic-based layout analysis with pdf.js, which has limitations:
- Inconsistent handling of poorly formatted PDFs
- Difficulty with multi-column layouts, tables, and figures
- No support for scanned documents
- Relies on PDF text extraction which may be incomplete or poorly structured

## Solution Architecture

### Hybrid Approach: PDF.js + OCR + Document Layout Analysis

```
┌─────────────────────────────────────────────────────────────┐
│                     PDF Input (ArrayBuffer)                  │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   pdf.js Page Rendering                      │
│  - Render each page to high-resolution canvas image          │
│  - Extract any embedded text metadata (for fallback)         │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Document Layout Analysis (AI)                   │
│  Option A: DocLayout-YOLO (ONNX Runtime Web)                │
│  Option B: Transformers.js with layout model                 │
│  - Detect regions: text, headings, tables, figures, captions │
│  - Output: bounding boxes with region types                  │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    OCR Text Extraction                        │
│  Tesseract.js (WebAssembly)                                  │
│  - Extract text from each detected region                    │
│  - Preserve reading order based on layout analysis           │
│  - Handle multiple languages                                 │
└─────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Markdown Generation & Formatting                │
│  - Convert detected structure to Markdown                    │
│  - Format headings, lists, tables, figure captions           │
│  - Preserve reading order (column-aware)                     │
└─────────────────────────────────────────────────────────────┘
```

## Technology Options

### Option 1: Tesseract.js Only (Simpler)

**Approach:**
- Render PDF pages to images using pdf.js
- Use Tesseract.js to OCR entire pages
- Apply post-processing heuristics to detect structure

**Pros:**
- Simple implementation
- Works in all browsers (WebAssembly)
- Well-established library
- ~2MB additional bundle size

**Cons:**
- No built-in layout analysis
- Need to implement structure detection heuristics
- May still have issues with complex layouts

**Dependencies:**
```json
{
  "tesseract.js": "^5.0.0"
}
```

### Option 2: Tesseract.js + DocLayout-YOLO (Recommended)

**Approach:**
- Render PDF pages to images using pdf.js
- Use DocLayout-YOLO (ONNX) to detect document structure
- Use Tesseract.js to OCR each detected region
- Combine results with proper reading order

**Pros:**
- Accurate layout detection
- Handles complex multi-column layouts
- Detects tables, figures, headings, etc.
- Better reading order determination

**Cons:**
- Larger bundle size (~10-20MB for models)
- Requires WebGPU for good performance
- More complex implementation

**Dependencies:**
```json
{
  "tesseract.js": "^5.0.0",
  "onnxruntime-web": "^1.18.0"
}
```

### Option 3: Transformers.js with Donut Model (Most Advanced)

**Approach:**
- Use Donut (OCR-free Document Understanding Transformer)
- Directly processes document images without separate OCR step
- End-to-end document understanding

**Pros:**
- OCR-free approach
- State-of-the-art accuracy
- Handles complex layouts naturally

**Cons:**
- Very large model size (~500MB+)
- Requires WebGPU for reasonable performance
- May be too slow for real-time use
- Limited browser support

**Dependencies:**
```json
{
  "@huggingface/transformers": "^3.0.0"
}
```

## Recommended Approach: Option 2 (Tesseract.js + DocLayout-YOLO)

This provides the best balance of accuracy, performance, and feasibility for browser-side implementation.

## Implementation Plan

### Phase 1: OCR Foundation (Tesseract.js)

**Files to Create/Modify:**

1. **`src/converters/OcrPdfConverter.ts`** (New)
   - Render PDF pages to canvas images
   - Use Tesseract.js for OCR
   - Basic text extraction with page-by-page processing

2. **`src/utils/ocrEngine.ts`** (New)
   - Tesseract.js worker management
   - Language detection and loading
   - Progress tracking

3. **`package.json`** (Modify)
   - Add `tesseract.js` dependency

### Phase 2: Document Layout Analysis (DocLayout-YOLO)

**Files to Create/Modify:**

1. **`src/utils/layoutAnalysis.ts`** (New)
   - Load DocLayout-YOLO ONNX model
   - Detect document regions (text, headings, tables, figures)
   - Return bounding boxes with region types

2. **`src/models/`** (New directory)
   - Store ONNX model files
   - Model configuration

3. **`vite.config.ts`** (Modify)
   - Add ONNX model handling
   - Configure asset optimization

### Phase 3: Integration & Markdown Generation

**Files to Create/Modify:**

1. **`src/converters/AiScientificPdfConverter.ts`** (New)
   - Combine OCR + layout analysis
   - Generate structured Markdown
   - Handle reading order

2. **`src/utils/markdownGenerator.ts`** (New)
   - Convert detected structure to Markdown
   - Format headings, lists, tables, figures
   - Preserve reading order

3. **`src/core/MarkItDown.ts`** (Modify)
   - Register new converter
   - Add conversion mode selection

4. **`src/components/FileUpload.tsx`** (Modify)
   - Add AI/OCR mode toggle
   - Show model loading progress

### Phase 4: Optimization & Polish

1. **Performance Optimization**
   - Lazy load models
   - Cache OCR results
   - WebGPU acceleration

2. **User Experience**
   - Progress indicators
   - Model loading status
   - Error handling

3. **Testing**
   - Various PDF types
   - Performance benchmarks
   - Browser compatibility

## Detailed Implementation

### 1. OCR Engine (`src/utils/ocrEngine.ts`)

```typescript
import Tesseract from 'tesseract.js';

export interface OcrResult {
  text: string;
  confidence: number;
  bbox: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  };
}

export class OcrEngine {
  private worker: Tesseract.Worker | null = null;
  private initialized = false;

  async initialize(language: string = 'eng'): Promise<void> {
    if (this.initialized) return;

    this.worker = await Tesseract.createWorker(language, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          // Progress callback
        }
      },
    });

    this.initialized = true;
  }

  async recognize(image: HTMLCanvasElement | HTMLImageElement): Promise<OcrResult[]> {
    if (!this.worker) {
      throw new Error('OCR engine not initialized');
    }

    const { data } = await this.worker.recognize(image);
    
    return data.words.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: word.bbox,
    }));
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}
```

### 2. Layout Analysis (`src/utils/layoutAnalysis.ts`)

```typescript
import * as ort from 'onnxruntime-web';

export interface LayoutRegion {
  type: 'text' | 'heading' | 'table' | 'figure' | 'caption' | 'list';
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export class LayoutAnalyzer {
  private session: ort.InferenceSession | null = null;

  async initialize(modelUrl: string): Promise<void> {
    this.session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgpu', 'wasm'],
    });
  }

  async analyze(imageData: ImageData): Promise<LayoutRegion[]> {
    if (!this.session) {
      throw new Error('Layout analyzer not initialized');
    }

    // Preprocess image for model
    const inputTensor = this.preprocessImage(imageData);
    
    // Run inference
    const results = await this.session.run({ images: inputTensor });
    
    // Post-process results to get bounding boxes
    return this.postprocessResults(results);
  }

  private preprocessImage(imageData: ImageData): ort.Tensor {
    // Convert ImageData to tensor format expected by model
    // Normalize pixel values, resize if needed
    const { width, height, data } = imageData;
    const float32Data = new Float32Array(3 * height * width);
    
    for (let i = 0; i < height * width; i++) {
      float32Data[i] = data[i * 4] / 255.0; // R
      float32Data[height * width + i] = data[i * 4 + 1] / 255.0; // G
      float32Data[2 * height * width + i] = data[i * 4 + 2] / 255.0; // B
    }
    
    return new ort.Tensor('float32', float32Data, [1, 3, height, width]);
  }

  private postprocessResults(results: ort.InferenceSession.OnnxValueMapType): LayoutRegion[] {
    // Parse model output to extract bounding boxes and classes
    // Apply NMS (Non-Maximum Suppression)
    // Return structured regions
    const regions: LayoutRegion[] = [];
    // Implementation depends on model output format
    return regions;
  }
}
```

### 3. AI Scientific PDF Converter (`src/converters/AiScientificPdfConverter.ts`)

```typescript
import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';
import { OcrEngine } from '../utils/ocrEngine';
import { LayoutAnalyzer } from '../utils/layoutAnalysis';
import { generateMarkdown } from '../utils/markdownGenerator';

const ACCEPTED_MIME_TYPE_PREFIXES = ['application/pdf'];
const ACCEPTED_FILE_EXTENSIONS = ['.pdf'];

export class AiScientificPdfConverter extends DocumentConverter {
  private ocrEngine: OcrEngine;
  private layoutAnalyzer: LayoutAnalyzer;
  private initialized = false;

  constructor() {
    super();
    this.ocrEngine = new OcrEngine();
    this.layoutAnalyzer = new LayoutAnalyzer();
  }

  accepts(_fileStream: ArrayBuffer, streamInfo: StreamInfo): boolean {
    const mimetype = (streamInfo.mimetype || '').toLowerCase();
    const extension = (streamInfo.extension || '').toLowerCase();

    if (extensionMatches(extension, ACCEPTED_FILE_EXTENSIONS)) {
      return true;
    }

    for (const prefix of ACCEPTED_MIME_TYPE_PREFIXES) {
      if (mimeTypeMatches(mimetype, prefix)) {
        return true;
      }
    }

    return false;
  }

  async convert(
    fileStream: ArrayBuffer,
    streamInfo: StreamInfo
  ): Promise<DocumentConverterResult> {
    // Initialize engines if needed
    if (!this.initialized) {
      await this.initialize();
    }

    // Load PDF with pdf.js
    const pdfjs = await import('pdfjs-dist');
    const pdf = await pdfjs.getDocument({ data: fileStream }).promise;
    const numPages = pdf.numPages;

    const pageResults: Array<{
      regions: Array<{
        type: string;
        text: string;
        bbox: { x: number; y: number; width: number; height: number };
      }>;
    }> = [];

    // Process each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const pageResult = await this.processPage(page, pageNum);
      pageResults.push(pageResult);
    }

    // Generate Markdown from all pages
    const markdown = generateMarkdown(pageResults);

    return {
      markdown: markdown || '*No text content could be extracted from this PDF.*',
      title: streamInfo.filename,
    };
  }

  private async initialize(): Promise<void> {
    // Initialize OCR engine
    await this.ocrEngine.initialize('eng');

    // Initialize layout analyzer with model
    // Model URL would be hosted or bundled
    const modelUrl = '/models/doclayout-yolo.onnx';
    await this.layoutAnalyzer.initialize(modelUrl);

    this.initialized = true;
  }

  private async processPage(page: any, pageNum: number): Promise<{
    regions: Array<{
      type: string;
      text: string;
      bbox: { x: number; y: number; width: number; height: number };
    }>;
  }> {
    // Render page to canvas
    const viewport = page.getViewport({ scale: 2 }); // Higher scale for better OCR
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    // Get image data for layout analysis
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Detect layout regions
    const layoutRegions = await this.layoutAnalyzer.analyze(imageData);

    // OCR each region
    const regions = [];
    for (const region of layoutRegions) {
      // Extract region from canvas
      const regionCanvas = this.extractRegion(canvas, region.bbox);
      
      // OCR the region
      const ocrResults = await this.ocrEngine.recognize(regionCanvas);
      const text = ocrResults.map(r => r.text).join(' ');

      regions.push({
        type: region.type,
        text,
        bbox: region.bbox,
      });
    }

    return { regions };
  }

  private extractRegion(
    sourceCanvas: HTMLCanvasElement,
    bbox: { x: number; y: number; width: number; height: number }
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = bbox.width;
    canvas.height = bbox.height;

    context.drawImage(
      sourceCanvas,
      bbox.x, bbox.y, bbox.width, bbox.height,
      0, 0, bbox.width, bbox.height
    );

    return canvas;
  }
}
```

### 4. Markdown Generator (`src/utils/markdownGenerator.ts`)

```typescript
interface PageRegion {
  type: string;
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
}

interface PageResult {
  regions: PageRegion[];
}

export function generateMarkdown(pageResults: PageResult[]): string {
  const pageMarkdowns: string[] = [];

  for (const page of pageResults) {
    // Sort regions by reading order (top-to-bottom, left-to-right for single column)
    // For multi-column, detect columns first
    const sortedRegions = sortRegionsByReadingOrder(page.regions);

    const markdownParts: string[] = [];
    for (const region of sortedRegions) {
      const markdown = convertRegionToMarkdown(region);
      if (markdown) {
        markdownParts.push(markdown);
      }
    }

    const pageMarkdown = markdownParts.join('\n\n');
    if (pageMarkdown.trim()) {
      pageMarkdowns.push(pageMarkdown.trim());
    }
  }

  return pageMarkdowns.join('\n\n---\n\n').trim();
}

function sortRegionsByReadingOrder(regions: PageRegion[]): PageRegion[] {
  // Detect if multi-column layout
  const columns = detectColumns(regions);
  
  if (columns.length > 1) {
    // Multi-column: sort within each column, then combine columns left-to-right
    return sortByColumns(regions, columns);
  }
  
  // Single column: sort by Y position (top to bottom)
  return [...regions].sort((a, b) => a.bbox.y - b.bbox.y);
}

function detectColumns(regions: PageRegion[]): number[] {
  // Analyze X distribution to detect column boundaries
  const xPositions = regions.map(r => r.bbox.x);
  const minX = Math.min(...xPositions);
  const maxX = Math.max(...xPositions);
  const spread = maxX - minX;

  // If spread is small, single column
  if (spread < 200) {
    return [0];
  }

  // Use clustering to find column centers
  // Simplified: assume 2-3 columns typical for scientific papers
  const numColumns = Math.min(3, Math.ceil(spread / 300));
  const columnWidth = spread / numColumns;
  
  const columns: number[] = [];
  for (let i = 0; i < numColumns; i++) {
    columns.push(minX + i * columnWidth);
  }
  
  return columns;
}

function sortByColumns(regions: PageRegion[], columns: number[]): PageRegion[] {
  // Assign each region to nearest column
  const columnRegions: Map<number, PageRegion[]> = new Map();
  
  for (const region of regions) {
    const nearestColumn = columns.reduce((nearest, col) => {
      return Math.abs(region.bbox.x - col) < Math.abs(region.bbox.x - nearest) ? col : nearest;
    });
    
    if (!columnRegions.has(nearestColumn)) {
      columnRegions.set(nearestColumn, []);
    }
    columnRegions.get(nearestColumn)!.push(region);
  }

  // Sort within each column by Y position
  const sorted: PageRegion[] = [];
  const sortedColumns = [...columnRegions.keys()].sort((a, b) => a - b);
  
  for (const col of sortedColumns) {
    const colRegions = columnRegions.get(col)!;
    colRegions.sort((a, b) => a.bbox.y - b.bbox.y);
    sorted.push(...colRegions);
  }

  return sorted;
}

function convertRegionToMarkdown(region: PageRegion): string {
  const text = region.text.trim();
  if (!text) return '';

  switch (region.type) {
    case 'heading':
      // Determine heading level from font size or position
      const level = estimateHeadingLevel(region);
      return `${'#'.repeat(level)} ${text}`;

    case 'table':
      // Format as markdown table
      return formatAsTable(text);

    case 'figure':
      return `*${text}*`;

    case 'caption':
      return `*${text}*`;

    case 'list':
      return formatAsList(text);

    case 'text':
    default:
      return text;
  }
}

function estimateHeadingLevel(region: PageRegion): number {
  // Estimate based on position and text characteristics
  const text = region.text.trim();
  
  if (region.bbox.y < 100 && text.length < 100) {
    return 1; // Top of page, short text = main heading
  }
  
  if (text.length < 80) {
    return 2; // Short text = subheading
  }
  
  return 3; // Default to h3
}

function formatAsTable(text: string): string {
  // Split by multiple spaces or tabs to detect columns
  const rows = text.split('\n').filter(row => row.trim());
  if (rows.length === 0) return text;

  const formattedRows = rows.map(row => {
    const cells = row.split(/\s{2,}|\t/).filter(cell => cell.trim());
    return `| ${cells.join(' | ')} |`;
  });

  // Add header separator after first row
  if (formattedRows.length > 1) {
    const numCells = formattedRows[0].split('|').length - 2;
    const separator = `| ${Array(numCells).fill('---').join(' | ')} |`;
    formattedRows.splice(1, 0, separator);
  }

  return formattedRows.join('\n');
}

function formatAsList(text: string): string {
  const lines = text.split('\n').filter(line => line.trim());
  return lines.map(line => {
    const trimmed = line.trim();
    // Check if already has bullet or number
    if (/^[•·○●▪▫►→\*\-–]\s/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed)) {
      return trimmed;
    }
    return `* ${trimmed}`;
  }).join('\n');
}
```

## Bundle Size Considerations

### Estimated Bundle Sizes

| Component | Size | Notes |
|-----------|------|-------|
| Tesseract.js | ~2 MB | WebAssembly + language data |
| ONNX Runtime Web | ~3 MB | Core runtime |
| DocLayout-YOLO Model | ~10-15 MB | ONNX model file |
| **Total** | **~15-20 MB** | Lazy loaded |

### Optimization Strategies

1. **Lazy Loading**
   - Load OCR/AI components only when scientific mode is enabled
   - Show loading indicator while downloading models

2. **Model Optimization**
   - Use quantized models (INT8) for smaller size
   - Consider model pruning for faster inference

3. **Caching**
   - Cache models in browser storage
   - Cache OCR results for repeated conversions

4. **CDN Hosting**
   - Host models on CDN for faster downloads
   - Use service worker for offline support

## Performance Considerations

### Expected Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Model Loading | 5-15 sec | First time only (cached after) |
| Page Rendering | 0.5-1 sec | Per page |
| Layout Analysis | 1-3 sec | Per page (WebGPU) |
| OCR | 2-5 sec | Per page |
| **Total** | **4-10 sec/page** | With WebGPU |

### Without WebGPU

- Layout analysis: 5-15 sec/page (WASM fallback)
- Total: 8-20 sec/page

### Progress Tracking

Implement progress callbacks for:
1. Model loading progress
2. Page rendering progress
3. Layout analysis progress
4. OCR progress per page

## Browser Compatibility

### Minimum Requirements

- **Chrome**: 90+ (WebAssembly, WebGPU optional)
- **Firefox**: 89+ (WebAssembly, WebGPU optional)
- **Safari**: 15+ (WebAssembly, no WebGPU)
- **Edge**: 90+ (WebAssembly, WebGPU optional)

### WebGPU Support

- **Chrome**: 113+ (enabled by default)
- **Edge**: 113+ (enabled by default)
- **Firefox**: Nightly (behind flag)
- **Safari**: Not yet supported

### Fallback Strategy

1. Check WebGPU support
2. If available: Use WebGPU acceleration
3. If not: Fall back to WASM (slower but functional)
4. Show performance warning if using WASM fallback

## Testing Strategy

### Test Cases

1. **Simple Text PDFs**
   - Single column, no tables
   - Verify basic text extraction

2. **Multi-Column Papers**
   - IEEE format two-column
   - Verify reading order

3. **Tables**
   - Simple tables
   - Complex tables with merged cells

4. **Figures**
   - Figure captions
   - Figure references

5. **Scanned Documents**
   - Low quality scans
   - Verify OCR accuracy

6. **Large Documents**
   - 20+ page papers
   - Verify performance

### Performance Benchmarks

- Time per page
- Memory usage
- Bundle size impact
- Model loading time

## Migration Path

### Phase 1: Add OCR Mode (Week 1-2)

1. Add Tesseract.js dependency
2. Create `OcrPdfConverter` with basic OCR
3. Add toggle in UI
4. Test with simple PDFs

### Phase 2: Add Layout Analysis (Week 3-4)

1. Add ONNX Runtime dependency
2. Integrate DocLayout-YOLO model
3. Create `AiScientificPdfConverter`
4. Test with complex PDFs

### Phase 3: Optimization (Week 5-6)

1. Implement lazy loading
2. Add progress indicators
3. Optimize model size
4. Add caching

### Phase 4: Polish (Week 7-8)

1. Comprehensive testing
2. Documentation
3. Performance tuning
4. Browser compatibility testing

## Future Enhancements

1. **Multi-Language Support**
   - Load appropriate Tesseract language packs
   - Auto-detect document language

2. **Mathematical Formula Detection**
   - Specialized model for formula recognition
   - LaTeX output for formulas

3. **Citation Extraction**
   - Detect and format references
   - Extract DOIs and URLs

4. **Figure Extraction**
   - Extract figures as separate images
   - Generate figure captions

5. **Export Options**
   - Direct export to Notion, Obsidian
   - PDF/A output with OCR layer

## Conclusion

The OCR/AI-based approach provides significantly better results for scientific papers compared to heuristic-based text extraction. The recommended implementation using Tesseract.js + DocLayout-YOLO offers the best balance of accuracy, performance, and feasibility for browser-side processing.

Key benefits:
- ✅ Works with poorly formatted PDFs
- ✅ Handles scanned documents
- ✅ Accurate layout detection
- ✅ Better reading order determination
- ✅ Works entirely client-side
- ✅ No server required

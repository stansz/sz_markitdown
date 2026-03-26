# Scientific Paper PDF Conversion Feature Plan

## Overview

Add enhanced PDF-to-Markdown conversion specifically optimized for scientific and peer-reviewed papers using IBM's **docling-sdk** with WebGPU. This feature provides superior handling of:

- Multi-column layouts
- Tables and figures
- Mathematical formulas
- Section hierarchies
- Reading order determination
- OCR for scanned documents

## Architecture

### Conversion Mode Selection

```
┌─────────────────────────────────────────────────────────────┐
│                     FileUpload Component                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  [Drag & Drop Area]                                  │    │
│  │                                                       │    │
│  │  ☐ Scientific Paper Mode (requires WebGPU)          │    │
│  │     Enhanced conversion for research papers          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                               │
│  - Manages `scientificMode` state                            │
│  - Passes mode to MarkItDown converter                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     MarkItDown Core                          │
│  - Routes PDF files to appropriate converter based on mode  │
│  - Standard Mode → PdfConverter (pdf.js)                     │
│  - Scientific Mode → ScientificPdfConverter (docling-sdk)   │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│   PdfConverter          │     │ ScientificPdfConverter  │
│   (pdf.js)              │     │ (docling-sdk/WebGPU)    │
│   - Basic text extract  │     │ - Layout analysis       │
│   - Page-by-page        │     │ - Table detection       │
│   - No structure        │     │ - Figure handling       │
│                         │     │ - Formula support       │
└─────────────────────────┘     └─────────────────────────┘
```

## Implementation Details

### 1. Dependencies

Add to `package.json`:
```json
{
  "dependencies": {
    "docling-sdk": "^1.3.6"
  }
}
```

### 2. New Files

#### `src/utils/webgpuDetection.ts`
Utility for detecting WebGPU support in the browser.

```typescript
/**
 * Detects if the browser supports WebGPU
 */
export function hasWebGPUSupport(): boolean {
  return !!(navigator as any).gpu;
}

/**
 * Get WebGPU support status with details
 */
export function getWebGPUStatus(): {
  supported: boolean;
  message: string;
} {
  if (!hasWebGPUSupport()) {
    return {
      supported: false,
      message: 'WebGPU is not supported in this browser. Please use Chrome 113+, Edge 112+, or Firefox Nightly.',
    };
  }
  return {
    supported: true,
    message: 'WebGPU is supported',
  };
}
```

#### `src/converters/ScientificPdfConverter.ts`
Enhanced PDF converter using docling-sdk for scientific papers.

```typescript
import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';

const ACCEPTED_MIME_TYPE_PREFIXES = ['application/pdf'];
const ACCEPTED_FILE_EXTENSIONS = ['.pdf'];

/**
 * Converts PDF files to Markdown using docling-sdk
 * Optimized for scientific papers with tables, figures, and complex layouts
 */
export class ScientificPdfConverter extends DocumentConverter {
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
    // Dynamically import docling-sdk
    const { DoclingClient } = await import('docling-sdk');

    // Initialize the client
    const client = new DoclingClient();

    // Convert ArrayBuffer to Blob
    const blob = new Blob([fileStream], { type: 'application/pdf' });
    const file = new File([blob], streamInfo.filename || 'document.pdf', {
      type: 'application/pdf',
    });

    try {
      // Use docling-sdk to convert the PDF
      const result = await client.convertFile(file, {
        outputFormats: ['markdown'],
        // Enable advanced features for scientific papers
        options: {
          doTableStructure: true,
          doFigureEnrichment: true,
          doOcr: true, // Enable OCR for scanned documents
        },
      });

      const markdown = result.markdown || '';

      return {
        markdown: markdown.trim(),
        title: streamInfo.filename,
      };
    } catch (error) {
      throw new Error(
        `Scientific PDF conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
```

### 3. Modified Files

#### `src/core/types.ts`
Add conversion mode types:

```typescript
/**
 * Conversion mode for PDF files
 */
export type PdfConversionMode = 'standard' | 'scientific';

/**
 * Options for MarkItDown initialization
 */
export interface MarkItDownOptions {
  enableBuiltins?: boolean;
  llmClient?: LLMClient;
  pdfConversionMode?: PdfConversionMode;
}
```

#### `src/core/MarkItDown.ts`
Update to support conversion mode selection:

```typescript
import { ScientificPdfConverter } from '../converters/ScientificPdfConverter';

export class MarkItDown {
  private converters: ConverterRegistration[] = [];
  private builtinsEnabled = false;
  private pdfConversionMode: PdfConversionMode = 'standard';

  constructor(options?: MarkItDownOptions) {
    this.pdfConversionMode = options?.pdfConversionMode || 'standard';
    if (options?.enableBuiltins !== false) {
      this.enableBuiltins();
    }
  }

  enableBuiltins(): void {
    // ... existing code ...
    
    // Register ScientificPdfConverter if in scientific mode
    if (this.pdfConversionMode === 'scientific') {
      this.registerConverter(
        new ScientificPdfConverter(),
        PRIORITY_SPECIFIC_FILE_FORMAT
      );
    } else {
      this.registerConverter(
        new PdfConverter(),
        PRIORITY_SPECIFIC_FILE_FORMAT
      );
    }
    
    // ... rest of existing code ...
  }
  
  // Add method to update conversion mode
  setPdfConversionMode(mode: PdfConversionMode): void {
    this.pdfConversionMode = mode;
    this.converters = []; // Clear existing converters
    this.enableBuiltins(); // Re-register with new mode
  }
}
```

#### `src/components/FileUpload.tsx`
Add scientific paper mode toggle:

```typescript
interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  scientificMode: boolean;
  onScientificModeChange: (enabled: boolean) => void;
  webgpuSupported: boolean;
}

export function FileUpload({
  onFilesSelected,
  scientificMode,
  onScientificModeChange,
  webgpuSupported,
}: FileUploadProps) {
  // ... existing code ...
  
  return (
    <div>
      {/* Existing upload area */}
      
      {/* Scientific Paper Mode Toggle */}
      <div className="mt-4 p-3 rounded-lg bg-muted/40 border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scientificMode && webgpuSupported}
                onChange={(e) => onScientificModeChange(e.target.checked)}
                disabled={!webgpuSupported}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
            </label>
            <div>
              <span className="text-sm font-medium text-foreground">
                Scientific Paper Mode
              </span>
              {!webgpuSupported && (
                <p className="text-xs text-destructive">
                  WebGPU not supported in this browser
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <svg
              className="w-5 h-5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Enhanced conversion for research papers with tables, figures, and
          complex layouts
        </p>
      </div>
    </div>
  );
}
```

#### `src/App.tsx`
Update to manage scientific mode state:

```typescript
function App() {
  const [files, setFiles] = useState<FileResult[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const [scientificMode, setScientificMode] = useState(false);
  const [webgpuSupported, setWebgpuSupported] = useState(false);
  const [converter, setConverter] = useState<MarkItDown | null>(null);

  // Detect WebGPU support on mount
  useEffect(() => {
    const { hasWebGPUSupport } = await import('./utils/webgpuDetection');
    setWebgpuSupported(hasWebGPUSupport());
    
    // Initialize converter with current mode
    setConverter(new MarkItDown({
      pdfConversionMode: scientificMode ? 'scientific' : 'standard',
    }));
  }, []);

  // Update converter when scientific mode changes
  useEffect(() => {
    if (converter) {
      converter.setPdfConversionMode(
        scientificMode ? 'scientific' : 'standard'
      );
    }
  }, [scientificMode, converter]);

  const handleFilesSelected = async (selectedFiles: File[]) => {
    // ... existing code, using the converter state ...
  };

  // Pass new props to FileUpload
  <FileUpload
    onFilesSelected={handleFilesSelected}
    scientificMode={scientificMode}
    onScientificModeChange={setScientificMode}
    webgpuSupported={webgpuSupported}
  />
}
```

### 4. Documentation Update (AGENTS.md)

Add to the Context section:

```markdown
**Recent Changes:**
- **Added Scientific Paper Mode** (current): Enhanced PDF conversion for scientific and peer-reviewed papers using docling-sdk with WebGPU.
  - Created `src/converters/ScientificPdfConverter.ts` using docling-sdk for advanced layout analysis
  - Added `src/utils/webgpuDetection.ts` for browser WebGPU support detection
  - Updated `MarkItDown` class to support PDF conversion mode selection
  - Added global "Scientific Paper Mode" toggle in FileUpload component
  - Requires WebGPU-compatible browser (Chrome 113+, Edge 112+, Firefox Nightly)
  - Provides superior handling of tables, figures, multi-column layouts, and mathematical formulas
```

## Browser Compatibility

### WebGPU Support Requirements
- **Chrome**: 113+
- **Edge**: 112+
- **Firefox**: Nightly (with WebGPU enabled)
- **Safari**: Not yet supported (as of early 2025)

### Fallback Behavior
When WebGPU is not supported:
1. The toggle will be disabled with a clear message
2. Users can still use the standard PDF converter (pdf.js)
3. No conversion functionality is lost, just the enhanced scientific mode

## Testing Strategy

1. **Unit Tests**
   - WebGPU detection utility
   - ScientificPdfConverter accepts/rejects correct file types
   - MarkItDown mode switching

2. **Integration Tests**
   - Upload scientific PDF with scientific mode enabled
   - Verify table extraction
   - Verify figure captions
   - Verify multi-column reading order

3. **Sample Test Documents**
   - arXiv papers with tables
   - IEEE format two-column papers
   - Scanned PDF documents (OCR test)
   - Papers with mathematical formulas

## Performance Considerations

1. **Bundle Size**
   - docling-sdk adds ~2-5MB to bundle
   - Consider lazy loading the converter only when scientific mode is enabled

2. **Conversion Time**
   - Scientific mode will be slower than standard PDF.js
   - Expected: 5-30 seconds per page depending on complexity
   - Add progress indicator for long conversions

3. **Memory Usage**
   - WebGPU models require additional memory
   - May impact performance on low-end devices
   - Consider adding a memory warning for large documents

## Future Enhancements

1. **Progress Indicator**: Show conversion progress for large documents
2. **Batch Processing**: Queue multiple scientific papers for conversion
3. **Export Options**: Direct export to common formats (Notion, Obsidian)
4. **Citation Extraction**: Extract and format bibliographic references
5. **Figure Extraction**: Extract figures as separate images with captions

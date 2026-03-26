# Project Memory

## Brief

**MarkItDown Browser** is a client-side document conversion tool that transforms various document formats (PDF, DOCX, HTML, PPTX, XLSX) into clean Markdown. The application runs entirely in the browser using React, TypeScript, and Vite, with no server-side processing required.

**Core Requirements:**
- Convert multiple document formats to Markdown
- Pure browser-based processing (client-side only)
- Support drag-and-drop file uploads
- Provide real-time preview of converted Markdown
- Maintain high performance with large files

**Goals:**
- Deliver a fast, responsive user interface
- Ensure reliable conversion across all supported formats
- Keep dependencies minimal and well-maintained

---

## Product

**Purpose:**
MarkItDown Browser exists to provide a simple, privacy-focused tool for converting documents to Markdown without uploading files to a server. All processing happens locally in the user's browser.

**Problems Solved:**
- Eliminates privacy concerns of uploading sensitive documents to cloud services
- Works offline once loaded
- Provides instant conversion without network latency
- Supports multiple common document formats in one interface

**How It Works:**
1. User uploads files via drag-and-drop or file picker
2. The appropriate converter (based on file type) processes the file in memory
3. Extracted text is formatted as Markdown
4. User can preview, copy, or download the Markdown output

**User Experience Goals:**
- Clean, intuitive interface using Tailwind CSS and shadcn/ui components
- Immediate feedback during conversion (loading states, error messages)
- Clear error handling with helpful messages
- Responsive design for different screen sizes

---

## Context

**Current Work Focus:**
- Fixing PDF conversion issues related to PDF.js worker loading
- Ensuring all converters work reliably in browser environment
- Maintaining code quality and TypeScript type safety

**Recent Changes:**
- **Added Scientific Paper Mode** (current): Enhanced PDF conversion for scientific and peer-reviewed papers using heuristic-based layout analysis.
  - Created `src/converters/ScientificPdfConverter.ts` with advanced heuristics for:
    - Multi-column layout detection using density analysis
    - Reading order determination (top-to-bottom, left-to-right)
    - Paragraph detection based on line spacing and indentation
    - List detection (bullets, numbered lists, Roman numerals)
    - Table row detection using alignment patterns
    - Figure caption detection
    - Horizontal line separators
    - Heading detection using font size, position, and text patterns
  - Updated `MarkItDown` class to support PDF conversion mode selection
  - Added global "Scientific Paper Mode" toggle in FileUpload component
  - **Note**: This is a heuristic-based implementation (not AI-powered). It works well for well-formatted scientific papers but may not match the quality of docling-sdk (which requires Python and cannot run in browser).
  - No WebGPU required - works in all modern browsers

- **Added Outlook .msg converter**: Implemented OutlookMsgConverter using @kenjiuno/msgreader library to support conversion of Outlook .msg email files to Markdown.
  - Created `src/converters/OutlookMsgConverter.ts` with full email metadata extraction (subject, sender, recipients, date, body)
  - Registered converter with PRIORITY_SPECIFIC_FILE_FORMAT in MarkItDown class
  - Added `@kenjiuno/msgreader` (v1.28.0) and `buffer` dependencies to package.json
  - Handles both HTML and plain text email bodies

- **Fixed PDF.js worker loading** (2025-03-25): Changed from CDN-based worker to locally bundled worker using Vite's worker import. This resolves CORS/network errors when converting PDF files.
  - Modified `src/converters/PdfConverter.ts` to import `pdfjs-dist/build/pdf.worker.mjs?worker&url`
  - Set `GlobalWorkerOptions.workerSrc` to the bundled worker URL
  - Vite config already had manual chunking for the worker

**Next Steps:**
- Test PDF conversion with various PDF files to ensure robustness
- Monitor for any other converter-specific issues
- Consider adding more document format support if needed
- Potentially add conversion progress indicators for large files

---

## Architecture

**System Architecture:**
- Single-page application (SPA) built with React 18
- TypeScript for type safety
- Vite for fast development and optimized production builds
- Component-based architecture with clear separation of concerns

**Source Code Paths:**
```
src/
├── components/          # React UI components
│   ├── FileUpload.tsx   # Drag-and-drop file upload
│   ├── FileList.tsx    # List of uploaded files
│   ├── MarkdownPreview.tsx  # Markdown rendering
│   └── ActionButtons.tsx    # Copy/download actions
├── converters/         # Document format converters
│   ├── DocxConverter.ts    # DOCX → Markdown (mammoth.js)
│   ├── HtmlConverter.ts    # HTML → Markdown (marked.js)
│   ├── OutlookMsgConverter.ts  # MSG → Markdown (@kenjiuno/msgreader)
│   ├── PdfConverter.ts     # PDF → Markdown (pdf.js)
│   ├── ScientificPdfConverter.ts  # PDF → Markdown (heuristic layout analysis)
│   ├── PptxConverter.ts    # PPTX → Markdown (pptx2json)
│   └── XlsxConverter.ts    # XLSX → Markdown (xlsx)
├── core/               # Core application logic
│   ├── MarkItDown.ts    # Main orchestrator
│   └── types.ts         # TypeScript interfaces
├── utils/              # Utility functions
│   ├── fileDetection.ts # MIME type and extension matching
│   ├── webgpuDetection.ts # WebGPU support detection
│   └── llmClient.ts     # LLM integration (future)
└── lib/
    └── utils.ts         # General utilities
```

**Key Technical Decisions:**
- **Client-side only**: No backend required, improves privacy and reduces infrastructure
- **Dynamic imports for converters**: Each converter is loaded on-demand to reduce initial bundle size
- **Vite manual chunking**: Separate chunks for heavy dependencies (pdf-worker, xlsx, jszip) to optimize loading
- **ES modules**: Using modern JavaScript modules for better tree-shaking

**Design Patterns:**
- **Strategy Pattern**: Each converter implements the `DocumentConverter` interface
- **Factory Pattern**: `MarkItDown` class selects appropriate converter based on file type
- **Separation of Concerns**: UI components separate from conversion logic
- **Lazy Loading**: Converters are dynamically imported when needed

**Component Relationships:**
- `App.tsx` → Main container, holds state for files and results
- `FileUpload` → Emits file added events
- `FileList` → Displays files, triggers conversion via `MarkItDown`
- `MarkdownPreview` → Shows converted markdown
- `MarkItDown` core → Uses appropriate converter from `converters/` directory

**Critical Implementation Paths:**
- File upload → Stream reading → Converter selection → Conversion → Markdown output
- Error handling at each stage (file reading, conversion, rendering)

---

## Tech

**Technologies Used:**
- **Frontend**: React 18, TypeScript 5
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS 3.4, shadcn/ui components
- **Converters**:
  - `pdfjs-dist` (v4.4.168) for PDF text extraction
  - Advanced heuristic-based layout analysis for scientific PDFs (no external ML dependencies)
  - `mammoth` (v1.8.0) for DOCX conversion
  - `marked` (v12.0.0) for HTML to Markdown
  - `@kenjiuno/msgreader` (v1.28.0) for Outlook .msg conversion
  - `xlsx` (v0.20.3) for spreadsheet conversion
  - `jszip` (v3.10.1) for PPTX parsing and archive handling
- **Icons**: lucide-react

**Development Setup:**
```bash
npm install
npm run dev      # Start development server
npm run build    # Production build
npm run preview  # Preview production build
```

**Technical Constraints:**
- Must run entirely in the browser (no server-side code)
- File processing happens in memory (limited by browser memory)
- Large files may cause performance issues (need to test limits)
- PDF.js worker must be bundled to avoid CORS issues (solved)

**Dependencies:**
- Production: See `package.json` for full list
- All dependencies are npm packages except xlsx which uses CDN tarball
- `buffer` package provides Node.js Buffer polyfill for browser environment (required by @kenjiuno/msgreader)
- pdfjs-dist worker is bundled via Vite with `?worker&url` import

**Tool Usage Patterns:**
- Vite for HMR and optimized builds
- TypeScript strict mode enabled
- ESLint/Prettier (if configured - check project setup)
- Git for version control

**Known Issues & Solutions:**
- PDF.js worker loading: Use local bundled worker instead of CDN to avoid CORS errors
  - Solution: `import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?worker&url'`
  - Set `pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl`

# MarkItDown Browser

A browser-based, client-side version of [Microsoft's MarkItDown](https://github.com/microsoft/markitdown) that converts various document formats to Markdown entirely in your browser. No server required.

## Features

- **100% Client-Side**: All processing happens in your browser. No data is sent to any server.
- **Multiple Formats**: Supports PDF, DOCX (Word), XLSX (Excel), PPTX (PowerPoint), and HTML files.
- **Drag & Drop**: Simple drag-and-drop interface for uploading files.
- **Markdown Preview**: Real-time preview of converted Markdown.
- **Copy & Download**: Easily copy to clipboard or download as `.md` file.

## Supported Formats

| Format | Extension | Library Used |
|--------|-----------|--------------|
| PDF | `.pdf` | pdf.js |
| Word | `.docx` | mammoth.js |
| Excel | `.xlsx`, `.xls` | SheetJS (xlsx) |
| PowerPoint | `.pptx` | JSZip |
| HTML | `.html`, `.htm` | Native DOMParser |

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/markitdown-browser.git
cd markitdown-browser

# Install dependencies
npm install

# Start development server
npm run dev
```

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Architecture

The project mirrors the Python version's architecture:

```
src/
├── core/
│   ├── MarkItDown.ts          # Main converter class
│   └── types.ts               # Shared types and interfaces
├── converters/
│   ├── HtmlConverter.ts       # HTML to Markdown
│   ├── DocxConverter.ts       # DOCX to Markdown
│   ├── PdfConverter.ts        # PDF to Markdown
│   ├── XlsxConverter.ts       # XLSX to Markdown
│   └── PptxConverter.ts       # PPTX to Markdown
├── utils/
│   ├── fileDetection.ts       # MIME type and extension detection
│   └── llmClient.ts           # LLM integration placeholder
├── components/
│   ├── FileUpload.tsx         # Drag-and-drop upload zone
│   ├── FileList.tsx           # File list with status
│   ├── MarkdownPreview.tsx    # Markdown preview
│   └── ActionButtons.tsx      # Copy and download actions
└── App.tsx                    # Main application component
```

### Converter Priority System

Converters are registered with priorities (lower = higher priority):

- `0.0`: Specific file formats (DOCX, PDF, XLSX, PPTX)
- `10.0`: Generic formats (HTML, plain text)

When converting a file, converters are tried in priority order until one succeeds.

## LLM Integration (Future)

The architecture includes placeholders for future LLM integration:

- **Image Description**: Extract and describe images from documents
- **Audio Transcription**: Transcribe audio content
- **OCR**: Extract text from images using vision models

To enable LLM features in the future, implement the `LLMClient` interface:

```typescript
interface LLMClient {
  describeImage(imageData: ArrayBuffer): Promise<string>;
  transcribeAudio(audioData: ArrayBuffer): Promise<string>;
}
```

## Technology Stack

- **Build Tool**: Vite
- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Conversion Libraries**:
  - `mammoth` - DOCX conversion
  - `pdfjs-dist` - PDF text extraction
  - `xlsx` - Excel file parsing
  - `jszip` - ZIP/PPTX file handling
  - `marked` - Markdown rendering

## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Limitations

- **Large Files**: Very large files may cause performance issues. Consider implementing Web Workers for better performance.
- **Complex Formatting**: Some complex document formatting may not be perfectly preserved.
- **Images**: Images embedded in documents are not extracted (placeholder for future LLM integration).
- **Audio/Video**: Audio and video transcription is not supported (placeholder for future LLM integration).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Microsoft MarkItDown](https://github.com/microsoft/markitdown) - Original Python implementation
- [pdf.js](https://mozilla.github.io/pdf.js/) - PDF rendering library
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) - DOCX to HTML conversion
- [SheetJS](https://sheetjs.com/) - Excel file parsing

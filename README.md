# MarkItDown Browser

A browser-based, client-side document conversion tool that transforms various document formats (PDF, DOCX, HTML, PPTX, XLSX, MSG) into clean Markdown (inspired by [Microsoft MarkItDown](https://github.com/microsoft/markitdown)). The application runs entirely in the browser using React, TypeScript, and Vite, with no server-side processing required.

[Try it out](https://szmarkitdown.netlify.app/)

## Vibe Coding Disclaimer

This project leverages "vibe coding" tools, primarily Roo Code extension.

## Features

- **100% Client-Side**: All processing happens in your browser. No data is sent to any server.
- **Multiple Formats**: Supports PDF, DOCX (Word), XLSX (Excel), PPTX (PowerPoint), HTML, and Outlook .msg files.
- **Drag & Drop**: Simple drag-and-drop interface for uploading files.
- **Markdown Preview**: Real-time preview of converted Markdown.
- **Copy & Download**: Easily copy to clipboard or download as `.md` file.
- **Privacy-Focused**: Works offline once loaded. Your documents never leave your computer.

## Supported Formats

| Format | Extension | Library Used | Version |
|--------|-----------|--------------|---------|
| PDF | `.pdf` | pdf.js | 4.4.168 |
| Word | `.docx` | mammoth.js | 1.8.0 |
| Excel | `.xlsx`, `.xls` | SheetJS (xlsx) | 0.20.3 |
| PowerPoint | `.pptx` | JSZip | 3.10.1 |
| HTML | `.html`, `.htm` | Native DOMParser + marked | 12.0.0 |
| Outlook Email | `.msg` | @kenjiuno/msgreader | 1.2.0 |


## Browser Compatibility

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Limitations

- **Large Files**: Very large files may cause performance issues. Consider implementing Web Workers for better performance.
- **Complex Formatting**: Some complex document formatting may not be perfectly preserved.
- **Images**: Images embedded in documents are not extracted.
- **Audio/Video**: Audio and video transcription is not supported.
- **Memory Constraints**: File processing happens in memory and is limited by browser available memory.

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/stansz/markitdown-browser.git
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

The project follows a modular architecture inspired by Microsoft's Python MarkItDown implementation:

```
src/
├── core/
│   ├── MarkItDown.ts          # Main converter orchestrator
│   └── types.ts               # Shared TypeScript interfaces
├── converters/                # Document format converters
│   ├── HtmlConverter.ts       # HTML → Markdown
│   ├── DocxConverter.ts       # DOCX → Markdown
│   ├── PdfConverter.ts        # PDF → Markdown
│   ├── XlsxConverter.ts       # XLSX/XLS → Markdown
│   ├── PptxConverter.ts       # PPTX → Markdown
│   └── OutlookMsgConverter.ts # MSG → Markdown
├── utils/
│   ├── fileDetection.ts       # MIME type and extension detection
│   └── llmClient.ts           # LLM integration placeholder
├── components/                # React UI components
│   ├── FileUpload.tsx         # Drag-and-drop upload zone
│   ├── FileList.tsx           # File list with conversion status
│   ├── MarkdownPreview.tsx    # Markdown rendering
│   └── ActionButtons.tsx      # Copy and download actions
└── App.tsx                    # Main application component
```

## Technology Stack

- **Build Tool**: Vite 5
- **Framework**: React 18 + TypeScript 5
- **Styling**: Tailwind CSS 3.4 + shadcn/ui components
- **Icons**: lucide-react
- **Conversion Libraries**:
  - `pdfjs-dist` (4.4.168) for PDF text extraction
  - `mammoth` (1.8.0) for DOCX conversion
  - `xlsx` (0.20.3) for spreadsheet conversion
  - `jszip` (3.10.1) for PPTX/archive handling
  - `marked` (12.0.0) for Markdown rendering
  - `@kenjiuno/msgreader` (1.2.0) for Outlook .msg files

### Polyfills

The project uses `vite-plugin-node-polyfills` to provide Node.js core module polyfills (Buffer, process, stream, etc.) for packages that depend on them, ensuring browser compatibility.


## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 MarkItDown Browser Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Acknowledgments

- [Microsoft MarkItDown](https://github.com/microsoft/markitdown) - Original Python implementation that inspired this project
- [pdf.js](https://mozilla.github.io/pdf.js/) - Mozilla's PDF rendering and text extraction library
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) - DOCX to HTML conversion
- [SheetJS](https://sheetjs.com/) - Excel file parsing library
- [JSZip](https://stuk.github.io/jszip/) - ZIP/PPTX file handling
- [marked](https://marked.js.org/) - Markdown parser
- [@kenjiuno/msgreader](https://github.com/kenjiuno/msgreader) - Outlook .msg file parser
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful, accessible UI components
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [VSCodium](https://github.com/VSCodium/vscodium) - Free/Libre Open Source Software Binaries of Visual Studio Code
- [Roo Code](https://github.com/RooCodeInc/Roo-Code) - Vibe Coding extension

import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';
import { OcrEngine, OcrProgress } from '../utils/ocrEngine';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?worker&url';

const ACCEPTED_MIME_TYPE_PREFIXES = ['application/pdf'];
const ACCEPTED_FILE_EXTENSIONS = ['.pdf'];

export interface OcrPdfConverterOptions {
  language?: string;
  scale?: number;
  onProgress?: (progress: OcrProgress) => void;
}

/**
 * Converts PDF files to Markdown using OCR (Tesseract.js)
 * Renders PDF pages to images and extracts text via OCR
 * Works with scanned documents and poorly formatted PDFs
 */
export class OcrPdfConverter extends DocumentConverter {
  private ocrEngine: OcrEngine;
  private options: OcrPdfConverterOptions;

  constructor(options: OcrPdfConverterOptions = {}) {
    super();
    this.ocrEngine = new OcrEngine();
    this.options = {
      language: options.language || 'eng',
      scale: options.scale || 2, // Higher scale for better OCR accuracy
      onProgress: options.onProgress,
    };
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
    // Dynamically import pdf.js
    const pdfjs = await import('pdfjs-dist');

    // Set up the worker using the locally bundled worker
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

    // Initialize OCR engine
    this.options.onProgress?.({ status: 'Initializing OCR engine...', progress: 0 });
    await this.ocrEngine.initialize(this.options.language, this.options.onProgress);

    // Load the PDF document
    this.options.onProgress?.({ status: 'Loading PDF...', progress: 10 });
    const pdf = await pdfjs.getDocument({ data: fileStream }).promise;
    const numPages = pdf.numPages;

    const pageTexts: string[] = [];

    // Process each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageProgress = ((pageNum - 1) / numPages) * 80 + 10;
      this.options.onProgress?.({
        status: `Processing page ${pageNum} of ${numPages}...`,
        progress: pageProgress,
      });

      const pageText = await this.processPage(pdf, pageNum);
      if (pageText.trim()) {
        pageTexts.push(pageText.trim());
      }
    }

    this.options.onProgress?.({ status: 'Conversion complete', progress: 100 });

    // Combine all pages with separators
    const markdown = pageTexts.join('\n\n---\n\n');

    return {
      markdown: markdown || '*No text content could be extracted from this PDF.*',
      title: streamInfo.filename,
    };
  }

  /**
   * Process a single PDF page: render to canvas and OCR
   */
  private async processPage(pdf: any, pageNum: number): Promise<string> {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.options.scale });

    // Create canvas for rendering
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Render page to canvas
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;

    // OCR the rendered image
    const ocrResult = await this.ocrEngine.recognizeDetailed(canvas);

    // Convert OCR result to structured text
    return this.ocrResultToText(ocrResult);
  }

  /**
   * Convert OCR result to structured text with basic formatting
   */
  private ocrResultToText(ocrResult: {
    text: string;
    confidence: number;
    paragraphs: Array<{
      text: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
    lines: Array<{
      text: string;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
    words: Array<{
      text: string;
      confidence: number;
      bbox: { x0: number; y0: number; x1: number; y1: number };
    }>;
  }): string {
    // Use paragraphs for better structure
    if (ocrResult.paragraphs.length > 0) {
      return ocrResult.paragraphs
        .map((p) => p.text.trim())
        .filter((text) => text.length > 0)
        .join('\n\n');
    }

    // Fallback to lines if no paragraphs detected
    if (ocrResult.lines.length > 0) {
      return ocrResult.lines
        .map((l) => l.text.trim())
        .filter((text) => text.length > 0)
        .join('\n');
    }

    // Fallback to raw text
    return ocrResult.text;
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    await this.ocrEngine.terminate();
  }
}

import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';
import { OcrEngine, OcrProgress } from '../utils/ocrEngine';
import { LayoutAnalyzer, LayoutAnalysisProgress } from '../utils/layoutAnalysis';
import { generateMarkdown, PageResult } from '../utils/markdownGenerator';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?worker&url';

const ACCEPTED_MIME_TYPE_PREFIXES = ['application/pdf'];
const ACCEPTED_FILE_EXTENSIONS = ['.pdf'];

export interface AiScientificPdfConverterOptions {
  language?: string;
  scale?: string;
  modelUrl?: string;
  onProgress?: (progress: { status: string; progress: number }) => void;
}

/**
 * Converts PDF files to Markdown using AI-powered layout analysis and OCR
 * Combines DocLayout-YOLO for structure detection with Tesseract.js for text extraction
 * Optimized for scientific papers with complex layouts
 */
export class AiScientificPdfConverter extends DocumentConverter {
  private ocrEngine: OcrEngine;
  private layoutAnalyzer: LayoutAnalyzer;
  private options: AiScientificPdfConverterOptions;
  private initialized = false;

  constructor(options: AiScientificPdfConverterOptions = {}) {
    super();
    this.ocrEngine = new OcrEngine();
    this.layoutAnalyzer = new LayoutAnalyzer(options.modelUrl);
    this.options = {
      language: options.language || 'eng',
      scale: options.scale || '2',
      modelUrl: options.modelUrl || '/models/doclayout-yolo.onnx',
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
    // Initialize engines if needed
    if (!this.initialized) {
      await this.initialize();
    }

    // Dynamically import pdf.js
    const pdfjs = await import('pdfjs-dist');

    // Set up the worker using the locally bundled worker
    pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

    // Load the PDF document
    this.options.onProgress?.({ status: 'Loading PDF...', progress: 5 });
    const pdf = await pdfjs.getDocument({ data: fileStream }).promise;
    const numPages = pdf.numPages;

    const pageResults: PageResult[] = [];
    const pageHeights: number[] = [];

    // Process each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pageProgress = ((pageNum - 1) / numPages) * 85 + 5;
      this.options.onProgress?.({
        status: `Processing page ${pageNum} of ${numPages}...`,
        progress: pageProgress,
      });

      const pageResult = await this.processPage(pdf, pageNum);
      pageResults.push(pageResult);
      
      // Store page height for header detection
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      pageHeights.push(viewport.height);
    }

    this.options.onProgress?.({ status: 'Generating Markdown...', progress: 95 });

    // Generate Markdown from all pages, passing page heights
    const markdown = generateMarkdown(pageResults, pageHeights);

    this.options.onProgress?.({ status: 'Conversion complete', progress: 100 });

    return {
      markdown: markdown || '*No text content could be extracted from this PDF.*',
      title: streamInfo.filename,
    };
  }

  /**
   * Initialize OCR and layout analysis engines
   */
  private async initialize(): Promise<void> {
    this.options.onProgress?.({ status: 'Initializing AI engines...', progress: 0 });

    // Initialize OCR engine
    await this.ocrEngine.initialize(this.options.language, (progress: OcrProgress) => {
      this.options.onProgress?.({
        status: progress.status,
        progress: progress.progress * 0.5, // OCR init is 50% of total init
      });
    });

    // Initialize layout analyzer
    await this.layoutAnalyzer.initialize((progress: LayoutAnalysisProgress) => {
      this.options.onProgress?.({
        status: progress.status,
        progress: 50 + progress.progress * 0.5, // Layout init is 50% of total init
      });
    });

    this.initialized = true;
  }

  /**
   * Process a single PDF page: render, analyze layout, OCR regions
   */
  private async processPage(pdf: any, pageNum: number): Promise<PageResult> {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: parseFloat(this.options.scale || '2') });

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
      const ocrResult = await this.ocrEngine.recognize(regionCanvas);
      const text = ocrResult.map((r) => r.text).join(' ');

      if (text.trim()) {
        regions.push({
          type: region.type,
          text,
          bbox: region.bbox,
        });
      }
    }

    return { regions };
  }

  /**
   * Extract a region from canvas as a new canvas element
   */
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
      bbox.x,
      bbox.y,
      bbox.width,
      bbox.height,
      0,
      0,
      bbox.width,
      bbox.height
    );

    return canvas;
  }

  /**
   * Check if converter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    await this.ocrEngine.terminate();
    await this.layoutAnalyzer.dispose();
    this.initialized = false;
  }
}

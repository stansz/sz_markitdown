import Tesseract, { LoggerMessage } from 'tesseract.js';

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

export interface OcrProgress {
  status: string;
  progress: number;
}

/**
 * OCR engine using Tesseract.js for text extraction from images
 * Works entirely in the browser via WebAssembly
 */
export class OcrEngine {
  private worker: Tesseract.Worker | null = null;
  private initialized = false;
  private currentLanguage = 'eng';

  /**
   * Initialize the OCR engine with specified language
   * @param language - Tesseract language code (e.g., 'eng', 'fra', 'deu')
   * @param onProgress - Optional callback for initialization progress
   */
  async initialize(
    language: string = 'eng',
    onProgress?: (progress: OcrProgress) => void
  ): Promise<void> {
    if (this.initialized && this.currentLanguage === language) {
      return;
    }

    // Terminate existing worker if language changed
    if (this.worker && this.currentLanguage !== language) {
      await this.terminate();
    }

    this.currentLanguage = language;

    onProgress?.({ status: 'Loading Tesseract worker...', progress: 0 });

    // Add a timeout to prevent hanging if Tesseract worker fails to initialize
    const timeoutMs = 30000; // 30 seconds
    try {
      this.worker = await Promise.race([
        Tesseract.createWorker(language, 1, {
          logger: (m: LoggerMessage) => {
            if (m.status === 'recognizing text') {
              onProgress?.({
                status: 'Recognizing text...',
                progress: m.progress * 100,
              });
            } else if (m.status === 'loading language traineddata') {
              onProgress?.({
                status: 'Loading language data...',
                progress: m.progress * 100,
              });
            }
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Tesseract initialization timeout')),
            timeoutMs
          )
        ),
      ]);
    } catch (error) {
      throw new Error(
        `Failed to initialize OCR engine: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }

    this.initialized = true;
    onProgress?.({ status: 'OCR engine ready', progress: 100 });
  }

  /**
   * Recognize text from an image
   * @param image - Canvas or image element to OCR
   * @returns Array of OCR results with text, confidence, and bounding boxes
   */
  async recognize(image: HTMLCanvasElement | HTMLImageElement): Promise<OcrResult[]> {
    if (!this.worker) {
      throw new Error('OCR engine not initialized. Call initialize() first.');
    }

    // Add a timeout to prevent hanging on a single recognition
    const timeoutMs = 60000; // 60 seconds per region (should be plenty)
    try {
      const { withTimeout } = await import('../lib/utils');
      const { data } = await withTimeout(
        this.worker.recognize(image),
        timeoutMs,
        'OCR recognition timed out'
      );
      return data.words.map((word: Tesseract.Word) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: {
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1,
        },
      }));
    } catch (e) {
      if (e instanceof Error && e.message.includes('timed out')) {
        console.warn('OCR recognition timed out, skipping region');
        return []; // Return empty result for this region
      }
      throw e;
    }
  }

  /**
   * Recognize text with detailed paragraph and line information
   * @param image - Canvas or image element to OCR
   * @returns Detailed OCR result with paragraphs, lines, and words
   */
  async recognizeDetailed(image: HTMLCanvasElement | HTMLImageElement): Promise<{
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
    words: OcrResult[];
  }> {
    if (!this.worker) {
      throw new Error('OCR engine not initialized. Call initialize() first.');
    }

    const { data } = await this.worker.recognize(image);

    return {
      text: data.text,
      confidence: data.confidence,
      paragraphs: data.paragraphs.map((p: Tesseract.Paragraph) => ({
        text: p.text,
        bbox: {
          x0: p.bbox.x0,
          y0: p.bbox.y0,
          x1: p.bbox.x1,
          y1: p.bbox.y1,
        },
      })),
      lines: data.lines.map((l: Tesseract.Line) => ({
        text: l.text,
        bbox: {
          x0: l.bbox.x0,
          y0: l.bbox.y0,
          x1: l.bbox.x1,
          y1: l.bbox.y1,
        },
      })),
      words: data.words.map((word: Tesseract.Word) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: {
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1,
        },
      })),
    };
  }

  /**
   * Check if the engine is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.worker !== null;
  }

  /**
   * Get current language
   */
  getLanguage(): string {
    return this.currentLanguage;
  }

  /**
   * Terminate the OCR engine and free resources
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}

/**
 * Singleton OCR engine instance for shared use
 */
let sharedEngine: OcrEngine | null = null;

/**
 * Get or create shared OCR engine instance
 */
export function getSharedOcrEngine(): OcrEngine {
  if (!sharedEngine) {
    sharedEngine = new OcrEngine();
  }
  return sharedEngine;
}

/**
 * Terminate shared OCR engine
 */
export async function terminateSharedOcrEngine(): Promise<void> {
  if (sharedEngine) {
    await sharedEngine.terminate();
    sharedEngine = null;
  }
}

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
   */
  async initialize(
    language: string = 'eng',
    onProgress?: (progress: OcrProgress) => void
  ): Promise<void> {
    if (this.initialized && this.currentLanguage === language) {
      return;
    }

    if (this.worker && this.currentLanguage !== language) {
      await this.terminate();
    }

    this.currentLanguage = language;
    onProgress?.({ status: 'Loading Tesseract worker...', progress: 0 });

    try {
      this.worker = await Tesseract.createWorker(language, 1, {
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
      });
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
   */
  async recognize(image: HTMLCanvasElement | HTMLImageElement): Promise<OcrResult[]> {
    if (!this.worker) {
      throw new Error('OCR engine not initialized. Call initialize() first.');
    }

    const { data } = await this.worker.recognize(image);
    
    console.log(`[OcrEngine] OCR result: ${data.words.length} words, confidence: ${data.confidence.toFixed(2)}`);
    if (data.words.length > 0) {
      console.log(`[OcrEngine] First few words:`, data.words.slice(0, 5).map((w: Tesseract.Word) => w.text).join(' | '));
    }
    
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
  }

  /**
   * Recognize text with detailed paragraph and line information
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

  isInitialized(): boolean {
    return this.initialized && this.worker !== null;
  }

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

let sharedEngine: OcrEngine | null = null;

export function getSharedOcrEngine(): OcrEngine {
  if (!sharedEngine) {
    sharedEngine = new OcrEngine();
  }
  return sharedEngine;
}

export async function terminateSharedOcrEngine(): Promise<void> {
  if (sharedEngine) {
    await sharedEngine.terminate();
    sharedEngine = null;
  }
}

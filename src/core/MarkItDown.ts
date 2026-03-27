import type {
  DocumentConverter,
  DocumentConverterResult,
  ConverterRegistration,
  MarkItDownOptions,
  StreamInfo,
  PdfConversionMode,
} from './types';
import {
  PRIORITY_SPECIFIC_FILE_FORMAT,
  PRIORITY_GENERIC_FILE_FORMAT,
  FileConversionException,
  UnsupportedFormatException,
} from './types';
import { HtmlConverter } from '../converters/HtmlConverter';
import { DocxConverter } from '../converters/DocxConverter';
import { PdfConverter } from '../converters/PdfConverter';
import { ScientificPdfConverter } from '../converters/ScientificPdfConverter';
import { XlsxConverter } from '../converters/XlsxConverter';
import { PptxConverter } from '../converters/PptxConverter';
import { OutlookMsgConverter } from '../converters/OutlookMsgConverter';
import { detectFileType } from '../utils/fileDetection';
import { getCachedOcrResult, cacheOcrResult } from '../utils/cache';

/**
 * MarkItDown - Browser-based document to Markdown converter
 * Mirrors the Python version's MarkItDown class
 */
export class MarkItDown {
  private converters: ConverterRegistration[] = [];
  private builtinsEnabled = false;
  private pdfConversionMode: PdfConversionMode = 'standard';
  private lazyLoadPromise: Promise<void> | null = null;

  constructor(options?: MarkItDownOptions) {
    this.pdfConversionMode = options?.pdfConversionMode || 'standard';
    if (options?.enableBuiltins !== false) {
      this.enableBuiltins();
    }
  }

  /**
   * Enable and register built-in converters
   */
  enableBuiltins(): void {
    if (this.builtinsEnabled) {
      console.warn('Built-in converters are already enabled.');
      return;
    }

    // Register converters in reverse order (most specific first)
    // Later registrations are tried first (higher priority)
    this.registerConverter(new OutlookMsgConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
    this.registerConverter(new PptxConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
    this.registerConverter(new XlsxConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
    
    // Register PDF converter based on mode
    // Priority: ai-scientific > ocr > scientific > standard
    // OCR and AI converters are lazy loaded to reduce initial bundle size
    if (this.pdfConversionMode === 'ai-scientific') {
      console.log('[MarkItDown] AI Scientific mode: lazy loading AI converter');
      // Lazy load AI converter
      this.lazyLoadPromise = import('../converters/AiScientificPdfConverter').then(({ AiScientificPdfConverter }) => {
        console.log('[MarkItDown] AI converter registered');
        this.registerConverter(new AiScientificPdfConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
      });
    } else if (this.pdfConversionMode === 'ocr') {
      console.log('[MarkItDown] OCR mode: lazy loading OCR converter');
      // Lazy load OCR converter
      this.lazyLoadPromise = import('../converters/OcrPdfConverter').then(({ OcrPdfConverter }) => {
        console.log('[MarkItDown] OCR converter registered');
        this.registerConverter(new OcrPdfConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
      });
    } else if (this.pdfConversionMode === 'scientific') {
      console.log('[MarkItDown] Scientific mode: registering ScientificPdfConverter');
      this.registerConverter(new ScientificPdfConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
    } else {
      console.log('[MarkItDown] Standard mode: registering PdfConverter');
      this.registerConverter(new PdfConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
    }
    
    this.registerConverter(new DocxConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
    this.registerConverter(new HtmlConverter(), PRIORITY_GENERIC_FILE_FORMAT);

    this.builtinsEnabled = true;
  }

  /**
   * Register a converter with a given priority
   * Lower priority values are tried first
   */
  registerConverter(converter: DocumentConverter, priority: number): void {
    this.converters.unshift({ converter, priority });
  }

  /**
   * Convert a file to Markdown
   */
  async convert(file: File): Promise<DocumentConverterResult> {
    console.log('[MarkItDown] convert() called, mode:', this.pdfConversionMode);
    // Wait for lazy-loaded converters to be registered
    if (this.lazyLoadPromise) {
      console.log('[MarkItDown] Waiting for lazy load...');
      await this.lazyLoadPromise;
      this.lazyLoadPromise = null;
      console.log('[MarkItDown] Lazy load complete');
    }

    // Check cache for OCR/AI modes
    if (this.pdfConversionMode === 'ocr' || this.pdfConversionMode === 'ai-scientific') {
      const cached = await getCachedOcrResult(file, this.pdfConversionMode);
      if (cached) {
        return {
          markdown: cached,
          title: file.name,
        };
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const streamInfo = detectFileType(file);

    const result = await this.convertStream(arrayBuffer, streamInfo);

    // Cache result for OCR/AI modes
    if (this.pdfConversionMode === 'ocr' || this.pdfConversionMode === 'ai-scientific') {
      await cacheOcrResult(file, this.pdfConversionMode, result.markdown);
    }

    return result;
  }

  /**
   * Convert an ArrayBuffer to Markdown
   */
  async convertStream(
    fileStream: ArrayBuffer,
    streamInfo: StreamInfo
  ): Promise<DocumentConverterResult> {
    // Sort converters by priority (lower values first)
    const sortedRegistrations = [...this.converters].sort(
      (a, b) => a.priority - b.priority
    );

    const failedAttempts: Array<{ converter: string; error: Error }> = [];

    for (const registration of sortedRegistrations) {
      const { converter } = registration;
      console.log('[MarkItDown] Trying converter:', converter.constructor.name);

      try {
        if (converter.accepts(fileStream, streamInfo)) {
          console.log('[MarkItDown] Converter accepted, converting...');
          const result = await converter.convert(fileStream, streamInfo);

          // Normalize the content (remove trailing whitespace, collapse multiple newlines)
          let normalized = result.markdown
            .split('\n')
            .map(line => line.trimEnd())
            .join('\n');
          normalized = normalized.replace(/\n{3,}/g, '\n\n');

          console.log('[MarkItDown] Conversion complete with:', converter.constructor.name);
          return {
            markdown: normalized,
            title: result.title,
          };
        }
      } catch (error) {
        console.error('[MarkItDown] Converter failed:', converter.constructor.name, error);
        failedAttempts.push({
          converter: converter.constructor.name,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    // If we got here, no converter could handle the file
    if (failedAttempts.length > 0) {
      const messages = failedAttempts
        .map(f => `${f.converter}: ${f.error.message}`)
        .join('; ');
      throw new FileConversionException(
        `All converters failed: ${messages}`
      );
    }

    throw new UnsupportedFormatException(
      'Could not convert file to Markdown. No converter supports this file type.'
    );
  }

  /**
   * Get list of registered converters (for debugging)
   */
  getRegisteredConverters(): string[] {
    return this.converters.map(r => r.converter.constructor.name);
  }

  /**
   * Update PDF conversion mode and re-register converters
   */
  setPdfConversionMode(mode: PdfConversionMode): void {
    this.pdfConversionMode = mode;
    this.converters = []; // Clear existing converters
    this.builtinsEnabled = false;
    this.enableBuiltins(); // Re-register with new mode
  }
}

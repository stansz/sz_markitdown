import type {
  DocumentConverter,
  DocumentConverterResult,
  ConverterRegistration,
  MarkItDownOptions,
  StreamInfo,
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
import { XlsxConverter } from '../converters/XlsxConverter';
import { PptxConverter } from '../converters/PptxConverter';
import { OutlookMsgConverter } from '../converters/OutlookMsgConverter';
import { detectFileType } from '../utils/fileDetection';

/**
 * MarkItDown - Browser-based document to Markdown converter
 * Mirrors the Python version's MarkItDown class
 */
export class MarkItDown {
  private converters: ConverterRegistration[] = [];
  private builtinsEnabled = false;

  constructor(options?: MarkItDownOptions) {
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
    this.registerConverter(new PptxConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
    this.registerConverter(new XlsxConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
    this.registerConverter(new PdfConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
    this.registerConverter(new DocxConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
    this.registerConverter(new OutlookMsgConverter(), PRIORITY_SPECIFIC_FILE_FORMAT);
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
    const arrayBuffer = await file.arrayBuffer();
    const streamInfo = detectFileType(file);

    return this.convertStream(arrayBuffer, streamInfo);
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

      try {
        if (converter.accepts(fileStream, streamInfo)) {
          const result = await converter.convert(fileStream, streamInfo);

          // Normalize the content (remove trailing whitespace, collapse multiple newlines)
          let normalized = result.markdown
            .split('\n')
            .map(line => line.trimEnd())
            .join('\n');
          normalized = normalized.replace(/\n{3,}/g, '\n\n');

          return {
            markdown: normalized,
            title: result.title,
          };
        }
      } catch (error) {
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
}

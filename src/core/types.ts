/**
 * Stream information for file type detection
 * Mirrors the Python version's StreamInfo class
 */
export interface StreamInfo {
  mimetype?: string;
  extension?: string;
  filename?: string;
  charset?: string;
  url?: string;
  localPath?: string;
}

/**
 * Result of converting a document to Markdown
 * Mirrors the Python version's DocumentConverterResult class
 */
export interface DocumentConverterResult {
  markdown: string;
  title?: string;
}

/**
 * Abstract base class for all document converters
 * Mirrors the Python version's DocumentConverter class
 */
export abstract class DocumentConverter {
  /**
   * Determine if this converter can handle the given file
   */
  abstract accepts(fileStream: ArrayBuffer, streamInfo: StreamInfo): boolean;

  /**
   * Convert the file to Markdown
   */
  abstract convert(
    fileStream: ArrayBuffer,
    streamInfo: StreamInfo
  ): Promise<DocumentConverterResult>;
}

/**
 * Converter registration with priority
 */
export interface ConverterRegistration {
  converter: DocumentConverter;
  priority: number;
}

/**
 * Priority constants for converter registration
 * Lower values = higher priority (tried first)
 */
export const PRIORITY_SPECIFIC_FILE_FORMAT = 0.0;
export const PRIORITY_GENERIC_FILE_FORMAT = 10.0;

/**
 * Options for MarkItDown initialization
 */
export interface MarkItDownOptions {
  enableBuiltins?: boolean;
  llmClient?: LLMClient;
}

/**
 * Placeholder interface for LLM integration
 * Will be implemented in future versions
 */
export interface LLMClient {
  describeImage(imageData: ArrayBuffer): Promise<string>;
  transcribeAudio(audioData: ArrayBuffer): Promise<string>;
}

/**
 * Custom error for conversion failures
 */
export class FileConversionException extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'FileConversionException';
  }
}

/**
 * Custom error for unsupported formats
 */
export class UnsupportedFormatException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFormatException';
  }
}

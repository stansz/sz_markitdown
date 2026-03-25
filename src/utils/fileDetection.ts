import type { StreamInfo } from '../core/types';

/**
 * MIME type mappings for common file extensions
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
};

/**
 * Detect file type from a File object
 * Mirrors the Python version's file type detection logic
 */
export function detectFileType(file: File): StreamInfo {
  const filename = file.name;
  const extension = getExtension(filename);
  const mimetype = file.type || EXTENSION_TO_MIME[extension] || 'application/octet-stream';

  return {
    mimetype,
    extension,
    filename,
  };
}

/**
 * Get file extension from filename
 */
function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Check if a MIME type matches a prefix
 */
export function mimeTypeMatches(mimetype: string, prefix: string): boolean {
  return mimetype.toLowerCase().startsWith(prefix.toLowerCase());
}

/**
 * Check if an extension matches a list
 */
export function extensionMatches(extension: string, extensions: string[]): boolean {
  return extensions.includes(extension.toLowerCase());
}

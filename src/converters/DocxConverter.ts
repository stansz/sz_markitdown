import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';
import { htmlToMarkdown } from '../core/htmlToMarkdown';

const ACCEPTED_MIME_TYPE_PREFIXES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ACCEPTED_FILE_EXTENSIONS = ['.docx'];

/**
 * Converts DOCX files to Markdown
 * Mirrors the Python version's DocxConverter
 * Uses mammoth.js to extract HTML, then shares the HTML → Markdown path with
 * HtmlConverter so the two implementations cannot drift apart.
 */
export class DocxConverter extends DocumentConverter {
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
    // Dynamically import mammoth to keep it out of the initial bundle
    const mammoth = await import('mammoth');

    const result = await mammoth.convertToHtml({ arrayBuffer: fileStream });
    const markdown = htmlToMarkdown(result.value);

    return {
      markdown,
      title: streamInfo.filename,
    };
  }
}

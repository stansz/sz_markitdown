import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';
import { htmlToMarkdown } from '../core/htmlToMarkdown';

const ACCEPTED_MIME_TYPE_PREFIXES = ['text/html', 'application/xhtml'];
const ACCEPTED_FILE_EXTENSIONS = ['.html', '.htm'];

/**
 * Converts HTML files to Markdown
 * Mirrors the Python version's HtmlConverter
 */
export class HtmlConverter extends DocumentConverter {
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
    // Decode the ArrayBuffer using the declared charset
    const encoding = streamInfo.charset || 'utf-8';
    const decoder = new TextDecoder(encoding);
    const htmlContent = decoder.decode(fileStream);

    const markdown = htmlToMarkdown(htmlContent);

    // Title is read from the raw source: htmlToMarkdown only walks <body>.
    const titleMatch = htmlContent.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    return {
      markdown,
      title,
    };
  }
}

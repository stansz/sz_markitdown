import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?worker&url';

const ACCEPTED_MIME_TYPE_PREFIXES = ['application/pdf'];
const ACCEPTED_FILE_EXTENSIONS = ['.pdf'];

/**
 * Converts PDF files to Markdown
 * Mirrors the Python version's PdfConverter
 * Uses pdf.js to extract text from PDF pages
 */
export class PdfConverter extends DocumentConverter {
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

    // Load the PDF document
    const pdf = await pdfjs.getDocument({ data: fileStream }).promise;

    let markdown = '';
    const numPages = pdf.numPages;

    // Extract text from each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Extract text items
      const pageText = textContent.items
        .map((item: any) => {
          if ('str' in item) {
            return item.str;
          }
          return '';
        })
        .filter(text => text.trim())
        .join(' ');

      if (pageText.trim()) {
        // Add page separator for multi-page documents
        if (numPages > 1) {
          markdown += `## Page ${pageNum}\n\n`;
        }
        markdown += pageText + '\n\n';
      }
    }

    // If no text was extracted, provide a message
    if (!markdown.trim()) {
      markdown = '*No text content could be extracted from this PDF.*\n\n';
    }

    return {
      markdown: markdown.trim(),
      title: streamInfo.filename,
    };
  }
}

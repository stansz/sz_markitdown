import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';

const ACCEPTED_MIME_TYPE_PREFIXES = [
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];
const ACCEPTED_FILE_EXTENSIONS = ['.pptx'];

/**
 * Converts PPTX files to Markdown
 * Mirrors the Python version's PptxConverter
 * Uses JSZip to extract slide XML and parse text elements
 */
export class PptxConverter extends DocumentConverter {
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
    // Dynamically import JSZip
    const JSZip = await import('jszip');

    // Load the PPTX file as a ZIP archive
    const zip = await JSZip.loadAsync(fileStream);

    let markdown = '';
    let slideNumber = 0;

    // Find all slide XML files
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.match(/ppt\/slides\/slide\d+\.xml/))
      .sort();

    for (const slideFile of slideFiles) {
      slideNumber++;

      // Read the slide XML
      const slideXml = await zip.files[slideFile].async('string');

      // Parse the XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(slideXml, 'text/xml');

      // Extract text from the slide
      const textElements = xmlDoc.getElementsByTagName('a:t');
      const slideTexts: string[] = [];

      for (let i = 0; i < textElements.length; i++) {
        const text = textElements[i].textContent?.trim();
        if (text) {
          slideTexts.push(text);
        }
      }

      if (slideTexts.length > 0) {
        // Add slide heading
        markdown += `## Slide ${slideNumber}\n\n`;

        // Add slide content
        for (const text of slideTexts) {
          markdown += `${text}\n\n`;
        }
      }
    }

    // If no content was extracted, provide a message
    if (!markdown.trim()) {
      markdown = '*No text content could be extracted from this presentation.*\n\n';
    }

    return {
      markdown: markdown.trim(),
      title: streamInfo.filename,
    };
  }
}

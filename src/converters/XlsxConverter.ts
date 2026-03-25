import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';

const ACCEPTED_MIME_TYPE_PREFIXES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const ACCEPTED_FILE_EXTENSIONS = ['.xlsx', '.xls'];

/**
 * Converts XLSX/XLS files to Markdown
 * Mirrors the Python version's XlsxConverter
 * Uses SheetJS (xlsx) to read Excel files and convert to Markdown tables
 */
export class XlsxConverter extends DocumentConverter {
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
    // Dynamically import xlsx
    const XLSX = await import('xlsx');

    // Read the workbook
    const workbook = XLSX.read(fileStream, { type: 'array' });

    let markdown = '';

    // Process each sheet
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];

      // Convert sheet to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length === 0) {
        continue;
      }

      // Add sheet name as heading if there are multiple sheets
      if (workbook.SheetNames.length > 1) {
        markdown += `## ${sheetName}\n\n`;
      }

      // Convert to Markdown table
      markdown += this.jsonToMarkdownTable(jsonData as any[][]);
      markdown += '\n\n';
    }

    // If no content was extracted, provide a message
    if (!markdown.trim()) {
      markdown = '*No data could be extracted from this spreadsheet.*\n\n';
    }

    return {
      markdown: markdown.trim(),
      title: streamInfo.filename,
    };
  }

  /**
   * Convert JSON data to a Markdown table
   */
  private jsonToMarkdownTable(data: any[][]): string {
    if (data.length === 0) return '';

    // Find the maximum number of columns
    const maxCols = Math.max(...data.map(row => row.length));

    // Normalize all rows to have the same number of columns
    const normalizedData = data.map(row => {
      const normalizedRow = [...row];
      while (normalizedRow.length < maxCols) {
        normalizedRow.push('');
      }
      return normalizedRow;
    });

    // Use first row as header
    const header = normalizedData[0];
    const rows = normalizedData.slice(1);

    // Build the table
    let table = '| ' + header.map(cell => this.escapeTableCell(String(cell || ''))).join(' | ') + ' |\n';
    table += '| ' + header.map(() => '---').join(' | ') + ' |\n';

    // Add data rows
    for (const row of rows) {
      table += '| ' + row.map(cell => this.escapeTableCell(String(cell || ''))).join(' | ') + ' |\n';
    }

    return table;
  }

  /**
   * Escape special characters in table cells
   */
  private escapeTableCell(text: string): string {
    return text
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ')
      .replace(/\r/g, '');
  }
}

import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';

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
    // Decode the ArrayBuffer to string
    const encoding = streamInfo.charset || 'utf-8';
    const decoder = new TextDecoder(encoding);
    const htmlContent = decoder.decode(fileStream);

    // Parse HTML and convert to Markdown
    const markdown = this.htmlToMarkdown(htmlContent);

    // Extract title if present
    const titleMatch = htmlContent.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    return {
      markdown,
      title,
    };
  }

  /**
   * Convert HTML string to Markdown
   * Simple implementation - can be enhanced with a proper library like turndown
   */
  private htmlToMarkdown(html: string): string {
    // Create a temporary DOM element to parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove script and style elements
    const scripts = doc.querySelectorAll('script, style');
    scripts.forEach(el => el.remove());

    // Get the body content
    const body = doc.body;
    if (!body) return '';

    // Convert to Markdown using a simple approach
    return this.elementToMarkdown(body);
  }

  /**
   * Recursively convert DOM elements to Markdown
   */
  private elementToMarkdown(element: Element): string {
    let markdown = '';

    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          markdown += text + ' ';
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();

        switch (tagName) {
          case 'h1':
            markdown += `# ${this.getTextContent(el)}\n\n`;
            break;
          case 'h2':
            markdown += `## ${this.getTextContent(el)}\n\n`;
            break;
          case 'h3':
            markdown += `### ${this.getTextContent(el)}\n\n`;
            break;
          case 'h4':
            markdown += `#### ${this.getTextContent(el)}\n\n`;
            break;
          case 'h5':
            markdown += `##### ${this.getTextContent(el)}\n\n`;
            break;
          case 'h6':
            markdown += `###### ${this.getTextContent(el)}\n\n`;
            break;
          case 'p':
            markdown += `${this.getTextContent(el)}\n\n`;
            break;
          case 'br':
            markdown += '\n';
            break;
          case 'strong':
          case 'b':
            markdown += `**${this.getTextContent(el)}**`;
            break;
          case 'em':
          case 'i':
            markdown += `*${this.getTextContent(el)}*`;
            break;
          case 'a':
            const href = el.getAttribute('href');
            if (href) {
              markdown += `[${this.getTextContent(el)}](${href})`;
            } else {
              markdown += this.getTextContent(el);
            }
            break;
          case 'ul':
            markdown += this.convertList(el, '- ');
            break;
          case 'ol':
            markdown += this.convertList(el, '1. ');
            break;
          case 'li':
            // Handled by convertList
            break;
          case 'table':
            markdown += this.convertTable(el);
            break;
          case 'blockquote':
            markdown += `> ${this.getTextContent(el)}\n\n`;
            break;
          case 'code':
            markdown += `\`${this.getTextContent(el)}\``;
            break;
          case 'pre':
            markdown += `\`\`\`\n${this.getTextContent(el)}\n\`\`\`\n\n`;
            break;
          case 'img':
            const src = el.getAttribute('src');
            const alt = el.getAttribute('alt') || '';
            if (src) {
              markdown += `![${alt}](${src})\n\n`;
            }
            break;
          case 'div':
          case 'section':
          case 'article':
          case 'main':
          case 'header':
          case 'footer':
            markdown += this.elementToMarkdown(el);
            break;
          default:
            // For other elements, just get the text content
            markdown += this.getTextContent(el);
        }
      }
    }

    return markdown;
  }

  /**
   * Get text content from an element
   */
  private getTextContent(element: Element): string {
    return element.textContent?.trim() || '';
  }

  /**
   * Convert a list (ul/ol) to Markdown
   */
  private convertList(listElement: Element, bullet: string): string {
    let markdown = '';
    const items = listElement.querySelectorAll(':scope > li');

    items.forEach((item, index) => {
      const prefix = bullet === '1. ' ? `${index + 1}. ` : bullet;
      markdown += `${prefix}${this.getTextContent(item)}\n`;
    });

    return markdown + '\n';
  }

  /**
   * Convert a table to Markdown
   */
  private convertTable(tableElement: Element): string {
    let markdown = '';
    const rows = tableElement.querySelectorAll('tr');

    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('th, td');
      const cellContents = Array.from(cells).map(cell => this.getTextContent(cell));

      markdown += '| ' + cellContents.join(' | ') + ' |\n';

      // Add header separator after first row
      if (rowIndex === 0) {
        markdown += '| ' + cellContents.map(() => '---').join(' | ') + ' |\n';
      }
    });

    return markdown + '\n';
  }
}

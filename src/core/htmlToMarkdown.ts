/**
 * Shared HTML → Markdown conversion for the HTML and DOCX converters.
 *
 * This logic previously existed as two near-identical private copies — one in
 * HtmlConverter, one in DocxConverter — so any fix had to be applied twice and
 * the two could quietly drift. There is now a single implementation.
 *
 * Inline markup (bold, italic, links, inline code) is rendered wherever it
 * appears, including inside paragraphs. That last part matters: mammoth wraps
 * every formatted DOCX run in a <p>, so flattening paragraph children silently
 * discarded all DOCX emphasis while leaving the text in place.
 */

export function htmlToMarkdown(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Script and style content has no Markdown equivalent worth keeping.
  doc.querySelectorAll('script, style').forEach(el => el.remove());

  const body = doc.body;
  if (!body) return '';

  return elementToMarkdown(body);
}

/** Text content of an element, trimmed. Used where content is literal. */
function textOf(element: Element): string {
  return element.textContent?.trim() || '';
}

/**
 * Markdown for an element whose Markdown form wraps its content, trimmed.
 */
function inline(element: Element): string {
  return elementToMarkdown(element).trim();
}

/** Markdown for every child of an element, in order. */
function elementToMarkdown(element: Element): string {
  return Array.from(element.childNodes)
    .map(nodeToMarkdown)
    .join('');
}

function isListTag(tagName: string): boolean {
  return tagName === 'ul' || tagName === 'ol';
}

/**
 * Convert one DOM node to Markdown.
 *
 * Elements whose Markdown form wraps their content (headings, paragraphs,
 * emphasis, links, list items, table cells) recurse, so nested markup
 * survives. Elements whose content is literal (code, pre) take text content
 * directly instead — converting markup inside a code block would be wrong.
 */
function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (!text || !text.trim()) return '';
    // Collapse runs of whitespace but keep the single leading and trailing
    // spaces. Trimming both ends and re-appending one space (the previous
    // behaviour) ate the space before text following inline markup, rendering
    // "**bold**heading" instead of "**bold** heading".
    return text.replace(/\s+/g, ' ');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const el = node as Element;
  const tagName = el.tagName.toLowerCase();

  switch (tagName) {
    case 'h1':
      return `# ${inline(el)}\n\n`;
    case 'h2':
      return `## ${inline(el)}\n\n`;
    case 'h3':
      return `### ${inline(el)}\n\n`;
    case 'h4':
      return `#### ${inline(el)}\n\n`;
    case 'h5':
      return `##### ${inline(el)}\n\n`;
    case 'h6':
      return `###### ${inline(el)}\n\n`;
    case 'p':
      return `${inline(el)}\n\n`;
    case 'br':
      return '\n';
    case 'strong':
    case 'b':
      return `**${inline(el)}**`;
    case 'em':
    case 'i':
      return `*${inline(el)}*`;
    case 'a': {
      const href = el.getAttribute('href');
      return href ? `[${inline(el)}](${href})` : inline(el);
    }
    case 'ul':
      return convertList(el, '- ');
    case 'ol':
      return convertList(el, '1. ');
    case 'li':
      // Handled by convertList so numbering stays correct.
      return '';
    case 'table':
      return convertTable(el);
    case 'blockquote':
      return `> ${inline(el)}\n\n`;
    case 'code':
      return `\`${textOf(el)}\``;
    case 'pre':
      return `\`\`\`\n${textOf(el)}\n\`\`\`\n\n`;
    case 'img': {
      const src = el.getAttribute('src');
      const alt = el.getAttribute('alt') || '';
      return src ? `![${alt}](${src})\n\n` : '';
    }
    case 'div':
    case 'section':
    case 'article':
    case 'main':
    case 'header':
    case 'footer':
    case 'span':
      // Pure wrappers: contribute their children, not their text.
      return elementToMarkdown(el);
    default:
      return textOf(el);
  }
}

/**
 * Convert a ul/ol to Markdown, indenting nested lists beneath their parent.
 *
 * Only direct children count as items (`:scope > li`). A nested list inside an
 * item is rendered on the following line, two spaces deeper per level, instead
 * of being flattened into the parent's text.
 */
function convertList(listElement: Element, bullet: string, depth = 0): string {
  const indent = '  '.repeat(depth);
  let markdown = '';

  const items = Array.from(listElement.querySelectorAll(':scope > li'));

  items.forEach((item, index) => {
    const ownParts: string[] = [];
    const nestedLists: Element[] = [];

    for (const child of Array.from(item.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childTag = (child as Element).tagName.toLowerCase();
        if (isListTag(childTag)) {
          nestedLists.push(child as Element);
          continue;
        }
      }
      ownParts.push(nodeToMarkdown(child));
    }

    const prefix = bullet === '1. ' ? `${index + 1}. ` : bullet;
    markdown += `${indent}${prefix}${ownParts.join('').trim()}\n`;

    for (const nested of nestedLists) {
      const nestedBullet =
        nested.tagName.toLowerCase() === 'ol' ? '1. ' : '- ';
      markdown += convertList(nested, nestedBullet, depth + 1);
    }
  });

  return markdown + '\n';
}

/**
 * Convert a table to Markdown.
 *
 * The first row becomes the header and gets a separator beneath it.
 */
function convertTable(tableElement: Element): string {
  let markdown = '';
  const rows = tableElement.querySelectorAll('tr');

  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('th, td');
    const cellContents = Array.from(cells).map(cell => inline(cell));

    markdown += '| ' + cellContents.join(' | ') + ' |\n';

    if (rowIndex === 0) {
      markdown += '| ' + cellContents.map(() => '---').join(' | ') + ' |\n';
    }
  });

  return markdown + '\n';
}

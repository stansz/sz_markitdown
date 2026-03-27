export interface PageRegion {
  type: string;
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
}

export interface PageResult {
  regions: PageRegion[];
}

/**
 * Patterns that match common header/footer content in scientific papers
 */
const HEADER_FOOTER_PATTERNS = [
  // Journal name and volume info (e.g., "PNAS Nexus, 2025, Vol. 4, No. 2")
  /^[\w\s]+,\s*\d{4},?\s*Vol\.\s*\d+,?\s*No\.\s*\d+/i,
  /^[\w\s]+,\s*\d{4},?\s*Vol\.?\s*\d+/i,
  // Author name followed by page number (e.g., "Hashizume et al. | 3")
  /^[\w\s]+et\s+al\.?\s*\|?\s*\d*$/i,
  // Just author name with et al (e.g., "Hashizume et al.")
  /^[\w\s]+et\s+al\.?\s*$/i,
  // Page number alone or with journal (e.g., "| 2 | PNAS Nexus, 2025, Vol. 4, No. 2 |")
  /^\|\s*\d+\s*\|/,
  /^\|\s*[\w\s]+et\s+al\.?\s*\|\s*\d+\s*\|/i,
  // DOI and publication info
  /^https?:\/\/doi\.org\//i,
  /^https?:\/\/[^\s]+\/[^\s]+\/[^\s]+/i,
  // Advance access / publication date
  /^Advance\s+access\s+publication/i,
  /^Received:|Accepted:|Published/i,
  // Competing interest / copyright notices
  /^Competing\s+Interest:/i,
  /^©\s*The\s+Author/i,
  /^This\s+is\s+an\s+Open\s+Access/i,
  /^Distributed\s+under\s+the\s+terms/i,
  /^Creative\s+Commons/i,
  // Page footer with journal info
  /PNAS\s+Nexus,\s*\d{4},?\s*Vol\.\s*\d+,?\s*No\.\s*\d+/i,
  // Pure page numbers (standalone digits)
  /^\s*\d+\s*$/,
  // Lines that are mostly non-alphanumeric (OCR garbage)
  /^[^a-zA-Z0-9\s]*$/,
];

/**
 * Check if text matches common header/footer patterns
 */
function isHeaderFooterPattern(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  
  for (const pattern of HEADER_FOOTER_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a region is likely a page header or footer based on position
 */
function isPageHeaderOrFooter(region: PageRegion, pageHeight: number, pageWidth: number): boolean {
  const text = region.text.trim();
  if (!text) return false;
  
  const lower = text.toLowerCase();
  const headerZone = region.bbox.y < pageHeight * 0.15;
  const footerZone = (region.bbox.y + region.bbox.height) > pageHeight * 0.85;
  const narrowBand = region.bbox.height < pageHeight * 0.12;
  const topOrBottom = headerZone || footerZone;
  
  if (topOrBottom) {
    if (isHeaderFooterPattern(text)) return true;
    if (/^\d+$/.test(text)) return true;
    if (text.length < 160 && isGarbageText(text)) return true;
    if (/^[\W_]+$/.test(text)) return true;
    if (narrowBand && /pnas nexus|advance access publication|received:|accepted:|published|copyright|competing interest|the author|journal/i.test(lower)) {
      return true;
    }
  }
  
  // Some OCR results shift headers/footers slightly into the body region.
  if (text.length < 220 && /pnas nexus|vol\.|no\.|advance access publication|received:|accepted:|competing interest|copyright|hashizumeetal\.?|\bpage\s*\d+\b/i.test(text)) {
    return true;
  }
  
  // Table-like line that is really a header/footer artifact
  if (text.includes('|') && text.length < 220) {
    const isWide = region.bbox.width > pageWidth * 0.5;
    const looksLikeHeaderFooter = /pnas\s+nexus|vol\.|no\.|received:|accepted:|published|©|competing\s+interest/i.test(text);
    if (isWide && looksLikeHeaderFooter) {
      return true;
    }
  }
  
  return false;
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectRepeatedPageMarkers(pageResults: PageResult[]): Set<string> {
  const counts = new Map<string, number>();

  for (const page of pageResults) {
    for (const region of page.regions) {
      const normalized = normalizeForComparison(region.text);
      if (!normalized || normalized.length < 15) continue;
      if (isSectionHeading(normalized) || isGarbageText(region.text)) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }
  }

  const repeated = new Set<string>();
  for (const [text, count] of counts.entries()) {
    if (count >= 2 && (isHeaderFooterPattern(text) || /pnas nexus|vol\.|no\.|hashizumeetal|advance access publication|received|accepted|copyright|competing interest/i.test(text))) {
      repeated.add(text);
    }
  }
  return repeated;
}

function isAsciiNoise(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;

  const allowedPunct = trimmed.replace(/[.,]/g, '');
  const nonAlpha = (allowedPunct.match(/[^a-zA-Z0-9\s]/g) || []).length;
  const ratio = nonAlpha / trimmed.length;
  if (ratio > 0.5) {
    return true;
  }

  const uppercaseDensity = (trimmed.match(/[A-Z]/g) || []).length / trimmed.length;
  const alphaDensity = (trimmed.match(/[a-zA-Z]/g) || []).length / trimmed.length;

  if (uppercaseDensity > 0.6 && alphaDensity < 0.4 && trimmed.split(' ').length > 4) {
    return true;
  }

  const randomPattern = /^[A-Z0-9\s\W]{20,}$/;
  if (randomPattern.test(trimmed)) {
    return true;
  }

  return false;
}

function stripHeaderFooterLines(text: string, repeatedMarkers: Set<string> = new Set()): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const normalized = normalizeForComparison(line);
      if (repeatedMarkers.has(normalized)) return false;
      if (isHeaderFooterPattern(line)) return false;
      if (isGarbageText(line)) return false;
      if (isAsciiNoise(line)) return false;
      if (line.length > 40 && line.split(' ').length < 3) return false;
      return true;
    });

  // First, join lines with a special marker to handle hyphenated words split across lines
  // We use a two-step process: join with marker, then fix hyphenated words
  const joined = lines.join(' \x00 '); // Use null char as temporary separator
  
  // Fix hyphenated words that were split across lines: "word- \n next" -> "word-next"
  // Only join when hyphen is at end of line (followed by whitespace and then next word)
  const fixedHyphens = joined.replace(/(\w+)-\s*\x00\s*(\w+)/g, '$1-$2');
  
  // Now replace the marker with normal space and clean up extra whitespace
  return fixedHyphens.replace(/\x00/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Check if text is mostly garbage/non-alphanumeric characters
 */
function isGarbageText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.length < 5) return false;
  
  // Count alphanumeric vs non-alphanumeric
  const alphanumericCount = (trimmed.match(/[a-zA-Z0-9]/g) || []).length;
  const spaceCount = (trimmed.match(/\s/g) || []).length;
  const nonAlphanumericCount = trimmed.length - alphanumericCount - spaceCount;

  // If more than 60% is non-alphanumeric (excluding spaces), it's likely garbage
  const nonAlphanumericRatio = nonAlphanumericCount / trimmed.length;
  if (nonAlphanumericRatio > 0.45 && nonAlphanumericRatio <= 0.6) {
    console.debug('[diagnostic] borderline garbage text', {
      text: trimmed,
      length: trimmed.length,
      nonAlphanumericRatio: nonAlphanumericRatio.toFixed(2),
      alphanumericCount,
      nonAlphanumericCount,
    });
  }
  if (nonAlphanumericRatio > 0.6) {
    return true;
  }

  // Check for repeated character patterns (OCR artifacts)
  const repeatedPattern = /([a-zA-Z0-9])\1{3,}/g;
  if (repeatedPattern.test(trimmed)) {
    return true;
  }
  
  // Check for random capital letters mixed with symbols
  const randomPattern = /^[A-Z\s\d\W]+$/;
  if (randomPattern.test(trimmed) && trimmed.length > 20 && trimmed.split(' ').length < 3) {
    return true;
  }
  
  return false;
}


/**
 * Common scientific paper section headings (case-insensitive)
 */
const SECTION_HEADINGS = new Set([
  'abstract', 'introduction', 'methods', 'materials and methods', 'results', 'discussion',
  'conclusions', 'conclusion', 'acknowledgments', 'references', 'bibliography',
  'keywords', 'supplementary material', 'appendix', 'appendices'
]);

/**
 * Check if text is a section heading
 */
function isSectionHeading(text: string): boolean {
  const cleaned = text.trim().toLowerCase();
  // Exact match or with trailing colon
  if (SECTION_HEADINGS.has(cleaned) || SECTION_HEADINGS.has(cleaned.replace(':', ''))) {
    return true;
  }
  // Numbered headings: "1. Introduction", "2 Methods", etc.
  if (/^\d+\.?\s*[A-Za-z\s]+$/.test(text) && cleaned.length < 50) {
    const parts = cleaned.split(/\.?\s+/);
    if (parts.length >= 2) {
      const headingText = parts.slice(1).join(' ');
      if (SECTION_HEADINGS.has(headingText)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Clean header text by removing table syntax and noisy symbols
 */
function cleanHeaderText(text: string): string {
  if (!text) return '';
  
  let cleaned = text;
  
  // Remove table pipe syntax: strip leading/trailing pipes and collapse multiple pipes
  cleaned = cleaned.replace(/^\s*\|+\s*/, '').replace(/\s*\|+\s*$/, '');
  cleaned = cleaned.replace(/\s*\|\s*\|\s*/g, ' ').replace(/\s{2,}/g, ' ');
  
  // Remove lines with high ratio of non-alphanumeric characters (noise/OCR garbage)
  const alphanumericCount = (cleaned.match(/[a-zA-Z0-9]/g) || []).length;
  const totalLength = cleaned.length;
  if (totalLength > 15 && alphanumericCount / totalLength < 0.4) {
    cleaned = cleaned.replace(/[^a-zA-Z0-9\s.,;:!?()\-']/g, ' ').trim();
  }
  
  // Clean up author line noise: remove symbols like ***, ®, @, ¥, ©, †, ‡, §, ¶, #
  cleaned = cleaned.replace(/[®@¥©†‡§¶#*%^&_+=<>{}[\]|\\~`]/g, ' ');
  
  // Fix common OCR issues
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/[.,;:!?]+$/, '');
  
  return cleaned.trim();
}

/**
 * Detect if a region is part of the document header (title, authors, journal)
 * based on position at top of first page and text characteristics
 */
function isHeaderRegion(region: PageRegion, pageIndex: number, pageHeight: number): boolean {
  if (pageIndex !== 0) return false; // Only first page (0-indexed)
  
  const text = region.text.trim().toLowerCase();
  if (!text) return false;
  
  // Header is at the top of the page (top 40%)
  const isAtTop = region.bbox.y < pageHeight * 0.4;
  
  // Check if it's before the abstract/introduction
  const isBeforeAbstract = !text.startsWith('abstract') &&
                           !text.startsWith('introduction') &&
                           !text.startsWith('keywords') &&
                           !text.match(/^\[?\d+\]?\s+(introduction|abstract|keywords)/i);
  
  return isAtTop && isBeforeAbstract;
}

/**
 * Extract and format header block from first page regions
 */
function extractHeaderBlock(regions: PageRegion[], pageHeight: number): string | null {
  if (regions.length === 0) return null;
  
  // Collect consecutive header regions at the top
  const headerRegions: PageRegion[] = [];
  let i = 0;
  for (; i < regions.length; i++) {
    if (isHeaderRegion(regions[i], 0, pageHeight)) {
      headerRegions.push(regions[i]);
    } else {
      break;
    }
  }
  
  if (headerRegions.length === 0) return null;
  
  // Clean and format
  const cleanedTexts = headerRegions.map(r => cleanHeaderText(r.text)).filter(t => t.length > 0);
  if (cleanedTexts.length === 0) return null;
  
  if (cleanedTexts.length >= 2) {
    const title = cleanedTexts[0];
    const authors = cleanedTexts.slice(1).join(', ');
    return `---\ntitle: "${title}"\nauthors: "${authors}"\n---\n\n`;
  } else {
    return `# ${cleanedTexts[0]}\n\n`;
  }
}

/**
 * Post-process markdown to fix heading hierarchy
 * - Convert section headings (Abstract, Introduction, etc.) to level 2 (##)
 * - Ensure content under sections is not marked as heading
 */
function postProcessMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Check if this is a heading line
    if (trimmed.startsWith('#')) {
      // Extract heading level and text
      const match = trimmed.match(/^(#+)\s+(.+)$/);
      if (match) {
        const hashes = match[1];
        const text = match[2];
        
        // Check if this is a section heading (Abstract, Introduction, etc.)
        if (isSectionHeading(text)) {
          // Convert to level 2 heading
          result.push(`## ${text}`);
          continue;
        }
        
        // If it's a level 3+ heading but the text ends with a period, it's likely a paragraph, not a heading
        if (hashes.length >= 3 && /[.!?]$/.test(text)) {
          // Convert to paragraph
          result.push(text);
          continue;
        }
      }
    }
    
    // Keep line as-is
    result.push(line);
  }
  
  return result.join('\n');
}

/**
 * Generate Markdown from OCR/layout analysis results
 * Handles multi-column layouts, tables, headings, lists, etc.
 */
export function generateMarkdown(pageResults: PageResult[], pageHeights?: number[]): string {
  const pageMarkdowns: string[] = [];
  const repeatedMarkers = collectRepeatedPageMarkers(pageResults);

  for (let pageIndex = 0; pageIndex < pageResults.length; pageIndex++) {
    const page = pageResults[pageIndex];
    
    // Use provided page height or estimate from regions
    const pageHeight = pageHeights && pageHeights[pageIndex] ? pageHeights[pageIndex] :
                       Math.max(...page.regions.map(r => r.bbox.y + r.bbox.height), 1000);
    
    console.log(`[MarkdownGenerator] Page ${pageIndex + 1}: sorting ${page.regions.length} regions`);
    
    // Sort regions by reading order
    let sortedRegions = sortRegionsByReadingOrder(page.regions);
    
    console.log(`[MarkdownGenerator] Page ${pageIndex + 1}: ALL sorted regions (${sortedRegions.length}):`,
      sortedRegions.map(r => ({ type: r.type, text: r.text.substring(0, 100), bbox: r.bbox })));

    // On first page, extract and remove header block
    let headerMarkdown: string | null = null;
    if (pageIndex === 0) {
      headerMarkdown = extractHeaderBlock(sortedRegions, pageHeight);
      if (headerMarkdown) {
        console.log(`[MarkdownGenerator] Page ${pageIndex + 1}: extracted header`);
        // Remove header regions from the list
        let i = 0;
        while (i < sortedRegions.length && isHeaderRegion(sortedRegions[i], 0, pageHeight)) {
          i++;
        }
        sortedRegions = sortedRegions.slice(i);
      }
    }

    const markdownParts: string[] = [];
    
    // Add header first if present
    if (headerMarkdown) {
      markdownParts.push(headerMarkdown.trim());
    }
    
    const pageWidth = Math.max(...page.regions.map(r => r.bbox.x + r.bbox.width), 1000);

    // Process remaining regions, filtering out headers/footers and garbage
    for (const region of sortedRegions) {
      if (isPageHeaderOrFooter(region, pageHeight, pageWidth)) {
        console.log(`[MarkdownGenerator] Filtering header/footer:`, { type: region.type, text: region.text.substring(0, 50) });
        continue;
      }
      
      if (isGarbageText(region.text)) {
        console.log(`[MarkdownGenerator] Filtering garbage:`, { text: region.text.substring(0, 50) });
        continue;
      }
      
      const markdown = convertRegionToMarkdown(region);
      if (markdown) {
        const cleanedMarkdown = stripHeaderFooterLines(markdown, repeatedMarkers);
        if (cleanedMarkdown) {
          markdownParts.push(cleanedMarkdown);
        }
      }
    }

    const pageMarkdown = markdownParts.join('\n\n');
    if (pageMarkdown.trim()) {
      const processed = postProcessMarkdown(pageMarkdown.trim());
      console.log(`[MarkdownGenerator] Page ${pageIndex + 1}: final markdown (first 200 chars):`, processed.substring(0, 200));
      pageMarkdowns.push(processed);
    }
  }

  const rawOutput = pageMarkdowns.join('\n\n---\n\n').trim();
  const finalOutput = cleanMarkdownNoise(rawOutput);
  console.log(`[MarkdownGenerator] Final output (first 500 chars):`, finalOutput.substring(0, 500));
  return finalOutput;
}

/**
 * Sort regions by reading order (top-to-bottom, left-to-right)
 * Handles multi-column layouts by detecting columns first
 */
function sortRegionsByReadingOrder(regions: PageRegion[]): PageRegion[] {
  if (regions.length === 0) {
    return [];
  }

  // Detect if multi-column layout
  const columns = detectColumns(regions);

  if (columns.length > 1) {
    // Multi-column: sort within each column, then combine columns left-to-right
    return sortByColumns(regions, columns);
  }

  // Single column: sort by Y position (top to bottom)
  return [...regions].sort((a, b) => a.bbox.y - b.bbox.y);
}

/**
 * Detect column boundaries from region positions
 */
function detectColumns(regions: PageRegion[]): number[] {
  // Analyze X distribution to detect column boundaries
  const xPositions = regions.map((r) => r.bbox.x);
  const minX = Math.min(...xPositions);
  const maxX = Math.max(...xPositions);
  const spread = maxX - minX;

  console.log('[MarkdownGenerator] Column detection:', { minX, maxX, spread, numRegions: regions.length });

  // If spread is small, single column
  if (spread < 200) {
    console.log('[MarkdownGenerator] Single column layout detected (spread < 200)');
    return [0];
  }

  // Use clustering to find column centers
  // Simplified: assume 2-3 columns typical for scientific papers
  const numColumns = Math.min(3, Math.ceil(spread / 300));
  const columnWidth = spread / numColumns;

  const columns: number[] = [];
  for (let i = 0; i < numColumns; i++) {
    columns.push(minX + i * columnWidth);
  }

  console.log('[MarkdownGenerator] Multi-column layout detected:', { numColumns, columns });
  return columns;
}

/**
 * Sort regions by columns (left-to-right, then top-to-bottom within each column)
 */
function sortByColumns(regions: PageRegion[], columns: number[]): PageRegion[] {
  // Assign each region to nearest column
  const columnRegions: Map<number, PageRegion[]> = new Map();

  for (const region of regions) {
    const nearestColumn = columns.reduce((nearest, col) => {
      return Math.abs(region.bbox.x - col) < Math.abs(region.bbox.x - nearest)
        ? col
        : nearest;
    });

    if (!columnRegions.has(nearestColumn)) {
      columnRegions.set(nearestColumn, []);
    }
    columnRegions.get(nearestColumn)!.push(region);
  }

  // Sort within each column by Y position
  const sorted: PageRegion[] = [];
  const sortedColumns = [...columnRegions.keys()].sort((a, b) => a - b);

  for (const col of sortedColumns) {
    const colRegions = columnRegions.get(col)!;
    colRegions.sort((a, b) => a.bbox.y - b.bbox.y);
    sorted.push(...colRegions);
  }

  return sorted;
}

/**
 * Convert a single region to Markdown format
 */
function convertRegionToMarkdown(region: PageRegion): string {
  const text = region.text.trim();
  if (!text) {
    return '';
  }

  switch (region.type) {
    case 'heading':
      const level = estimateHeadingLevel(region);
      return `${'#'.repeat(level)} ${text}`;

    case 'table':
      return formatAsTable(text);

    case 'figure':
      return `*${text}*`;

    case 'caption':
      return `*${text}*`;

    case 'list':
      return formatAsList(text);

    case 'text':
    default:
      return text;
  }
}

/**
 * Estimate heading level based on position and text characteristics
 */
function estimateHeadingLevel(region: PageRegion): number {
  const text = region.text.trim();

  // Top of page, short text = main heading
  if (region.bbox.y < 100 && text.length < 100) {
    return 1;
  }

  // Short text = subheading
  if (text.length < 80) {
    return 2;
  }

  // Default to h3
  return 3;
}

/**
 * Format text as Markdown table
 */
function formatAsTable(text: string): string {
  // Split by multiple spaces or tabs to detect columns
  const rows = text.split('\n').filter((row) => row.trim());
  if (rows.length === 0) {
    return text;
  }

  const formattedRows = rows.map((row) => {
    const cells = row.split(/\s{2,}|\t/).filter((cell) => cell.trim());
    return `| ${cells.join(' | ')} |`;
  });

  // Add header separator after first row
  if (formattedRows.length > 1) {
    const numCells = formattedRows[0].split('|').length - 2;
    const separator = `| ${Array(numCells).fill('---').join(' | ')} |`;
    formattedRows.splice(1, 0, separator);
  }

  return formattedRows.join('\n');
}

/**
 * Format text as Markdown list
 */
function formatAsList(text: string): string {
  const lines = text.split('\n').filter((line) => line.trim());
  return lines
    .map((line) => {
      const trimmed = line.trim();
      // Check if already has bullet or number
      if (/^[•·○●▪▫►→\*\-–]\s/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed)) {
        return trimmed;
      }
      return `* ${trimmed}`;
    })
    .join('\n');
}

/**
 * Detect if text is likely a heading based on characteristics
 */
export function isLikelyHeading(text: string, bbox: { y: number; height: number }): boolean {
  const trimmed = text.trim();

  // Short text at top of page
  if (bbox.y < 150 && trimmed.length < 100) {
    return true;
  }

  // All caps, short
  if (trimmed === trimmed.toUpperCase() && trimmed.length < 80) {
    return true;
  }

  // Ends with colon
  if (trimmed.endsWith(':') && trimmed.length < 100) {
    return true;
  }

  // Numbered section (e.g., "1. Introduction", "2.1 Methods")
  if (/^\d+\.?\d*\s+[A-Z]/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Detect if text is likely a list item
 */
export function isLikelyListItem(text: string): boolean {
  const trimmed = text.trim();

  // Bullet patterns
  const bulletPatterns = ['•', '·', '○', '●', '▪', '▫', '►', '→', '*', '-', '–'];
  if (bulletPatterns.some((bullet) => trimmed.startsWith(bullet))) {
    return true;
  }

  // Number patterns
  const numberPatterns = [
    /^\(?\d+\)?[\.\)]\s/, // "1.", "1)", "(1)"
    /^[A-Za-z]\)\s/, // "A)", "a)"
    /^[IVXLCDM]+\)\s/, // "I)", "II)" (Roman numerals)
    /^\(?[A-Za-z]\)?[\.\)]\s/, // "A.", "a."
  ];

  if (numberPatterns.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  return false;
}

/**
 * Detect if text is likely a figure caption
 */
export function isLikelyFigureCaption(text: string): boolean {
  const lower = text.toLowerCase().trim();

  const figurePatterns = [
    /^fig(?:ure)?\.?\s*\d+[\.\:]\s*/i,
    /^figure\s+\d+[\.\:]\s*/i,
    /^table\s+\d+[\.\:]\s*/i,
  ];

  return figurePatterns.some((pattern) => pattern.test(lower));
}

interface NoiseFilterOptions {
  symbolRatioThreshold?: number;
  minLengthForRatioCheck?: number;
  dropJunkTableRows?: boolean;
  dropBlankSeparators?: boolean;
  safelistPatterns?: RegExp[];
}

const DEFAULT_NOISE_FILTER_OPTIONS: Required<NoiseFilterOptions> = {
  symbolRatioThreshold: 0.45,
  minLengthForRatioCheck: 20,
  dropJunkTableRows: true,
  dropBlankSeparators: true,
  safelistPatterns: [/doi\.org/, /PRJNA\d+/, /M2\s*=\s*\{/, /\bFig\.\s?\d+/i],
};

function isNoiseLine(line: string, opts: Required<NoiseFilterOptions>): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  if (opts.safelistPatterns.some((pattern) => pattern.test(trimmed))) {
    return false;
  }

  if (opts.dropBlankSeparators && /^[-_\s]{4,}$/.test(trimmed)) {
    return true;
  }
  if (opts.dropBlankSeparators && /^[-_=*]{3,}$/.test(trimmed) && trimmed.includes('-')) {
    return true;
  }

  if (opts.dropJunkTableRows && trimmed.startsWith('|') && trimmed.endsWith('|')) {
    const inner = trimmed.slice(1, -1);
    const symbolCount = (inner.match(/[^a-zA-Z0-9\s|.,;:()\-]/g) || []).length;
    const realWordCount = (inner.match(/[a-zA-Z]{1,}/g) || []).length;
    const letterCount = (inner.match(/[a-zA-Z]/g) || []).length;
    const tokenCount = inner.split(/\s+/).filter(Boolean).length;
    const letterRatio = letterCount / Math.max(inner.length, 1);
    if (realWordCount === 0 && symbolCount > 2) return true;
    if (inner.length > 10 && symbolCount / inner.length > 0.35 && realWordCount < 2) return true;
    if (inner.length > 20 && letterRatio < 0.35 && tokenCount > 8) return true;
  }

  if (opts.minLengthForRatioCheck && trimmed.length >= opts.minLengthForRatioCheck) {
    const normalChars = trimmed.match(/[a-zA-Z0-9\s.,;:\-()'"/\%+×±≤≥~→←αβγδΔ]/g) || [];
    const symbolRatio = 1 - normalChars.length / trimmed.length;
    if (symbolRatio > opts.symbolRatioThreshold) {
      return true;
    }
  }

  if (trimmed.startsWith('*') && trimmed.endsWith('*')) {
    const inner = trimmed.slice(1, -1);
    if (/[-—]{5,}/.test(inner) && (inner.match(/[a-zA-Z]{4,}/g) || []).length < 3) {
      return true;
    }
    const tokens = inner.split(/\s+/);
    const singleCharTokens = tokens.filter((token) => token.length === 1 && /[A-Z]/.test(token)).length;
    if (tokens.length > 5 && singleCharTokens / tokens.length > 0.5) {
      return true;
    }
  }

  return false;
}

function cleanMarkdownNoise(markdown: string, options: NoiseFilterOptions = {}): string {
  const opts = { ...DEFAULT_NOISE_FILTER_OPTIONS, ...options };
  const lines = markdown.split('\n');
  const cleaned: string[] = [];

  for (const line of lines) {
    if (!isNoiseLine(line, opts)) {
      cleaned.push(line);
    }
  }

  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n');
}

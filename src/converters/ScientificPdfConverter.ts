import { DocumentConverter } from '../core/types';
import type { DocumentConverterResult, StreamInfo } from '../core/types';
import { mimeTypeMatches, extensionMatches } from '../utils/fileDetection';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?worker&url';

const ACCEPTED_MIME_TYPE_PREFIXES = ['application/pdf'];
const ACCEPTED_FILE_EXTENSIONS = ['.pdf'];

// Tika-inspired configuration parameters
const CONFIG = {
  // Space detection: average character width tolerance (as fraction of avg char width)
  averageCharTolerance: 0.5,
  // Space detection: space width tolerance (as fraction of space character width)
  spacingTolerance: 0.3,
  // Paragraph detection: line height multiplier for paragraph break
  dropThreshold: 1.5,
  // Minimum characters per page to consider text extraction successful
  minCharsPerPage: 10,
};

/**
 * Character-level text item with detailed position and font information
 * Similar to docling's PdfTextCell, enhanced with Tika-inspired features
 */
interface CharCell {
  char: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  pageNum: number;
  angle?: number; // Rotation angle in radians (0 for horizontal)
  structureTag?: string; // PDF structure tag (e.g., 'H', 'P', 'LI') from marked content
}

/**
 * Word-level cell (grouped characters)
 * Similar to docling's word_cells
 */
interface WordCell {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  pageNum: number;
  chars: CharCell[];
  structureTag?: string; // Propagated from characters
}

/**
 * Line-level cell (grouped words)
 * Similar to docling's textline_cells
 */
interface LineCell {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  pageNum: number;
  words: WordCell[];
  structureTag?: string; // Propagated from words/characters
}

/**
 * Detected shape/vector graphic
 */
interface Shape {
  type: 'line' | 'rectangle' | 'path';
  x: number;
  y: number;
  width: number;
  height: number;
  pageNum: number;
}

/**
 * Detected image
 */
interface ImageResource {
  x: number;
  y: number;
  width: number;
  height: number;
  pageNum: number;
  data?: Uint8Array;
}

/**
 * Document structure element
 */
interface StructureElement {
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'figure' | 'separator';
  level?: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNum: number;
  metadata?: Record<string, unknown>;
}

/**
 * Page analysis result
 */
interface PageAnalysis {
  pageNum: number;
  pageWidth: number;
  pageHeight: number;
  charCells: CharCell[];
  wordCells: WordCell[];
  lineCells: LineCell[];
  shapes: Shape[];
  images: ImageResource[];
  elements: StructureElement[];
}

/**
 * Converts PDF files to Markdown with advanced layout analysis
 * Based on docling's approach: character-level extraction, word grouping, line detection
 * Optimized for scientific papers with multi-column layouts, tables, figures, etc.
 */
export class ScientificPdfConverter extends DocumentConverter {
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
    const numPages = pdf.numPages;

    const pageAnalyses: PageAnalysis[] = [];

    // Analyze each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const analysis = await this.analyzePage(page, pageNum);
      pageAnalyses.push(analysis);
    }

    // Convert analyses to markdown
    const markdown = this.convertAnalysesToMarkdown(pageAnalyses);

    return {
      markdown: markdown || '*No text content could be extracted from this PDF.*',
      title: streamInfo.filename,
    };
  }

  /**
   * Analyze a single page - extract characters, words, lines, shapes, images
   * This follows docling's approach of detailed extraction, enhanced with marked content
   */
  private async analyzePage(
    page: any,
    pageNum: number
  ): Promise<PageAnalysis> {
    const viewport = page.getViewport({ scale: 1 });
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;

    // Extract text content with operator list for detailed analysis
    // Include marked content to get PDF structure tags (Tika: marked content extraction)
    const textContent = await page.getTextContent({ includeMarkedContent: true });
    const operatorList = await page.getOperatorList();

    // Extract character-level cells
    const charCells = this.extractCharCells(textContent, pageHeight, pageNum);

    // Group characters into words
    const wordCells = this.groupCharsIntoWords(charCells);

    // Group words into lines
    const lineCells = this.groupWordsIntoLines(wordCells);

    // Detect shapes from operator list
    const shapes = this.detectShapes(operatorList, pageHeight, pageNum);

    // Detect images
    const images = await this.detectImages(page, pageNum);

    // Detect document structure (using marked content if available)
    const elements = this.detectStructure(lineCells, shapes, pageWidth, pageNum, pageHeight);

    return {
      pageNum,
      pageWidth,
      pageHeight,
      charCells,
      wordCells,
      lineCells,
      shapes,
      images,
      elements,
    };
  }

  /**
   * Extract character-level cells from text content
   * Similar to docling's char_cells extraction, enhanced with Tika techniques
   */
  private extractCharCells(
    textContent: any,
    pageHeight: number,
    pageNum: number
  ): CharCell[] {
    const cells: CharCell[] = [];

    for (const item of textContent.items) {
      if (!('str' in item) || typeof item.str !== 'string' || !item.str.trim()) {
        continue;
      }

      const transform = item.transform as number[] | undefined;
      if (!transform || transform.length < 6) {
        continue;
      }

      // Extract transformation matrix components
      const a = transform[0]; // horizontal scaling factor (includes font size)
      const b = transform[1]; // vertical shear (rotation)
      // c = transform[2] (horizontal shear) - not used
      const d = transform[3]; // vertical scaling factor (font size)
      const e = transform[4]; // x translation
      const f = transform[5]; // y translation

      // Determine font size (use vertical scaling)
      const fontSize = Math.abs(d) || Math.abs(a) || 12;

      // Compute rotation angle from matrix (Tika's angle detection)
      // Angle = atan2(b, a) gives the rotation of the text baseline
      const angle = Math.atan2(b, a);

      // Convert PDF coordinates to top-left origin
      const x = e;
      const y = pageHeight - f;

      const fontName = item.fontName || 'unknown';

      // Extract marked content structure tag if available (Tika: marked content extraction)
      let structureTag: string | undefined;
      if (Array.isArray(item.markedContent) && item.markedContent.length > 0) {
        // Take the innermost (last) structure type as it's the most specific
        const lastMc = item.markedContent[item.markedContent.length - 1];
        if (lastMc && typeof lastMc === 'object' && 'type' in lastMc) {
          structureTag = (lastMc as any).type as string;
        }
      }

      // Split string into individual characters for character-level analysis
      const chars = item.str.split('');
      
      // Estimate average character width for this font (improved from simple 0.6 factor)
      // Use the horizontal scaling factor (a) to get more precise width
      // Typical average character width is about 0.6 of font size for Latin fonts
      const avgCharWidth = Math.abs(a) * 0.6;

      let currentX = x;

      for (const char of chars) {
        if (char.trim()) {
          // Estimate individual character width (could be refined with glyph-specific widths)
          // For now, use average width, but adjust for common narrow/wide characters
          let charWidth = avgCharWidth;
          if (char === 'i' || char === 'l' || char === 't' || char === 'f' || char === 'j' || char === '.') {
            charWidth = avgCharWidth * 0.6; // Narrow characters
          } else if (char === 'W' || char === 'M' || char === 'm') {
            charWidth = avgCharWidth * 1.2; // Wide characters
          }

          cells.push({
            char,
            x: currentX,
            y,
            width: charWidth,
            height: fontSize,
            fontSize,
            fontName,
            pageNum,
            angle: Math.abs(angle) > 0.1 ? angle : undefined, // Store angle if significant rotation
            structureTag,
          });
          // Advance by the actual character width for next character
          currentX += charWidth;
        } else {
          // For whitespace characters, still advance by average char width
          currentX += avgCharWidth;
        }
      }
    }

    return cells;
  }

  /**
   * Group characters into words based on proximity
   * Similar to docling's word_cells grouping, with Tika-inspired space detection
   */
  private groupCharsIntoWords(charCells: CharCell[]): WordCell[] {
    if (charCells.length === 0) return [];

    // Sort by Y then X
    const sorted = [...charCells].sort((a, b) => {
      const yDiff = Math.abs(a.y - b.y);
      if (yDiff < 3) {
        return a.x - b.x;
      }
      return a.y - b.y;
    });

    // Compute average character width for adaptive space detection (Tika: averageCharTolerance)
    const avgCharWidth = sorted.reduce((sum, c) => sum + c.width, 0) / sorted.length;
    const spaceThreshold = avgCharWidth * CONFIG.averageCharTolerance;

    const words: WordCell[] = [];
    let currentWord: CharCell[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      // Check if characters are on same line
      const sameLine = Math.abs(curr.y - prev.y) < 3;

      if (sameLine) {
        // Compute gap between characters
        const gap = curr.x - (prev.x + prev.width);
        // Determine if they're close enough to be in the same word
        // Tika: uses averageCharTolerance for space detection
        const closeTogether = gap < spaceThreshold;

        if (closeTogether) {
          currentWord.push(curr);
        } else {
          // Gap is large enough to be a space - finalize current word
          if (currentWord.length > 0) {
            words.push(this.createWordCell(currentWord));
          }
          currentWord = [curr];
        }
      } else {
        // Different lines - finalize current word
        if (currentWord.length > 0) {
          words.push(this.createWordCell(currentWord));
        }
        currentWord = [curr];
      }
    }

    // Don't forget last word
    if (currentWord.length > 0) {
      words.push(this.createWordCell(currentWord));
    }

    return words;
  }

  /**
   * Create a word cell from character cells
   * Propagates structureTag from characters if consistent
   */
  private createWordCell(chars: CharCell[]): WordCell {
    const text = chars.map(c => c.char).join('');
    const x = Math.min(...chars.map(c => c.x));
    const y = Math.min(...chars.map(c => c.y));
    const maxX = Math.max(...chars.map(c => c.x + c.width));
    const maxY = Math.max(...chars.map(c => c.y + c.height));

    // Propagate structureTag: if all chars have the same non-undefined tag, use it
    const tags = chars.map(c => c.structureTag).filter(t => t !== undefined) as string[];
    let structureTag: string | undefined;
    if (tags.length > 0) {
      const uniqueTags = new Set(tags);
      if (uniqueTags.size === 1) {
        structureTag = tags[0];
      }
      // If multiple different tags, we leave it undefined (mixed structure)
    }

    return {
      text,
      x,
      y,
      width: maxX - x,
      height: maxY - y,
      fontSize: chars[0].fontSize,
      fontName: chars[0].fontName,
      pageNum: chars[0].pageNum,
      chars,
      structureTag,
    };
  }

  /**
   * Group words into lines based on Y position
   * Similar to docling's textline_cells grouping
   */
  private groupWordsIntoLines(wordCells: WordCell[]): LineCell[] {
    if (wordCells.length === 0) return [];

    // Sort by Y then X
    const sorted = [...wordCells].sort((a, b) => {
      const yDiff = Math.abs(a.y - b.y);
      if (yDiff < 5) {
        return a.x - b.x;
      }
      return a.y - b.y;
    });

    const lines: LineCell[] = [];
    let currentLine: WordCell[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];

      // Check if words are on same line
      const tolerance = Math.max(prev.fontSize, curr.fontSize) * 0.5;
      const sameLine = Math.abs(curr.y - prev.y) < tolerance;

      if (sameLine) {
        currentLine.push(curr);
      } else {
        // Finalize current line
        if (currentLine.length > 0) {
          lines.push(this.createLineCell(currentLine));
        }
        currentLine = [curr];
      }
    }

    // Don't forget last line
    if (currentLine.length > 0) {
      lines.push(this.createLineCell(currentLine));
    }

    return lines;
  }

  /**
   * Create a line cell from word cells
   * Propagates structureTag from words if consistent
   */
  private createLineCell(words: WordCell[]): LineCell {
    const text = words.map(w => w.text).join(' ');
    const x = Math.min(...words.map(w => w.x));
    const y = Math.min(...words.map(w => w.y));
    const maxX = Math.max(...words.map(w => w.x + w.width));
    const maxY = Math.max(...words.map(w => w.y + w.height));

    // Propagate structureTag from words (similar logic as in createWordCell)
    const tags = words.map(w => w.structureTag).filter(t => t !== undefined) as string[];
    let structureTag: string | undefined;
    if (tags.length > 0) {
      const uniqueTags = new Set(tags);
      if (uniqueTags.size === 1) {
        structureTag = tags[0];
      }
    }

    return {
      text,
      x,
      y,
      width: maxX - x,
      height: maxY - y,
      fontSize: words[0].fontSize,
      fontName: words[0].fontName,
      pageNum: words[0].pageNum,
      words,
      structureTag,
    };
  }

  /**
   * Detect shapes from operator list
   * Similar to docling's shapes extraction
   */
  private detectShapes(
    operatorList: any,
    pageHeight: number,
    pageNum: number
  ): Shape[] {
    const shapes: Shape[] = [];
    const ops = operatorList.fnArray;
    const args = operatorList.argsArray;

    let currentX = 0;
    let currentY = 0;

    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const arg = args[i];

      // Track current position
      if (op === 1) { // OPS.moveTo
        currentX = arg[0];
        currentY = pageHeight - arg[1];
      } else if (op === 2) { // OPS.lineTo
        const x = arg[0];
        const y = pageHeight - arg[1];

        // Detect horizontal lines (potential separators)
        if (Math.abs(y - currentY) < 2) {
          shapes.push({
            type: 'line',
            x: Math.min(currentX, x),
            y: currentY,
            width: Math.abs(x - currentX),
            height: 1,
            pageNum,
          });
        }

        currentX = x;
        currentY = y;
      } else if (op === 3) { // OPS.rectangle
        const x = arg[0];
        const y = pageHeight - arg[1] - arg[3];
        const width = arg[2];
        const height = arg[3];

        shapes.push({
          type: 'rectangle',
          x,
          y,
          width,
          height,
          pageNum,
        });
      }
    }

    return shapes;
  }

  /**
   * Detect images from page
   */
  private async detectImages(
    page: any,
    pageNum: number
  ): Promise<ImageResource[]> {
    const images: ImageResource[] = [];

    try {
      const operatorList = await page.getOperatorList();
      const ops = operatorList.fnArray;
      // args not needed for image detection
      // const args = operatorList.argsArray;

      for (let i = 0; i < ops.length; i++) {
        if (ops[i] === 12) { // OPS.paintImageXObject
          // Image detected - we don't extract the actual data for now
          // but we note its presence
          images.push({
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            pageNum,
          });
        }
      }
    } catch {
      // Ignore errors in image detection
    }

    return images;
  }

  /**
   * Detect document structure from line cells
   * This is the key part that follows docling's approach
   */
  private detectStructure(
    lineCells: LineCell[],
    shapes: Shape[],
    pageWidth: number,
    pageNum: number,
    pageHeight: number
  ): StructureElement[] {
    const elements: StructureElement[] = [];

    // Detect columns first
    const columns = this.detectColumns(lineCells, pageWidth);

    // Process each column
    for (const column of columns) {
      const columnElements = this.detectColumnElements(column.lines, shapes, pageNum, pageHeight);
      elements.push(...columnElements);
    }

    return elements;
  }

  /**
   * Detect columns using density analysis
   */
  private detectColumns(lineCells: LineCell[], pageWidth: number): { lines: LineCell[] }[] {
    if (lineCells.length === 0) return [];

    // Analyze X distribution
    const lineCenters = lineCells.map(line => line.x + line.width / 2);
    const minX = Math.min(...lineCenters);
    const maxX = Math.max(...lineCenters);
    const spread = maxX - minX;

    // If spread is small, single column
    if (spread < pageWidth * 0.2) {
      return [{ lines: lineCells }];
    }

    // Use density-based column detection
    const numSlices = Math.min(20, Math.floor(pageWidth / 50));
    const sliceWidth = pageWidth / numSlices;
    const sliceCounts = new Array(numSlices).fill(0);

    for (const line of lineCells) {
      const lineCenter = line.x + line.width / 2;
      const sliceIndex = Math.min(Math.floor(lineCenter / sliceWidth), numSlices - 1);
      sliceCounts[sliceIndex]++;
    }

    // Find peaks in density
    const peaks: number[] = [];
    const threshold = lineCells.length / (numSlices * 2);

    for (let i = 1; i < sliceCounts.length - 1; i++) {
      if (sliceCounts[i] > threshold && 
          sliceCounts[i] > sliceCounts[i - 1] && 
          sliceCounts[i] > sliceCounts[i + 1]) {
        peaks.push(i);
      }
    }

    if (peaks.length <= 1) {
      return [{ lines: lineCells }];
    }

    // Split into columns based on peaks
     const columns: { lines: LineCell[] }[] = [];
     const boundaries = this.findColumnBoundaries(peaks);

    for (let i = 0; i < boundaries.length; i++) {
      const startSlice = i === 0 ? 0 : boundaries[i - 1];
      const endSlice = boundaries[i];

      const columnLines = lineCells.filter(line => {
        const lineCenter = line.x + line.width / 2;
        const lineSlice = Math.min(Math.floor(lineCenter / sliceWidth), numSlices - 1);
        return lineSlice >= startSlice && lineSlice < endSlice;
      });

      if (columnLines.length > 0) {
        columns.push({ lines: columnLines });
      }
    }

    // Add last column
    if (boundaries.length > 0) {
      const lastStart = boundaries[boundaries.length - 1];
      const lastLines = lineCells.filter(line => {
        const lineCenter = line.x + line.width / 2;
        const lineSlice = Math.min(Math.floor(lineCenter / sliceWidth), numSlices - 1);
        return lineSlice >= lastStart;
      });
      if (lastLines.length > 0) {
        columns.push({ lines: lastLines });
      }
    }

    return columns.length > 0 ? columns : [{ lines: lineCells }];
  }

  /**
   * Find column boundaries from density peaks
   */
  private findColumnBoundaries(peaks: number[]): number[] {
    if (peaks.length === 0) return [];

    peaks.sort((a, b) => a - b);

    // Find gaps between peaks
    const gaps: { index: number; size: number }[] = [];
    for (let i = 0; i < peaks.length - 1; i++) {
      const gap = peaks[i + 1] - peaks[i];
      gaps.push({ index: i + 1, size: gap });
    }

    // Sort by gap size (largest first)
    gaps.sort((a, b) => b.size - a.size);

    // Determine number of columns (2-3 typical for scientific papers)
    const numColumns = Math.min(3, peaks.length);
    const numSplits = numColumns - 1;

    const boundaries: number[] = [];
    for (let i = 0; i < numSplits && i < gaps.length; i++) {
      boundaries.push(peaks[gaps[i].index]);
    }

    return boundaries.sort((a, b) => a - b);
  }

  /**
   * Detect structure elements within a column
   */
  private detectColumnElements(
    lines: LineCell[],
    shapes: Shape[],
    pageNum: number,
    pageHeight: number
  ): StructureElement[] {
    const elements: StructureElement[] = [];

    // Filter out watermark/footer lines before processing
    const filteredLines = this.filterWatermarkLines(lines, pageHeight);

    // Group lines into paragraphs
    const paragraphs = this.groupLinesIntoParagraphs(filteredLines);

    for (const paragraph of paragraphs) {
      const element = this.classifyParagraph(paragraph, shapes, pageNum);
      if (element) {
        elements.push(element);
      }
    }

    return elements;
  }

  /**
   * Group lines into paragraphs based on spacing
   * Uses Tika-inspired dropThreshold for paragraph detection
   */
  private groupLinesIntoParagraphs(lines: LineCell[]): LineCell[][] {
    if (lines.length === 0) return [];

    const paragraphs: LineCell[][] = [];
    let currentParagraph: LineCell[] = [lines[0]];

    for (let i = 1; i < lines.length; i++) {
      const prevLine = lines[i - 1];
      const currLine = lines[i];

      // Calculate vertical gap
      const verticalGap = currLine.y - (prevLine.y + prevLine.height);

      // Calculate average line height
      const avgHeight = (prevLine.height + currLine.height) / 2;

      // If gap exceeds dropThreshold * avgHeight, start new paragraph
      // Tika: dropThreshold is a multiplier for line height to detect paragraph breaks
      if (verticalGap > avgHeight * CONFIG.dropThreshold) {
        paragraphs.push(currentParagraph);
        currentParagraph = [currLine];
      } else {
        currentParagraph.push(currLine);
      }
    }

    // Don't forget last paragraph
    if (currentParagraph.length > 0) {
      paragraphs.push(currentParagraph);
    }

    return paragraphs;
  }

  /**
   * Classify a paragraph as heading, list, table, etc.
   * Enhanced with Tika's marked content extraction: uses PDF structure tags if available
   */
  private classifyParagraph(
    lines: LineCell[],
    shapes: Shape[],
    pageNum: number
  ): StructureElement | null {
    if (lines.length === 0) return null;

    const firstLine = lines[0];
    const text = lines.map(l => l.text).join(' ').trim();

    if (!text) return null;

    // Try to classify using marked content (PDF structure tags) first (Tika technique)
    const markedContentElement = this.classifyFromMarkedContent(lines, pageNum);
    if (markedContentElement) {
      return markedContentElement;
    }

    // Fall back to heuristic classification
    // Detect headings
    const headingInfo = this.detectHeading(lines);
    if (headingInfo.isHeading) {
      return {
        type: 'heading',
        level: headingInfo.level,
        text,
        x: firstLine.x,
        y: firstLine.y,
        width: Math.max(...lines.map(l => l.width)),
        height: lines.reduce((sum, l) => sum + l.height, 0),
        pageNum,
      };
    }

    // Detect lists
    const listInfo = this.detectList(text);
    if (listInfo.isList) {
      return {
        type: 'list',
        text,
        x: firstLine.x,
        y: firstLine.y,
        width: Math.max(...lines.map(l => l.width)),
        height: lines.reduce((sum, l) => sum + l.height, 0),
        pageNum,
        metadata: { listType: listInfo.type },
      };
    }

    // Detect figure captions
    if (this.detectFigureCaption(text)) {
      return {
        type: 'figure',
        text,
        x: firstLine.x,
        y: firstLine.y,
        width: Math.max(...lines.map(l => l.width)),
        height: lines.reduce((sum, l) => sum + l.height, 0),
        pageNum,
      };
    }

    // Detect table rows
    if (this.detectTableRow(lines)) {
      return {
        type: 'table',
        text,
        x: firstLine.x,
        y: firstLine.y,
        width: Math.max(...lines.map(l => l.width)),
        height: lines.reduce((sum, l) => sum + l.height, 0),
        pageNum,
      };
    }

    // Detect horizontal separators
    if (this.detectSeparator(text, shapes)) {
      return {
        type: 'separator',
        text: '---',
        x: firstLine.x,
        y: firstLine.y,
        width: Math.max(...lines.map(l => l.width)),
        height: lines.reduce((sum, l) => sum + l.height, 0),
        pageNum,
      };
    }

    // Regular paragraph
    return {
      type: 'paragraph',
      text,
      x: firstLine.x,
      y: firstLine.y,
      width: Math.max(...lines.map(l => l.width)),
      height: lines.reduce((sum, l) => sum + l.height, 0),
      pageNum,
    };
  }

  /**
   * Classify structure using PDF marked content (structure tags) if available
   * This leverages Tika's marked content extraction technique
   */
  private classifyFromMarkedContent(lines: LineCell[], pageNum: number): StructureElement | null {
    if (lines.length === 0) return null;
    
    // Check if all lines have the same structureTag (non-undefined)
    const tags = lines.map(l => l.structureTag).filter(t => t !== undefined) as string[];
    if (tags.length === 0) return null; // no marked content
    
    const uniqueTags = new Set(tags);
    if (uniqueTags.size !== 1) return null; // mixed tags, ignore
    
    const tag = tags[0];
    const text = lines.map(l => l.text).join(' ').trim();
    if (!text) return null;
    
    // Map PDF structure tags to our element types
    // Common tags: H (heading), H1-H6, P (paragraph), L (list), LI (list item), 
    // Table, TR, TD, Figure, Caption, etc.
    const tagUpper = tag.toUpperCase();
    let type: StructureElement['type'] = 'paragraph';
    let level: number | undefined;
    let metadata: Record<string, unknown> | undefined;
    
    if (tagUpper.startsWith('H') || tagUpper.startsWith('HEADING')) {
      type = 'heading';
      // Extract level if it's H1, H2, etc.
      const levelMatch = tagUpper.match(/H(\d)/);
      if (levelMatch) {
        level = parseInt(levelMatch[1], 10);
      } else {
        // Estimate level from font size of first line
        const avgFontSize = lines.reduce((sum, l) => sum + l.fontSize, 0) / lines.length;
        if (avgFontSize >= 20) level = 1;
        else if (avgFontSize >= 16) level = 2;
        else level = 3;
      }
    } else if (tagUpper === 'P' || tagUpper === 'PARA' || tagUpper === 'PARAGRAPH') {
      type = 'paragraph';
    } else if (tagUpper === 'L' || tagUpper === 'LIST' || tagUpper === 'LI' || tagUpper === 'LISTITEM') {
      type = 'list';
      // Determine list type from content (bullet or number)
      const firstLineText = lines[0].text.trim();
      const bulletPatterns = ['•', '·', '○', '●', '▪', '▫', '►', '→', '*', '-', '–'];
      const isBullet = bulletPatterns.some(b => firstLineText.startsWith(b));
      metadata = { listType: isBullet ? 'bullet' : 'number' };
    } else if (tagUpper.includes('TABLE') || tagUpper === 'TR' || tagUpper === 'TD' || tagUpper === 'TH') {
      type = 'table';
    } else if (tagUpper.includes('FIGURE') || tagUpper.includes('FIG') || tagUpper === 'CAPTION') {
      type = 'figure';
    } else if (tagUpper === 'SEPARATOR' || tagUpper === 'HR') {
      type = 'separator';
    } else {
      // Unknown tag, treat as paragraph
      type = 'paragraph';
    }
    
    const firstLine = lines[0];
    return {
      type,
      ...(level !== undefined && { level }),
      ...(metadata !== undefined && { metadata }),
      text,
      x: firstLine.x,
      y: firstLine.y,
      width: Math.max(...lines.map(l => l.width)),
      height: lines.reduce((sum, l) => sum + l.height, 0),
      pageNum,
    };
  }

  /**
   * Detect if lines form a heading
   */
  private detectHeading(lines: LineCell[]): { isHeading: boolean; level: number } {
    if (lines.length === 0) return { isHeading: false, level: 0 };

    const firstLine = lines[0];
    const text = firstLine.text.trim();

    // Signal 1: Font size
    const avgFontSize = lines.reduce((sum, l) => sum + l.fontSize, 0) / lines.length;

    // Signal 2: Text characteristics
    const isAllCaps = text === text.toUpperCase() && text.length < 100;
    const endsWithColon = text.endsWith(':');
    const isShort = text.length < 80;

    // Signal 3: Position (at left margin)
    const isAtLeftMargin = firstLine.x < 50;

    // Signal 4: Line spacing (more space after)
    let spacingAfter = 0;
    if (lines.length > 1) {
      spacingAfter = lines[1].y - (firstLine.y + firstLine.height);
    }
    const hasExtraSpacing = spacingAfter > avgFontSize * 1.5;

    // Combine signals
    let headingScore = 0;
    if (avgFontSize > 14) headingScore += 2;
    if (isAllCaps) headingScore += 1;
    if (endsWithColon) headingScore += 1;
    if (isShort) headingScore += 1;
    if (isAtLeftMargin) headingScore += 1;
    if (hasExtraSpacing) headingScore += 1;

    if (headingScore >= 3) {
      let level = 1;
      if (avgFontSize >= 20) level = 1;
      else if (avgFontSize >= 16) level = 2;
      else level = 3;

      return { isHeading: true, level };
    }

    return { isHeading: false, level: 0 };
  }

  /**
   * Detect if text is a list item
   */
  private detectList(text: string): { isList: boolean; type: string } {
    const trimmed = text.trim();

    // Bullet patterns
    const bulletPatterns = ['•', '·', '○', '●', '▪', '▫', '►', '→', '*', '-', '–'];
    if (bulletPatterns.some(bullet => trimmed.startsWith(bullet))) {
      return { isList: true, type: 'bullet' };
    }

    // Number patterns
    const numberPatterns = [
      /^\(?\d+\)?[\.\)]\s/,  // "1.", "1)", "(1)"
      /^[A-Za-z]\)\s/,        // "A)", "a)"
      /^[IVXLCDM]+\)\s/,      // "I)", "II)" (Roman numerals)
      /^\(?[A-Za-z]\)?[\.\)]\s/, // "A.", "a."
    ];

    if (numberPatterns.some(pattern => pattern.test(trimmed))) {
      return { isList: true, type: 'number' };
    }

    return { isList: false, type: 'none' };
  }

  /**
   * Detect if text is a figure caption
   */
  private detectFigureCaption(text: string): boolean {
    const lower = text.toLowerCase().trim();

    const figurePatterns = [
      /^fig(?:ure)?\.?\s*\d+[\.\:]\s*/i,
      /^figure\s+\d+[\.\:]\s*/i,
      /^table\s+\d+[\.\:]\s*/i,
    ];

    return figurePatterns.some(pattern => pattern.test(lower));
  }

  /**
   * Detect if lines form a table row
   */
  private detectTableRow(lines: LineCell[]): boolean {
    if (lines.length !== 1) return false;

    const line = lines[0];

    // Check for table-like characteristics
    if (line.words.length >= 3) {
      // Check if words are evenly spaced
      const positions = line.words.map(w => w.x);
      const gaps: number[] = [];
      for (let i = 1; i < positions.length; i++) {
        gaps.push(positions[i] - positions[i - 1]);
      }

      if (gaps.length >= 2) {
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
        const cv = Math.sqrt(variance) / avgGap;

        // If gaps are fairly consistent, it might be a table
        if (cv < 0.5 && avgGap > 20) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Detect if text is a separator
   */
  private detectSeparator(text: string, shapes: Shape[]): boolean {
    // Check for repeated characters
    if (/^[-=*]{5,}$/.test(text)) {
      return true;
    }

    // Check for very short line with dashes
    if (text.length < 10 && /^[-_=~]+$/.test(text)) {
      return true;
    }

    // Check for horizontal line shapes
    if (shapes.some(s => s.type === 'line' && s.width > 100 && s.height < 5)) {
      return true;
    }

    return false;
  }

  /**
   * Convert page analyses to markdown
   */
  private convertAnalysesToMarkdown(analyses: PageAnalysis[]): string {
    const pageMarkdowns: string[] = [];

    for (const analysis of analyses) {
      const pageMarkdown = this.convertPageAnalysisToMarkdown(analysis);
      if (pageMarkdown.trim()) {
        pageMarkdowns.push(pageMarkdown.trim());
      }
    }

    return pageMarkdowns.join('\n\n---\n\n').trim();
  }

  /**
   * Convert a single page analysis to markdown
   * Elements are already ordered by column (left to right) and within each column by Y (top to bottom)
   * from detectStructure(). Do NOT globally sort by Y, as that would interleave multi-column text.
   */
  private convertPageAnalysisToMarkdown(analysis: PageAnalysis): string {
    const elements = analysis.elements;
    const markdownParts: string[] = [];

    for (const element of elements) {
      const markdown = this.convertElementToMarkdown(element);
      if (markdown) {
        markdownParts.push(markdown);
      }
    }

    return markdownParts.join('\n\n');
  }

  /**
   * Convert a structure element to markdown
   */
  private convertElementToMarkdown(element: StructureElement): string {
    switch (element.type) {
      case 'heading':
        const level = Math.min(element.level || 1, 3);
        return `${'#'.repeat(level)} ${element.text}`;

      case 'list':
        const listType = element.metadata?.listType || 'bullet';
        const marker = listType === 'bullet' ? '* ' : '- ';
        // Remove the original marker from text
        const cleanedText = element.text
          .replace(/^[•·○●▪▫►→\*\-–]\s*/, '')
          .replace(/^\(?\d+\)?[\.\)]\s/, '')
          .replace(/^[A-Za-z]\)\s/, '')
          .replace(/^\(?[A-Za-z]\)?[\.\)]\s/, '')
          .trim();
        return `${marker}${cleanedText}`;

      case 'figure':
        return `*${element.text}*`;

      case 'table':
        // Format as markdown table
        const cells = element.text.split(/\s{2,}/).filter(c => c.trim());
        if (cells.length >= 2) {
          return `| ${cells.join(' | ')} |`;
        }
        return element.text;

      case 'separator':
        return '---';

      case 'paragraph':
        default:
          return element.text;
      }
    }
  
    /**
     * Check if a line is likely a watermark/footer and should be filtered out
     * Watermarks typically appear at the bottom of the page and contain phrases like
     * "Downloaded from" along with URLs and dates.
     */
    private isWatermarkLine(line: LineCell, pageHeight: number): boolean {
      const text = line.text.trim();
      if (!text) return false;
  
      // Check if line is at the bottom of the page (bottom 20% to be safe)
      const lineBottom = line.y + line.height;
      const bottomThreshold = pageHeight * 0.80; // Bottom 20%
      if (lineBottom < bottomThreshold) {
        return false; // Not at bottom, unlikely to be watermark
      }
  
      // Check for common watermark patterns (case-insensitive, flexible spacing)
      const lowerText = text.toLowerCase();
      
      // Pattern 1: Contains "downloaded" anywhere (handles "Downloadedfrom" without space)
      if (lowerText.includes('downloaded')) {
        return true;
      }
  
      // Pattern 2: Contains URL and guest/access keywords (handles concatenated text)
      const hasUrl = /https?:\/\/[^\s]+/.test(text);
      if (hasUrl && (lowerText.includes('guest') || lowerText.includes('access') || lowerText.includes('retrieve'))) {
        return true;
      }
  
      // Pattern 3: Very long URL-only text at bottom (publisher identifiers)
      const urlPattern = /^https?:\/\/[^\s]+$/i;
      if (urlPattern.test(text) && text.length > 50) {
        return true;
      }
  
      // Pattern 4: Contains "by guest on" with optional spaces and date
      // Matches: "by guest on", "bygueston", "by gueston", etc.
      if (/by\s*guest\s*on/i.test(text) && /\d{1,2}\s+\w+\s+\d{4}/i.test(text)) {
        return true;
      }
  
      // Pattern 5: Contains "accessed from" or "retrieved from"
      if (lowerText.includes('accessed from') || lowerText.includes('retrieved from')) {
        return true;
      }
  
      // Pattern 6: Contains "downloaded from" (with or without space)
      if (/downloaded\s*from/i.test(text)) {
        return true;
      }
  
      return false;
    }
  
    /**
     * Filter out watermark/footer lines from the line collection
     */
    private filterWatermarkLines(lines: LineCell[], pageHeight: number): LineCell[] {
      return lines.filter(line => !this.isWatermarkLine(line, pageHeight));
    }
  }

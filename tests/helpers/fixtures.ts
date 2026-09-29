import JSZip from 'jszip';

/**
 * In-memory fixture builders.
 *
 * Fixtures are generated rather than committed as binaries so the tests stay
 * readable and the repo stays free of opaque blobs. The trade-off, stated
 * plainly: the OOXML fixtures are built with jszip, the same library the
 * converters read with, so these tests cover the converters' XML parsing but
 * not the zip layer underneath it.
 */

/** Convert a Uint8Array to a properly-sized ArrayBuffer. */
export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
}

/** Encode a string as the ArrayBuffer every converter accepts. */
export function bytes(text: string): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(text));
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ DOCX */

const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

const DOCX_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/**
 * Style names must match mammoth's default style map exactly
 * ("Heading 1", not "Heading1") or the heading degrades to a paragraph.
 */
const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/></w:style>
</w:styles>`;

export interface DocxBlock {
  text: string;
  /** Style id — 'Heading1'/'Heading2' map to h1/h2 via DOCX_STYLES. */
  style?: 'Heading1' | 'Heading2';
  bold?: boolean;
}

export async function makeDocx(blocks: DocxBlock[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', DOCX_CONTENT_TYPES);
  zip.file('_rels/.rels', DOCX_RELS);
  zip.file('word/styles.xml', DOCX_STYLES);

  const paragraphs = blocks
    .map(block => {
      const style = block.style
        ? `<w:pPr><w:pStyle w:val="${block.style}"/></w:pPr>`
        : '';
      const runProps = block.bold ? '<w:rPr><w:b/></w:rPr>' : '';
      return `<w:p>${style}<w:r>${runProps}<w:t xml:space="preserve">${escapeXml(
        block.text
      )}</w:t></w:r></w:p>`;
    })
    .join('');

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`
  );

  return zip.generateAsync({ type: 'arraybuffer' });
}

/* ------------------------------------------------------------------ XLSX */

export interface XlsxSheet {
  name: string;
  rows: Array<Array<string | number>>;
}

export async function makeXlsx(sheets: XlsxSheet[]): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(sheet.rows),
      sheet.name
    );
  }

  const out = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return toArrayBuffer(new Uint8Array(out));
}

/* ------------------------------------------------------------------ PPTX */

/**
 * The converter only needs `ppt/slides/slideN.xml` entries containing `a:t`
 * text nodes — the surrounding package parts are never read.
 */
export async function makePptx(slides: string[][]): Promise<ArrayBuffer> {
  const zip = new JSZip();

  slides.forEach((slideTexts, index) => {
    const runs = slideTexts
      .map(text => `<a:p><a:r><a:t>${escapeXml(text)}</a:t></a:r></a:p>`)
      .join('');
    zip.file(
      `ppt/slides/slide${index + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${runs}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
    );
  });

  return zip.generateAsync({ type: 'arraybuffer' });
}

/* ------------------------------------------------------------------ File */

/** Build a browser File the way the app does (name + MIME drive detection). */
export function makeFile(
  data: ArrayBuffer | string,
  filename: string,
  type = ''
): File {
  return new File([data], filename, { type });
}

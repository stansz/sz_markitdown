import { describe, it, expect } from 'vitest';
import { DocxConverter } from '../src/converters/DocxConverter';
import type { StreamInfo } from '../src/core/types';
import { bytes, makeDocx } from './helpers/fixtures';

const info: StreamInfo = {
  filename: 'report.docx',
  extension: '.docx',
  mimetype:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

describe('DocxConverter.accepts', () => {
  const converter = new DocxConverter();

  it('accepts by extension and MIME type', () => {
    expect(converter.accepts(bytes(''), { extension: '.docx' })).toBe(true);
    expect(converter.accepts(bytes(''), { mimetype: info.mimetype })).toBe(true);
  });

  it('rejects other formats', () => {
    expect(converter.accepts(bytes(''), { extension: '.doc' })).toBe(false);
    expect(converter.accepts(bytes(''), { extension: '.pptx' })).toBe(false);
  });
});

describe('DocxConverter.convert', () => {
  const converter = new DocxConverter();

  it('converts heading and body paragraphs', async () => {
    const data = await makeDocx([
      { text: 'Report Title', style: 'Heading1' },
      { text: 'Body text.' },
      { text: 'Section', style: 'Heading2' },
    ]);

    const { markdown } = await converter.convert(data, info);

    expect(markdown).toContain('# Report Title');
    expect(markdown).toContain('Body text.');
    expect(markdown).toContain('## Section');
  });

  it('keeps bold runs', async () => {
    // Regression: mammoth emits a <p>-wrapped <strong> for every formatted
    // run, and the 'p' branch used to flatten its children — so DOCX bold and
    // italic never survived conversion at all.
    const data = await makeDocx([{ text: 'bold bit', bold: true }]);
    const { markdown } = await converter.convert(data, info);
    expect(markdown).toContain('**bold bit**');
  });

  it('keeps italic runs', async () => {
    const data = await makeDocx([{ text: 'italic bit', italic: true }]);
    const { markdown } = await converter.convert(data, info);
    expect(markdown).toContain('*italic bit*');
  });

  it('uses the filename as the title', async () => {
    const data = await makeDocx([{ text: 'x' }]);
    const result = await converter.convert(data, info);
    expect(result.title).toBe('report.docx');
  });

  it('throws on a file that is not a valid docx', async () => {
    // Result of a truncated download or a renamed non-docx file.
    await expect(converter.convert(bytes('not a zip'), info)).rejects.toThrow();
  });
});

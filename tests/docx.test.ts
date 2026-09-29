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

  it.fails('keeps bold runs (known limitation)', async () => {
    // Same root cause as the HTML case: mammoth emits <p><strong>…</strong></p>
    // and the converter's 'p' branch flattens all children, so bold is lost.
    const data = await makeDocx([{ text: 'bold bit', bold: true }]);
    const { markdown } = await converter.convert(data, info);
    expect(markdown).toContain('**bold bit**');
  });

  it('currently drops bold instead, because mammoth wraps runs in a paragraph', async () => {
    // Pins today's behaviour. If this starts failing, the flattening bug was
    // fixed: delete this test and flip the .fails above to a normal `it`.
    const data = await makeDocx([{ text: 'bold bit', bold: true }]);
    const { markdown } = await converter.convert(data, info);

    expect(markdown).toContain('bold bit');
    expect(markdown).not.toContain('**bold bit**');
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

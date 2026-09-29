import { describe, it, expect } from 'vitest';
import { XlsxConverter } from '../src/converters/XlsxConverter';
import type { StreamInfo } from '../src/core/types';
import { bytes, makeXlsx } from './helpers/fixtures';

const info: StreamInfo = {
  filename: 'scores.xlsx',
  extension: '.xlsx',
  mimetype:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

describe('XlsxConverter.accepts', () => {
  const converter = new XlsxConverter();

  it('accepts by extension, including legacy .xls', () => {
    expect(converter.accepts(bytes(''), { extension: '.xlsx' })).toBe(true);
    expect(converter.accepts(bytes(''), { extension: '.xls' })).toBe(true);
  });

  it('accepts by MIME type', () => {
    expect(
      converter.accepts(bytes(''), {
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
    ).toBe(true);
    expect(converter.accepts(bytes(''), { mimetype: 'application/vnd.ms-excel' })).toBe(
      true
    );
  });

  it('rejects other formats', () => {
    expect(converter.accepts(bytes(''), { extension: '.csv' })).toBe(false);
  });
});

describe('XlsxConverter.convert', () => {
  const converter = new XlsxConverter();

  it('renders a single sheet as a Markdown table', async () => {
    const data = await makeXlsx([
      {
        name: 'Scores',
        rows: [
          ['Name', 'Score'],
          ['Alice', 90],
          ['Bob', 85],
        ],
      },
    ]);

    const result = await converter.convert(data, info);

    expect(result.markdown).toContain('| Name | Score |');
    expect(result.markdown).toContain('| --- | --- |');
    expect(result.markdown).toContain('| Alice | 90 |');
    expect(result.markdown).toContain('| Bob | 85 |');
    expect(result.title).toBe('scores.xlsx');
  });

  it('omits sheet headings when there is only one sheet', async () => {
    const data = await makeXlsx([{ name: 'Scores', rows: [['a', 'b']] }]);
    const { markdown } = await converter.convert(data, info);
    expect(markdown).not.toContain('## Scores');
  });

  it('adds a heading per sheet when there are several', async () => {
    const data = await makeXlsx([
      { name: 'Alpha', rows: [['a']] },
      { name: 'Beta', rows: [['b']] },
    ]);

    const { markdown } = await converter.convert(data, info);

    expect(markdown).toContain('## Alpha');
    expect(markdown).toContain('## Beta');
  });

  it('escapes pipes so table structure survives cell content', async () => {
    const data = await makeXlsx([
      { name: 'Pipes', rows: [['A|B', 'C'], ['1', '2']] },
    ]);

    const { markdown } = await converter.convert(data, info);

    expect(markdown).toContain('A\\|B');
    // Every rendered row must keep exactly the expected column count.
    const row = markdown
      .split('\n')
      .find(line => line.startsWith('| A'));
    expect(row).toBe('| A\\|B | C |');
  });

  it('pads ragged rows to the widest row', async () => {
    const data = await makeXlsx([
      { name: 'Ragged', rows: [['h1', 'h2', 'h3'], ['only-one']] },
    ]);

    const { markdown } = await converter.convert(data, info);

    expect(markdown).toContain('| only-one |  |  |');
  });

  it('reports a message when the sheet holds no data', async () => {
    const data = await makeXlsx([{ name: 'Empty', rows: [] }]);
    const { markdown } = await converter.convert(data, info);
    expect(markdown).toBe('*No data could be extracted from this spreadsheet.*');
  });
});

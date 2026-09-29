import { describe, it, expect } from 'vitest';
import { PptxConverter } from '../src/converters/PptxConverter';
import type { StreamInfo } from '../src/core/types';
import { bytes, makePptx } from './helpers/fixtures';

const info: StreamInfo = {
  filename: 'deck.pptx',
  extension: '.pptx',
  mimetype:
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

describe('PptxConverter.accepts', () => {
  const converter = new PptxConverter();

  it('accepts by extension and MIME type', () => {
    expect(converter.accepts(bytes(''), { extension: '.pptx' })).toBe(true);
    expect(converter.accepts(bytes(''), { mimetype: info.mimetype })).toBe(true);
  });

  it('rejects other formats', () => {
    expect(converter.accepts(bytes(''), { extension: '.ppt' })).toBe(false);
    expect(converter.accepts(bytes(''), { extension: '.docx' })).toBe(false);
  });
});

describe('PptxConverter.convert', () => {
  const converter = new PptxConverter();

  it('renders each slide with a heading and its text', async () => {
    const data = await makePptx([
      ['Quarterly Review', 'Revenue up 12%'],
      ['Next Steps', 'Ship the thing'],
    ]);

    const { markdown } = await converter.convert(data, info);

    expect(markdown).toContain('## Slide 1');
    expect(markdown).toContain('Quarterly Review');
    expect(markdown).toContain('Revenue up 12%');
    expect(markdown).toContain('## Slide 2');
    expect(markdown).toContain('Next Steps');
    expect(markdown).toContain('Ship the thing');
  });

  it('uses the filename as the title', async () => {
    const data = await makePptx([['x']]);
    const result = await converter.convert(data, info);
    expect(result.title).toBe('deck.pptx');
  });

  it('numbers slides by file position, so a textless slide leaves a gap', async () => {
    // Pins current behaviour: slideNumber counts files, but a slide with no
    // text emits no heading, so the visible numbering can skip.
    const data = await makePptx([['first'], [], ['third']]);
    const { markdown } = await converter.convert(data, info);

    expect(markdown).toContain('## Slide 1');
    expect(markdown).not.toContain('## Slide 2');
    expect(markdown).toContain('## Slide 3');
  });

  it('reports a message when there is nothing to extract', async () => {
    const data = await makePptx([]);
    const { markdown } = await converter.convert(data, info);
    expect(markdown).toBe(
      '*No text content could be extracted from this presentation.*'
    );
  });
});

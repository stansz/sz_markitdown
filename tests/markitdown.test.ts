import { describe, it, expect, vi, afterEach } from 'vitest';
import { MarkItDown } from '../src/core/MarkItDown';
import { DocumentConverter } from '../src/core/types';
import type { DocumentConverterResult, StreamInfo } from '../src/core/types';
import {
  FileConversionException,
  UnsupportedFormatException,
  PRIORITY_SPECIFIC_FILE_FORMAT,
  PRIORITY_GENERIC_FILE_FORMAT,
} from '../src/core/types';
import { bytes, makeFile } from './helpers/fixtures';

/** Converter that accepts one extension and returns whatever it is told to. */
class StubConverter extends DocumentConverter {
  constructor(
    private readonly extension: string,
    private readonly markdown: string,
    private readonly behaviour: 'ok' | 'throw' = 'ok'
  ) {
    super();
  }

  accepts(_fileStream: ArrayBuffer, streamInfo: StreamInfo): boolean {
    return streamInfo.extension === this.extension;
  }

  async convert(): Promise<DocumentConverterResult> {
    if (this.behaviour === 'throw') throw new Error('stub failure');
    return { markdown: this.markdown };
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MarkItDown registration', () => {
  it('registers all six built-in converters by default', () => {
    // Order is reverse-registration because registerConverter unshifts.
    expect(new MarkItDown().getRegisteredConverters()).toEqual([
      'HtmlConverter',
      'DocxConverter',
      'PdfConverter',
      'XlsxConverter',
      'PptxConverter',
      'OutlookMsgConverter',
    ]);
  });

  it('registers nothing when builtins are disabled', () => {
    const md = new MarkItDown({ enableBuiltins: false });
    expect(md.getRegisteredConverters()).toEqual([]);
  });

  it('is idempotent when enableBuiltins is called twice', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const md = new MarkItDown();
    const before = md.getRegisteredConverters();

    md.enableBuiltins();

    expect(md.getRegisteredConverters()).toEqual(before);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('MarkItDown routing', () => {
  it('routes an HTML file to the HtmlConverter', async () => {
    const md = new MarkItDown();
    const file = makeFile('<html><title>T</title><body><p>hi</p></body></html>', 'a.html', 'text/html');

    const result = await md.convert(file);

    expect(result.title).toBe('T');
    expect(result.markdown).toContain('hi');
  });

  it('prefers a lower-priority-value converter over a generic one', async () => {
    const md = new MarkItDown();
    md.registerConverter(
      new StubConverter('.html', 'SPECIFIC WINS'),
      PRIORITY_SPECIFIC_FILE_FORMAT
    );

    const result = await md.convert(makeFile('<p>x</p>', 'a.html', 'text/html'));

    expect(result.markdown).toBe('SPECIFIC WINS');
  });

  it('tries the most recently registered of equal priority first', async () => {
    const md = new MarkItDown({ enableBuiltins: false });
    md.registerConverter(
      new StubConverter('.txt', 'FIRST REGISTERED'),
      PRIORITY_GENERIC_FILE_FORMAT
    );
    md.registerConverter(
      new StubConverter('.txt', 'SECOND REGISTERED'),
      PRIORITY_GENERIC_FILE_FORMAT
    );

    const result = await md.convert(makeFile('x', 'a.txt', 'text/plain'));

    expect(result.markdown).toBe('SECOND REGISTERED');
  });
});

describe('MarkItDown failure modes', () => {
  it('rejects with UnsupportedFormatException when nothing accepts the file', async () => {
    const md = new MarkItDown();
    await expect(
      md.convert(makeFile('plain', 'notes.txt', 'text/plain'))
    ).rejects.toBeInstanceOf(UnsupportedFormatException);
  });

  it('rejects with FileConversionException when every accepting converter fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Builtins off: with HtmlConverter registered it would legitimately
    // succeed on an .html file, masking the failure path.
    const md = new MarkItDown({ enableBuiltins: false });
    md.registerConverter(
      new StubConverter('.html', '', 'throw'),
      PRIORITY_SPECIFIC_FILE_FORMAT
    );

    const promise = md.convert(makeFile('<p>x</p>', 'a.html', 'text/html'));

    await expect(promise).rejects.toBeInstanceOf(FileConversionException);
    await expect(promise).rejects.toThrow(/All converters failed/);
    await expect(promise).rejects.toThrow(/StubConverter: stub failure/);
  });

  it('falls through to a later converter when an earlier one throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const md = new MarkItDown();
    md.registerConverter(
      new StubConverter('.html', '', 'throw'),
      PRIORITY_SPECIFIC_FILE_FORMAT
    );
    md.registerConverter(
      new StubConverter('.html', 'FALLBACK WINS'),
      PRIORITY_GENERIC_FILE_FORMAT
    );

    const result = await md.convert(makeFile('<p>x</p>', 'a.html', 'text/html'));

    expect(result.markdown).toBe('FALLBACK WINS');
  });

  it('rejects a malformed .msg with FileConversionException', async () => {
    // Real-world case: a truncated or renamed message file.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const md = new MarkItDown();

    await expect(
      md.convert(makeFile(bytes('not an OLE compound file'), 'broken.msg'))
    ).rejects.toBeInstanceOf(FileConversionException);
  });
});

describe('MarkItDown output normalisation', () => {
  it('trims trailing whitespace and collapses blank-line runs', async () => {
    const md = new MarkItDown({ enableBuiltins: false });
    md.registerConverter(
      new StubConverter('.txt', 'first   \n\n\n\nsecond\n'),
      PRIORITY_SPECIFIC_FILE_FORMAT
    );

    const result = await md.convert(makeFile('x', 'a.txt', 'text/plain'));

    // Note: per-line trailing whitespace is trimmed and blank-line runs are
    // collapsed, but the result as a whole is NOT trimmed — the trailing
    // newline survives.
    expect(result.markdown).toBe('first\n\nsecond\n');
  });
});

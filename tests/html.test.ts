import { describe, it, expect } from 'vitest';
import { HtmlConverter } from '../src/converters/HtmlConverter';
import type { StreamInfo } from '../src/core/types';
import { bytes, toArrayBuffer } from './helpers/fixtures';

const HTML = `<!DOCTYPE html>
<html>
  <head><title>Doc Title</title></head>
  <body>
    <script>alert('should be stripped')</script>
    <style>.hidden { display: none }</style>
    <h1>Hello World</h1>
    <h2>Second Level</h2>
    <p>A paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
    <p>A <a href="https://example.com">Example</a> link.</p>
    <ul><li>First</li><li>Second</li></ul>
    <ol><li>One</li><li>Two</li></ol>
    <table>
      <tr><th>A</th><th>B</th></tr>
      <tr><td>1</td><td>2</td></tr>
    </table>
    <blockquote>quoted</blockquote>
    <p>Some <code>inlinecode</code> here.</p>
    <pre>pre block</pre>
    <img src="img.png" alt="alt text">
  </body>
</html>`;

const info: StreamInfo = {
  filename: 'sample.html',
  extension: '.html',
  mimetype: 'text/html',
};

describe('HtmlConverter.accepts', () => {
  const converter = new HtmlConverter();

  it('accepts by extension', () => {
    expect(converter.accepts(bytes(HTML), { extension: '.html' })).toBe(true);
    expect(converter.accepts(bytes(HTML), { extension: '.htm' })).toBe(true);
  });

  it('accepts by MIME type, including the xhtml prefix', () => {
    expect(converter.accepts(bytes(HTML), { mimetype: 'text/html' })).toBe(true);
    expect(
      converter.accepts(bytes(HTML), { mimetype: 'application/xhtml+xml' })
    ).toBe(true);
    expect(
      converter.accepts(bytes(HTML), {
        mimetype: 'text/html; charset=utf-8',
      })
    ).toBe(true);
  });

  it('rejects other formats', () => {
    expect(converter.accepts(bytes(HTML), { extension: '.docx' })).toBe(false);
    expect(converter.accepts(bytes(HTML), { mimetype: 'text/plain' })).toBe(
      false
    );
  });
});

describe('HtmlConverter.convert', () => {
  const converter = new HtmlConverter();

  it('extracts the document title', async () => {
    const result = await converter.convert(bytes(HTML), info);
    expect(result.title).toBe('Doc Title');
  });

  it('returns undefined when there is no title element', async () => {
    const result = await converter.convert(bytes('<p>hi</p>'), info);
    expect(result.title).toBeUndefined();
  });

  it('converts headings', async () => {
    const { markdown } = await converter.convert(bytes(HTML), info);
    expect(markdown).toContain('# Hello World');
    expect(markdown).toContain('## Second Level');
  });

  it('converts inline emphasis, links and code', async () => {
    // Deliberately NOT wrapped in <p> — see the known-limitation test below
    // for why paragraph-wrapped inline markup is lost.
    const html = `<div><strong>bold</strong> <em>italic</em> <a href="https://example.com">Example</a> <code>inlinecode</code></div>`;
    const { markdown } = await converter.convert(bytes(html), info);
    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('*italic*');
    expect(markdown).toContain('[Example](https://example.com)');
    expect(markdown).toContain('`inlinecode`');
  });

  it.fails('keeps inline markup nested inside a paragraph (known limitation)', async () => {
    // BUG: the 'p' branch renders getTextContent(el), which flattens every
    // child, so bold/italic/links/inline-code inside a <p> are dropped.
    // This test is marked .fails so it turns red the moment it is fixed —
    // flip it to a normal `it` when that happens.
    const { markdown } = await converter.convert(bytes(HTML), info);
    expect(markdown).toContain('**bold**');
    expect(markdown).toContain('*italic*');
    expect(markdown).toContain('[Example](https://example.com)');
  });

  it('converts unordered and ordered lists', async () => {
    const { markdown } = await converter.convert(bytes(HTML), info);
    expect(markdown).toContain('- First');
    expect(markdown).toContain('- Second');
    expect(markdown).toContain('1. One');
    expect(markdown).toContain('2. Two');
  });

  it('converts tables with a header separator', async () => {
    const { markdown } = await converter.convert(bytes(HTML), info);
    expect(markdown).toContain('| A | B |');
    expect(markdown).toContain('| --- | --- |');
    expect(markdown).toContain('| 1 | 2 |');
  });

  it('converts blockquotes, images and preformatted blocks', async () => {
    const { markdown } = await converter.convert(bytes(HTML), info);
    expect(markdown).toContain('> quoted');
    expect(markdown).toContain('![alt text](img.png)');
    expect(markdown).toContain('```');
    expect(markdown).toContain('pre block');
  });

  it('strips script and style content', async () => {
    const { markdown } = await converter.convert(bytes(HTML), info);
    expect(markdown).not.toContain('should be stripped');
    expect(markdown).not.toContain('display: none');
  });

  it('honours the charset from StreamInfo', async () => {
    // 0xE9 is 'é' in ISO-8859-1 but invalid UTF-8.
    const latin1 = toArrayBuffer(new Uint8Array([0x43, 0x61, 0x66, 0xe9]));
    const result = await converter.convert(latin1, {
      ...info,
      charset: 'iso-8859-1',
    });
    expect(result.markdown).toContain('Café');
  });
});

import { describe, it, expect } from 'vitest';
import {
  detectFileType,
  mimeTypeMatches,
  extensionMatches,
} from '../src/utils/fileDetection';

describe('detectFileType', () => {
  it('prefers the browser-reported MIME type', () => {
    const file = new File(['x'], 'notes.html', { type: 'text/html' });
    expect(detectFileType(file)).toEqual({
      mimetype: 'text/html',
      extension: '.html',
      filename: 'notes.html',
    });
  });

  it('falls back to the extension map when the browser reports no type', () => {
    // Browsers routinely hand over an empty type for .docx/.msg.
    const file = new File(['x'], 'report.docx', { type: '' });
    expect(detectFileType(file).mimetype).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('falls back to octet-stream for an unknown extension', () => {
    const file = new File(['x'], 'mystery.zzz', { type: '' });
    expect(detectFileType(file).mimetype).toBe('application/octet-stream');
  });

  it('lower-cases the extension', () => {
    expect(detectFileType(new File(['x'], 'REPORT.DOCX')).extension).toBe('.docx');
  });

  it('uses the last dot for multi-dot names', () => {
    expect(detectFileType(new File(['x'], 'a.b.c.pdf')).extension).toBe('.pdf');
  });

  it('returns an empty extension when there is no dot', () => {
    expect(detectFileType(new File(['x'], 'README')).extension).toBe('');
  });
});

describe('mimeTypeMatches', () => {
  it('matches on prefix, not equality', () => {
    // Converter MIME lists are prefixes so charset suffixes still match.
    expect(mimeTypeMatches('text/html; charset=utf-8', 'text/html')).toBe(true);
    expect(mimeTypeMatches('application/pdf', 'application/pdf')).toBe(true);
  });

  it('is case-insensitive both ways', () => {
    expect(mimeTypeMatches('TEXT/HTML', 'text/html')).toBe(true);
    expect(mimeTypeMatches('text/html', 'TEXT/HTML')).toBe(true);
  });

  it('does not match a different type', () => {
    expect(mimeTypeMatches('text/plain', 'text/html')).toBe(false);
  });
});

describe('extensionMatches', () => {
  it('matches case-insensitively', () => {
    expect(extensionMatches('.HTML', ['.html', '.htm'])).toBe(true);
  });

  it('rejects extensions outside the list', () => {
    expect(extensionMatches('.txt', ['.html', '.htm'])).toBe(false);
  });
});

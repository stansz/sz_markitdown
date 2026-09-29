/**
 * jsdom does not implement the WHATWG encoding globals, and the converters
 * use TextDecoder (HtmlConverter) and TextEncoder (fixture builders). Node
 * provides both, so expose them when jsdom has not.
 */
import { TextDecoder, TextEncoder } from 'node:util';
import { Buffer } from 'node:buffer';

const g = globalThis as Record<string, unknown>;

if (typeof g.TextDecoder === 'undefined') g.TextDecoder = TextDecoder;
if (typeof g.TextEncoder === 'undefined') g.TextEncoder = TextEncoder;
// SheetJS and mammoth reach for Buffer in their Node code paths.
if (typeof g.Buffer === 'undefined') g.Buffer = Buffer;

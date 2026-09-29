import { defineConfig } from 'vitest/config';

/**
 * Test config is kept separate from vite.config.ts so the production build
 * path stays untouched. The converters need no Vite plugins here: mammoth,
 * jszip and xlsx all resolve normally from node_modules under jsdom, and the
 * only Vite-specific import in the codebase (`?worker&url` in PdfConverter)
 * is deliberately not exercised — see the note in README/AGENTS about PDF.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Vitest externalises node_modules, so Node resolves mammoth's Node
      // entry (lib/index.js) whose unzip only accepts {path}/{buffer} —
      // DocxConverter passes {arrayBuffer}, which only the browser build
      // understands. The browser build is what actually ships, so testing it
      // is also the more faithful choice.
      mammoth: 'mammoth/mammoth.browser.js',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    globals: false,
  },
});

# AGENTS.md

Browser-based document → Markdown converter. React 18 + TypeScript + Vite 6, built as a static SPA and deployed to Cloudflare Workers at https://md.ogsapps.cc/.

**The invariant:** everything runs client-side. No backend, no network requests after load, documents never leave the browser. Any change that would send file contents to a server is wrong for this project.

User-facing docs — supported formats, features, limitations, the full source tree — live in `README.md`. Don't duplicate them here.

## Commands

```bash
npm install
npm run dev        # dev server
npm run typecheck  # tsc -b
npm test           # vitest run — the only thing that checks conversion output
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the production build
```

CI (`.github/workflows/ci.yml`) runs typecheck, tests and build on every pull request and on pushes to `main`.

## Deployment

Cloudflare Workers static assets; configuration is in `wrangler.jsonc` (`assets.directory: ./dist`).

- A push to `main` builds and deploys automatically — the Worker is Git-connected to this repo.
- Manual deploy: `npm run build && npx wrangler deploy`
- To verify a deploy, read back the live bundle rather than trusting the pipeline: fetch `/` and check the `index-<hash>.js` filename matches your local `dist/index.html`. Vite content-hashes assets, so that filename changes on every real code change.

## Architecture

`MarkItDown` (`src/core/MarkItDown.ts`) holds a registry of converters. Each implements `DocumentConverter` with `accepts()` and `convert()`, and they are tried in priority order — lower priority value first. Layout: `src/converters/` one file per format, `src/core/` registry, types and shared HTML → Markdown, `src/components/` UI, `src/utils/` helpers.

**Non-obvious constraints — don't undo these:**

- **Converters are dynamically imported** (`await import('mammoth')` and so on) to keep heavy parsers out of the initial bundle. Keep any new converter lazy.
- **HTML → Markdown lives in one place: `src/core/htmlToMarkdown.ts`.** Both `HtmlConverter` and `DocxConverter` call it. They were near-identical copies until they drifted, which is how DOCX emphasis was silently lost for so long. Change it there, once.
- **The PDF worker must be bundled, not fetched from a CDN.** `PdfConverter.ts` imports `pdfjs-dist/build/pdf.worker.mjs?worker&url` and assigns it to `GlobalWorkerOptions.workerSrc`. A CDN-hosted worker fails on CORS.
- **`vite-plugin-node-polyfills` is required** — `mammoth`, `@kenjiuno/msgreader` and others expect Node core modules (Buffer, process, stream) that browsers don't provide.
- **`xlsx` installs from a SheetJS CDN tarball, not npm.** `package.json` points at `cdn.sheetjs.com`; the lockfile pins an integrity hash.
- **`main` is protected.** Direct pushes are rejected — work on a branch and open a pull request.

## Gotchas

Each of these has already cost time here.

- **Never commit `vite.config.js` or `vite.config.d.ts`.** They are `tsc -b` output of `vite.config.ts`, and Vite resolves `vite.config.js` *before* `vite.config.ts` — so a committed artifact silently shadows the real config and edits to the `.ts` do nothing at all. `tsconfig.node.json` emits into `node_modules/.tmp/` and `.gitignore` blocks both names.
- **Don't clear browser storage on mount.** Vite content-hashes every asset filename, so there is nothing to cache-bust, and this project has no service worker. Wiping `localStorage`/IndexedDB also permanently blocks any persisted setting — the dark-mode toggle can only read `prefers-color-scheme` for that reason.
- **The test suite needs jsdom, not plain Node.** `HtmlConverter`, `DocxConverter` and `PptxConverter` all use `DOMParser`. `tests/setup.ts` supplies the encoding globals jsdom lacks.
- **`vitest.config.ts` aliases `mammoth` to its browser build.** Vitest externalises `node_modules`, so Node would otherwise load mammoth's Node entry, whose `unzip` accepts only `{path}`/`{buffer}` while `DocxConverter` passes `{arrayBuffer}`.
- **vitest is deliberately pinned to 3.x.** vitest 4 declares `peer vite: ^6 || ^7 || ^8`, which sends npm's arborist into a deep peer walk that crashes: `Cannot read properties of null (reading 'edgesOut')` in `#loadPeerSet`. Don't bump it without moving vite at the same time.
- **Beware silently dropped output.** Conversion returns a plausible-looking string even when it is wrong, which is why the bugs the suite now covers went unnoticed. Assert on output, not on "it did not throw".

## Outstanding work

- **Test coverage gaps** — no tests for the PDF and MSG converters. pdfjs needs a real worker (`?worker&url` does not run under jsdom); `.msg` is an OLE compound document, so covering it needs a real sample committed under `tests/fixtures/`.
- **HTML table cells do not escape `|`** — `convertTable` joins cells with ` | ` and never escapes a pipe inside cell content, so such a cell silently breaks the table. `XlsxConverter` handles this correctly; the HTML path does not.
- **ESLint** — no config or dependencies yet. Deliberately left out of the first CI pull request so CI started green.
- **Dead polyfills** — `path` and `fs` in `nodePolyfills.include` are imported by nothing and do not appear in the built bundle.
- **AI OCR (issue #7)** — `src/utils/llmClient.ts` is a placeholder that throws. Real LLM calls need a server-side proxy (a Cloudflare Worker script), because an API key in the browser bundle is public. Adding that script is also when `@cloudflare/vite-plugin` becomes worth adopting.

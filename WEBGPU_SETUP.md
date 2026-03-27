# WebGPU ONNX Runtime Setup Guide

## Overview

This document describes the WebGPU configuration for the MarkItDown project's AI-powered PDF conversion feature using ONNX Runtime Web with the DocLayout-YOLO model.

## What Was Changed

### 1. Updated ONNX Runtime Web Version
- **From:** `onnxruntime-web@1.18.0`
- **To:** `onnxruntime-web@1.24.3`
- **Reason:** Latest version includes improved WebGPU support via JSEP (JavaScript Execution Provider)

### 2. Changed Import Path
- **Before:** `import * as ort from 'onnxruntime-web';`
- **After:** `import * as ort from 'onnxruntime-web/webgpu';`
- **Reason:** Explicitly imports the WebGPU-enabled build with JSEP support

### 3. Configured JSEP WASM Paths
The layout analysis utility now properly configures the JSEP-specific WASM files needed for WebGPU acceleration:

```typescript
if (typeof ort !== 'undefined' && ort.env && ort.env.wasm) {
  ort.env.wasm.wasmPaths = '/onnxruntime/';
  
  if (ort.env.wasm.wasmPaths && typeof ort.env.wasm.wasmPaths === 'string') {
    const wasmBasePath = ort.env.wasm.wasmPaths.endsWith('/') ? ort.env.wasm.wasmPaths : ort.env.wasm.wasmPaths + '/';
    (ort.env.wasm as any).wasmPaths = {
      'ort-wasm-simd.jsep.wasm': wasmBasePath + 'ort-wasm-simd.jsep.wasm',
      'ort-wasm-simd-threaded.jsep.wasm': wasmBasePath + 'ort-wasm-simd-threaded.jsep.wasm',
      // Fallback paths for regular WASM
      'ort-wasm-simd.wasm': wasmBasePath + 'ort-wasm-simd.wasm',
      'ort-wasm.wasm': wasmBasePath + 'ort-wasm.wasm',
    };
  }
}
```

### 4. Added Required WASM Files
The following JSEP WebGPU WASM files are now copied to `public/onnxruntime/`:
- `ort-wasm-simd.jsep.wasm` - JSEP SIMD WASM binary for WebGPU
- `ort-wasm-simd-threaded.jsep.wasm` - JSEP SIMD threaded WASM binary
- `ort-wasm-simd-threaded.jsep.mjs` - JSEP SIMD threaded JavaScript module
- `ort.webgpu.min.js` - WebGPU-specific ONNX Runtime JavaScript
- `ort.wasm-core.min.js` - Core WASM runtime
- `ort.wasm.min.js` - Standard WASM runtime (fallback)

### 5. Vite Configuration Updates
Added manual chunking for onnxruntime-web to optimize loading:

```typescript
build: {
  target: 'esnext',
  rollupOptions: {
    output: {
      manualChunks: {
        'pdf-worker': ['pdfjs-dist/build/pdf.worker.mjs'],
        'onnxruntime-web': ['onnxruntime-web'], // NEW
      },
    },
  },
}
```

### 6. Improved Error Handling
Enhanced initialization with better error messages and automatic fallback:
- Tries WebGPU first if available
- Automatically falls back to WASM if WebGPU fails
- Provides clear diagnostic messages

## Browser Requirements

### WebGPU Support
WebGPU is supported in:
- **Chrome 113+** (default)
- **Edge 112+** (default)
- **Firefox Nightly** (with `dom.webgpu.enabled` flag set to `true`)
- **Safari Technology Preview** (experimental)

### Server Headers for WebGPU
The Vite dev server already includes the required headers for SharedArrayBuffer support:

```typescript
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
}
```

These are necessary for WebGPU to work properly with shared memory.

## Testing WebGPU

### Automated Test Page
A test page is available at `public/test-webgpu.html` (or `dist/test-webgpu.html` after build).

**To test:**
1. Start the dev server: `npm run dev`
2. Open: `http://localhost:5173/test-webgpu.html`
3. Click "Test WASM Backend" to verify WASM works
4. Click "Test WebGPU Backend" to verify WebGPU acceleration
5. Click "Test Both Backends" to run both tests

The test page will show:
- Browser WebGPU support status
- ONNX Runtime configuration
- Whether each backend can successfully load the DocLayout-YOLO model
- Detailed error messages if something fails

### Manual Testing
You can also test by using the main application:
1. Enable "Scientific Paper Mode" toggle
2. Upload a PDF file
3. Check the browser console for messages like:
   - `[LayoutAnalyzer] ✓ Model loaded successfully with WebGPU acceleration`
   - `[LayoutAnalyzer]   Backend: WebGPU (JSEP)`
   - Or if falling back: `[LayoutAnalyzer] WebGPU initialization failed, falling back to WASM`

## Troubleshooting

### "WebGPU not supported"
- Update to Chrome 113+ or Edge 112+
- For Firefox, enable the `dom.webgpu.enabled` flag in `about:config`
- For Safari, use Safari Technology Preview

### "Failed to load layout analysis model"
- Ensure the model file exists at `/models/doclayout-yolo.onnx`
- Check that all JSEP WASM files are in `/onnxruntime/`:
  - `ort-wasm-simd.jsep.wasm`
  - `ort-wasm-simd-threaded.jsep.wasm`
- Verify the WASM files are being served correctly (check Network tab in DevTools)

### "WebGPU initialization failed"
Common causes:
1. **Missing JSEP WASM files** - Ensure they're copied to `public/onnxruntime/`
2. **Browser doesn't support required WebGPU features** - Update browser
3. **Model not compatible with WebGPU operators** - The model should work; check console for specific errors
4. **CORS issues** - Make sure you're using the dev server or proper static file hosting

### Large Bundle Size
The JSEP WASM files are large (~25-27MB each). This is expected. They are lazy-loaded only when using AI Scientific mode.

## File Structure

```
public/
├── onnxruntime/
│   ├── ort-wasm-simd.jsep.wasm          (25 MB)
│   ├── ort-wasm-simd-threaded.jsep.wasm (25 MB)
│   ├── ort-wasm-simd-threaded.jsep.mjs (JS module)
│   ├── ort.webgpu.min.js                (28 KB)
│   ├── ort.wasm-core.min.js             (core runtime)
│   ├── ort.wasm.min.js                  (WASM fallback)
│   └── [other WASM files for fallback]
├── models/
│   └── doclayout-yolo.onnx              (model file)
└── test-webgpu.html                     (test page)

dist/
├── assets/
│   ├── onnxruntime-web-*.js             (bundled)
│   ├── ort-wasm-simd-threaded.jsep-*.wasm
│   └── [other bundled assets]
└── test-webgpu.html                     (copied)
```

## Performance Expectations

- **WebGPU:** 2-5x faster inference compared to WASM for the DocLayout-YOLO model
- **WASM:** Reliable fallback, works in all modern browsers
- **First load:** May take 1-2 seconds to initialize the model (download WASM, compile shaders)
- **Subsequent inferences:** Much faster with WebGPU

## Next Steps

1. Test with various PDF files (scanned, multi-column, tables)
2. Monitor performance with large documents
3. Consider adding progress indicators for model loading
4. Test browser compatibility across Chrome, Edge, Firefox Nightly

## References

- [ONNX Runtime WebGPU Documentation](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html)
- [JSEP Build Configuration](https://onnxruntime.ai/docs/build/web.html)
- [Deploying ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/deploy.html)
- [WebGPU Status](https://caniuse.com/webgpu)

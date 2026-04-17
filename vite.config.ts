import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), nodePolyfills({
    include: ['buffer', 'stream', 'util', 'process', 'events', 'path', 'fs'],
    globals: {
      Buffer: true,
      global: true,
      process: true,
    },
  }), cloudflare()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-worker': ['pdfjs-dist/build/pdf.worker.mjs'],
        },
      },
    },
  },
})
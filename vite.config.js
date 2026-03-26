import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        nodePolyfills({
            // Include specific polyfills needed for docling-sdk
            include: ['process', 'buffer', 'util', 'events', 'stream', 'path'],
            // Exclude globals that might conflict
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
        }),
    ],
    optimizeDeps: {
        exclude: ['lucide-react'],
    },
    resolve: {
        alias: {
            buffer: 'buffer',
        },
    },
    define: {
        'process.env': {},
        'process': '{}',
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
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The frontend never talks to ml-service directly — every call goes to the
 * backend under `/api`, which proxies CV parsing and scoring onwards. In dev
 * that means one proxy rule; in the container nginx does the same job.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  preview: { port: 4173 },
  build: {
    outDir: 'dist',
    // Source maps make the shipped bundle debuggable; there is nothing secret
    // in it (no accounts, no keys — the API is entirely public).
    sourcemap: true,
  },
});

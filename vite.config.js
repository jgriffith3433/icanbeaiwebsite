import { defineConfig } from 'vite';

// Plain static site: index.html loads day.config.js and js/*.js as classic scripts.
export default defineConfig({
  base: './',
  appType: 'mpa',
  server: {
    host: '0.0.0.0',
    port: 8092,
    strictPort: true,
    open: false,
    headers: { 'Cache-Control': 'no-store' }, // always serve fresh files while testing
  },
  preview: {
    port: 8093,
    strictPort: true,
    headers: { 'Cache-Control': 'no-store' },
  },
});

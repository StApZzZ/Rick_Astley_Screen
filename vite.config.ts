import { defineConfig } from 'vite';

export default defineConfig({
  // Relative URLs everywhere: the build works at "/", under any sub-path
  // behind a reverse proxy, and copied into an existing site's folder.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});

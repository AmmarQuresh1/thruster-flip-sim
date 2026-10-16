import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 inlines everything into one HTML file (used for the in-chat preview build).
export default defineConfig({
  base: './',
  plugins: process.env.SINGLE ? [viteSingleFile()] : [],
  build: { outDir: process.env.SINGLE ? 'dist-single' : 'dist', target: 'es2022', chunkSizeWarningLimit: 4000 },
});

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative asset paths — required so the packaged app's built index.html
  // (loaded via loadFile(), an effectively file://-rooted context) can
  // resolve its own JS/CSS/font assets. The default root-absolute paths
  // (e.g. /assets/x.js) only work when served from an actual server root,
  // which the dev server provides but a packaged app does not.
  base: './',
  server: {
    port: 9999,
  },
  build: {
    outDir: 'dist',
    cssMinify: false,
  },
})

import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2018',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})

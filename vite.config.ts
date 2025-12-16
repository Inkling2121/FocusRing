import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'renderer',
  base: './',  // Use relative paths for Electron
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true
  }
})

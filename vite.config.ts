import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'renderer',
  base: './',  // Use relative paths for Electron
  server: {
    host: '127.0.0.1',  // Bind to IPv4 localhost explicitly
    port: 5173,
    strictPort: true  // Fail if port is already in use
  },
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true
  }
})

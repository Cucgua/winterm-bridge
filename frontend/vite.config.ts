import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true
      },
      '/ttyd': {
        target: 'ws://localhost:8080',
        ws: true
      }
    }
  },
  build: {
    outDir: '../backend/cmd/server/static',
    emptyOutDir: true
  }
})

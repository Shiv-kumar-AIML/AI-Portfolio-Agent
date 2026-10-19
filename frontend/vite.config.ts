import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In dev the api gateway runs on :5010 (or :3060 via docker-compose.local.yml); proxying /api keeps
// the browser same-origin, exactly like production behind nginx.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5010'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
})

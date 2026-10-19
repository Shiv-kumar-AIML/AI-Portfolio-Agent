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
    // Vite rejects unknown Host headers (DNS-rebinding protection). Allow ngrok tunnels so the dev
    // site can be shared for a demo — only ngrok's domains, not every host.
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ngrok.dev'],
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
})

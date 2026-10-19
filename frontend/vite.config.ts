import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In dev the api gateway runs on :5010 (or :3060 via docker-compose.local.yml); proxying /api keeps
// the browser same-origin, exactly like production behind nginx.
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5010'
// Tunnels used to share the site for a demo (Vite rejects unknown Host headers otherwise).
const tunnelHosts = ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.ngrok.dev']
const apiProxy = { '/api': { target: apiTarget, changeOrigin: true } }

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    allowedHosts: tunnelHosts,
    proxy: apiProxy,
  },
  // `npm run share`: the production build (a few compressed files) — much faster through a tunnel
  // than the dev server's hundreds of unbundled modules.
  preview: {
    port: 4174,
    allowedHosts: tunnelHosts,
    proxy: apiProxy,
  },
})

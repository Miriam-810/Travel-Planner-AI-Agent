import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The trip island (Three.js) is one lazily loaded ~0.9 MB chunk, only fetched on trip pages.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // Forward /api to the FastAPI dev server so the browser sees one origin.
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  build: {
    // hls.js vive en un chunk lazy aislado (~509 kB, ~157 kB gzip).
    // El código inicial permanece por debajo de 400 kB.
    chunkSizeWarningLimit: 550,
  },
  server: {
    strictPort: false,
    port: 5173,
    host: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
})

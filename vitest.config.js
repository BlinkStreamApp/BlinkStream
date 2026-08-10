// Configuracion central de Vitest para BlinkStream.
// - jsdom: necesitamos DOM para React Testing Library (hooks, componentes).
// - globals: describe/it/expect disponibles sin import (estilo Jest).
// - setupFiles: matching extension es para tests E2E o no-DOM.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  // Vitest 4 y el plugin de React comparten el runtime JSX automático.
  // Pre-bundlearlo mantiene rápido el arranque de las suites React.
  optimizeDeps: {
    include: ['react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'],
  },
  resolve: {
    alias: {
      // Alias raiz para imports absolutos desde tests.
      '~': path.resolve(__dirname, 'src'),
      // Stubs de plugins de Tauri que el codigo importa dinamicamente
      // (vite los analiza estaticamente aunque sean strings de runtime).
      // Si no, vitest falla con "Failed to resolve import" al cargar.
      '@tauri-apps/plugin-log': path.resolve(__dirname, 'src/test/__mocks__/plugin-log.js'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
    // Excluimos los tests de Deno en supabase/functions/ (esos son para el
    // runtime de Supabase, no para vitest en jsdom). Tambien excluimos
    // build artifacts.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      'supabase/**', // tests Deno, no vitest
      'scripts/build-updater-manifest.test.mjs', // suite del runner nativo de Node
    ],
  },
})

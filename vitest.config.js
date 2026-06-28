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
  // FIX WT-20260628-31: vitest 2.x + @vitejs/plugin-react 6.x tiene un bug
  // conocido por el cual los archivos `.test.jsx` NO reciben la inyeccion
  // del automatic JSX runtime, mientras que los `.jsx` normales si. Esto
  // provoca `ReferenceError: React is not defined` al renderizar componentes
  // en tests (afecto a 11 casos en channelpoints.fixes.test.jsx).
  //
  // Workaround limpio: forzar `esbuild.jsx: 'automatic'` para que vitest
  // haga la transformacion del JSX con jsx-runtime en lugar de esperar a
  // que el plugin de React la aplique. Asi nos ahorramos tocar todos los
  // tests con `import React from 'react'` y la build sigue limpia.
  //
  // Ademas, pre-bundleamos `react/jsx-runtime` y `react-dom/client` para
  // que el automatic runtime este disponible en el optimizeDeps y no se
  // quede fuera del cache. Esto tambien acelera el arranque de los tests.
  esbuild: {
    jsx: 'automatic',
  },
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
    ],
  },
})

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '**/src-tauri/target/**', 'coverage/**']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-empty': 'off',
      // Permitimos `void` en handlers de error y `||=` etc. (ES2025)
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  // Tests y mocks: declarar globals de vitest + node de fondo.
  {
    files: ['**/*.test.{js,jsx}', '**/__mocks__/**/*.{js,jsx}', 'vitest.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        // Vitest globals (inyectados por la config `globals: true`).
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        beforeAll: 'readonly',
        afterEach: 'readonly',
        afterAll: 'readonly',
        suite: 'readonly',
      },
    },
    rules: {
      // En los mocks de tauri solemos usar parámetros posicionales aunque
      // no los leamos — desactivamos la regla para mantener el código simple.
      'no-unused-vars': 'off',
    },
  },
])

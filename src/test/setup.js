// Setup global para todos los tests.
// - Carga matchers de @testing-library/jest-dom (toBeInTheDocument, etc).
// - Mockea window.matchMedia (jsdom no lo trae y React 19 lo usa en providers).
// - Limpia localStorage / sessionStorage entre tests para evitar fugas.
// - Registra mocks globales para los plugins de Tauri que se importan
//   dinamicamente (vite los intenta resolver estaticamente).
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom no implementa matchMedia; lo stub para evitar warnings de React.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// jsdom no implementa scrollTo; algunos componentes lo llaman en mount.
if (!window.HTMLElement.prototype.scrollTo) {
  window.HTMLElement.prototype.scrollTo = vi.fn()
}

// Mocks globales de los modulos de Tauri. Se aplican a TODOS los tests
// que importen estos modulos (ya sea directa o transitivamente).
// Usamos vi.mock con factory y un sentinel para forzar reemplazo.
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(async () => ({
    isFocused: vi.fn(async () => false),
    show: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
  })),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
}))

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(async () => '0.0.0-test'),
  getName: vi.fn(async () => 'BlinkStream'),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(async () => null),
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(async () => {}),
  exit: vi.fn(async () => {}),
}))

// Cada test empieza con storage limpio.
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

// Tras cada test, desmontar componentes de React Testing Library
// para evitar renders zombi entre casos.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Mock global de @tauri-apps/api/* y @tauri-apps/plugin-*.
// Vitest resuelve el alias `~tauri` automaticamente (ver vitest.config.js).
// Esto evita que los modulos reales intenten acceder al bridge IPC de Tauri
// (que no existe en jsdom) durante los tests.

export const invoke = vi.fn(async (cmd) => {
  // Respuestas realistas por defecto para los comandos que el proyecto usa.
  switch (cmd) {
    case 'get_secret':
      return null
    case 'store_secret':
      return undefined
    case 'delete_secret':
      return undefined
    default:
      return undefined
  }
})

export const convertFileSrc = vi.fn((path) => path)

export class TauriEvent {
  static get EVENT() { return { WINDOW_FOCUS: 'tauri://focus', WINDOW_BLUR: 'tauri://blur' } }
}

export const listen = vi.fn(async () => () => {})
export const emit = vi.fn(async () => {})

export async function getCurrentWindow() {
  return {
    isFocused: vi.fn(async () => false),
    show: vi.fn(async () => {}),
    hide: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    setFocus: vi.fn(async () => {}),
    label: 'main',
  }
}

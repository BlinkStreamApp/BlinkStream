

export const invoke = vi.fn(async (cmd) => {

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

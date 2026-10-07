import { afterEach, describe, expect, it } from 'vitest'
import { isTauri } from './tauriEnv'

describe('tauriEnv', () => {
  afterEach(() => {
    delete globalThis.isTauri
    delete window.__TAURI_INTERNALS__
  })

  it('uses the official Tauri runtime flag', () => {
    globalThis.isTauri = true

    expect(isTauri()).toBe(true)
  })

  it('keeps compatibility with the injected IPC internals', () => {
    window.__TAURI_INTERNALS__ = {}

    expect(isTauri()).toBe(true)
  })
})

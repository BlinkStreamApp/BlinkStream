

export function isTauri() {
  return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
}

export function isTauriDev() {
  return isTauri() && window.__TAURI_INTERNALS__?.metadata?.dev === true
}

export function safeOpenUrl(url, focus = true) {
  if (!url || typeof url !== 'string') return null
  if (isTauri()) {

    try {

      return import('@tauri-apps/plugin-opener')
        .then(({ openUrl }) => openUrl(url))
        .then(() => null)
        .catch(() => openViaGlobalThis(url, focus))
    } catch {
      return openViaGlobalThis(url, focus)
    }
  }
  return openViaGlobalThis(url, focus)
}

function openViaGlobalThis(url, focus) {
  if (typeof globalThis === 'undefined' || typeof globalThis.open !== 'function') return null
  const w = globalThis.open(url, '_blank', 'noopener,noreferrer')
  if (focus && w && typeof w.focus === 'function') {
    try { w.focus() } catch {  }
  }
  return w
}

// Stub para @tauri-apps/plugin-log. Algunos archivos del proyecto hacen
// `import('@tauri-apps/plugin-log')` como cadena dinamica (vite la analiza
// estaticamente, asi que necesitamos un archivo resoluble).
// Lo expone como no-op functions; tests que no dependen de el no se enteran.
export const error = () => {}
export const warn = () => {}
export const info = () => {}
export const debug = () => {}
export const trace = () => {}
export default { error, warn, info, debug, trace }

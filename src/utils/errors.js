// ============================================================
// Manejo de errores unificado (M-6 / Auditoria WT-20260628-01)
// ============================================================
// Estandariza el logging, los codigos de error y los mensajes
// user-friendly en toda la app. Antes habia un patron mixto:
// try/catch silenciosos, console.error sin contexto, .catch()
// con arrow functions vacias, etc.
//
// AHORA: tres primitivas:
//   - AppError           → clase con codigo + contexto
//   - logError(err, ctx) → console estructurado + Tauri log
//   - formatUserMessage  → mensaje user-friendly segun codigo
//
// Uso recomendado:
//   try { await somethingRisky() }
//   catch (err) { logError(err, { component: 'Chat', action: 'connect' }) }
// ============================================================

// Codigos de error tipados. Strings, no enums, porque JS no los tiene
// nativos. Cualquier codigo nuevo debe añadirse aqui Y a formatUserMessage.
export const ErrorCode = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  AUTH_FAILED: 'AUTH_FAILED',
  STREAM_DOWN: 'STREAM_DOWN',
  RECORDING_FAILED: 'RECORDING_FAILED',
  CHANNEL_POINTS_UNAVAILABLE: 'CHANNEL_POINTS_UNAVAILABLE',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  STORAGE_ERROR: 'STORAGE_ERROR',
  // Channel Points (Helix /channel_points/*) — WT-20260628-14
  CHANNEL_POINTS_LIST_FAILED: 'CHANNEL_POINTS_LIST_FAILED',
  CHANNEL_POINTS_CREATE_FAILED: 'CHANNEL_POINTS_CREATE_FAILED',
  CHANNEL_POINTS_UPDATE_FAILED: 'CHANNEL_POINTS_UPDATE_FAILED',
  CHANNEL_POINTS_DELETE_FAILED: 'CHANNEL_POINTS_DELETE_FAILED',
  CHANNEL_POINTS_REDEEM_FAILED: 'CHANNEL_POINTS_REDEEM_FAILED',
  CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED: 'CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED',
  CHANNEL_POINTS_APP_TOKEN_FAILED: 'CHANNEL_POINTS_APP_TOKEN_FAILED',
  CHANNEL_POINTS_INSUFFICIENT_BALANCE: 'CHANNEL_POINTS_INSUFFICIENT_BALANCE',
  // Moderation (Helix /moderation/*) — M1 / WT-20260628-13
  MOD_ACTION_FAILED: 'MOD_ACTION_FAILED',
  UNKNOWN: 'UNKNOWN',
}

/**
 * Error estandar de la aplicacion.
 * Extiende Error nativo anadiendo `code` y `context` para que el log
 * estructurado (logError) pueda correlacionar facilmente.
 *
 * @param {string} code           - Uno de ErrorCode.*
 * @param {string} message        - Mensaje tecnico (en ingles) para logs
 * @param {object} [context]      - Contexto extra: component, action, etc.
 */
export class AppError extends Error {
  constructor(code, message, context = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.context = context
    // Capturamos stack solo si existe (algunos Error polyfills no lo setean)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AppError)
    }
  }
}

// Helper: detecta si estamos en Tauri (para mandar logs al backend).
// Re-exportado desde tauriEnv para tener una sola fuente de verdad.
import { isTauri } from './tauriEnv'

// Helper interno: serializa contexto para que se vea claro en consola.
function fmtContext(context) {
  if (!context || typeof context !== 'object') return ''
  try {
    return ' ' + JSON.stringify(context, (_k, v) => {
      if (v instanceof Error) return `${v.name}: ${v.message}`
      return v
    })
  } catch { return '' }
}

/**
 * Loggea un error a consola con formato estructurado. Si Tauri esta
 * disponible, intenta mandar al backend via @tauri-apps/plugin-log
 * (lazy import para no romper builds sin el plugin).
 *
 * @param {Error|AppError|unknown} err     - Error a loggear
 * @param {object}                 context - { component, action, ... }
 */
export function logError(err, context = {}) {
  const code = err?.code || ErrorCode.UNKNOWN
  const message = err?.message || String(err)
  const stack = err?.stack || ''
  console.error(
    `%c[BlinkStream]%c ${code}%c ${message}%c${fmtContext({ ...context, stack: stack.split('\n').slice(0, 3).join(' | ') })}`,
    'color:#9146ff;font-weight:bold',
    'color:#f59e0b;font-weight:bold',
    'color:inherit',
    'color:#6b6b80;font-style:italic',
  )

  // Si Tauri expone el plugin de log, mandamos al backend via dynamic
  // import. Lo hacemos lazy y opacamos el specifier con `new Function`
  // para que el bundler (rolldown) NO intente resolver el modulo
  // estaticamente: si @tauri-apps/plugin-log no esta instalado (p.ej.
  // dev web puro), el build peta. Asi el require solo ocurre en runtime.
  if (isTauri()) {
    try {
      const dynamicImport = new Function('m', 'return import(m)')
      dynamicImport('@tauri-apps/plugin-log')
        .then(({ error: tauriError }) => {
          try { tauriError(`[${code}] ${message} ${JSON.stringify(context)}`) } catch { /* ignore */ }
        })
        .catch(() => { /* plugin no instalado, OK */ })
    } catch { /* ignore */ }
  }
}

/**
 * Traduce un error a un mensaje user-friendly en espanol, segun su
 * codigo. Si no reconoce el codigo, devuelve un mensaje generico.
 *
 * @param {Error|AppError|unknown} err
 * @returns {string} Mensaje apto para mostrar en UI
 */
export function formatUserMessage(err) {
  const code = err?.code || ErrorCode.UNKNOWN
  switch (code) {
    case ErrorCode.NETWORK_ERROR:
      return 'Sin conexion a internet. Revisa tu red e intentalo de nuevo.'
    case ErrorCode.AUTH_FAILED:
      return 'No pudimos iniciar sesion con Twitch. Intentalo de nuevo.'
    case ErrorCode.STREAM_DOWN:
      return 'El canal esta offline o no responde. Vuelve mas tarde.'
    case ErrorCode.RECORDING_FAILED:
      return 'No se pudo iniciar la grabacion. Comprueba el espacio en disco.'
    case ErrorCode.CHANNEL_POINTS_UNAVAILABLE:
      return 'Las recompensas del canal no estan disponibles ahora mismo.'
    case ErrorCode.CHANNEL_POINTS_LIST_FAILED:
      return 'No se pudieron cargar las recompensas del canal.'
    case ErrorCode.CHANNEL_POINTS_CREATE_FAILED:
      return 'No se pudo crear la recompensa. Revisa los datos e intentalo de nuevo.'
    case ErrorCode.CHANNEL_POINTS_UPDATE_FAILED:
      return 'No se pudo actualizar la recompensa. Intentalo de nuevo.'
    case ErrorCode.CHANNEL_POINTS_DELETE_FAILED:
      return 'No se pudo eliminar la recompensa. Intentalo de nuevo.'
    case ErrorCode.CHANNEL_POINTS_REDEEM_FAILED:
      return 'No se pudo canjear esta recompensa. Por políticas de Twitch, las recompensas del streamer solo pueden canjearse en su web oficial.'
    case ErrorCode.CHANNEL_POINTS_REDEMPTION_FULFILL_FAILED:
      return 'No se pudo aprobar/rechazar la redencion. Intentalo de nuevo.'
    case ErrorCode.CHANNEL_POINTS_APP_TOKEN_FAILED:
      return 'No se pudo autenticar la app con Twitch. Revisa tu configuracion.'
    case ErrorCode.CHANNEL_POINTS_INSUFFICIENT_BALANCE:
      return 'No tienes suficientes puntos del canal para esta recompensa.'
    case ErrorCode.MOD_ACTION_FAILED:
      return 'La accion de moderacion fallo. Verifica tus permisos e intentalo de nuevo.'
    case ErrorCode.TOKEN_EXPIRED:
      return 'Tu sesion expiro. Vuelve a iniciar sesion.'
    case ErrorCode.STORAGE_ERROR:
      return 'No se pudo guardar en el almacenamiento local.'
    case ErrorCode.UNKNOWN:
    default:
      return 'Algo salio mal. Intentalo de nuevo o reinicia la app.'
  }
}

// ============================================================
// i18n.js — Traducciones es/en (M1 / WT-20260628-13)
// ============================================================
// Antes: solo 40 keys inline.
// Ahora: ~70 keys con namespace `mod.*` para M1, `chat.*` para
// refinamientos futuros, y resto de keys legacy preservadas.
//
// Uso: `import { useT } from '../utils/i18n'; const t = useT(); t('mod.tab.viewers')`
// Si una key no existe en el idioma actual, cae a `es` y finalmente
// al string de la key (mismo patron que antes).
// ============================================================

const translations = {
  es: {
    // Legacy (no tocar para no romper traducciones existentes)
    search: 'Buscar canal...',
    settings: 'Configuración',
    about: 'Acerca de BlinkStream',
    login: 'Iniciar sesión',
    logout: 'Cerrar sesión',
    connected: 'Conectado',
    offline: 'Offline',
    live: 'En vivo',
    viewers: 'viewers',
    watch: 'Ver ahora',
    favourites: 'Favoritos',
    recent: 'Vistos Recientemente',
    liveChannels: 'Canales en vivo',
    topGames: 'Juegos populares',
    noVods: 'No se encontraron VODs',
    noClips: 'No se encontraron clips',
    loading: 'Cargando...',
    error: 'Error',
    retry: 'Reintentar',
    back: 'Volver',
    send: 'Enviar',
    chat: 'Chat',
    mute: 'Silenciar',
    recording: 'REC',
    quality: 'Calidad',
    volume: 'Volumen',
    theatre: 'Teatro',
    fullscreen: 'Fullscreen',
    pip: 'Picture-in-Picture',
    audioOnly: 'Solo audio',
    clips: 'Clips',
    vods: 'VODs',
    openBrowser: 'Abrir en navegador',
    record: 'Grabar stream',
    stopRecord: 'Detener grabación',
    accentColor: 'Color de acento',
    fontSize: 'Tamaño',
    hideBots: 'Ocultar bots',
    emoteFavs: 'Favoritos',
    emoteRecent: 'Recientes',
    emoteChannel: 'Del canal',
    emoteGlobal: 'Globales',

    // Moderation (M1)
    'mod.tab.viewers': 'Viewers',
    'mod.tab.mods': 'Mods',
    'mod.tab.vips': 'VIPs',
    'mod.tab.bans': 'Bans',
    'mod.tab.timeouts': 'Timeouts',
    'mod.tab.settings': 'Ajustes',
    'mod.action.ban': 'Banear',
    'mod.action.unban': 'Desbanear',
    'mod.action.timeout': 'Timeout',
    'mod.action.untimeout': 'Quitar timeout',
    'mod.action.mod': 'Promover a mod',
    'mod.action.unmod': 'Quitar mod',
    'mod.action.vip': 'Añadir VIP',
    'mod.action.unvip': 'Quitar VIP',
    'mod.action.delete': 'Borrar mensaje',
    'mod.reason.placeholder': 'Describe el motivo...',
    'mod.confirm.antiFatFinger': 'Escribe el username para confirmar',
    'mod.toast.success': 'Acción aplicada',
    'mod.toast.failed': 'La acción falló',
    'mod.rateLimit.exceeded': 'Demasiadas acciones. Espera unos segundos.',
    'mod.empty.viewers': 'No hay viewers aún.',
    'mod.empty.mods': 'Este canal aún no tiene moderadores.',
    'mod.empty.vips': 'Este canal aún no tiene VIPs.',
    'mod.empty.bans': 'No hay baneados. ¡Bien!',
    'mod.empty.timeouts': 'No hay timeouts activos.',
    'mod.role.broadcaster': 'BROADCASTER',
    'mod.role.mod': 'MOD',
    'mod.role.vip': 'VIP',
    'mod.role.viewer': 'VIEWER',
    'mod.unauthorized': 'No tienes permisos de moderador en este canal.',

    // Grabacion global (G1 / WT-20260628-16)
    'rec.global.off': 'Grabacion: OFF',
    'rec.global.armed': 'Grabacion: ARMED',
    'rec.global.on': 'Grabando',
    'rec.toggle.tooltip.off': 'Activar grabacion (OFF)',
    'rec.toggle.tooltip.armed': 'Pasar a ON (ARMED)',
    'rec.toggle.tooltip.on': 'Desactivar grabacion (ON)',
    'rec.start.success': 'Grabacion iniciada',
    'rec.stop.success': 'Grabacion detenida',
    'rec.drawer.title': 'Grabaciones activas',
    'rec.drawer.empty': 'No hay grabaciones activas',
    'rec.drawer.close': 'Cerrar',
    'rec.drawer.refresh': 'Refrescar',
    'rec.disk.free': 'Disco libre',
    'rec.disk.aria': 'Espacio en disco usado',
    'rec.disk.unknown': 'Espacio en disco desconocido',
    'rec.list.unknown': 'Canal en grabacion',
    'rec.list.stop': 'Stop',
  },
  en: {
    // Legacy
    search: 'Search channel...',
    settings: 'Settings',
    about: 'About BlinkStream',
    login: 'Log in',
    logout: 'Log out',
    connected: 'Connected',
    offline: 'Offline',
    live: 'Live',
    viewers: 'viewers',
    watch: 'Watch now',
    favourites: 'Favorites',
    recent: 'Recently Watched',
    liveChannels: 'Live Channels',
    topGames: 'Top Games',
    noVods: 'No VODs found',
    noClips: 'No clips found',
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry',
    back: 'Back',
    send: 'Send',
    chat: 'Chat',
    mute: 'Mute',
    recording: 'REC',
    quality: 'Quality',
    volume: 'Volume',
    theatre: 'Theatre',
    fullscreen: 'Fullscreen',
    pip: 'Picture-in-Picture',
    audioOnly: 'Audio only',
    clips: 'Clips',
    vods: 'VODs',
    openBrowser: 'Open in browser',
    record: 'Record stream',
    stopRecord: 'Stop recording',
    accentColor: 'Accent color',
    fontSize: 'Font size',
    hideBots: 'Hide bots',
    emoteFavs: 'Favorites',
    emoteRecent: 'Recent',
    emoteChannel: 'Channel',
    emoteGlobal: 'Global',

    // Moderation (M1)
    'mod.tab.viewers': 'Viewers',
    'mod.tab.mods': 'Mods',
    'mod.tab.vips': 'VIPs',
    'mod.tab.bans': 'Bans',
    'mod.tab.timeouts': 'Timeouts',
    'mod.tab.settings': 'Settings',
    'mod.action.ban': 'Ban',
    'mod.action.unban': 'Unban',
    'mod.action.timeout': 'Timeout',
    'mod.action.untimeout': 'Remove timeout',
    'mod.action.mod': 'Add as mod',
    'mod.action.unmod': 'Remove mod',
    'mod.action.vip': 'Add VIP',
    'mod.action.unvip': 'Remove VIP',
    'mod.action.delete': 'Delete message',
    'mod.reason.placeholder': 'Describe the reason...',
    'mod.confirm.antiFatFinger': 'Type the username to confirm',
    'mod.toast.success': 'Action applied',
    'mod.toast.failed': 'Action failed',
    'mod.rateLimit.exceeded': 'Too many actions. Wait a few seconds.',
    'mod.empty.viewers': 'No viewers yet.',
    'mod.empty.mods': 'This channel has no moderators yet.',
    'mod.empty.vips': 'This channel has no VIPs yet.',
    'mod.empty.bans': 'No banned users. Nice!',
    'mod.empty.timeouts': 'No active timeouts.',
    'mod.role.broadcaster': 'BROADCASTER',
    'mod.role.mod': 'MOD',
    'mod.role.vip': 'VIP',
    'mod.role.viewer': 'VIEWER',
    'mod.unauthorized': 'You do not have moderator permissions on this channel.',

    // Global recording (G1 / WT-20260628-16)
    'rec.global.off': 'Recording: OFF',
    'rec.global.armed': 'Recording: ARMED',
    'rec.global.on': 'Recording',
    'rec.toggle.tooltip.off': 'Enable recording (OFF)',
    'rec.toggle.tooltip.armed': 'Switch to ON (ARMED)',
    'rec.toggle.tooltip.on': 'Disable recording (ON)',
    'rec.start.success': 'Recording started',
    'rec.stop.success': 'Recording stopped',
    'rec.drawer.title': 'Active recordings',
    'rec.drawer.empty': 'No active recordings',
    'rec.drawer.close': 'Close',
    'rec.drawer.refresh': 'Refresh',
    'rec.disk.free': 'Free disk',
    'rec.disk.aria': 'Used disk space',
    'rec.disk.unknown': 'Disk space unknown',
    'rec.list.unknown': 'Channel being recorded',
    'rec.list.stop': 'Stop',
  },
}

let currentLang = (() => {
  try { return localStorage.getItem('blinkstream_lang') || 'es' }
  catch { return 'es' }
})()

export function setLanguage(lang) {
  currentLang = lang
  try { localStorage.setItem('blinkstream_lang', lang) } catch { /* ignore */ }
}

export function getLanguage() {
  return currentLang
}

/**
 * Traductor. Si la key no existe en el idioma actual, cae a es y
 * finalmente al string de la key (no rompe UI).
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  return translations[currentLang]?.[key] || translations.es[key] || key
}

/**
 * Hook-friendly: devuelve la funcion t. Si cambia el idioma, el componente
 * se re-renderiza solo si pasas una version. Para casos simples, usa t
 * directamente. Los consumidores existentes (Settings, Chat) ya importan
 * useT de este modulo.
 */
export function useT() {
  return t
}

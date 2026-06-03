const translations = {
  es: {
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
  },
  en: {
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
  },
}

let currentLang = localStorage.getItem('blinkstream_lang') || 'es'

export function setLanguage(lang) {
  currentLang = lang
  localStorage.setItem('blinkstream_lang', lang)
}

export function getLanguage() {
  return currentLang
}

export function t(key) {
  return translations[currentLang]?.[key] || translations.es[key] || key
}

export function useT() {
  return t
}

export function formatPlayerError(rawError, channelName, t) {
  if (!rawError) return null
  const str = String(rawError)
  const lower = str.toLowerCase()
  const details = str.replace(/^No se pudo cargar [^:]+:\s*/i, '').replace(/Streamlink fallo:\s*error:\s*/i, '')
  if (['no playable streams found', 'offline', 'no streams found', 'stream is offline', 'is not live'].some(reason => lower.includes(reason))) {
    const rawTitle = t ? t('player.offlineTitle', '{channel} está Offline') : '{channel} está Offline'
    return {
      isOffline: true,
      title: rawTitle.replace('{channel}', channelName || (t ? t('player.channelDefault', 'El canal') : 'El canal')),
      desc: t ? t('player.offlineDesc', 'Este canal no está transmitiendo en directo en este momento.') : 'Este canal no está transmitiendo en directo en este momento.',
    }
  }
  return {
    isOffline: false,
    title: t ? t('player.playbackError', 'Error de reproducción') : 'Error de reproducción',
    desc: details === 'VIDEO_SOURCE_UNAVAILABLE'
      ? (t ? t('player.videoSourceUnavailable', 'No hay una fuente de vídeo accesible. Puede requerir iniciar sesión con la misma cuenta de Twitch en el chat oficial.') : 'No hay una fuente de vídeo accesible. Puede requerir iniciar sesión con la misma cuenta de Twitch en el chat oficial.')
      : details === 'VIDEO_CODEC_UNSUPPORTED'
      ? (t ? t('player.codecUnsupported', 'El sistema no admite el códec de vídeo de este canal (HEVC/AV1). Prueba otra calidad si está disponible.') : 'El sistema no admite el códec de vídeo de este canal (HEVC/AV1). Prueba otra calidad si está disponible.')
      : details,
  }
}

import { describe, expect, it } from 'vitest'
import { formatPlayerError } from './playerErrors'
import { featureLanguages, recentTranslations } from './recentTranslations'

describe('playback error presentation', () => {
  it.each(featureLanguages)('does not label playback failures as recording failures (%s)', language => {
    const t = (key, fallback) => recentTranslations[language][key] || fallback
    expect(formatPlayerError('No se pudo cargar live: Streamlink fallo: error: missing source', 'live', t))
      .toEqual({ isOffline: false, title: recentTranslations[language]['player.playbackError'], desc: 'missing source' })
    expect(formatPlayerError('VIDEO_CODEC_UNSUPPORTED', 'live', t).desc)
      .toBe(recentTranslations[language]['player.codecUnsupported'])
    expect(formatPlayerError('No se pudo cargar live: VIDEO_SOURCE_UNAVAILABLE', 'live', t))
      .toMatchObject({ isOffline: false, desc: recentTranslations[language]['player.videoSourceUnavailable'] })
  })
  it('keeps offline status distinct from codec or playback errors', () => {
    expect(formatPlayerError('No playable streams found', 'live')).toMatchObject({ isOffline: true, title: 'live está Offline' })
    expect(formatPlayerError('VIDEO_CODEC_UNSUPPORTED', 'live').isOffline).toBe(false)
    expect(formatPlayerError(null, 'live')).toBeNull()
  })
})

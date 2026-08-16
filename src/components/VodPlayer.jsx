import { useState, useEffect, useRef } from 'react'
import { PUBLIC_CLIENT_ID, getHeaders, sanitizeChannelForGraphQL } from '../utils/twitch'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../utils/tauriEnv'
import Hls from 'hls.js'
import PhosphorIcon from './icons/PhosphorIcon'
import TimeRangeSnipper from './clips/TimeRangeSnipper'

function parseDuration(dur) {
  if (!dur) return 0
  const h = dur.match(/(\d+)h/); const m = dur.match(/(\d+)m/); const s = dur.match(/(\d+)s/)
  return (h ? parseInt(h[1]) * 3600 : 0) + (m ? parseInt(m[1]) * 60 : 0) + (s ? parseInt(s[1]) : 0)
}

async function getVodM3u8(vodId) {

  if (!isTauri()) return null
  try {
    return await invoke('get_vod_manifest_url', { vodId: String(vodId) })
  } catch { return null }
}

async function fetchVods(channel) {
  let userId = null

  const login = sanitizeChannelForGraphQL(channel)
  if (!login) return []
  try {
    const gqlRes = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query($login: String!) { user(login: $login) { id } }',
        variables: { login },
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (gqlRes.ok) { const d = await gqlRes.json(); userId = d?.data?.user?.id }
  } catch {  }

  if (!userId) return []
  try {
    const headers = await getHeaders()
    const res = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive&first=20`, { headers, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data || []).map(v => ({ id: v.id, title: v.title, viewCount: v.view_count, lengthSeconds: parseDuration(v.duration), thumbnailUrl: v.thumbnail_url || '' }))
  } catch { return [] }
}

function VodVideo({ video }) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(null)
  const [showSnipper, setShowSnipper] = useState(false)

  useEffect(() => {
    let c = false
    getVodM3u8(video.id).then(u => { if (!c) u ? setUrl(u) : setError('No se pudo obtener el VOD') }).catch(() => { if (!c) setError('Error') })
    return () => { c = true; if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [video.id])

  useEffect(() => {
    const v = videoRef.current
    if (!url || !v) return
    if (Hls.isSupported()) {
      const hls = new Hls(); hlsRef.current = hls
      hls.loadSource(url); hls.attachMedia(v)
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url }
    else {
      setError('HLS no soportado')
    }
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [url])

  if (error) return (
    <div className="aspect-video bg-black rounded-xl flex items-center justify-center"><p className="text-text-secondary text-sm">{error}</p></div>
  )
  if (!url) return (
    <div className="aspect-video bg-black rounded-xl flex items-center justify-center"><div className="w-6 h-6 border-2 border-twitch border-t-transparent rounded-full animate-spin" /></div>
  )

  return (
    <div className="space-y-3">
      <video ref={videoRef} controls autoPlay playsInline className="w-full rounded-xl bg-black" style={{ aspectRatio: '16/9' }}
        poster={video.thumbnailUrl?.replace('%{width}', '1280').replace('%{height}', '720')} />

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowSnipper(p => !p)}
          className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${
            showSnipper
              ? 'bg-twitch text-white border-twitch shadow-md'
              : 'bg-bg-tertiary hover:bg-white/10 border-white/10 text-text-primary'
          }`}
        >
          <PhosphorIcon name="SlidersHorizontal" size={15} weight="bold" />
          <span>{showSnipper ? 'Ocultar Recortador' : 'Recortar y Descargar Fragmento de VOD'}</span>
        </button>
      </div>

      {showSnipper && (
        <TimeRangeSnipper
          mediaUrl={url}
          maxDuration={video.lengthSeconds || 3600}
          title={video.title}
          onClose={() => setShowSnipper(false)}
        />
      )}
    </div>
  )
}

export default function VodPlayer({ channel, onClose }) {
  const [vods, setVods] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeVod, setActiveVod] = useState(null)

  useEffect(() => {

    // eslint-disable-next-line react-hooks/set-state-in-effect
    let c = false; setLoading(true)
    fetchVods(channel).then(v => { if (!c) { setVods(v); setLoading(false) } }).catch(() => { if (!c) setLoading(false) })
    return () => { c = true }
  }, [channel])

  useEffect(() => { const h = (e) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])

  const fd = (s) => { const m = Math.floor(s / 60); const sec = s % 60; return `${m}:${sec.toString().padStart(2, '0')}` }
  const fv = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 animate-fade-in" onClick={onClose}>
      <div className="bg-bg-secondary border border-bg-tertiary/50 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-bg-tertiary/30 shrink-0">
          <h2 className="text-white text-sm font-bold">VODs de {channel}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer transition-colors">
            <PhosphorIcon name="X" size={18} weight="bold" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-twitch border-t-transparent rounded-full animate-spin" /></div>
          : vods.length === 0 ? <p className="text-text-muted text-sm text-center py-12">No se encontraron VODs</p>
          : activeVod ? (
            <div className="flex flex-col gap-3">
              <button onClick={() => setActiveVod(null)} className="text-twitch text-[12px] hover:underline cursor-pointer self-start">← Volver</button>
              <VodVideo video={activeVod} />
              <div className="flex items-center gap-3 text-[12px] text-text-secondary">
                <span className="font-semibold text-text-primary">{activeVod.title}</span>
                <span>{fv(activeVod.viewCount)} views</span>
                <span>{fd(activeVod.lengthSeconds)}</span>
              </div>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {vods.map(vod => (
                <button key={vod.id} onClick={() => setActiveVod(vod)} className="text-left group cursor-pointer card-hover rounded-lg overflow-hidden bg-bg-tertiary">
                  <div className="relative aspect-video overflow-hidden">
                    {vod.thumbnailUrl ? (
                      <img src={vod.thumbnailUrl.replace('%{width}', '320').replace('%{height}', '180')} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted/30">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
                      </div>
                    )}
                    <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[11px] px-1.5 py-0.5 rounded">{fd(vod.lengthSeconds)}</span>
                  </div>
                  <div className="p-2">
                    <p className="text-[12px] font-medium text-text-primary truncate leading-tight">{vod.title}</p>
                    <p className="text-[11px] text-text-muted mt-0.5">{fv(vod.viewCount)} views</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

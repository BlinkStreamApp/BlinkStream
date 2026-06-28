import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../utils/tauriEnv'
import { PUBLIC_CLIENT_ID } from '../utils/twitch'
import PhosphorIcon from './icons/PhosphorIcon'

function ClipVideo({ clip }) {
  const [videoUrl, setVideoUrl] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Reset de loading/error + fetch async. setState en effect
    // es el patron "fetch on prop change", no cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
     
    setError(null)
    // FIX WT-20260628-34: fuera de Tauri el invoke no tiene backend;
    // mostramos "No disponible" sin tirar el catch.
    if (!isTauri()) { setError('No disponible en este entorno'); setLoading(false); return }
    invoke('get_twitch_clip_url', { slug: clip.slug })
      .then(setVideoUrl)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [clip.slug])

  if (loading) return <div className="aspect-video bg-black rounded-xl flex items-center justify-center"><div className="w-7 h-7 border-2 border-twitch border-t-transparent rounded-full animate-spin" /></div>
  if (error || !videoUrl) return (
    <div className="aspect-video bg-black rounded-xl flex flex-col items-center justify-center gap-3 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] pointer-events-none">
        <svg width="120" height="120" viewBox="0 0 100 80" fill="currentColor" className="text-white"><path d="M10 10H55C68 10 75 18 75 27C75 36 68 42 55 42H28L10 10Z"/><path d="M18 46H58C71 46 78 54 78 63C78 72 71 80 58 80H10L18 46Z"/></svg>
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-twitch/10 blur-3xl rounded-full" />
      <PhosphorIcon name="Info" size={32} weight="regular" className="text-text-muted/40" />
      <p className="text-text-secondary text-sm">{error ? 'Error al cargar' : 'No disponible'}</p>
      {error && <p className="text-text-muted text-[12px] text-center px-6 max-w-xs truncate">{error}</p>}
    </div>
  )

  return (
    <div className="relative w-full bg-black rounded-xl overflow-hidden border border-bg-tertiary/50" style={{ aspectRatio: '16/9' }}>
      <video src={videoUrl} controls autoPlay playsInline className="absolute inset-0 w-full h-full object-contain" />
    </div>
  )
}

export default function ClipPlayer({ channel, onClose }) {
  const [clips, setClips] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeClip, setActiveClip] = useState(null)

  useEffect(() => {
    // Reset de loading al cambiar de canal + fetch. Patron canonico.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    let c = false; setLoading(true)
    fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-ID': PUBLIC_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ user(login: "${channel.toLowerCase()}") { clips(first: 20, criteria: { period: LAST_WEEK }) { edges { node { slug title viewCount durationSeconds thumbnailURL } } } } }` }),
      signal: AbortSignal.timeout(10000),
    }).then(r => r.ok ? r.json() : null).then(d => { if (!c) { setClips(d?.data?.user?.clips?.edges?.map(e => e.node) || []); setLoading(false) } }).catch(() => { if (!c) setLoading(false) })
    return () => { c = true }
  }, [channel])

  useEffect(() => { const h = (e) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])

  const fd = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`
  const fv = (n) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n)

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 animate-fade-in" onClick={onClose}>
      <div className="bg-bg-secondary border border-bg-tertiary/50 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-bg-tertiary/30 shrink-0">
          <h2 className="text-white text-sm font-bold">Clips de {channel}</h2>
          <button onClick={onClose} className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer transition-colors"><PhosphorIcon name="X" size={18} weight="bold" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-twitch border-t-transparent rounded-full animate-spin" /></div>
          : clips.length === 0 ? <p className="text-text-muted text-sm text-center py-12">No se encontraron clips</p>
          : activeClip ? (
            <div className="flex flex-col gap-3">
              <button onClick={() => setActiveClip(null)} className="text-twitch text-[12px] hover:underline cursor-pointer self-start">← Volver</button>
              <ClipVideo clip={activeClip} />
              <div className="flex items-center gap-3 text-[12px] text-text-secondary"><span className="font-semibold text-text-primary">{activeClip.title}</span><span>{fv(activeClip.viewCount)} views</span><span>{fd(activeClip.durationSeconds)}</span></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {clips.map(clip => (
                <button key={clip.slug} onClick={() => setActiveClip(clip)} className="text-left group cursor-pointer card-hover rounded-lg overflow-hidden bg-bg-tertiary">
                  <div className="relative aspect-video overflow-hidden">
                    {clip.thumbnailURL ? <img src={clip.thumbnailURL} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                    : <div className="w-full h-full flex items-center justify-center text-text-muted/30"><svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg></div>}
                    <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[11px] px-1.5 py-0.5 rounded">{fd(clip.durationSeconds)}</span>
                  </div>
                  <div className="p-2"><p className="text-[12px] font-medium text-text-primary truncate leading-tight">{clip.title}</p><p className="text-[11px] text-text-muted mt-0.5">{fv(clip.viewCount)} views</p></div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

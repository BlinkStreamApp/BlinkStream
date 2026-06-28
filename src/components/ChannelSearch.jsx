import { useState, useEffect, useRef, useCallback } from 'react'
import { searchChannels } from '../utils/twitch'
import PhosphorIcon from './icons/PhosphorIcon'

const CHANNEL_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,24}$/

export default function ChannelSearch({ onSelect, currentChannel }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searching, setSearching] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault(); inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  useEffect(() => {
    // Reset al cambiar de canal: estado UI que depende de currentChannel.
    // No es cascading render: el effect se re-monta solo al cambiar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (currentChannel) { setInput(''); setSuggestions([]) }
  }, [currentChannel])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const val = input.trim()
    if (val.length < 2) {
      // Input demasiado corto: limpiamos suggestions. setState en effect
      // es OK porque es reset dependiente de la prop `input`.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestions([]); return
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchChannels(val)
        setSuggestions(results.filter(r => r.login !== currentChannel).slice(0, 6))
        setShowSuggestions(true)
        setSelectedIdx(-1)
      } catch { setSuggestions([]) }
      finally { setSearching(false) }
    }, 250)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [input, currentChannel])

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setShowSuggestions(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectChannel = useCallback((name) => {
    setError('')
    setInput('')
    setSuggestions([])
    setShowSuggestions(false)
    onSelect(name)
    inputRef.current?.blur()
  }, [onSelect])

  const handleSubmit = (e) => {
    e.preventDefault()
    const name = input.trim().toLowerCase()
    if (!name) { setError('Introduce un nombre de canal'); return }
    if (!CHANNEL_RE.test(name)) { setError('Nombre inválido (3-25 chars, letras/números/_)'); return }
    selectChannel(name)
  }

  const handleKeyDown = (e) => {
    if (!showSuggestions || !suggestions.length) return
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1)); break
      case 'ArrowUp': e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); break
      case 'Enter':
        if (selectedIdx >= 0) { e.preventDefault(); selectChannel(suggestions[selectedIdx].login) }
        break
      case 'Escape': setShowSuggestions(false); break
    }
  }

  return (
    <div className="flex-1 max-w-sm relative z-[9998]" ref={containerRef}>
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <PhosphorIcon name="MagnifyingGlass" size={16} weight="regular" className="absolute left-3 top-0 bottom-0 my-auto text-text-muted/60 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError('') }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Buscar canal…"
          maxLength={25}
          className="w-full pl-9 pr-12 py-2 rounded-lg bg-bg-primary/80 text-text-primary placeholder-text-muted/60 text-sm border border-bg-tertiary focus:border-twitch/60 focus:bg-bg-primary focus:ring-2 focus:ring-twitch/20 focus:outline-none transition-all shadow-sm"
          aria-label="Buscar canal de Twitch"
          autoComplete="off"
        />
        {searching ? (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-twitch border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-muted/40 bg-bg-tertiary/40 px-1.5 py-0.5 rounded border border-bg-tertiary/30 select-none">Ctrl+K</span>
        )}
        {error && <span className="absolute -bottom-5 left-0 text-red-400/80 text-[11px] whitespace-nowrap">{error}</span>}
      </form>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full mt-1.5 left-0 right-0 bg-bg-secondary border border-bg-tertiary/50 rounded-xl shadow-2xl z-[9999] py-1 overflow-hidden animate-slide-up">
          {suggestions.map((s, i) => (
            <button
              key={s.login}
              onClick={() => selectChannel(s.login)}
              className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left cursor-pointer transition-colors ${
                i === selectedIdx ? 'bg-twitch/20 text-twitch' : 'hover:bg-hover text-text-primary'
              }`}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              {s.avatar ? (
                <img src={s.avatar.replace('{width}', '40').replace('{height}', '40')} alt="" className="w-7 h-7 rounded-full" loading="lazy" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-bg-tertiary flex items-center justify-center text-xs text-text-muted">?</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{s.displayName || s.login}</div>
                <div className="text-[11px] text-text-muted/60 truncate">
                  {s.isLive ? `🔴 ${s.game || 'En vivo'} · ${s.viewers ? `${(s.viewers/1000).toFixed(1)}k` : ''}` : 'Sin stream'}
                </div>
              </div>
              {s.isLive && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-pulse-dot" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

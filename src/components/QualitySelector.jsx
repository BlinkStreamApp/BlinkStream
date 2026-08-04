const FALLBACK_QUALITIES = [
  { value: 'audio_only', label: 'Solo audio 🎧' },
  { value: '160p30', label: '160p30 (Mínimo)' },
  { value: '360p30', label: '360p30' },
  { value: '480p30', label: '480p30' },
  { value: '720p60', label: '720p60 (HD)' },
  { value: '936p60', label: '936p60 (Pro Bitrate 🚀)' },
  { value: '963p60', label: '963p60 (Pro Bitrate 🚀)' },
  { value: '1080p60', label: '1080p60 (Full HD ⚡)' },
  { value: '1440p60', label: '1440p60 (2K 💎)' },
]

function qualityLabel(value) {
  const map = {
    audio: 'Solo audio 🎧',
    audio_only: 'Solo audio 🎧',
    '160p': '160p (Mínimo)',
    '160p30': '160p30 (Mínimo)',
    '360p': '360p',
    '360p30': '360p30',
    '480p': '480p',
    '480p30': '480p30',
    '720p': '720p (HD)',
    '720p60': '720p60 (HD)',
    '936p': '936p (Pro Bitrate 🚀)',
    '936p60': '936p60 (Pro Bitrate 🚀)',
    '963p': '963p (Pro Bitrate 🚀)',
    '963p60': '963p60 (Pro Bitrate 🚀)',
    '1080p': '1080p (Full HD ⚡)',
    '1080p60': '1080p60 (Full HD ⚡)',
    '1440p': '1440p (2K 💎)',
    '1440p60': '1440p60 (2K 💎)',
    '2k60': '1440p60 (2K 💎)',
    source: 'Source (Calidad original 👑)',
  }
  return map[value] || value
}

export default function QualitySelector({ current, onChange, qualities = [], isSettings = false }) {
  const rawItems = (qualities && qualities.length > 0 ? qualities : FALLBACK_QUALITIES.map(q => q.value))
    .filter(q => q && q.toLowerCase() !== 'best')

  // Aseguramos que el valor actual o las resoluciones clave como 1440p/963p estén accesibles en el desplegable de respaldo
  const items = Array.from(new Set([...rawItems]))
  const effective = items.includes(current) ? current : (items[items.length - 1] || '1080p60')

  return (
    <div className="relative w-full">
      <select
        value={effective}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full text-white font-mono font-bold border border-white/15 hover:border-twitch/50 focus:border-twitch focus:ring-1 focus:ring-twitch transition-all appearance-none cursor-pointer shadow-inner ${
          isSettings
            ? 'pl-2 pr-6 py-1 text-[11px] bg-[#0c0d13] rounded-lg'
            : 'pl-3 pr-8 py-1 text-[12px] bg-black/60 hover:bg-black/80 rounded-xl'
        }`}
        title="Seleccionar calidad de transmisión"
      >
        {items.map(q => (
          <option key={q} value={q} className="bg-[#10121a] text-white font-mono py-1">
            {qualityLabel(q)}
          </option>
        ))}
      </select>
      <div className={`absolute top-1/2 -translate-y-1/2 pointer-events-none text-twitch font-bold ${isSettings ? 'right-2 text-[9px]' : 'right-3 text-[10px]'}`}>
        ▼
      </div>
    </div>
  )
}

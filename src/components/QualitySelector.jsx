const FALLBACK_QUALITIES = [
  { value: 'audio_only', label: 'Solo audio' },
  { value: '160p30', label: '160p30' },
  { value: '360p30', label: '360p30' },
  { value: '480p30', label: '480p30' },
  { value: '720p60', label: '720p60' },
  { value: '1080p60', label: '1080p60' },
]

function qualityLabel(value) {
  const map = {
    audio_only: 'Solo audio',
    '160p30': '160p30',
    '360p30': '360p30',
    '480p30': '480p30',
    '720p60': '720p60',
    '1080p60': '1080p60',
    source: 'Source',
  }
  return map[value] || value
}

export default function QualitySelector({ current, onChange, qualities = [] }) {
  const items = (qualities.length > 0 ? qualities : FALLBACK_QUALITIES.map(q => q.value))
    .filter(q => q.toLowerCase() !== 'best')

  const effective = items.includes(current) ? current : (items[items.length - 1] || '1080p60')

  return (
    <select
      value={effective}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/10 hover:bg-white/20 text-white text-[12px] px-2 py-1 rounded-lg border border-white/10 focus:border-twitch focus:outline-none cursor-pointer transition-colors appearance-none"
    >
      {items.map(q => (
        <option key={q} value={q} className="bg-bg-secondary text-text-primary">
          {qualityLabel(q)}
        </option>
      ))}
    </select>
  )
}

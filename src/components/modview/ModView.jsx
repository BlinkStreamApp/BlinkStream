import { useState } from 'react'
import { useT } from '../../utils/i18n'
import { OfficialModView } from './OfficialModView'
import { BlinkStreamModView } from './NativeModWorkspace'
import { useModerationSession } from '../../hooks/useModerationSession'

function SessionOwner({ broadcasterId, userId, twitchToken, isLoggedIn }) {
  useModerationSession({ broadcasterId: isLoggedIn ? broadcasterId : null, userId, token: twitchToken })
  return null
}

export function ModView({
  ...props
}) {
  const t = useT()
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('bs.modview.surface') === 'blinkstream' ? 'blinkstream' : 'official' } catch { return 'official' }
  })
  const changeMode = next => {
    setMode(next)
    try { localStorage.setItem('bs.modview.surface', next) } catch { /* storage unavailable */ }
  }
  return <div data-playback-surface={mode === 'official' ? 'modview-hybrid' : 'modview-native'} className="flex flex-col h-full min-h-0 w-full bg-[#0a0a0f] text-white">
    <SessionOwner {...props} />
    <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-white/10">
      <button type="button" aria-pressed={mode === 'official'} className="px-3 py-1 rounded bg-white/10 cursor-pointer aria-pressed:bg-twitch" onClick={() => changeMode('official')}>{t('mod.official.title')}</button>
      <button type="button" aria-pressed={mode === 'blinkstream'} className="px-3 py-1 rounded bg-white/10 cursor-pointer aria-pressed:bg-twitch" onClick={() => changeMode('blinkstream')}>BlinkStream</button>
      {mode === 'official' && <button type="button" className="ml-auto cursor-pointer text-sm" onClick={props.onExit}>{t('mod.official.exit')}</button>}
    </div>
    <div className="flex flex-col flex-1 min-h-0">
      {mode === 'official' ? <OfficialModView key={`${props.userId || ''}:${props.channel}`} {...props} /> : <BlinkStreamModView key={`${props.userId || ''}:${props.channel}`} {...props} onOpenOfficial={() => changeMode('official')} />}
    </div>
  </div>
}

export default ModView

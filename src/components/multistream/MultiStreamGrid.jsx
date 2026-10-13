import { useState, Suspense, lazy } from 'react'
import { useT } from '../../utils/i18n'
import GridCell from './GridCell'
import PhosphorIcon from '../icons/PhosphorIcon'
import ChannelLabel from '../chat/ChannelLabel'
import { normalizeChatChannels } from '../../utils/chatChannels'

const Chat = lazy(() => import('../Chat'))

function ChatFallback() {
  return (
    <div className="flex-1 min-h-[300px] flex items-center justify-center bg-bg-secondary text-text-muted text-xs animate-pulse">
      Cargando chat...
    </div>
  )
}

export default function MultiStreamGrid({
  initialChannel,
  isLoggedIn = false,
  twitchToken = '',
  twitchUsername = '',
  chatOnRight = true,
  onSelectChannel,
  onExit
}) {
  const t = useT()

  const [channels, setChannels] = useState(() => {
    const list = ['', '', '', '']
    if (initialChannel) list[0] = initialChannel
    return list
  })

  const [gridCount, setGridCount] = useState(2)
  const [focusedAudioIdx, setFocusedAudioIdx] = useState(0)
  const [activeChatIdx, setActiveChatIdx] = useState(0)
  const [showChatPanel, setShowChatPanel] = useState(true)
  const [chatMode, setChatMode] = useState('individual')
  const [sendDestination, setSendDestination] = useState('')
  const [isBinauralActive, setIsBinauralActive] = useState(false)
  const [cellPans, setCellPans] = useState([-1, 1, 0, 0])

  const handleToggleBinaural = () => {
    setIsBinauralActive(prev => {
      const next = !prev
      if (next) {
        setCellPans([-1, 1, 0, 0])
      }
      return next
    })
  }

  const handleSetChannel = (index, newChannel) => {
    setChannels(prev => {
      const copy = [...prev]
      copy[index] = newChannel
      return copy
    })

    if (!channels.slice(0, gridCount).some(Boolean)) {
      setFocusedAudioIdx(index)
    }
    if (!channels[activeChatIdx] || activeChatIdx >= gridCount) {
      setActiveChatIdx(index)
    }
  }

  const handleRemoveChannel = (index) => {
    setChannels(prev => {
      const copy = [...prev]
      copy[index] = ''
      return copy
    })
  }

  // Hidden slots keep their channels, but must not own the visible audio or chat.
  const visibleChannels = channels.slice(0, gridCount)
  const firstVisibleIdx = visibleChannels.findIndex(Boolean)
  const audioIdx = visibleChannels[focusedAudioIdx] ? focusedAudioIdx : firstVisibleIdx
  const chatIdx = visibleChannels[activeChatIdx] ? activeChatIdx : firstVisibleIdx
  const activeChatChannel = visibleChannels[chatIdx] || ''
  const unifiedChannels = normalizeChatChannels(visibleChannels)
  const destination = unifiedChannels.includes(sendDestination) ? sendDestination : ''

  const getGridClasses = () => {
    if (gridCount === 2) return 'grid-cols-1 md:grid-cols-2 auto-rows-[minmax(220px,1fr)] md:grid-rows-1'
    return 'grid-cols-1 md:grid-cols-2 auto-rows-[minmax(220px,1fr)] md:grid-rows-2'
  }

  const gridPanel = (
      <div className="flex-1 flex flex-col min-w-0 min-h-[500px] md:min-h-0 p-3 sm:p-4 gap-3">
        {}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 rounded-2xl bg-bg-secondary/80 border border-white/[0.06] backdrop-blur-md shrink-0 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-xl bg-gradient-to-br from-twitch to-fuchsia-500 flex items-center justify-center text-white shadow-md shadow-twitch/30">
              <PhosphorIcon name="SquaresFour" size={20} weight="fill" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[14px] font-extrabold text-text-primary tracking-tight truncate">{t('grid.title', 'Modo Multivistas Simultáneo')}</h2>
              <p className="text-[11px] text-text-muted truncate hidden sm:block">{t('grid.layout', 'Disposición del Grid')}</p>
            </div>
          </div>

          {}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <button
              onClick={handleToggleBinaural}
              aria-pressed={isBinauralActive}
              aria-label={t('grid.binauralMode', 'Modo Binaural (L/R)')}
              className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 text-[11px] font-bold transition-all cursor-pointer ${
                isBinauralActive
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.35)]'
                  : 'bg-bg-tertiary border-white/10 text-text-muted hover:text-white hover:bg-white/5'
              }`}
              title={t('grid.binauralTip', 'Asigna automáticamente el canal 1 al oído izquierdo y el canal 2 al derecho')}
            >
              <PhosphorIcon name="Headphones" size={15} weight={isBinauralActive ? 'fill' : 'regular'} className={isBinauralActive ? 'text-cyan-300' : ''} />
              <span className="hidden sm:inline">{t('grid.binauralMode', 'Modo Binaural (L/R)')}</span>
            </button>

            <div className="flex p-1 rounded-xl bg-bg-tertiary border border-white/10 gap-1">
              {[
                { count: 2, label: 'Dual (2)' },
                { count: 3, label: 'Triple (3)' },
                { count: 4, label: 'Quad (2×2)' },
              ].map(({ count, label }) => (
                <button
                  key={count}
                  onClick={() => setGridCount(count)}
                  aria-pressed={gridCount === count}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    gridCount === count
                      ? 'bg-twitch text-white shadow-sm'
                      : 'text-text-muted hover:text-text-primary hover:bg-white/5'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowChatPanel(p => !p)}
              className={`p-2 rounded-xl border flex items-center gap-1.5 text-[12px] font-semibold transition-all cursor-pointer ${
                showChatPanel
                  ? 'bg-white/10 border-white/30 text-white'
                  : 'bg-bg-tertiary border-white/10 text-text-muted hover:text-white'
              }`}
              aria-expanded={showChatPanel}
              aria-label={showChatPanel ? t('grid.hideChat', 'Ocultar chat') : t('grid.showChat', 'Mostrar chat')}
              title={showChatPanel ? t('grid.hideChat', 'Ocultar chat') : t('grid.showChat', 'Mostrar chat')}
            >
              <PhosphorIcon name="ChatCircleDots" size={18} weight={showChatPanel ? 'fill' : 'regular'} />
            </button>

            {onExit && (
              <button
                onClick={onExit}
                className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-[12px] font-bold transition-colors cursor-pointer"
              >
                {t('nav.home', 'Volver al inicio')}
              </button>
            )}
          </div>
        </div>

        {}
        <div className={`flex-1 grid gap-3 min-h-0 min-w-0 overflow-y-auto ${getGridClasses()}`}>
          {Array.from({ length: gridCount }).map((_, i) => (
            <div
              key={i}
              className={`w-full h-full min-h-[220px] min-w-0 ${
                gridCount === 3 && i === 2 ? 'md:col-span-2 md:max-w-[70%] md:mx-auto' : ''
              }`}
            >
              <GridCell
                key={channels[i] || 'empty'}
                index={i}
                channel={channels[i]}
                onSetChannel={handleSetChannel}
                onRemove={handleRemoveChannel}
                isAudioFocused={audioIdx === i}
                onFocusAudio={setFocusedAudioIdx}
                isChatActive={!!channels[i] && (chatMode === 'unified' || chatIdx === i)}
                onSelectChat={(idx) => { setActiveChatIdx(idx); setChatMode('individual'); setShowChatPanel(true) }}
                onSelectSingleChannel={onSelectChannel}
                gridCount={gridCount}
                externalPan={cellPans[i]}
                onPanChange={(idx, val) => setCellPans(p => {
                  const copy = [...p]
                  copy[idx] = val
                  return copy
                })}
                isBinaural={isBinauralActive && (i === 0 || i === 1)}
              />
            </div>
          ))}
        </div>
      </div>
  )

  const chatPanel = showChatPanel && (
        <aside aria-label={t('grid.chatsTitle', 'Chats del grid')} className={`w-full md:w-80 lg:w-96 min-h-[500px] md:min-h-0 shrink-0 flex flex-col bg-bg-secondary/90 border-t md:border-t-0 ${
          chatOnRight ? 'md:border-l' : 'md:border-r'
        } border-white/[0.06] backdrop-blur-xl transition-all duration-300`}>

          <div className="shrink-0 border-b border-white/[0.06] bg-gradient-to-b from-twitch/10 to-transparent p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold tracking-tight text-text-primary [@media(max-height:600px)]:hidden"><PhosphorIcon name="Chats" size={20} className="text-twitch-light" />{t('grid.chatsTitle', 'Chats del grid')}</div>
            <div role="group" aria-label={t('grid.chatMode', 'Modo de chat')} className="flex gap-1 rounded-xl border border-white/10 bg-bg-primary/70 p-1">
              {['individual', 'unified'].map(mode => <button key={mode} type="button" aria-pressed={chatMode === mode} onClick={() => { if (mode === chatMode) return; setChatMode(mode); if (mode === 'unified') setSendDestination(activeChatChannel) }} className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-twitch cursor-pointer ${chatMode === mode ? 'bg-twitch/25 text-text-primary ring-1 ring-twitch/40' : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'}`}>
                <PhosphorIcon name={mode === 'unified' ? 'Chats' : 'ChatCircleDots'} size={16} />{mode === 'unified' ? t('grid.unified', 'Unificado') : t('grid.individual', 'Individual')}
              </button>)}
            </div>
            {chatMode === 'unified' && <p className="mt-2.5 text-[11px] leading-relaxed text-text-secondary [@media(max-height:600px)]:hidden">{t('grid.unifiedHint', 'Mensajes de los canales visibles, juntos y etiquetados por origen.')}</p>}
          </div>

          {}
          <div className={`gap-2 p-2 border-b border-white/[0.06] bg-bg-tertiary/70 ${chatMode === 'unified' ? 'grid grid-cols-2' : 'flex items-center overflow-x-auto no-scrollbar'}`}>
            <span className={`text-[10px] font-semibold uppercase text-text-secondary tracking-wider px-1 shrink-0 flex items-center gap-1 ${chatMode === 'unified' ? 'col-span-2 [@media(max-height:600px)]:hidden' : ''}`}>
              <PhosphorIcon name="Chats" size={14} className="text-twitch" weight="duotone" />
              {chatMode === 'unified' ? t('grid.includedChannels', 'Canales incluidos') : t('grid.chatSelector', 'Chat Activo:')}
            </span>
            {chatMode === 'unified' ? unifiedChannels.map(ch => <ChannelLabel key={ch} channel={ch} channels={unifiedChannels} />) : visibleChannels.map((ch, idx) => {
              if (!ch) return null
              const isActive = idx === chatIdx
              return (
                <button
                  key={`${ch}-${idx}`}
                  onClick={() => setActiveChatIdx(idx)}
                  aria-pressed={isActive}
                  className={`px-3 py-1 rounded-lg text-[12px] font-bold truncate transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                    isActive
                      ? 'bg-fuchsia-600 text-white shadow-sm shadow-fuchsia-500/30'
                      : 'bg-bg-primary/60 text-text-muted hover:text-text-primary hover:bg-bg-primary border border-white/5'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-text-muted'}`} />
                  {ch}
                </button>
              )
            })}
            {visibleChannels.every(c => !c) && (
              <span className="text-[11px] text-text-muted italic px-2">{t('grid.emptyCell', 'Celda de directo vacía')}</span>
            )}
          </div>

          {}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {activeChatChannel ? (
              <Suspense fallback={<ChatFallback />}>
                <Chat
                  key={chatMode === 'unified' ? 'unified' : activeChatChannel}
                  channel={chatMode === 'unified' ? destination : activeChatChannel}
                  channels={chatMode === 'unified' ? unifiedChannels : undefined}
                  onSelectDestination={setSendDestination}
                  isLoggedIn={isLoggedIn}
                  twitchToken={twitchToken}
                  twitchUsername={twitchUsername}
                  broadcasterId=""
                  isGridMode={true}
                />
              </Suspense>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-text-muted/60">
                <PhosphorIcon name="ChatSlash" size={40} weight="duotone" className="mb-2 opacity-50" />
                <p className="text-[13px] font-medium">{t('grid.emptyChat', 'Añade un canal al grid para ver su chat.')}</p>
              </div>
            )}
          </div>
        </aside>
  )

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-bg-primary overflow-y-auto md:overflow-hidden">
      {!chatOnRight && chatPanel}
      {gridPanel}
      {chatOnRight && chatPanel}
    </div>
  )
}

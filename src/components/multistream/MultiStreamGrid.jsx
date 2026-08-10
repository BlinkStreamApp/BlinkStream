import { useState, Suspense, lazy } from 'react'
import { useT } from '../../utils/i18n'
import GridCell from './GridCell'
import PhosphorIcon from '../icons/PhosphorIcon'

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

  const handleSetChannel = (index, newChannel) => {
    setChannels(prev => {
      const copy = [...prev]
      copy[index] = newChannel
      return copy
    })

    if (!channels[activeChatIdx]) {
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

  const activeChatChannel = channels[activeChatIdx] || channels.find(c => c !== '') || ''

  const getGridClasses = () => {
    if (gridCount === 2) return 'grid-cols-1 md:grid-cols-2 grid-rows-2 md:grid-rows-1'
    if (gridCount === 3) return 'grid-cols-1 md:grid-cols-2 grid-rows-2'
    return 'grid-cols-1 md:grid-cols-2 grid-rows-2'
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-bg-primary overflow-hidden">
      {}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 p-3 sm:p-4 gap-3">
        {}
        <div className="flex items-center justify-between gap-3 px-4 py-2 rounded-2xl bg-bg-secondary/80 border border-white/[0.06] backdrop-blur-md shrink-0 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-twitch to-fuchsia-500 flex items-center justify-center text-white shadow-md shadow-twitch/30">
              <PhosphorIcon name="SquaresFour" size={20} weight="fill" />
            </div>
            <div>
              <h2 className="text-[14px] font-extrabold text-text-primary tracking-tight truncate">{t('grid.title', 'Modo Multivistas Simultáneo')}</h2>
              <p className="text-[11px] text-text-muted truncate hidden sm:block">{t('grid.layout', 'Disposición del Grid')}</p>
            </div>
          </div>

          {}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex p-1 rounded-xl bg-bg-tertiary border border-white/10 gap-1">
              {[
                { count: 2, label: 'Dual (2)' },
                { count: 3, label: 'Triple (3)' },
                { count: 4, label: 'Quad (4x4)' },
              ].map(({ count, label }) => (
                <button
                  key={count}
                  onClick={() => setGridCount(count)}
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
              title={t('chat.hidden', 'Chat oculto')}
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
        <div className={`flex-1 grid gap-3 min-h-0 min-w-0 ${getGridClasses()}`}>
          {Array.from({ length: gridCount }).map((_, i) => (
            <div
              key={i}
              className={`w-full h-full min-h-0 min-w-0 ${
                gridCount === 3 && i === 2 ? 'md:col-span-2 md:max-w-[70%] md:mx-auto' : ''
              }`}
            >
              <GridCell
                index={i}
                channel={channels[i]}
                onSetChannel={handleSetChannel}
                onRemove={handleRemoveChannel}
                isAudioFocused={focusedAudioIdx === i}
                onFocusAudio={setFocusedAudioIdx}
                isChatActive={activeChatIdx === i || (activeChatIdx !== i && channels[i] === activeChatChannel && channels[i] !== '')}
                onSelectChat={(idx) => setActiveChatIdx(idx)}
                onSelectSingleChannel={onSelectChannel}
                gridCount={gridCount}
              />
            </div>
          ))}
        </div>
      </div>

      {}
      {showChatPanel && (
        <div className={`w-full md:w-80 lg:w-96 shrink-0 flex flex-col bg-bg-secondary/90 border-t md:border-t-0 ${
          chatOnRight ? 'md:border-l' : 'md:border-r'
        } border-white/[0.06] backdrop-blur-xl transition-all duration-300`}>

          {}
          <div className="flex items-center gap-1 p-2 border-b border-white/[0.06] bg-bg-tertiary/70 overflow-x-auto no-scrollbar">
            <span className="text-[11px] font-bold uppercase text-text-muted tracking-wider px-2 shrink-0 flex items-center gap-1">
              <PhosphorIcon name="Chats" size={14} className="text-twitch" weight="duotone" />
              {t('grid.chatSelector', 'Chat Activo:')}
            </span>
            {channels.map((ch, idx) => {
              if (!ch) return null
              const isActive = idx === activeChatIdx
              return (
                <button
                  key={`${ch}-${idx}`}
                  onClick={() => setActiveChatIdx(idx)}
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
            {channels.every(c => !c) && (
              <span className="text-[11px] text-text-muted italic px-2">{t('grid.emptyCell', 'Celda de directo vacía')}</span>
            )}
          </div>

          {}
          <div className="flex-1 min-h-[300px] flex flex-col overflow-hidden">
            {activeChatChannel ? (
              <Suspense fallback={<ChatFallback />}>
                <Chat
                  key={activeChatChannel}
                  channel={activeChatChannel}
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
                <p className="text-[13px] font-medium">{t('chat.placeholder.connecting', 'Podrás ver el chat en cuanto cargues tu primer stream al Grid.')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

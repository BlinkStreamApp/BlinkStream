import { useState, useEffect, useCallback } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'
import {
  getPredictions,
  createPrediction,
  resolvePrediction,
  getPolls,
  createPoll,
  endPoll,
} from '../../utils/twitch'

export function PredictionsPollsPanel({ broadcasterId, _userId, token, isLoggedIn = true, onLoginWithToken }) {
  const [subTab, setSubTab] = useState('predictions') // 'predictions' | 'polls'
  const [predictions, setPredictions] = useState([])
  const [polls, setPolls] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  // Form State for creating prediction
  const [predTitle, setPredTitle] = useState('')
  const [predOutcome1, setPredOutcome1] = useState('Sí')
  const [predOutcome2, setPredOutcome2] = useState('No')
  const [predWindow, setPredWindow] = useState(120)

  // Form State for creating poll
  const [pollTitle, setPollTitle] = useState('')
  const [pollChoices, setPollChoices] = useState(['Opción 1', 'Opción 2'])
  const [pollDuration, setPollDuration] = useState(60)

  const loadData = useCallback(async () => {
    if (!broadcasterId || !isLoggedIn) return
    setLoading(true)
    setStatusMessage('')
    try {
      if (subTab === 'predictions') {
        const res = await getPredictions(broadcasterId, 20, token)
        if (res.success) {
          setPredictions(res.value || [])
        } else {
          setPredictions([])
          if (res.error?.status >= 500) {
            setStatusMessage('Error del servidor de Twitch al cargar predicciones')
          }
        }
      } else {
        const res = await getPolls(broadcasterId, 20, token)
        if (res.success) {
          setPolls(res.value || [])
        } else {
          setPolls([])
          if (res.error?.status >= 500) {
            setStatusMessage('Error del servidor de Twitch al cargar encuestas')
          }
        }
      }
    } catch {
      // Ignorar fallo de red en lectura pasiva
    }
    setLoading(false)
  }, [broadcasterId, subTab, isLoggedIn, token])

  useEffect(() => {
    if (isLoggedIn) {
      loadData()
    }
  }, [loadData, isLoggedIn])

  const handleCreatePrediction = async (e) => {
    e.preventDefault()
    if (!predTitle.trim() || !predOutcome1.trim() || !predOutcome2.trim()) return
    setActionPending(true)
    setStatusMessage('')

    const res = await createPrediction(broadcasterId, predTitle, [predOutcome1, predOutcome2], predWindow, token)
    if (res.success) {
      setShowCreateModal(false)
      setPredTitle('')
      loadData()
    } else {
      setStatusMessage(res.error?.message || 'Error al crear predicción')
    }
    setActionPending(false)
  }

  const handleResolvePrediction = async (predictionId, status, winningOutcomeId) => {
    setActionPending(true)
    setStatusMessage('')
    const res = await resolvePrediction(broadcasterId, predictionId, status, winningOutcomeId, token)
    if (res.success) {
      loadData()
    } else {
      setStatusMessage(res.error?.message || `Error al resolver predicción (${status})`)
    }
    setActionPending(false)
  }

  const handleCreatePoll = async (e) => {
    e.preventDefault()
    const validChoices = pollChoices.map(c => c.trim()).filter(Boolean)
    if (!pollTitle.trim() || validChoices.length < 2) return
    setActionPending(true)
    setStatusMessage('')

    const res = await createPoll(broadcasterId, pollTitle, validChoices, pollDuration, false, 100, token)
    if (res.success) {
      setShowCreateModal(false)
      setPollTitle('')
      loadData()
    } else {
      setStatusMessage(res.error?.message || 'Error al crear encuesta')
    }
    setActionPending(false)
  }

  const handleEndPoll = async (pollId) => {
    setActionPending(true)
    const res = await endPoll(broadcasterId, pollId, 'TERMINATED', token)
    if (res.success) {
      loadData()
    } else {
      setStatusMessage(res.error?.message || 'Error al finalizar encuesta')
    }
    setActionPending(false)
  }

  return (
    <div className="h-full flex flex-col font-sans">
      {/* Header Tabs */}
      <div className="shrink-0 p-2.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setSubTab('predictions'); setShowCreateModal(false) }}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              subTab === 'predictions'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            🎲 Predicciones
          </button>
          <button
            onClick={() => { setSubTab('polls'); setShowCreateModal(false) }}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              subTab === 'polls'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            📊 Encuestas
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowCreateModal(p => !p)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-twitch hover:bg-twitch-glow text-white text-xs font-semibold transition-all cursor-pointer shadow-sm shadow-twitch/30"
          >
            <PhosphorIcon name="Plus" size={13} weight="bold" />
            <span>{showCreateModal ? 'Cerrar' : 'Nueva'}</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Recargar"
          >
            <PhosphorIcon name="ArrowsClockwise" size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="px-3 py-2 bg-purple-950/40 border-b border-purple-500/20 text-[11px] text-purple-200 flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-1.5 min-w-0">
            <PhosphorIcon name="Info" size={14} className="text-purple-400 shrink-0" />
            <span className="truncate">{statusMessage}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onLoginWithToken && statusMessage.includes('renovar') && (
              <button
                onClick={onLoginWithToken}
                className="px-2 py-0.5 rounded bg-twitch hover:bg-twitch-dark text-white text-[10px] font-bold cursor-pointer transition-colors"
              >
                Renovar
              </button>
            )}
            <button
              onClick={() => setStatusMessage('')}
              className="text-white/40 hover:text-white transition-colors cursor-pointer"
              title="Cerrar aviso"
            >
              <PhosphorIcon name="X" size={12} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {/* Creation Modal Form */}
      {showCreateModal && (
        <div className="p-3 border-b border-white/10 bg-black/40 space-y-2 animate-slide-up shrink-0">
          {subTab === 'predictions' ? (
            <form onSubmit={handleCreatePrediction} className="space-y-2">
              <span className="text-[10px] font-bold uppercase text-purple-300 tracking-wider">Crear Nueva Predicción</span>
              <input
                type="text"
                placeholder="Título de la predicción (ej: ¿Ganamos la partida?)..."
                value={predTitle}
                onChange={e => setPredTitle(e.target.value)}
                maxLength={45}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-twitch"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Opción 1 (ej: Sí)"
                  value={predOutcome1}
                  onChange={e => setPredOutcome1(e.target.value)}
                  maxLength={25}
                  className="w-full bg-white/5 border border-white/15 rounded-lg px-2 py-1 text-xs text-white"
                  required
                />
                <input
                  type="text"
                  placeholder="Opción 2 (ej: No)"
                  value={predOutcome2}
                  onChange={e => setPredOutcome2(e.target.value)}
                  maxLength={25}
                  className="w-full bg-white/5 border border-white/15 rounded-lg px-2 py-1 text-xs text-white"
                  required
                />
              </div>
              <div className="flex items-center justify-between pt-1">
                <select
                  value={predWindow}
                  onChange={e => setPredWindow(Number(e.target.value))}
                  className="bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-xs text-white"
                >
                  <option value={60}>1 minuto</option>
                  <option value={120}>2 minutos</option>
                  <option value={300}>5 minutos</option>
                  <option value={600}>10 minutos</option>
                </select>
                <button
                  type="submit"
                  disabled={actionPending}
                  className="px-3 py-1 bg-gradient-to-r from-twitch to-purple-600 hover:from-twitch-glow hover:to-purple-500 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  Iniciar Predicción
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCreatePoll} className="space-y-2">
              <span className="text-[10px] font-bold uppercase text-blue-300 tracking-wider">Crear Nueva Encuesta</span>
              <input
                type="text"
                placeholder="Pregunta de la encuesta..."
                value={pollTitle}
                onChange={e => setPollTitle(e.target.value)}
                maxLength={60}
                className="w-full bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-twitch"
                required
              />
              <div className="space-y-1.5">
                {pollChoices.map((choice, i) => (
                  <input
                    key={i}
                    type="text"
                    placeholder={`Opción ${i + 1}`}
                    value={choice}
                    onChange={e => {
                      const next = [...pollChoices]
                      next[i] = e.target.value
                      setPollChoices(next)
                    }}
                    maxLength={25}
                    className="w-full bg-white/5 border border-white/15 rounded-lg px-2 py-1 text-xs text-white"
                    required
                  />
                ))}
              </div>
              <div className="flex items-center justify-between pt-1">
                <select
                  value={pollDuration}
                  onChange={e => setPollDuration(Number(e.target.value))}
                  className="bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-xs text-white"
                >
                  <option value={30}>30 segundos</option>
                  <option value={60}>1 minuto</option>
                  <option value={120}>2 minutos</option>
                  <option value={300}>5 minutos</option>
                </select>
                <button
                  type="submit"
                  disabled={actionPending}
                  className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
                >
                  Iniciar Encuesta
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* List content */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
        {!isLoggedIn ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300 mb-3">
              <PhosphorIcon name="Coins" size={24} weight="duotone" />
            </div>
            <p className="text-xs font-bold text-white mb-1">Inicio de Sesión Requerido</p>
            <p className="text-[11px] text-text-muted max-w-[240px] mb-4">
              Inicia sesión con tu cuenta de moderador o creador para consultar y gestionar predicciones en tiempo real.
            </p>
            {onLoginWithToken && (
              <button
                onClick={onLoginWithToken}
                className="px-4 py-2 bg-twitch hover:bg-twitch-glow text-white text-xs font-bold rounded-xl shadow-lg shadow-twitch/30 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <PhosphorIcon name="SignIn" size={15} weight="bold" />
                <span>Iniciar sesión en Twitch</span>
              </button>
            )}
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center p-8 text-text-muted text-xs">
            <div className="w-5 h-5 border-2 border-twitch border-t-transparent rounded-full animate-spin mr-2" />
            <span>Cargando {subTab === 'predictions' ? 'predicciones' : 'encuestas'}...</span>
          </div>
        ) : subTab === 'predictions' ? (
          predictions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted select-none">
              <PhosphorIcon name="Coins" size={24} className="text-white/20 mb-2" />
              <p className="text-xs font-semibold text-white/70">Sin predicciones recientes</p>
              <p className="text-[10px] text-text-muted mt-0.5">Usa "+ Nueva" para iniciar una predicción para tu chat.</p>
            </div>
          ) : (
            predictions.map(pred => {
              const isActive = pred.status === 'ACTIVE' || pred.status === 'LOCKED'
              const outcomes = pred.outcomes || []
              const totalPoints = outcomes.reduce((acc, o) => acc + (o.channel_points || 0), 0)

              return (
                <div key={pred.id} className="p-3 rounded-xl border border-white/10 bg-white/[0.03] space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">{pred.title}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      isActive ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-white/10 text-white/60'
                    }`}>
                      {pred.status}
                    </span>
                  </div>

                  {/* Outcomes breakdown */}
                  <div className="space-y-1.5 pt-1">
                    {outcomes.map(out => {
                      const points = out.channel_points || 0
                      const pct = totalPoints > 0 ? Math.round((points / totalPoints) * 100) : 0
                      const isWinner = pred.winning_outcome_id === out.id

                      return (
                        <div key={out.id} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-white/90 flex items-center gap-1">
                              {isWinner && <span>👑</span>}
                              {out.title}
                            </span>
                            <span className="text-text-muted font-mono">{pct}% ({points} pts)</span>
                          </div>
                          <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-twitch to-purple-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>

                          {isActive && (
                            <button
                              onClick={() => handleResolvePrediction(pred.id, 'RESOLVED', out.id)}
                              disabled={actionPending}
                              className="text-[10px] text-green-400 hover:text-green-300 hover:underline cursor-pointer pt-0.5"
                            >
                              ✓ Elegir "{out.title}" como ganadora
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {isActive && (
                    <div className="flex items-center justify-end pt-1">
                      <button
                        onClick={() => handleResolvePrediction(pred.id, 'CANCELED')}
                        disabled={actionPending}
                        className="text-[10px] text-red-400 hover:text-red-300 hover:underline cursor-pointer"
                      >
                        ✕ Cancelar & Reembolsar Puntos
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )
        ) : (
          polls.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted select-none">
              <PhosphorIcon name="ChartBar" size={24} className="text-white/20 mb-2" />
              <p className="text-xs font-semibold text-white/70">Sin encuestas recientes</p>
              <p className="text-[10px] text-text-muted mt-0.5">Usa "+ Nueva" para lanzar una encuesta en el canal.</p>
            </div>
          ) : (
            polls.map(poll => {
              const isActive = poll.status === 'ACTIVE'
              const choices = poll.choices || []
              const totalVotes = choices.reduce((acc, c) => acc + (c.votes || 0), 0)

              return (
                <div key={poll.id} className="p-3 rounded-xl border border-white/10 bg-white/[0.03] space-y-2 animate-fade-in">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">{poll.title}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      isActive ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'bg-white/10 text-white/60'
                    }`}>
                      {poll.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {choices.map(c => {
                      const votes = c.votes || 0
                      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0

                      return (
                        <div key={c.id} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-semibold text-white/90">{c.title}</span>
                            <span className="text-text-muted font-mono">{pct}% ({votes} votos)</span>
                          </div>
                          <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {isActive && (
                    <div className="flex items-center justify-end pt-1">
                      <button
                        onClick={() => handleEndPoll(poll.id)}
                        disabled={actionPending}
                        className="text-[10px] text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                      >
                        ⏹️ Finalizar Encuesta
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )
        )}
      </div>
    </div>
  )
}

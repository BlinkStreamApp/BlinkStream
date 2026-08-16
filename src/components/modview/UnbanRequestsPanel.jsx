import { useState, useEffect, useCallback } from 'react'
import PhosphorIcon from '../icons/PhosphorIcon'
import { getUnbanRequests, resolveUnbanRequest } from '../../utils/twitch'

export function UnbanRequestsPanel({ broadcasterId, userId, token, isLoggedIn = true, onLoginWithToken, onInspectUser }) {
  const [requests, setRequests] = useState([])
  const [statusFilter, setStatusFilter] = useState('pending') // 'pending' | 'approved' | 'denied'
  const [loading, setLoading] = useState(false)
  const [actionPending, setActionPending] = useState({})
  const [resolutionTextMap, setResolutionTextMap] = useState({})
  const [showInputFor, setShowInputFor] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  const loadRequests = useCallback(async () => {
    if (!broadcasterId || !userId || !isLoggedIn) return
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await getUnbanRequests(broadcasterId, userId, statusFilter, 50, token)
      if (res.success) {
        setRequests(res.value || [])
      } else {
        setRequests([])
        if (res.error?.status >= 500) {
          setErrorMsg('Error de red al consultar solicitudes')
        }
      }
    } catch {
      // Ignorar fallo de red en lectura pasiva
    }
    setLoading(false)
  }, [broadcasterId, userId, statusFilter, isLoggedIn, token])

  useEffect(() => {
    if (isLoggedIn && userId) {
      loadRequests()
    }
  }, [loadRequests, isLoggedIn, userId])

  const handleResolve = async (reqId, status) => {
    if (!broadcasterId || !userId || !reqId) return
    setActionPending(prev => ({ ...prev, [reqId]: true }))
    setErrorMsg('')

    const resolutionText = resolutionTextMap[reqId] || ''
    const res = await resolveUnbanRequest(broadcasterId, userId, reqId, status, resolutionText, token)
    if (res.success) {
      // Remove from current list if looking at pending
      setRequests(prev => prev.filter(r => r.id !== reqId))
      setShowInputFor(null)
    } else {
      setErrorMsg(res.error?.message || `Error al resolver solicitud (${status})`)
    }
    setActionPending(prev => ({ ...prev, [reqId]: false }))
  }

  return (
    <div className="h-full flex flex-col font-sans">
      {/* Header & Sub-filters */}
      <div className="shrink-0 p-2.5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Pendientes
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'approved'
                ? 'bg-green-500/20 text-green-300 border border-green-500/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Aprobadas
          </button>
          <button
            onClick={() => setStatusFilter('denied')}
            className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === 'denied'
                ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                : 'text-white/60 hover:text-white'
            }`}
          >
            Rechazadas
          </button>
        </div>

        <button
          onClick={loadRequests}
          disabled={loading}
          className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0 ml-1"
          title="Recargar solicitudes"
        >
          <PhosphorIcon name="ArrowsClockwise" size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {errorMsg && (
        <div className="p-2 bg-red-500/10 border-b border-red-500/20 text-[11px] text-red-300">
          {errorMsg}
        </div>
      )}

      {/* Requests list */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {!isLoggedIn ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center select-none">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300 mb-3">
              <PhosphorIcon name="ChatCircleSlash" size={24} weight="duotone" />
            </div>
            <p className="text-xs font-bold text-white mb-1">Inicio de Sesión Requerido</p>
            <p className="text-[11px] text-text-muted max-w-[240px] mb-4">
              Inicia sesión con tu cuenta de moderador o creador para consultar y resolver apelaciones de desbaneo.
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
            <span>Cargando solicitudes...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-text-muted select-none">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-2 text-white/30">
              <PhosphorIcon name="ChatCircleSlash" size={20} weight="duotone" />
            </div>
            <p className="text-xs font-semibold text-white/70">Sin solicitudes {statusFilter}</p>
            <p className="text-[10px] text-text-muted mt-0.5 max-w-[220px]">
              {statusFilter === 'pending'
                ? 'No hay peticiones de desbaneo pendientes de revisión en este momento.'
                : `No hay registros con estado "${statusFilter}".`}
            </p>
          </div>
        ) : (
          requests.map(req => {
            const isPending = actionPending[req.id]
            const username = req.user_login || req.user_name || 'Usuario'
            const createdAt = req.created_at ? new Date(req.created_at).toLocaleString() : ''

            return (
              <div
                key={req.id}
                className="p-3 rounded-xl border border-white/10 bg-white/[0.03] space-y-2 animate-fade-in"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button
                      onClick={() => onInspectUser?.({ username, userId: req.user_id })}
                      className="text-xs font-bold text-white hover:text-twitch-glow hover:underline cursor-pointer truncate"
                    >
                      @{username}
                    </button>
                  </div>
                  <span className="text-[10px] text-text-muted/60 font-mono shrink-0">{createdAt}</span>
                </div>

                {/* User Appeal Message */}
                <div className="p-2.5 rounded-lg bg-black/40 border border-white/5 space-y-1">
                  <span className="text-[9px] uppercase font-bold text-text-muted">Mensaje de apelación:</span>
                  <p className="text-xs text-white/90 break-words font-sans">
                    "{req.text || req.message || 'Sin mensaje especificado'}"
                  </p>
                </div>

                {/* Optional resolution input */}
                {statusFilter === 'pending' && showInputFor === req.id && (
                  <input
                    type="text"
                    placeholder="Nota de resolución para el usuario (opcional)..."
                    value={resolutionTextMap[req.id] || ''}
                    onChange={e => setResolutionTextMap({ ...resolutionTextMap, [req.id]: e.target.value })}
                    className="w-full bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-twitch"
                  />
                )}

                {/* Action buttons */}
                {statusFilter === 'pending' && (
                  <div className="flex items-center justify-between pt-1 gap-2">
                    <button
                      onClick={() => setShowInputFor(showInputFor === req.id ? null : req.id)}
                      className="text-[10px] text-twitch-glow hover:underline cursor-pointer"
                    >
                      {showInputFor === req.id ? 'Ocultar nota' : '+ Añadir nota'}
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleResolve(req.id, 'denied')}
                        disabled={isPending}
                        className="flex items-center gap-1 px-2.5 py-1 bg-red-500/15 hover:bg-red-500/30 text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                        title="Rechazar solicitud"
                      >
                        <PhosphorIcon name="X" size={13} weight="bold" />
                        <span>Rechazar</span>
                      </button>
                      <button
                        onClick={() => handleResolve(req.id, 'approved')}
                        disabled={isPending}
                        className="flex items-center gap-1 px-2.5 py-1 bg-green-500/15 hover:bg-green-500/30 text-green-300 border border-green-500/30 hover:border-green-500/50 rounded-lg text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                        title="Aprobar y desbanear usuario"
                      >
                        <PhosphorIcon name="CheckCircle" size={13} weight="bold" />
                        <span>Aprobar / Unban</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

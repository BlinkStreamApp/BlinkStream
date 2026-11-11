

import { useState, useCallback, useMemo, useEffect } from 'react'
import { ActionModal } from './ActionModal'
import { useModeration } from '../../hooks/useModeration'
import { ModerationContext } from './moderationContextValue'
import { openNativeWhisper } from '../../utils/whispers'
import NativeWhispers from '../chat/NativeWhispers'
import { clearChannelActivity } from '../../utils/channelActivity'

export function ModerationProvider({
  children,
  broadcasterId,
  userId,
  onPromoteAction,
  onToast,
}) {
  const [actionModal, setActionModal] = useState(null)
  useEffect(() => () => clearChannelActivity(String(userId || '')), [userId])
  const mod = useModeration({ broadcasterId, userId })

  const openAction = useCallback((action, target) => {
    if (!action || !target) return

    if ((action === 'mod' || action === 'unmod' || action === 'vip' || action === 'unvip') && target?.user_login) {
      try {
        window.dispatchEvent(new CustomEvent('bs:chat:prefill', {
          detail: { text: `/${action} ${target.user_login} ` },
        }))
        onToast?.({ type: 'info', message: `Comando /${action} ${target.user_login} pre-llenado en el chat. Pulsa Enter para enviar.` })
      } catch {
        onToast?.({ type: 'error', message: 'No se pudo preparar el comando de promocion' })
      }
      return
    }
    setActionModal({ open: true, action, target })
  }, [onToast])

  const closeAction = useCallback(() => {
    setActionModal(null)
  }, [])

  const executeAction = useCallback(async (action, target) => {
    if (!action || !target) return false
    switch (action) {
      case 'copy': {
        if (target.user_login) {
          try {
            await navigator.clipboard.writeText(target.user_login)
            onToast?.({ type: 'info', message: `Username copiado: ${target.user_login}` })
            return true
          } catch {
            onToast?.({ type: 'error', message: 'No se pudo copiar al portapapeles' })
            return false
          }
        }
        return false
      }
      case 'whisper': {
        return openNativeWhisper(target)
      }
      case 'delete': {
        if (!target.message_id) {
          onToast?.({ type: 'error', message: 'No se puede borrar: falta el id de mensaje' })
          return false
        }
        const ok = await mod.deleteMessage(target.message_id, target.user_login)
        if (ok) onToast?.({ type: 'success', message: 'Mensaje borrado' })
        else onToast?.({ type: 'error', message: 'No se pudo borrar el mensaje' })
        return ok
      }
      case 'profile': {

        onToast?.({ type: 'info', message: 'Abre la tarjeta del usuario (click en el nombre)' })
        return true
      }
      default:
        return false
    }
  }, [mod, onToast])

  const value = useMemo(() => ({
    actionModal,
    openAction,
    closeAction,
    executeAction,

    mod,
  }), [actionModal, openAction, closeAction, executeAction, mod])

  const handleConfirm = useCallback(async ({ reason, duration }) => {
    if (!actionModal) return
    const { action, target } = actionModal
    let ok = false
    try {
      switch (action) {
        case 'ban':       ok = await mod.ban(target.user_id, target.user_login, reason); break
        case 'unban':     ok = await mod.unban(target.user_id, target.user_login); break
        case 'timeout':   ok = await mod.timeout(target.user_id, target.user_login, duration, reason); break
        case 'untimeout': ok = await mod.untimeout(target.user_id, target.user_login); break
        case 'mod':
        case 'unmod':
        case 'vip':
        case 'unvip': {
          if (onPromoteAction) {
            ok = await onPromoteAction(action, target)
          } else {
            onToast?.({ type: 'error', message: 'Promocion no disponible en este contexto' })
          }
          break
        }
        default:
          break
      }
    } catch (err) {
      ok = false
      onToast?.({ type: 'error', message: 'Error al ejecutar la accion' })
      console.error('[ModerationContext] action failed', action, err)
    }
    if (ok) {
      const labels = {
        ban: 'Usuario baneado',
        unban: 'Usuario desbaneado',
        timeout: `Timeout aplicado (${duration}s)`,
        untimeout: 'Timeout retirado',
        mod: 'Usuario promovido a mod',
        unmod: 'Mod retirado',
        vip: 'VIP añadido',
        unvip: 'VIP retirado',
      }
      onToast?.({ type: 'success', message: labels[action] || 'Accion completada' })
      setActionModal(null)
    } else {
      onToast?.({ type: 'error', message: 'La accion fallo. Revisa los permisos o el rate limit.' })
    }
  }, [actionModal, mod, onPromoteAction, onToast])

  return (
    <ModerationContext.Provider value={value}>
      {children}
      <NativeWhispers key={userId || 'signed-out'} account={userId ? String(userId) : ''} />
      {actionModal && (
        <ActionModal
          open={actionModal.open}
          onClose={closeAction}
          onConfirm={handleConfirm}
          action={actionModal.action}
          targetUser={actionModal.target}
          busy={mod.isRateLimited}
        />
      )}
    </ModerationContext.Provider>
  )
}

export default ModerationProvider

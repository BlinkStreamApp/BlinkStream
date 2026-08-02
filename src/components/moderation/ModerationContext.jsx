/**
 * @file ModerationProvider — provider del sistema de moderacion
 * (WT-20260628-56). Solo exporta el componente Provider para
 * satisfacer `react-refresh/only-export-components`. El objeto
 * Context y los hooks viven en `moderationContextValue.js`.
 *
 * Por que hace falta el provider: el boton derecho sobre un mensaje
 * vive en Chat.jsx (capa profunda del arbol). El ActionModal quiere
 * vivir en App.jsx para tener acceso al broadcasterId/userId via
 * context y para que solo exista UN modal a la vez (UX consistente
 * con el resto de overlays de la app: Settings, About, CPPanel, etc.).
 *
 * Patron: cualquier hijo puede llamar `openAction(action, target)`. El
 * Provider monta el ActionModal una sola vez y resuelve la accion
 * final contra `useModeration` (Helix API). Para acciones que NO
 * pasan por el modal (whisper, copy username, delete message),
 * las manejamos inline con feedback al usuario.
 *
 * Acciones soportadas:
 *   - 'ban' | 'unban'         -> openAction -> ActionModal -> useModeration.ban/unban
 *   - 'timeout' | 'untimeout' -> openAction -> ActionModal -> useModeration.timeout/untimeout
 *   - 'mod' | 'unmod'         -> openAction -> prefill /mod en chat (sin WS directo)
 *   - 'vip' | 'unvip'         -> openAction -> prefill /vip en chat (sin WS directo)
 *   - 'whisper'               -> executeAction -> abre popout de Twitch
 *   - 'profile'               -> executeAction -> toast informativo
 *   - 'copy'                  -> executeAction -> clipboard
 *   - 'delete'                -> executeAction -> useModeration.deleteMessage
 */

import { useState, useCallback, useMemo } from 'react'
import { ActionModal } from './ActionModal'
import { useModeration } from '../../hooks/useModeration'
import { ModerationContext } from './moderationContextValue'
import { safeOpenUrl } from '../../utils/tauriEnv'

/**
 * Provider que mantiene el estado del modal de moderacion y expone
 * helpers para que cualquier hijo dispare acciones de mod.
 *
 * Props:
 *   - broadcasterId, userId: id del canal + viewer (para que useModeration
 *     sepa a quien actuar y aplique rate limit per-canal).
 *   - onPromoteAction: callback para mod/unmod/vip/unvip cuando la
 *     accion pasa por el modal (no usado por el flujo actual, pero
 *     se mantiene para compatibilidad con el ModPanel).
 *   - onToast: callback opcional para mostrar feedback al usuario
 *     (p.ej. "Username copiado"). Si no se provee, no se muestra nada.
 */
export function ModerationProvider({
  children,
  broadcasterId,
  userId,
  onPromoteAction,
  onToast,
}) {
  const [actionModal, setActionModal] = useState(null)
  const mod = useModeration({ broadcasterId, userId })

  const openAction = useCallback((action, target) => {
    if (!action || !target) return
    // Para acciones de promocion (mod/unmod/vip/unvip) desde fuera del
    // ModPanel no tenemos acceso al WS de chat aqui. En vez de bloquear,
    // pre-llenamos la caja de input del chat con el comando IRC y
    // dejamos que el usuario lo envie (un Enter). Esto evita acoplar el
    // contexto al WS privado de Chat.jsx.
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

  /**
   * Ejecuta una accion que NO requiere el modal (whisper/copy/delete/profile).
   * Devuelve true si se completo (o si no aplica error).
   */
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
        // Twitch no expone DM publico sin scopes especiales; el workaround
        // mas simple y estable es abrir la pagina de chat del usuario con
        // un query param `?whisper=USERNAME`. Twitch lo interpreta nativo.
        if (target.user_login) {
          const url = `https://www.twitch.tv/popout/${target.user_login}/chat?whisper=${encodeURIComponent(target.user_login)}`
          try { safeOpenUrl(url, false) } catch { /* no-op: popup bloqueado */ }
          return true
        }
        return false
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
        // El popcard ya lo maneja Chat.jsx via setUserCard; aqui solo
        // delegamos devolviendo true para que el caller no haga nada raro.
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
    // expongo `mod` por si algun consumidor quiere `remainingActions` o
    // `auditLog` sin re-instanciar el hook.
    mod,
  }), [actionModal, openAction, closeAction, executeAction, mod])

  /**
   * Handler de confirm del ActionModal. Despacha a useModeration para
   * ban/unban/timeout/untimeout y a onPromoteAction para mod/vip.
   * Devuelve true si la accion se ejecuto OK; el ActionModal cierra
   * su overlay automaticamente al hacer onClose (lo invoca el padre).
   */
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

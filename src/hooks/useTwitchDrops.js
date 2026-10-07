import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchUserDropsInventory, claimDropReward, parseDropsInventory, isDropsIntegrityError } from '../utils/drops'
import { getStoredToken } from '../utils/twitch'
import { isTauri } from '../utils/tauriEnv'

const AUTOCLAIM_KEY = 'blinkstream_drops_autoclaim'
const CLAIM_BLOCKED_KEY = 'blinkstream_drops_claim_blocked'
const INITIAL_SYNC_TIMEOUT_MS = 22000
const AUTOCLAIM_RETRY_DELAY_MS = 60000

export function useTwitchDrops(token, channel = null, prepareOfficialInventory = null) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [syncStatus, setSyncStatus] = useState('starting')
  const [syncError, setSyncError] = useState(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const [claimBlocked, setClaimBlocked] = useState(() => {
    try { return sessionStorage.getItem(CLAIM_BLOCKED_KEY) === 'true' } catch { return false }
  })
  const claimBlockedRef = useRef(claimBlocked)
  const [autoClaim, setAutoClaim] = useState(() => {
    if (claimBlocked) return false
    try {
      const stored = localStorage.getItem(AUTOCLAIM_KEY)
      return stored !== null ? stored === 'true' : true
    } catch {
      return true
    }
  })
  const [claimingIds, setClaimingIds] = useState(new Set())
  const claimingIdsRef = useRef(new Set())
  const claimAttemptsRef = useRef(new Map())
  const refreshInFlightRef = useRef(null)
  const [lastClaimedDrop, setLastClaimedDrop] = useState(null)
  const [claimError, setClaimError] = useState(null)
  const claimErrorIdRef = useRef(null)
  const syncStatusRef = useRef('starting')

  const pollingTimerRef = useRef(null)

  const refreshDrops = useCallback((force = true) => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current.promise
    const request = { promise: null }
    refreshInFlightRef.current = request
    const visible = force !== false
    request.promise = (async () => {
      try {
        if (visible) setLoading(true)
        const effectiveToken = token || (await getStoredToken())
        const data = await fetchUserDropsInventory(effectiveToken, channel, { force: visible })
        if (refreshInFlightRef.current !== request) return
        const nextStatus = data.status || 'ready'
        setCampaigns(data.campaigns || [])
        setAuthRequired(Boolean(data.authRequired))
        if (!(nextStatus === 'starting' && syncStatusRef.current === 'bridge-timeout')) {
          syncStatusRef.current = nextStatus
          setSyncStatus(nextStatus)
          setSyncError(data.error || null)
        }
        setLastUpdatedAt(data.updatedAt || null)
      } catch (err) {
        if (refreshInFlightRef.current !== request) return
        console.warn('[useTwitchDrops] Error refreshing drops:', err)
        syncStatusRef.current = 'error'
        setSyncStatus('error')
        setSyncError(err instanceof Error ? err.message : String(err))
      } finally {
        if (refreshInFlightRef.current === request) {
          refreshInFlightRef.current = null
          if (visible) setLoading(false)
        }
      }
    })()
    return request.promise
  }, [token, channel])

  // Listen to background watcher updates via Tauri event
  useEffect(() => {
    let unlisten = null
    let disposed = false
    if (isTauri()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('twitch_drops_update', (event) => {
          if (disposed || (event?.payload?.channel && event.payload.channel !== channel)) return
          const state = parseDropsInventory(event?.payload)
          setCampaigns(state.campaigns)
          setAuthRequired(state.authRequired)
          syncStatusRef.current = state.status
          setSyncStatus(state.status)
          setSyncError(state.error)
          setLastUpdatedAt(state.updatedAt)
        }).then(fn => {
          if (disposed) fn()
          else unlisten = fn
        })
      }).catch(() => {})
    }

    return () => {
      disposed = true
      if (unlisten) unlisten()
    }
  }, [channel])

  useEffect(() => {
    if (syncStatus !== 'starting') return undefined

    const timer = setTimeout(() => {
      if (syncStatusRef.current !== 'starting') return
      syncStatusRef.current = 'bridge-timeout'
      setSyncStatus('bridge-timeout')
      setSyncError('La sincronización nativa de Drops no respondió a tiempo.')
    }, INITIAL_SYNC_TIMEOUT_MS)

    return () => clearTimeout(timer)
  }, [syncStatus])

  const claimDrop = useCallback(async (dropInstanceId, benefitName = 'Recompensa') => {
    if (claimBlockedRef.current || !dropInstanceId || claimingIdsRef.current.has(dropInstanceId) || claimAttemptsRef.current.get(dropInstanceId)?.confirmed) return

    try {
      claimingIdsRef.current.add(dropInstanceId)
      const campaign = campaigns.find(c => c.drops?.some(d => d.dropInstanceId === dropInstanceId))
      const drop = campaign?.drops.find(d => d.dropInstanceId === dropInstanceId)
      const attempt = { attemptedAt: Date.now(), confirmed: false,
        campaignId: campaign?.id, dropId: drop?.id, benefitName }
      claimAttemptsRef.current.set(dropInstanceId, attempt)
      setClaimingIds(new Set(claimingIdsRef.current))
      setClaimError(null)
      claimErrorIdRef.current = null

      const effectiveToken = token || (await getStoredToken())
      const inventorySession = await prepareOfficialInventory?.()
      const result = inventorySession
        ? await claimDropReward(dropInstanceId, effectiveToken, inventorySession)
        : await claimDropReward(dropInstanceId, effectiveToken)
      if (!result?.success) throw new Error('Twitch no confirmó el reclamo del Drop')
      attempt.confirmed = true
      setLastClaimedDrop({ id: dropInstanceId, name: benefitName, time: Date.now() })
      await refreshDrops()
    } catch (err) {
      // A watcher update may have confirmed a manual claim while the native command was waiting.
      const attempt = claimAttemptsRef.current.get(dropInstanceId)
      if (attempt?.confirmed) return
      console.error('[useTwitchDrops] Error claiming drop:', err)
      setClaimError(err instanceof Error ? err.message : String(err))
      claimErrorIdRef.current = dropInstanceId
      if (isTauri() || /No se pudo confirmar el reclamo en la página oficial|La ventana oficial de Drops se ha cerrado/.test(err instanceof Error ? err.message : String(err))) {
        if (attempt) attempt.pendingConfirmation = true
        // Persist the pause so closing/reopening the panel cannot launch another official window.
        setAutoClaim(false)
        try { localStorage.setItem(AUTOCLAIM_KEY, 'false') } catch { /* Keep the in-memory pause. */ }
      }
      if (isDropsIntegrityError(err)) {
        claimBlockedRef.current = true
        setClaimBlocked(true)
        setAutoClaim(false)
        try {
          sessionStorage.setItem(CLAIM_BLOCKED_KEY, 'true')
          localStorage.setItem(AUTOCLAIM_KEY, 'false')
        } catch { /* La pausa en memoria sigue activa si el almacenamiento no está disponible. */ }
      }
    } finally {
      claimingIdsRef.current.delete(dropInstanceId)
      setClaimingIds(new Set(claimingIdsRef.current))
    }
  }, [token, refreshDrops, campaigns, prepareOfficialInventory])

  // Periodic polling
  useEffect(() => {
    let active = true

    const check = async () => {
      if (!active) return
      await refreshDrops(false)
    }

    check()
    pollingTimerRef.current = setInterval(check, 15000)

    return () => {
      active = false
      refreshInFlightRef.current = null
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
    }
  }, [refreshDrops])

  useEffect(() => {
    for (const [instance, attempt] of claimAttemptsRef.current) {
      if (attempt.confirmed || !attempt.dropId || !attempt.campaignId) continue
      const drop = campaigns.find(c => c.id === attempt.campaignId)?.drops?.find(d => d.id === attempt.dropId)
      if (!drop?.isClaimed) continue
      claimAttemptsRef.current.set(instance, { ...attempt, confirmed: true, pendingConfirmation: false })
      setLastClaimedDrop({ id: instance, name: attempt.benefitName, time: Date.now() })
      if (claimErrorIdRef.current === instance) {
        claimErrorIdRef.current = null
        setClaimError(null)
      }
    }
  }, [campaigns])

  // Auto-claim trigger when campaigns change
  useEffect(() => {
    if (!autoClaim || claimBlockedRef.current || claimingIdsRef.current.size > 0) return

    for (const campaign of campaigns) {
      for (const drop of campaign.drops || []) {
        const attempt = claimAttemptsRef.current.get(drop.dropInstanceId)
        if (drop.isReadyToClaim && drop.dropInstanceId && !claimingIdsRef.current.has(drop.dropInstanceId)
          && !attempt?.confirmed && !attempt?.pendingConfirmation && (!attempt || Date.now() - attempt.attemptedAt >= AUTOCLAIM_RETRY_DELAY_MS)) {
          claimDrop(drop.dropInstanceId, drop.benefitName)
          return
        }
      }
    }
  }, [campaigns, autoClaim, claimDrop, claimingIds])

  const toggleAutoClaim = useCallback(() => {
    if (!autoClaim || claimBlockedRef.current) {
      setClaimError(null)
      claimErrorIdRef.current = null
      for (const [id, attempt] of claimAttemptsRef.current) {
        if (!attempt.confirmed) claimAttemptsRef.current.delete(id)
      }
    }
    if (claimBlockedRef.current) {
      claimBlockedRef.current = false
      setClaimBlocked(false)
      try { sessionStorage.removeItem(CLAIM_BLOCKED_KEY) } catch { /* Recuperación explícita en memoria. */ }
    }
    setAutoClaim(prev => {
      const next = !prev
      try {
        localStorage.setItem(AUTOCLAIM_KEY, next ? 'true' : 'false')
      } catch {
        // Ignorar
      }
      return next
    })
  }, [autoClaim])

  const claimableCount = campaigns.reduce((acc, c) => {
    return acc + (c.drops?.filter(d => d.isReadyToClaim)?.length || 0)
  }, 0)

  return {
    campaigns,
    loading,
    authRequired,
    syncStatus,
    syncError,
    lastUpdatedAt,
    autoClaim,
    toggleAutoClaim,
    claimDrop,
    claimingIds,
    claimableCount,
    lastClaimedDrop,
    claimError,
    claimBlocked,
    refreshDrops,
  }
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchUserDropsInventory, claimDropReward, parseCampaign } from '../utils/drops'
import { getStoredToken } from '../utils/twitch'

const AUTOCLAIM_KEY = 'blinkstream_drops_autoclaim'

export function useTwitchDrops(token, channel = null) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(false)
  const [autoClaim, setAutoClaim] = useState(() => {
    try {
      const stored = localStorage.getItem(AUTOCLAIM_KEY)
      return stored !== null ? stored === 'true' : true
    } catch {
      return true
    }
  })
  const [claimingIds, setClaimingIds] = useState(new Set())
  const claimingIdsRef = useRef(new Set())
  const [lastClaimedDrop, setLastClaimedDrop] = useState(null)

  const pollingTimerRef = useRef(null)

  const refreshDrops = useCallback(async () => {
    const effectiveToken = token || (await getStoredToken())

    try {
      setLoading(true)
      const data = await fetchUserDropsInventory(effectiveToken, channel)
      setCampaigns(data.campaigns || [])
    } catch (err) {
      console.warn('[useTwitchDrops] Error refreshing drops:', err)
    } finally {
      setLoading(false)
    }
  }, [token, channel])

  // Listen to background watcher updates via Tauri event
  useEffect(() => {
    let unlisten = null
    const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
    if (isTauri) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('twitch_drops_update', (event) => {
          const rawList = event?.payload?.campaigns || []
          if (Array.isArray(rawList)) {
            const campaignMap = new Map()
            for (const c of rawList) {
              if (c?.id) {
                campaignMap.set(c.id, parseCampaign(c, false))
              }
            }
            const updated = Array.from(campaignMap.values())
            if (updated.length > 0) {
              setCampaigns(updated)
            }
          }
        }).then(fn => { unlisten = fn })
      }).catch(() => {})
    }

    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  const claimDrop = useCallback(async (dropInstanceId, benefitName = 'Recompensa') => {
    const effectiveToken = token || (await getStoredToken())
    if (!dropInstanceId || claimingIdsRef.current.has(dropInstanceId)) return

    try {
      claimingIdsRef.current.add(dropInstanceId)
      setClaimingIds(new Set(claimingIdsRef.current))

      await claimDropReward(dropInstanceId, effectiveToken)
      setLastClaimedDrop({ id: dropInstanceId, name: benefitName, time: Date.now() })
      await refreshDrops()
    } catch (err) {
      console.error('[useTwitchDrops] Error claiming drop:', err)
    } finally {
      claimingIdsRef.current.delete(dropInstanceId)
      setClaimingIds(new Set(claimingIdsRef.current))
    }
  }, [token, refreshDrops])

  // Periodic polling
  useEffect(() => {
    let active = true

    const check = async () => {
      if (!active) return
      await refreshDrops()
    }

    check()
    pollingTimerRef.current = setInterval(check, 15000)

    return () => {
      active = false
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
    }
  }, [refreshDrops])

  // Auto-claim trigger when campaigns change
  useEffect(() => {
    if (!autoClaim) return

    for (const campaign of campaigns) {
      for (const drop of campaign.drops || []) {
        if (drop.isReadyToClaim && drop.dropInstanceId && !claimingIdsRef.current.has(drop.dropInstanceId)) {
          claimDrop(drop.dropInstanceId, drop.benefitName)
          break
        }
      }
    }
  }, [campaigns, autoClaim, claimDrop])

  const toggleAutoClaim = useCallback(() => {
    setAutoClaim(prev => {
      const next = !prev
      try {
        localStorage.setItem(AUTOCLAIM_KEY, next ? 'true' : 'false')
      } catch {
        // Ignorar
      }
      return next
    })
  }, [])

  const claimableCount = campaigns.reduce((acc, c) => {
    return acc + (c.drops?.filter(d => d.isReadyToClaim)?.length || 0)
  }, 0)

  return {
    campaigns,
    loading,
    autoClaim,
    toggleAutoClaim,
    claimDrop,
    claimingIds,
    claimableCount,
    lastClaimedDrop,
    refreshDrops,
  }
}

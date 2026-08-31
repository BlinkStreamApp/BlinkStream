import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchUserDropsInventory, claimDropReward } from '../utils/drops'

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
    if (!token) {
      setCampaigns([])
      return
    }

    try {
      setLoading(true)
      const data = await fetchUserDropsInventory(token, channel)
      setCampaigns(data.campaigns || [])
    } catch (err) {
      console.warn('[useTwitchDrops] Error refreshing drops:', err)
    } finally {
      setLoading(false)
    }
  }, [token, channel])

  const claimDrop = useCallback(async (dropInstanceId, benefitName = 'Recompensa') => {
    if (!token || !dropInstanceId || claimingIdsRef.current.has(dropInstanceId)) return

    try {
      claimingIdsRef.current.add(dropInstanceId)
      setClaimingIds(new Set(claimingIdsRef.current))

      await claimDropReward(dropInstanceId, token)
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
    if (!token) return

    let active = true

    const check = async () => {
      if (!active) return
      await refreshDrops()
    }

    check()
    pollingTimerRef.current = setInterval(check, 60000)

    return () => {
      active = false
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current)
    }
  }, [token, refreshDrops])

  // Auto-claim trigger when campaigns change
  useEffect(() => {
    if (!autoClaim || !token) return

    for (const campaign of campaigns) {
      for (const drop of campaign.drops || []) {
        if (drop.isReadyToClaim && drop.dropInstanceId && !claimingIdsRef.current.has(drop.dropInstanceId)) {
          claimDrop(drop.dropInstanceId, drop.benefitName)
          break
        }
      }
    }
  }, [campaigns, autoClaim, token, claimDrop])

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

import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauriEnv'
import { parseDropsInventory } from './drops'

const empty = account => ({ account, accountId: null, verifiedLogin: null, enabled: null, session: null, phase: 'idle', campaigns: [],
  updatedAt: null, catalogCount: 0, error: null, claimOutcome: null, claimingId: null, claimBlocked: false,
  autoClaim: false, remember: false, savingPreference: false })
let snapshot = empty('')
let raw = null
let generation = 0
let reading = null
let checking = null
let timer = null
let autoRunning = false
let attempted = new Set()
const listeners = new Set()
const pending = phase => ['preparing', 'authorizing', 'checking'].includes(phase)
const publish = changes => { snapshot = { ...snapshot, ...changes }; listeners.forEach(listener => listener()) }
const current = (version, session) => generation === version && snapshot.session === session
const nativeClose = session => session ? invoke('disconnect_experimental_drops', { session }).catch(() => {}) : Promise.resolve()
function invalidateSession(session, error) {
  generation++
  checking = null
  reading = null
  raw = null
  publish({ session: null, accountId: null, verifiedLogin: null, phase: 'idle', campaigns: [], updatedAt: null,
    claimingId: null, claimOutcome: null, autoClaim: false, remember: false, error })
  void nativeClose(session)
}

export const getDropsSnapshot = () => snapshot
export function subscribeDrops(listener) {
  listeners.add(listener)
  if (!timer) timer = setInterval(() => {
    if (snapshot.session && snapshot.phase === 'ready' && !snapshot.claimingId && document.visibilityState !== 'hidden') {
      void refreshDropsSession()
    }
  }, 60000)
  return () => {
    listeners.delete(listener)
    if (!listeners.size) { clearInterval(timer); timer = null }
  }
}

export function bindDropsAccount(account) {
  const owner = String(account || '').trim().toLowerCase()
  if (snapshot.account === owner) return
  const previous = snapshot.session
  generation++
  raw = null
  reading = null
  checking = null
  attempted = new Set()
  snapshot = empty(owner)
  publish({})
  void nativeClose(previous)
}

export async function checkDropsSession() {
  if (checking) return checking
  const version = generation
  const session = snapshot.session
  checking = (async () => {
    try {
      if (!isTauri()) { if (generation === version) publish({ enabled: false, phase: 'unavailable' }); return }
      const status = await invoke('experimental_drops_status', { session })
      if (!current(version, session)) {
        if (!session && status?.session) void nativeClose(status.session)
        return
      }
      if (!status?.enabled) { publish({ enabled: false, phase: 'unavailable' }); return }
      if (!session && snapshot.account && status.phase === 'connected' && /^[a-f0-9]{32}$/.test(status.session || '')) {
        if (!/^[0-9]{1,25}$/.test(String(status.accountId || ''))) return
        publish({ session: status.session, enabled: true, phase: 'connected', accountId: String(status.accountId),
          verifiedLogin: status.login || '', remember: Boolean(status.remember), claimBlocked: Boolean(status.claimBlocked) })
        void refreshDropsSession()
        return
      }
      if (session && status.phase === 'idle') {
        invalidateSession(session, 'authorization')
      } else if (session && pending(snapshot.phase)) {
        if (status.phase === 'connected') {
          if (!/^[0-9]{1,25}$/.test(String(status.accountId || ''))) { invalidateSession(session, 'account'); return }
          publish({ enabled: true, phase: 'connected', accountId: String(status.accountId), verifiedLogin: status.login || '',
            remember: Boolean(status.remember), claimBlocked: Boolean(status.claimBlocked) })
          void refreshDropsSession()
        } else if (pending(status.phase)) publish({ enabled: true, phase: status.phase })
        else invalidateSession(session, status.phase || 'authorization')
      } else publish({ enabled: true })
    } catch (error) {
      if (current(version, session)) publish({ enabled: true, error: String(error?.message || error), phase: session ? 'error' : 'idle' })
    }
    finally { if (generation === version) checking = null }
  })()
  return checking
}

export async function connectDropsSession() {
  if (!snapshot.account || pending(snapshot.phase)) return
  const previous = snapshot.session
  const version = ++generation
  reading = null
  checking = null
  raw = null
  attempted = new Set()
  publish({ session: null, accountId: null, verifiedLogin: null, phase: 'preparing', campaigns: [], updatedAt: null, catalogCount: 0, error: null, claimOutcome: null, claimBlocked: false, autoClaim: false, remember: false })
  await nativeClose(previous)
  if (generation !== version) return
  publish({ session: crypto.randomUUID().replaceAll('-', '') })
}

export function disconnectDropsSession() {
  const previous = snapshot.session
  generation++
  reading = null
  checking = null
  raw = null
  attempted = new Set()
  snapshot = { ...empty(snapshot.account), enabled: snapshot.enabled }
  publish({})
  const version = generation
  return previous ? invoke('disconnect_experimental_drops', { session: previous }).catch(() => {
    if (generation === version) publish({ error: 'storage' })
  }) : Promise.resolve()
}

export function failDropsAuthorization(session, code) {
  if (snapshot.session !== session) return
  invalidateSession(session, String(code))
}

export function refreshDropsSession() {
  if (reading) return reading
  if (!snapshot.session || snapshot.claimingId || pending(snapshot.phase)) return Promise.resolve()
  const version = generation
  const session = snapshot.session
  publish({ phase: 'loading', error: null })
  const request = { promise: null }
  reading = request.promise = (async () => {
    try {
      const data = await invoke('experimental_drops_probe', { session })
      if (!current(version, session)) return
      if (!snapshot.accountId || String(data?.accountId || '') !== snapshot.accountId) throw new Error('account')
      const parsed = parseDropsInventory(data)
      raw = data
      publish({ phase: 'ready', campaigns: parsed.campaigns, updatedAt: parsed.updatedAt,
        catalogCount: data.catalogCampaigns?.length || 0, error: null })
    } catch (error) {
      if (!current(version, session)) return
      const code = String(error?.message || error)
      if (['account', 'authorization', 'cancelled'].includes(code)) {
        invalidateSession(session, code)
      } else publish({ phase: 'error', error: code, autoClaim: false })
    } finally {
      if (reading === request.promise) reading = null
      if (current(version, session)) await runAutoClaims()
    }
  })()
  return request.promise
}

export async function claimSessionDrop(instance) {
  if (!snapshot.session || !raw || snapshot.claimingId || snapshot.claimBlocked || snapshot.phase !== 'ready') return
  const target = snapshot.campaigns.flatMap(campaign => campaign.drops).find(drop => drop.dropInstanceId === instance && drop.isReadyToClaim)
  if (!target) return
  const version = generation
  const session = snapshot.session
  attempted.add(instance)
  publish({ claimingId: instance, claimOutcome: null, error: null })
  try {
    const data = await invoke('claim_experimental_drop', { session, instance })
    if (!current(version, session)) return
    if (!['claimed', 'already-claimed'].includes(data?.outcome) || !Array.isArray(data.campaigns)) throw new Error('uncertain')
    const refreshed = { ...raw, campaigns: data.campaigns, updatedAt: data.updatedAt }
    const parsed = parseDropsInventory(refreshed)
    const ownerCampaign = snapshot.campaigns.find(campaign => campaign.drops.includes(target))
    if (!parsed.campaigns.some(campaign => campaign.id === ownerCampaign?.id && campaign.drops.some(drop => drop.id === target.id && drop.isClaimed))) throw new Error('uncertain')
    raw = refreshed
    publish({ campaigns: parsed.campaigns, updatedAt: parsed.updatedAt, claimOutcome: data.outcome, claimingId: null })
    return true
  } catch (error) {
    if (current(version, session)) publish({ claimingId: null, claimBlocked: true, autoClaim: false, error: String(error?.message || error) })
    return false
  }
}

async function runAutoClaims() {
  if (autoRunning || reading) return
  const version = generation
  const session = snapshot.session
  autoRunning = true
  try {
    while (current(version, session) && snapshot.autoClaim && snapshot.phase === 'ready' && !snapshot.claimBlocked &&
      !snapshot.claimingId && document.visibilityState !== 'hidden') {
      const target = snapshot.campaigns.flatMap(campaign => campaign.drops)
        .find(drop => drop.isReadyToClaim && !attempted.has(drop.dropInstanceId))
      if (!target || !await claimSessionDrop(target.dropInstanceId)) break
    }
  } finally { autoRunning = false }
}

export async function setDropsAutoClaim(enabled) {
  if (!enabled) { publish({ autoClaim: false }); return }
  if (!snapshot.session || snapshot.phase !== 'ready' || snapshot.claimBlocked || snapshot.claimingId) return
  publish({ autoClaim: true })
  await refreshDropsSession()
}

export async function setDropsRemember(remember) {
  if (!snapshot.session || snapshot.savingPreference || snapshot.claimingId || pending(snapshot.phase)) return
  const version = generation
  const session = snapshot.session
  publish({ savingPreference: true })
  try {
    await invoke('remember_drops_connection', { session, remember })
    if (current(version, session)) publish({ remember, error: null })
  } catch {
    if (current(version, session)) publish({ error: 'storage' })
  } finally {
    if (current(version, session)) publish({ savingPreference: false })
  }
}

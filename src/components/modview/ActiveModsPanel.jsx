import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { getModerators, getVips, getChatters } from '../../utils/twitch'
import PhosphorIcon from '../icons/PhosphorIcon'
import { ModDataNotice } from './ModDataNotice'
import CommunityGroups from '../chat/CommunityGroups'
import CommunityUserRow from '../chat/CommunityUserRow'
import { useT } from '../../utils/i18n'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../../utils/tauriEnv'

export function ActiveModsPanel({ broadcasterId, channelLogin, userId, recentMessages = [], onInspectUser, initialTab = 'groups' }) {
  const t = useT()
  const [tab, setTab] = useState(initialTab)
  const [mods, setMods] = useState([])
  const [vips, setVips] = useState([])
  const [chatters, setChatters] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [errors, setErrors] = useState({})
  const requestRef = useRef(0)

  const loadData = useCallback(async () => {
    const request = ++requestRef.current
    setMods([]); setVips([]); setChatters([]); setErrors({})
    if (!broadcasterId) { setLoading(false); return }
    setLoading(true)
    try {
      const results = await Promise.allSettled([
        getModerators(broadcasterId),
        /^[1-9][0-9]{0,31}$/.test(userId) && /^[1-9][0-9]{0,31}$/.test(broadcasterId) && String(userId) !== String(broadcasterId)
          ? Promise.resolve({ success: false, error: { context: { reason: 'broadcaster_only' } } })
          : getVips(broadcasterId),
        getChatters(broadcasterId, userId),
      ])
      if (request !== requestRef.current) return
      const failures = {}
      results.forEach((result, index) => {
        const key = ['mods', 'vips', 'chatters'][index]
        if (result.status === 'fulfilled' && result.value.success) {
          const setList = [setMods, setVips, setChatters][index]
          setList(result.value.value || [])
        } else failures[key] = result.status === 'rejected' ? result.reason || {} : result.value.error || {}
      })
      if (Object.keys(failures).length && channelLogin && isTauri()) {
        try {
          const roster = await invoke('get_public_chat_roster', { channel: channelLogin })
          if (request !== requestRef.current) return
          if (!Array.isArray(roster?.users)) throw new Error('response')
          if (failures.chatters) { setChatters(roster.users); delete failures.chatters }
          if (failures.mods) { setMods(roster.users.filter(user => user.isMod)); delete failures.mods }
          if (failures.vips) { setVips(roster.users.filter(user => user.isVip)) }
        } catch { /* Preserve the original access errors when the public list is unavailable. */ }
      }
      if (request === requestRef.current) setErrors(failures)
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [broadcasterId, channelLogin, userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData()
    return () => { requestRef.current += 1 }
  }, [loadData])

  // Unificar chatters de API con los que han hablado en chat en esta sesión
  const mergedChatters = useMemo(() => {
    const map = new Map()
    for (const c of chatters) {
      const uname = (c.user_login || c.user_name || '').toLowerCase()
      if (uname) {
        map.set(uname, {
          userId: c.user_id || c.id || '',
          user_login: c.user_login || c.user_name,
          user_name: c.user_name || c.user_login,
          isMod: Boolean(c.isMod),
          isBroadcaster: Boolean(c.isBroadcaster),
          isVip: Boolean(c.isVip),
          isSub: false,
          color: c.color,
        })
      }
    }
    for (const m of recentMessages) {
      const uname = (m.user || m.user_login || m.displayName || m.user_name || '').toLowerCase()
      if (uname) {
        const existing = map.get(uname) || {
          userId: m.user_id || m.userId || '',
          user_login: uname,
          user_name: m.displayName || m.user_name || m.user || uname,
        }

        const badges = m.badges || []
        const isBroadcaster = !!(m.isBroadcaster || badges.some(b => b.set === 'broadcaster' || b.name === 'broadcaster'))
        const isMod = !!(m.isMod || isBroadcaster || badges.some(b => b.set === 'moderator' || b.name === 'moderator'))
        const isVip = !!(m.isVip || badges.some(b => b.set === 'vip' || b.name === 'vip'))
        const isSub = !!(m.isSub || badges.some(b => b.set === 'subscriber' || b.name === 'subscriber'))

        map.set(uname, {
          ...existing,
          userId: existing.userId || m.user_id || m.userId || '',
          user_name: m.displayName || m.user_name || existing.user_name,
          isBroadcaster: existing.isBroadcaster || isBroadcaster,
          isMod: existing.isMod || isMod,
          isVip: existing.isVip || isVip,
          isSub: existing.isSub || isSub,
          color: m.color || existing.color,
        })
      }
    }
    return Array.from(map.values())
  }, [chatters, recentMessages])

  const allMods = useMemo(() => {
    const map = new Map()
    for (const m of mods) {
      const u = (m.user_login || m.user_name || '').toLowerCase()
      if (u) map.set(u, { ...m, isMod: true })
    }
    for (const c of mergedChatters) {
      if (c.isMod || c.isBroadcaster) {
        map.set(c.user_login.toLowerCase(), { ...c, isMod: true })
      }
    }
    return Array.from(map.values())
  }, [mods, mergedChatters])

  const allVips = useMemo(() => {
    const map = new Map()
    for (const v of vips) {
      const u = (v.user_login || v.user_name || '').toLowerCase()
      if (u) map.set(u, { ...v, isVip: true })
    }
    for (const c of mergedChatters) {
      if (c.isVip) {
        map.set(c.user_login.toLowerCase(), { ...c, isVip: true })
      }
    }
    return Array.from(map.values())
  }, [vips, mergedChatters])

  const vipError = errors.vips
  const vipOwnerOnly = vipError?.context?.reason === 'broadcaster_only'
  // A 401 alone also covers expired tokens and client mismatches.
  const vipMissingScope = (vipError?.context?.status ?? vipError?.status) === 401
    && /missing.*scope|scope.*required/i.test(vipError?.context?.twitchMsg || '')
  const vipNotice = vipOwnerOnly ? 'community.vipOwnerOnly' : vipMissingScope ? 'community.vipReadScope' : null

  const currentList = tab === 'chatters' ? mergedChatters : tab === 'mods' ? allMods : allVips
  const filteredList = currentList.filter(item => {
    const name = item.user_name || item.user_login || item.name || ''
    return name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col font-sans">
      {/* Subtabs */}
      <div className="shrink-0 flex items-center justify-between p-2 border-b border-white/10 bg-white/[0.02]">
        <select value={tab} onChange={event => setTab(event.target.value)} aria-label={t('community.filter')} className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-bg-secondary px-3 text-xs font-medium text-text-primary">
          <option value="groups">{t('community.title')}</option>
          <option value="chatters">{t('community.chatters')} ({mergedChatters.length})</option>
          <option value="mods">{t('community.moderators')} ({allMods.length})</option>
          <option value="vips">{t('community.vips')}{errors.vips ? '' : ` (${allVips.length})`}</option>
        </select>

        <button
          onClick={loadData}
          disabled={loading}
          type="button" aria-label={t('community.refresh')}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-text-muted hover:bg-white/10 cursor-pointer shrink-0 ml-2"
          title={t('community.refresh')}
        >
          <PhosphorIcon name="ArrowsClockwise" size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search filter */}
      <div className="p-2 border-b border-white/5">
        <input
          type="search"
          placeholder={t('community.search')} aria-label={t('community.search')} maxLength={100}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 w-full min-w-0 bg-white/5 border border-white/10 rounded-lg px-3 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-twitch"
        />
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {(tab === 'groups' || tab === 'vips') && vipError ? <div role="note" className="px-3 py-2 text-xs text-amber-300">
          {vipNotice ? <p>{t(vipNotice)}</p> : null}
          <p>{t('community.vipPartial')}</p>
        </div> : null}
        {(tab === 'groups' ? Object.keys(errors).length > 0 : Boolean(errors[tab])) && <details className="rounded-lg border border-amber-400/15 bg-amber-400/5 text-xs text-amber-200">
          <summary className="cursor-pointer px-3 py-2 leading-relaxed">{t('community.partial')}</summary>
          <div className="border-t border-amber-400/10">{(tab === 'groups' ? Object.entries(errors) : [[tab, errors[tab]]]).map(([source, error]) => <div key={source}><p className="px-3 pt-2 font-medium">{t(`community.${source === 'mods' ? 'moderators' : source === 'chatters' ? 'chatters' : 'vips'}`)}</p>{source === 'vips' && vipNotice ? null : <ModDataNotice error={error} />}</div>)}</div>
        </details>}
        {tab === 'groups' ? <>
          <CommunityGroups viewers={mergedChatters} moderators={allMods} vips={allVips} broadcasterId={broadcasterId} search={search} onInspectUser={onInspectUser} />
        </> : loading ? (
          <div className="flex items-center justify-center p-6 text-text-muted text-xs">
            <div className="w-5 h-5 border-2 border-twitch border-t-transparent rounded-full animate-spin mr-2" />
            <span>{t('community.loading')}</span>
          </div>
        ) : filteredList.length === 0 && !errors[tab] ? (
          <p className="text-center p-4 text-xs text-text-muted/60 italic">
            {t('community.empty')}
          </p>
        ) : (
          filteredList.map(item => <CommunityUserRow key={item.user_login || item.user_id || item.id} user={{ ...item, isMod: tab === 'mods' || item.isMod, isVip: tab === 'vips' || item.isVip }} onInspectUser={onInspectUser} />)
        )}
      </div>
    </div>
  )
}

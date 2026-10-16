import { useEffect, useId, useRef, useState } from 'react'
import { getJSON, setJSON } from '../utils/storage'
import { changeCollections, collectionsKey, normalizeCollections, COLLECTION_COLORS } from '../utils/channelCollections'
import { prepareCollectionCover } from '../utils/collectionCover'
import { useT } from '../utils/i18n'
import PhosphorIcon from './icons/PhosphorIcon'

const coverColors = {
  violet: 'from-violet-600/70 to-purple-950', pink: 'from-fuchsia-600/70 to-pink-950',
  cyan: 'from-cyan-600/70 to-slate-950', green: 'from-emerald-600/70 to-green-950',
  orange: 'from-orange-600/70 to-stone-950', blue: 'from-blue-600/70 to-indigo-950',
}

// Key the editor by owner: drafts, undo and selection must never survive an account change.
export default function ChannelCollections({ owner, favorites = [], onSelect, liveStatus = {}, logos = {} }) {
  if (!owner || owner === 'current' || owner === 'twitch_user') return null
  return <CollectionEditor key={owner.toLowerCase()} owner={owner.toLowerCase()} favorites={favorites} onSelect={onSelect} liveStatus={liveStatus} logos={logos} />
}

function CollectionEditor({ owner, favorites, onSelect, liveStatus, logos }) {
  const t = useT()
  const [items, setItems] = useState(() => normalizeCollections(getJSON(collectionsKey(owner), [])))
  const itemsRef = useRef(items)
  const activeRef = useRef(true)
  const [selectedId, setSelectedId] = useState(items[0]?.id || '')
  const [name, setName] = useState('')
  const [channel, setChannel] = useState('')
  const [error, setError] = useState('')
  const [undo, setUndo] = useState(null)
  const [managing, setManaging] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [uploading, setUploading] = useState(false)
  const uploadRequestRef = useRef(0)
  const coverInputRef = useRef(null)
  const [collapsed, setCollapsed] = useState(() => getJSON(`${collectionsKey(owner)}:collapsed`, false) === true)
  const contentId = useId()
  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])
  const selected = items.find(item => item.id === selectedId) || items[0]
  const button = 'min-h-10 rounded-lg border border-white/10 px-3 py-2 text-[13px] font-semibold leading-snug text-text-primary transition-colors hover:bg-twitch/15 focus-visible:outline-2 focus-visible:outline-twitch disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer'
  const input = 'min-h-10 min-w-0 rounded-lg border border-white/10 bg-bg-primary px-3 py-2 text-sm font-medium leading-snug text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-twitch'
  function save(next) {
    if (!activeRef.current) return false
    if (!setJSON(collectionsKey(owner), next)) {
      setError('collections.saveError')
      return false
    }
    const membershipChanged = [...new Set(itemsRef.current.flatMap(item => item.channels))].sort().join(',') !== [...new Set(next.flatMap(item => item.channels))].sort().join(',')
    itemsRef.current = next
    setItems(next)
    setError('')
    if (membershipChanged) window.dispatchEvent(new CustomEvent('blinkstream_collections_updated', { detail: { owner } }))
    return true
  }
  function apply(action) {
    try { return save(changeCollections(itemsRef.current, action)) }
    catch (err) { setError(err.message); return false }
  }
  return <section aria-label={t('collections.label')} className="my-6 rounded-2xl border border-twitch/20 bg-bg-secondary/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('collections.title')} <span className="ml-2 rounded-full bg-twitch/15 px-2 py-0.5 text-sm text-twitch-light">{items.length}</span></h2>
          <p className="mt-1 text-sm text-text-muted">{t('collections.hint')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!collapsed && <>
          <button className={`${button} bg-twitch/20 text-twitch-light`} aria-expanded={showCreate} onClick={() => setShowCreate(value => !value)}>{t('collections.new')}</button>
          {selected && <button className={button} aria-expanded={managing} onClick={() => setManaging(value => !value)}>{managing ? t('collections.done') : t('collections.manage')}</button>}
          </>}
          <button type="button" className={`${button} inline-flex items-center gap-2`} aria-expanded={!collapsed} aria-controls={contentId} onClick={() => {
            const next = !collapsed
            setJSON(`${collectionsKey(owner)}:collapsed`, next)
            setCollapsed(next)
          }}>
            <span aria-hidden="true" className={`inline-flex ${collapsed ? '' : 'rotate-180'}`}><PhosphorIcon name="CaretDown" size={15} /></span>
            {collapsed ? t('collections.expand') : t('collections.collapse')}
          </button>
        </div>
      </div>
      <div id={contentId} hidden={collapsed}>
      {error && <p role="alert" className="mt-3 text-sm text-red-400">{t(error, error)}</p>}
      {showCreate && <form className="my-4 flex flex-wrap gap-2" onSubmit={event => {
        event.preventDefault()
        const id = crypto.randomUUID()
        if (apply({ type: 'create', id, name })) { setSelectedId(id); setName(''); setUndo(null); setShowCreate(false); setManaging(true) }
      }}>
        <input className={`${input} flex-1`} aria-label={t('collections.name')} value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder={t('collections.placeholder')} />
        <button className={`${button} bg-twitch/20`} type="submit">{t('collections.create')}</button>
      </form>}
      {undo && <div role="status" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-text-muted">{t('collections.deleted')}
        <button className={button} onClick={() => {
          if (itemsRef.current.some(item => item.id === undo.id)) return
          try {
            const next = changeCollections(itemsRef.current, { type: 'create', id: undo.id, name: undo.name }).filter(item => item.id !== undo.id)
            const { position, ...restored } = undo
            next.splice(Math.min(position, next.length), 0, restored)
            if (save(next)) { setSelectedId(undo.id); setUndo(null) }
          } catch (err) { setError(err.message) }
        }}>{t('collections.undo')}</button>
      </div>}
      {!items.length ? <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-text-muted">{t('collections.empty')}</p> : <>
        <div className="my-4 flex gap-3 overflow-x-auto pb-2 scrollbar-thin" aria-label={t('collections.choose')}>
          {items.map(item => <button className={`group flex w-[124px] shrink-0 flex-col items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-twitch cursor-pointer ${selected?.id === item.id ? 'border-twitch/60 bg-twitch/10 ring-1 ring-twitch/30' : 'border-transparent hover:border-white/10 hover:bg-bg-secondary/70'}`} key={item.id} aria-pressed={selected?.id === item.id} aria-label={`${item.name} ${item.channels.length}`} onClick={() => { uploadRequestRef.current++; setUploading(false); setSelectedId(item.id); setChannel(''); setError(''); setManaging(false) }}>
            <span className={`relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br ${coverColors[item.color || 'violet']} shadow-sm motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5`}>
              {item.cover ? <img src={item.cover} alt="" className="h-full w-full object-cover" /> : <span aria-hidden="true" className="text-4xl font-bold text-white/80">{item.name[0].toUpperCase()}</span>}
              <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] text-white">{item.channels.length} {item.channels.length === 1 ? t('collections.channel') : t('collections.channels')}</span>
            </span>
            <span className="w-full break-words text-center text-[13px] font-semibold leading-snug text-text-primary">{item.name}</span>
          </button>)}
        </div>
        {managing && <div className="mb-4 rounded-xl border border-white/10 bg-bg-primary/30 p-3">
        <h4 className="text-sm font-semibold tracking-tight text-text-primary">{t('collections.customize')}</h4>
        <p className="mb-4 mt-1 text-[13px] leading-relaxed text-text-secondary">{t('collections.customizeHint')}</p>
        <div className="mb-5 flex flex-wrap items-start gap-x-6 gap-y-4 rounded-xl border border-white/5 bg-bg-secondary/40 p-3 sm:p-4">
          <div className="min-w-0">
            <p className="mb-2 text-[13px] font-semibold text-text-primary">{t('collections.cover')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={uploading} className={`${button} inline-flex min-h-9 items-center justify-center gap-2 border-twitch/35 bg-twitch/15 text-twitch-light hover:bg-twitch/25`} onClick={() => coverInputRef.current?.click()}>
                <span aria-hidden="true" className="inline-flex"><PhosphorIcon name={uploading ? 'SpinnerGap' : 'FolderOpen'} size={16} /></span>
                {uploading ? t('collections.preparing') : selected.cover ? t('collections.changeImage') : t('collections.upload')}
              </button>
              {selected.cover && <button type="button" className={`${button} min-h-9`} onClick={() => { uploadRequestRef.current++; setUploading(false); apply({ type: 'appearance', id: selected.id, cover: '' }) }}>{t('collections.removeCover')}</button>}
            </div>
            <input ref={coverInputRef} aria-label={t('collections.uploadCover')} aria-describedby="collections-cover-help" type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} className="hidden" onChange={async event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              const id = selected.id, request = ++uploadRequestRef.current
              setUploading(true)
              try {
                const cover = await prepareCollectionCover(file)
                if (activeRef.current && request === uploadRequestRef.current && itemsRef.current.some(item => item.id === id)) apply({ type: 'appearance', id, cover })
              } catch (err) { if (activeRef.current && request === uploadRequestRef.current) setError(err.message) }
              finally { if (activeRef.current && request === uploadRequestRef.current) setUploading(false) }
            }} />
            <p id="collections-cover-help" className="mt-2 text-xs leading-relaxed text-text-secondary">{t('collections.coverFormat')}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-text-muted">{t('collections.coverCrop')}</p>
          </div>
          {uploading && <span role="status" className="text-sm text-text-muted">{t('collections.preparingCover')}</span>}
          <label className="min-w-0 text-[13px] font-semibold text-text-primary">{t('collections.color')} <select aria-label={t('collections.color')} className={`${input} mt-2 block w-full min-w-32`} value={selected.color || 'violet'} onChange={e => apply({ type: 'appearance', id: selected.id, color: e.target.value })}>{COLLECTION_COLORS.map(color => <option key={color} value={color}>{({ violet: t('collections.violet'), pink: t('collections.pink'), cyan: t('collections.cyan'), green: t('collections.green'), orange: t('collections.orange'), blue: t('collections.blue') })[color]}</option>)}</select></label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form key={selected.id} className="flex min-w-0 flex-1 flex-wrap gap-2" onSubmit={event => {
            event.preventDefault()
            apply({ type: 'rename', id: selected.id, name: new FormData(event.currentTarget).get('name') })
          }}>
            <input className={`${input} flex-1`} aria-label={t('collections.renameLabel')} name="name" defaultValue={selected.name} maxLength={40} />
            <button className={button} type="submit">{t('collections.rename')}</button>
          </form>
          <button className={button} aria-label={t('collections.before')} disabled={items.indexOf(selected) === 0} onClick={() => apply({ type: 'moveCollection', id: selected.id, delta: -1 })}>↑</button>
          <button className={button} aria-label={t('collections.after')} disabled={items.indexOf(selected) === items.length - 1} onClick={() => apply({ type: 'moveCollection', id: selected.id, delta: 1 })}>↓</button>
          <button className={`${button} text-red-400`} onClick={() => { if (apply({ type: 'delete', id: selected.id })) { setUndo({ ...selected, position: items.indexOf(selected) }); setChannel('') } }}>{t('collections.delete')}</button>
        </div>
        <form className="my-4 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); if (apply({ type: 'add', id: selected.id, channel })) setChannel('') }}>
          <input className={`${input} flex-1`} aria-label={t('collections.addLabel')} value={channel} onChange={e => setChannel(e.target.value)} maxLength={25} placeholder={t('collections.channelName')} />
          <button className={button} type="submit">{t('collections.add')}</button>
        </form>
        {!!favorites.length && <div className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="collection-favorite" className="text-sm text-text-muted">{t('collections.fromFavorites')}</label>
          <select id="collection-favorite" className={`${input} max-w-full`} value="" onChange={event => { if (event.target.value) apply({ type: 'add', id: selected.id, channel: event.target.value }) }}>
            <option value="">{t('collections.selectChannel')}</option>
            {favorites.filter(ch => !selected.channels.includes(ch.toLowerCase())).map(ch => <option key={ch} value={ch}>{ch}</option>)}
          </select>
        </div>}
        </div>}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <h3 className="font-semibold text-text-primary">{selected.name} <span className="font-normal text-text-muted">· {selected.channels.length} {selected.channels.length === 1 ? t('collections.channel') : t('collections.channels')}</span></h3>
          <span className="text-xs text-text-muted">{t('collections.local')}</span>
        </div>
        <ul className="grid max-h-96 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3" aria-label={t('collections.members')}>
          {selected.channels.map((ch, index) => <li key={ch} className="min-w-0 rounded-xl border border-white/10 bg-bg-primary/50 transition-colors hover:border-twitch/40">
            <button className="flex min-h-20 w-full min-w-0 items-center gap-3 rounded-xl p-3 text-left focus-visible:outline-2 focus-visible:outline-twitch cursor-pointer" aria-label={ch} onClick={() => onSelect(ch)}>
              {logos[ch] ? <img src={logos[ch]} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-twitch/15 text-lg font-semibold text-twitch-light">{ch[0].toUpperCase()}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-text-primary">{ch}</span>
                <span className="mt-1 block truncate text-xs text-text-muted">{liveStatus[ch]?.live === true ? (liveStatus[ch].game || t('live')) : liveStatus[ch]?.live === false ? t('collections.disconnected') : t('collections.unknownState')}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${liveStatus[ch]?.live === true ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-text-muted'}`}>{liveStatus[ch]?.live === true ? t('live').toUpperCase() : liveStatus[ch]?.live === false ? t('offline').toUpperCase() : t('collections.unknown')}</span>
            </button>
            {managing && <div className="flex flex-wrap gap-2 border-t border-white/5 p-2">
            <button className={button} aria-label={`${t('collections.up')} ${ch}`} disabled={index === 0} onClick={() => apply({ type: 'moveChannel', id: selected.id, channel: ch, delta: -1 })}>↑</button>
            <button className={button} aria-label={`${t('collections.down')} ${ch}`} disabled={index === selected.channels.length - 1} onClick={() => apply({ type: 'moveChannel', id: selected.id, channel: ch, delta: 1 })}>↓</button>
            <button className={button} aria-label={`${t('collections.remove')} ${ch}`} onClick={() => apply({ type: 'remove', id: selected.id, channel: ch })}>{t('collections.remove')}</button>
            </div>}
          </li>)}
        </ul>
        {!selected.channels.length && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-white/10 p-4">
          <p className="text-sm text-text-muted">{t('collections.noChannels')}</p>
          {!managing && <button className={button} onClick={() => setManaging(true)}>{t('collections.addChannels')}</button>}
        </div>}
      </>}
      </div>
  </section>
}

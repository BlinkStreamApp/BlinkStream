import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCategories, fetchCategoryStreams } from '../utils/categories'
import { useCategoryFeed } from '../hooks/useCategoryFeed'
import { useT, getLanguage } from '../utils/i18n'
import PhosphorIcon from './icons/PhosphorIcon'
import { getJSON, setJSON } from '../utils/storage'
import { categoryPreferencesKey, normalizeCategoryPreferences, changeCategoryPreferences, visibleCategories } from '../utils/categoryPreferences'

const languages = [['es', 'Español'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt', 'Português'], ['it', 'Italiano'], ['ja', '日本語'], ['ko', '한국어'], ['ru', 'Русский'], ['zh', '中文']]
const art = (url, width, height) => url?.replace('{width}', width).replace('{height}', height) || ''

function languageName(code) {
  try {
    const name = new Intl.DisplayNames([getLanguage()], { type: 'language' }).of(code)
    return name[0].toLocaleUpperCase(getLanguage()) + name.slice(1)
  }
  catch { return languages.find(([value]) => value === code)?.[1] || code.toUpperCase() }
}

function LanguageBadge({ code }) {
  const t = useT()
  const normalized = code?.trim().toLowerCase() || ''
  let name = normalized && normalized !== 'other' ? languageName(normalized) : ''
  name ||= normalized === 'other' ? t('browse.otherLanguage', 'Otros idiomas') : normalized.toUpperCase() || t('browse.unknownLanguage', 'Idioma no indicado')
  return <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-twitch/25 bg-twitch/10 px-2.5 py-1 text-[11px] font-semibold leading-none text-text-primary" title={`${t('set.language', 'Idioma')}: ${name}`}>
    <PhosphorIcon name="GlobeHemisphereWest" size={13} className="shrink-0 text-twitch-light" />
    <span className="truncate">{name}</span>
    {normalized && normalized !== 'other' && <span className="shrink-0 border-l border-twitch/30 pl-1.5 text-[10px] tracking-wide text-text-secondary">{normalized.toUpperCase()}</span>}
  </span>
}

function FeedStatus({ feed, emptyMessage }) {
  const t = useT()
  const errors = {
    auth: t('browse.errorAuth', 'La sesión de Twitch no es válida. Vuelve a conectar tu cuenta.'),
    rate: t('browse.errorRate', 'Twitch ha limitado las consultas. Espera un momento y reintenta.'),
    timeout: t('browse.errorTimeout', 'Twitch no respondió a tiempo.'),
    invalid: t('browse.errorInvalid', 'Twitch devolvió una respuesta inesperada.'),
    network: t('browse.errorNetwork', 'No se pudo consultar Twitch. Comprueba tu conexión.'),
  }
  if (feed.loading) return <p role="status" className="py-4 text-sm text-text-muted">{t('browse.loading', 'Consultando Twitch…')}</p>
  if (feed.error) return <div role="alert" className="py-3 text-sm text-text-secondary">
    <p>{errors[feed.error] || errors.network}</p>
    <button onClick={feed.retry} className="mt-2 rounded-lg border border-twitch/30 px-3 py-1.5 text-twitch-light hover:bg-twitch/10 cursor-pointer">{t('retry', 'Reintentar')}</button>
  </div>
  if (!feed.items.length) return <p role="status" className="py-4 text-sm text-text-muted">{emptyMessage}</p>
  return null
}

export default function CategoryExplorer({ onSelect, owner }) {
  const account = owner && !['current', 'twitch_user'].includes(owner) ? owner.toLowerCase() : null
  return <CategoryExplorerContent key={account || 'guest'} onSelect={onSelect} owner={account} />
}

function CategoryExplorerContent({ onSelect, owner }) {
  const t = useT()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [category, setCategory] = useState(null)
  const [language, setLanguage] = useState('')
  const [authVersion, setAuthVersion] = useState(0)
  const [preferences, setPreferences] = useState(() => normalizeCategoryPreferences(owner ? getJSON(categoryPreferencesKey(owner), {}) : {}))
  const preferencesRef = useRef(preferences)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [managing, setManaging] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [preferenceError, setPreferenceError] = useState('')
  const [lastHidden, setLastHidden] = useState(null)
  const streamHeading = useRef(null)
  const lastCategoryButton = useRef(null)
  useEffect(() => {
    const refresh = () => setAuthVersion(value => value + 1)
    window.addEventListener('blinkstream_auth_updated', refresh)
    return () => window.removeEventListener('blinkstream_auth_updated', refresh)
  }, [])
  useEffect(() => { if (category) streamHeading.current?.focus() }, [category])
  const search = query.trim()
  const categoryRequest = useCallback(options => fetchCategories({ ...options, query: search }), [search])
  const streamRequest = useCallback(options => fetchCategoryStreams({ ...options, categoryId: category?.id, language }), [category?.id, language])
  const categories = useCategoryFeed({ scope: `${authVersion}:${search}`, request: categoryRequest, delay: search ? 300 : 0 })
  const streams = useCategoryFeed({ scope: `${authVersion}:${category?.id}:${language}`, request: streamRequest, enabled: !!category })
  const grid = expanded || !!search
  const displayedCategories = visibleCategories(categories.items, preferences, { search, favoritesOnly })
  function updatePreference(action) {
    if (!owner) return
    try {
      const next = changeCategoryPreferences(preferencesRef.current, action)
      if (!setJSON(categoryPreferencesKey(owner), next)) {
        setPreferenceError(t('browse.preferenceError', 'No se pudieron guardar las preferencias. Inténtalo de nuevo.'))
        return
      }
      preferencesRef.current = next
      setPreferences(next)
      setPreferenceError('')
      if (action.type === 'hide') {
        if (category?.id === action.game.id) setCategory(null)
        setLastHidden(action.game)
      } else if (action.type === 'restore' && action.id === lastHidden?.id) setLastHidden(null)
    } catch (error) { setPreferenceError(error.message) }
  }
  const closeCategory = () => {
    setCategory(null)
    lastCategoryButton.current?.focus()
  }

  return <section aria-labelledby="category-explorer-title" className="mb-6 animate-fade-in">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h2 id="category-explorer-title" className="text-base font-bold tracking-tight text-text-primary sm:text-lg">{t('browse.title', 'Explorar categorías')}</h2>
      {!search && <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={grid} className="group inline-flex min-h-11 items-center justify-center gap-2.5 rounded-xl border border-twitch/40 bg-twitch/15 px-4 py-2.5 text-sm font-semibold leading-snug text-text-primary transition-colors hover:border-twitch/70 hover:bg-twitch/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-twitch cursor-pointer">
        <span aria-hidden="true" className="inline-flex shrink-0 text-twitch-light"><PhosphorIcon name="SquaresFour" size={18} /></span>
        {expanded ? t('browse.compact', 'Vista compacta') : t('browse.all', 'Explorar todas')}
        <span aria-hidden="true" className="inline-flex shrink-0 text-twitch-light motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"><PhosphorIcon name={expanded ? 'CaretLeft' : 'ArrowRight'} size={16} /></span>
      </button>}
    </div>
    <label className="mb-3 flex max-w-md items-center gap-2 rounded-xl border border-white/10 bg-bg-secondary/50 px-3 py-2 focus-within:border-twitch/60">
      <PhosphorIcon name="MagnifyingGlass" size={18} className="text-text-muted" />
      <span className="sr-only">{t('browse.search', 'Buscar juego o categoría')}</span>
      <input type="search" value={query} onChange={event => { setQuery(event.target.value); setCategory(null) }} placeholder={t('browse.searchPlaceholder', 'Buscar juego o categoría…')} maxLength={100} className="min-w-0 w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted" />
    </label>
    {owner && <div className="mb-3 flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={managing} onClick={() => { setManaging(value => !value); setShowHidden(false) }} className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-twitch cursor-pointer ${managing ? 'border-twitch/40 bg-twitch/15 text-twitch-light' : 'border-white/10 text-text-secondary hover:bg-hover'}`}>
        <PhosphorIcon name={managing ? 'CheckCircle' : 'SlidersHorizontal'} size={15} />
        {managing ? t('browse.finishManaging', 'Terminar edición') : t('browse.manage', 'Gestionar categorías')}
      </button>
      <button type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(value => !value)} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-twitch cursor-pointer ${favoritesOnly ? 'border-twitch/40 bg-twitch/15 text-twitch-light' : 'border-white/10 text-text-secondary hover:bg-hover'}`}>
        <PhosphorIcon name="PushPin" size={15} />{t('browse.favoritesOnly', 'Solo favoritas')}
      </button>
      {managing && <>
        <button type="button" aria-expanded={showHidden} onClick={() => setShowHidden(value => !value)} className="min-h-10 rounded-xl border border-white/10 px-3 py-2 text-[13px] font-medium text-text-secondary hover:bg-hover focus-visible:outline-2 focus-visible:outline-twitch cursor-pointer">{t('browse.hidden', 'Categorías ocultas')} ({preferences.hidden.length})</button>
        <span className="text-xs text-text-muted">{t('browse.localPreferences', 'Preferencias locales de esta cuenta')}</span>
      </>}
    </div>}
    {preferenceError && <p role="alert" className="mb-3 text-sm text-red-400">{preferenceError}</p>}
    {lastHidden && <div role="status" className="mb-3 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
      {lastHidden.name} · {t('browse.hiddenNotice', 'Categoría ocultada')}
      <button className="min-h-9 rounded-lg border border-twitch/30 px-3 text-twitch-light cursor-pointer" onClick={() => updatePreference({ type: 'restore', id: lastHidden.id })}>{t('browse.undo', 'Deshacer')}</button>
    </div>}
    {managing && showHidden && <div className="mb-4 rounded-xl border border-white/10 bg-bg-secondary/50 p-3">
      <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('browse.hidden', 'Categorías ocultas')}</h3>
      {!preferences.hidden.length && <p className="text-sm text-text-muted">{t('browse.noHidden', 'No tienes categorías ocultas.')}</p>}
      <div className="flex flex-wrap gap-2">{preferences.hidden.map(game => <button key={game.id} onClick={() => updatePreference({ type: 'restore', id: game.id })} className="min-h-10 rounded-lg border border-white/10 px-3 text-sm text-text-secondary hover:bg-hover cursor-pointer">{t('browse.restore', 'Restaurar')} {game.name}</button>)}</div>
    </div>}
    <p className="mb-3 flex items-center gap-2 text-[13px] font-medium leading-relaxed text-text-secondary sm:text-sm">
      <span aria-hidden="true" className="inline-flex shrink-0 text-twitch-light"><PhosphorIcon name={search ? 'MagnifyingGlass' : 'GameController'} size={17} /></span>
      {search ? t('browse.matches', 'Categorías que coinciden con tu búsqueda') : t('browse.popular', 'Categorías populares en Twitch')}
    </p>
    <FeedStatus feed={{ ...categories, items: displayedCategories }} emptyMessage={favoritesOnly || categories.items.length ? t('browse.noVisible', 'No hay categorías visibles con estos filtros. Revisa tus favoritas o restaura las ocultas.') : t('browse.noCategories', 'No se encontraron categorías. Prueba otro nombre.')} />
    {(!categories.loading || !!displayedCategories.length) && <div className={grid ? 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3' : 'flex gap-3 overflow-x-auto pb-2 scrollbar-thin'}>
      {displayedCategories.map(game => <div key={game.id} className={grid ? 'min-w-0' : 'shrink-0 w-[124px]'}>
      <button aria-label={game.name} onClick={event => {
        lastCategoryButton.current = event.currentTarget
        if (category?.id === game.id) { closeCategory(); return }
        setCategory(game)
      }} aria-pressed={category?.id === game.id} className={`relative flex w-full flex-col items-center gap-2.5 rounded-2xl border p-2.5 text-left group cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-twitch ${category?.id === game.id ? 'bg-twitch/10 border-twitch/60 ring-1 ring-twitch/30' : 'border-transparent hover:border-white/10 hover:bg-bg-secondary/70'}`}>
        {preferences.favorites.some(item => item.id === game.id) && <span aria-hidden="true" className="absolute left-3 top-3 z-10 rounded-md bg-black/70 p-1 text-twitch-light"><PhosphorIcon name="PushPin" size={14} /></span>}
        {game.box_art_url ? <img src={art(game.box_art_url, '285', '380')} alt="" loading="lazy" className="w-full aspect-[3/4] rounded-xl object-cover shadow-sm motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:-translate-y-0.5" /> : <div className="w-full aspect-[3/4] rounded-xl bg-bg-tertiary flex items-center justify-center"><PhosphorIcon name="GameController" size={24} /></div>}
        <span className="w-full text-center text-[13px] font-semibold leading-snug text-text-primary break-words">{game.name}</span>
      </button>
      {owner && managing && <div className="mt-1 flex justify-center gap-1">
        <button type="button" aria-label={`${t('browse.pin', 'Fijar')} ${game.name}`} aria-pressed={preferences.favorites.some(item => item.id === game.id)} onClick={() => updatePreference({ type: 'pin', game })} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-white/10 text-twitch-light hover:bg-twitch/15 focus-visible:outline-2 focus-visible:outline-twitch cursor-pointer" title={t('browse.pinTip', 'Fijar o quitar de favoritas')}><PhosphorIcon name="PushPin" size={16} /></button>
        <button type="button" aria-label={`${t('browse.hide', 'Ocultar')} ${game.name}`} onClick={() => updatePreference({ type: 'hide', game })} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-white/10 text-text-secondary hover:bg-hover focus-visible:outline-2 focus-visible:outline-twitch cursor-pointer" title={t('browse.hide', 'Ocultar')}><PhosphorIcon name="X" size={15} /></button>
      </div>}
      </div>)}
    </div>}
    {!!categories.cursor && !categories.error && <button type="button" disabled={categories.loadingMore} aria-busy={categories.loadingMore} onClick={() => { setExpanded(true); categories.loadMore() }} className="mt-4 inline-flex min-h-11 items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-bg-secondary/70 px-4 py-2.5 text-sm font-semibold leading-snug text-text-primary transition-colors hover:border-twitch/50 hover:bg-twitch/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-twitch disabled:cursor-wait disabled:opacity-60 cursor-pointer">
      <span aria-hidden="true" className={`inline-flex shrink-0 text-twitch-light ${categories.loadingMore ? 'motion-safe:animate-spin' : ''}`}><PhosphorIcon name={categories.loadingMore ? 'SpinnerGap' : 'Plus'} size={18} /></span>
      {categories.loadingMore ? t('browse.loading', 'Consultando Twitch…') : t('browse.moreCategories', 'Cargar más categorías')}
    </button>}
    {category && <div className="mt-5 rounded-2xl border border-twitch/20 bg-gradient-to-b from-bg-secondary/80 to-bg-secondary/40 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h3 ref={streamHeading} tabIndex={-1} className="flex min-w-0 items-center gap-3 text-base font-bold tracking-tight text-text-primary outline-none sm:text-lg">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-twitch/25 bg-twitch/10 text-twitch-light"><PhosphorIcon name="Broadcast" size={21} /></span>
          <span>{t('browse.liveIn', 'En vivo en')} {category.name}</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-bg-tertiary/70 py-1.5 pl-3 pr-1.5 text-xs font-medium text-text-secondary">
            <PhosphorIcon name="GlobeHemisphereWest" size={16} className="text-twitch-light" />{t('set.language', 'Idioma')}
            <select value={language} onChange={event => setLanguage(event.target.value)} className="max-w-[180px] rounded-lg bg-bg-tertiary px-2 py-1.5 text-[13px] font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-twitch">
              <option value="">{t('browse.allLanguages', 'Todos los idiomas')}</option>
              {languages.map(([code]) => <option key={code} value={code}>{languageName(code)}</option>)}
            </select>
          </label>
          <button onClick={closeCategory} className="rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-text-secondary hover:bg-hover focus-visible:outline-2 focus-visible:outline-twitch cursor-pointer">{t('close', 'Cerrar')}</button>
        </div>
      </div>
      <p className="mb-4 text-[13px] leading-relaxed text-text-secondary">{t('browse.order', 'Directos ordenados por espectadores. Los resultados cambian en tiempo real.')}</p>
      <FeedStatus feed={streams} emptyMessage={language ? t('browse.noLanguageStreams', 'No hay directos en esta categoría para el idioma seleccionado. Prueba todos los idiomas.') : t('noLiveStreams', 'No hay streams en vivo')} />
      {!streams.loading && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {streams.items.map(stream => <button key={stream.id} onClick={() => onSelect(stream.user_login)} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-bg-tertiary/80 text-left shadow-sm transition-colors hover:border-twitch/45 hover:bg-bg-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-twitch cursor-pointer">
          <div className="relative aspect-video w-full overflow-hidden bg-bg-secondary">
            {stream.thumbnail_url ? <img src={art(stream.thumbnail_url, '640', '360')} alt="" loading="lazy" className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-[1.03]" /> : <div aria-hidden="true" className="flex h-full items-center justify-center text-text-muted/40"><PhosphorIcon name="MonitorPlay" size={38} /></div>}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
            <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white" />{t('live', 'En vivo')}</span>
            <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/80 px-2 py-1 text-[11px] font-semibold tabular-nums text-white">
              <PhosphorIcon name="Users" size={13} />{Number(stream.viewer_count || 0).toLocaleString()} {t('viewers', 'espectadores')}
            </span>
            <span aria-hidden="true" className="absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white transition-colors group-hover:bg-twitch group-focus-visible:bg-twitch"><PhosphorIcon name="Play" size={16} weight="fill" /></span>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
              <p className="min-w-0 break-words text-[15px] font-bold leading-snug tracking-tight text-text-primary">{stream.user_name}</p>
              <LanguageBadge code={stream.language} />
            </div>
            <p className="line-clamp-2 min-h-[2.75rem] break-words text-[13px] leading-[1.4rem] text-text-secondary" title={stream.title}>{stream.title}</p>
          </div>
        </button>)}
      </div>}
      {!!streams.cursor && !streams.error && <button disabled={streams.loadingMore} onClick={streams.loadMore} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs text-text-secondary hover:bg-hover disabled:opacity-50 cursor-pointer">{streams.loadingMore ? t('browse.loading', 'Consultando Twitch…') : t('browse.moreStreams', 'Cargar más directos')}</button>}
    </div>}
  </section>
}



import { useState, useEffect } from 'react'
import { t } from '../../utils/i18n'
import PhosphorIcon from '../icons/PhosphorIcon'

const TWITCH_COLORS = [
  { name: 'Blue', value: '#4d8cff' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Orange', value: '#ff8c00' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Purple', value: '#9146ff' },
]

const MAX_TITLE_LEN = 45
const MAX_PROMPT_LEN = 200
const MAX_IMAGE_BYTES = 1024 * 1024 
const MAX_COOLDOWN_SEC = 604800 

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function RewardForm({ initial, saving, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '')

  const [cost, setCost] = useState(
    initial != null && Number.isFinite(initial.cost) ? initial.cost : 50
  )
  const [prompt, setPrompt] = useState(initial?.prompt || '')
  const [bgColor, setBgColor] = useState(initial?.background_color || '#9146ff')
  const [imageDataUrl, setImageDataUrl] = useState(null)
  const [imageError, setImageError] = useState(null)
  const [maxPerStream, setMaxPerStream] = useState(initial?.max_per_stream || 0)
  const [maxPerStreamEnabled, setMaxPerStreamEnabled] = useState(initial?.is_max_per_stream_enabled || false)
  const [maxPerUser, setMaxPerUser] = useState(initial?.max_per_user_per_stream || 0)
  const [maxPerUserEnabled, setMaxPerUserEnabled] = useState(!!initial?.max_per_user_per_stream)
  const [cooldown, setCooldown] = useState(initial?.global_cooldown_seconds || 0)
  const [cooldownEnabled, setCooldownEnabled] = useState(initial?.is_global_cooldown_enabled || false)
  const [userInputRequired, setUserInputRequired] = useState(initial?.is_user_input_required || false)
  const [isEnabled, setIsEnabled] = useState(initial?.is_enabled !== false)
  const [submitError, setSubmitError] = useState(null)

  const titleOk = title.trim().length > 0 && title.length <= MAX_TITLE_LEN
  const promptOk = prompt.length <= MAX_PROMPT_LEN

  const costOk = Number.isFinite(cost) && cost >= 0 && cost <= 10_000_000
  const cooldownOk = cooldown >= 0 && cooldown <= MAX_COOLDOWN_SEC
  const canSubmit = titleOk && promptOk && costOk && cooldownOk && !saving

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) {
      setImageDataUrl(null)
      setImageError(null)
      return
    }
    if (!/^image\/(png|jpe?g)$/.test(file.type)) {
      setImageError('Solo JPG o PNG')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Maximo 1MB')
      return
    }
    setImageError(null)
    try {
      const url = await fileToDataUrl(file)
      setImageDataUrl(url)
    } catch {
      setImageError('Error leyendo la imagen')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitError(null)
    const data = {
      title: title.trim(),
      cost: Number(cost),
      prompt: prompt.trim() || undefined,
      background_color: bgColor,
      is_enabled: isEnabled,
      is_user_input_required: userInputRequired,
      ...(maxPerStreamEnabled ? { is_max_per_stream_enabled: true, max_per_stream: Number(maxPerStream) } : { is_max_per_stream_enabled: false }),
      ...(maxPerUserEnabled ? { max_per_user_per_stream: Number(maxPerUser) } : {}),
      ...(cooldownEnabled ? { is_global_cooldown_enabled: true, global_cooldown_seconds: Number(cooldown) } : { is_global_cooldown_enabled: false }),
    }

    const res = await onSave(data)
    if (!res.ok) {
      setSubmitError(res.error || 'Error al guardar')
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[100000] bg-black/65 backdrop-blur-md flex items-center justify-center animate-fade-in p-4"
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-bg-secondary border border-bg-tertiary/60 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slide-up"
      >
        <div className="sticky top-0 z-10 bg-bg-secondary border-b border-bg-tertiary/40 px-5 py-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary">
            {initial ? t('cp.manage.editReward') : t('cp.manage.newReward')}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-hover cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 p-5">
          {}
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-text-secondary mb-1 flex justify-between">
                <span>{t('cp.manage.title')}</span>
                <span className={title.length > MAX_TITLE_LEN ? 'text-red-400' : 'text-text-muted'}>
                  {title.length}/{MAX_TITLE_LEN}
                </span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={MAX_TITLE_LEN + 10}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-[13px] border border-bg-tertiary focus:border-twitch focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-text-secondary mb-1 block">{t('cp.manage.cost')}</label>
              <input
                type="number"
                min={0}
                max={10_000_000}
                value={cost}
                onChange={(e) => setCost(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-[13px] border border-bg-tertiary focus:border-twitch focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-text-secondary mb-1 flex justify-between">
                <span>{t('cp.manage.prompt')}</span>
                <span className={prompt.length > MAX_PROMPT_LEN ? 'text-red-400' : 'text-text-muted'}>
                  {prompt.length}/{MAX_PROMPT_LEN}
                </span>
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                maxLength={MAX_PROMPT_LEN + 50}
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-[13px] border border-bg-tertiary focus:border-twitch focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-text-secondary mb-1 block">{t('cp.manage.background')}</label>
              <div className="flex gap-2">
                {TWITCH_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setBgColor(c.value)}
                    className={`w-7 h-7 rounded-md transition-all cursor-pointer ${bgColor === c.value ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-text-secondary mb-1 block">{t('cp.manage.image')}</label>
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleImageChange}
                className="w-full text-[11px] text-text-secondary file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:bg-bg-tertiary file:text-text-primary file:cursor-pointer"
              />
              {imageError && <p className="text-[10px] text-red-400 mt-1">{imageError}</p>}
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={maxPerStreamEnabled}
                  onChange={(e) => setMaxPerStreamEnabled(e.target.checked)}
                  className="accent-twitch"
                />
                {t('cp.manage.maxPerStream')}
              </label>
              {maxPerStreamEnabled && (
                <input
                  type="number"
                  min={1}
                  value={maxPerStream}
                  onChange={(e) => setMaxPerStream(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-[12px] border border-bg-tertiary focus:border-twitch focus:outline-none"
                />
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={maxPerUserEnabled}
                  onChange={(e) => setMaxPerUserEnabled(e.target.checked)}
                  className="accent-twitch"
                />
                {t('cp.manage.maxPerUser')}
              </label>
              {maxPerUserEnabled && (
                <input
                  type="number"
                  min={1}
                  value={maxPerUser}
                  onChange={(e) => setMaxPerUser(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-[12px] border border-bg-tertiary focus:border-twitch focus:outline-none"
                />
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={cooldownEnabled}
                  onChange={(e) => setCooldownEnabled(e.target.checked)}
                  className="accent-twitch"
                />
                {t('cp.manage.cooldown')}
              </label>
              {cooldownEnabled && (
                <input
                  type="number"
                  min={0}
                  max={MAX_COOLDOWN_SEC}
                  value={cooldown}
                  onChange={(e) => setCooldown(Number(e.target.value))}
                  className="mt-1 w-full px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-[12px] border border-bg-tertiary focus:border-twitch focus:outline-none"
                />
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={userInputRequired}
                  onChange={(e) => setUserInputRequired(e.target.checked)}
                  className="accent-twitch"
                />
                {t('cp.manage.userInput')}
              </label>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={isEnabled}
                  onChange={(e) => setIsEnabled(e.target.checked)}
                  className="accent-twitch"
                />
                {t('cp.manage.enabled')}
              </label>
            </div>
          </div>

          {}
          <div className="space-y-2">
            <p className="text-[10px] text-text-muted uppercase tracking-wide">Preview</p>
            <div
              className="rounded-xl overflow-hidden"
              style={{ backgroundColor: bgColor }}
            >
              <div className="aspect-square flex items-center justify-center text-white/80 text-5xl font-bold">
                {imageDataUrl ? (
                  <img src={imageDataUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  title.charAt(0).toUpperCase() || '?'
                )}
              </div>
              <div className="bg-black/40 p-3 text-white">
                <p className="text-sm font-bold line-clamp-2">{title || 'Título'}</p>
                <p className="text-[11px] opacity-80 mt-0.5 line-clamp-2">{prompt || 'Descripción'}</p>
                <div className="mt-2 inline-flex items-center gap-1 text-yellow-300 text-[11px] font-bold">
                  <PhosphorIcon name="Coins" size={12} weight="duotone" />
                  {Number(cost || 0).toLocaleString('es-ES')}
                </div>
              </div>
            </div>
          </div>
        </div>

        {submitError && (
          <div className="mx-5 mb-3 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {submitError}
          </div>
        )}

        <div className="sticky bottom-0 z-10 bg-bg-secondary border-t border-bg-tertiary/40 px-5 py-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[12px] text-text-secondary hover:text-text-primary hover:bg-hover cursor-pointer transition-colors"
          >
            {t('cp.manage.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg text-[12px] font-medium text-white bg-twitch hover:bg-twitch-dark disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors btn-press"
          >
            {saving ? '...' : t('cp.manage.save')}
          </button>
        </div>
      </form>
    </div>
  )
}

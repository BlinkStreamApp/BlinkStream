import { useT } from '../../utils/i18n'
import { usePlayerControls } from '../../hooks/usePlayerControls'
import { PLAYER_CONTROL_IDS, setPlayerControl } from '../../utils/playerControls'
import ToggleSwitch from '../ToggleSwitch'

export default function SettingsPlayerTab() {
  const t = useT()
  const controls = usePlayerControls()
  const [saveError, setSaveError] = useState(false)
  return <section className="space-y-4">
    <h3 className="text-base font-bold">{t('controls.title')}</h3>
    <p className="text-sm text-text-secondary">{t('controls.description')}</p>
    {saveError && <p role="alert" className="text-sm text-amber-300">{t('controls.saveError')}</p>}
    {PLAYER_CONTROL_IDS.map(id => <div key={id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 p-3">
      <span>{t(`controls.${id}`)}</span><ToggleSwitch label={t(`controls.${id}`)} active={controls[id]} onClick={() => setSaveError(!setPlayerControl(id, !controls[id]))} />
    </div>)}
  </section>
}
import { useState } from 'react'

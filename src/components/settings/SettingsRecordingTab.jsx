/**
 * @file Tab "Grabación" del modal de Settings (placeholder G1).
 * La implementación completa llega en G1. Por ahora solo dejamos un
 * placeholder visible y notas para el usuario.
 */

export function SettingsRecordingTab() {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-text-secondary mb-2 block">Grabación de streams</label>
        <p className="text-[11px] text-text-muted/70 leading-relaxed">
          Aquí podrás configurar la ruta de guardado, formato (mp4/ts), bitrate, calidad máxima y auto-rec al iniciar directo.
        </p>
      </div>
      <div className="border-t border-bg-tertiary/50 pt-4">
        <div className="p-3 rounded-xl bg-bg-tertiary/30 border border-dashed border-bg-tertiary/60 text-center">
          <p className="text-[12px] text-text-muted">Próximamente — G1</p>
          <p className="text-[10px] text-text-muted/50 mt-1">Las opciones de grabación aterrizan en la próxima release.</p>
        </div>
      </div>
    </div>
  )
}

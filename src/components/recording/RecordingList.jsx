

import { useState, useEffect } from 'react'
import { measureInvoke } from '../../utils/perf'
import { logError, ErrorCode } from '../../utils/errors'
import { logEvent } from '../../utils/eventLog'
import { t } from '../../utils/i18n'
import { formatDurationHMS } from '../../utils/format'

function RecordingCard({ recording, onStopped }) {

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const startedAt = recording?.startedAt
    const start = typeof startedAt === 'number' ? startedAt : Date.now()
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [recording?.startedAt])

  const handleStop = async () => {
    try {
      await measureInvoke('stop_recording')
      logEvent('recording', 'recording.stopped', { source: 'RecordingList' })
      onStopped?.()
    } catch (err) {
      const msg = typeof err === 'string' ? err : err?.message || String(err)
      if (/no hay grabaci[oó]n activa/i.test(msg)) {

        onStopped?.()
        return
      }
      logError(err, {
        component: 'RecordingList',
        action: 'stop_recording',
        code: ErrorCode.RECORDING_FAILED,
      })
    }
  }

  const channelName = recording?.channelName || t('rec.list.unknown')

  return (
    <div className="bg-bg-tertiary/30 border border-bg-tertiary/60 rounded-lg p-3 flex items-center justify-between gap-2">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-text-primary truncate">
          {channelName}
        </p>
        <p className="text-[11px] text-text-muted font-mono mt-0.5">
          {formatDurationHMS(elapsed)}
        </p>
      </div>
      <button
        onClick={handleStop}
        className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white bg-red-500/90 hover:bg-red-500 rounded transition-colors cursor-pointer"
        title={t('rec.list.stop')}
        aria-label={t('rec.list.stop')}
      >
        {t('rec.list.stop')}
      </button>
    </div>
  )
}

export default function RecordingList({ recordings, onChanged }) {
  if (!recordings || recordings.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[11px] text-text-muted">
        {t('rec.drawer.empty')}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {recordings.map((rec, i) => (
        <RecordingCard

          key={`${rec.channelId || 'rec'}-${i}`}
          recording={rec}
          onStopped={onChanged}
        />
      ))}
    </div>
  )
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TimeRangeSnipper from './TimeRangeSnipper'
import * as tauriEnv from '../../utils/tauriEnv'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('TimeRangeSnipper', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(tauriEnv, 'isTauri').mockReturnValue(true)
    invoke.mockResolvedValue('C:\\Users\\Videos\\blinkstream_clip.mp4')
  })

  it('renders time range sliders and duration correctly', () => {
    render(
      <TimeRangeSnipper
        mediaUrl="https://example.com/stream.m3u8"
        maxDuration={120}
        title="Epic Play"
      />
    )

    expect(screen.getByText(/Recortar y Descargar Fragmento/i)).toBeDefined()
    expect(screen.getByText(/Duración: 01:00/i)).toBeDefined()
    expect(screen.getByText(/Descargar Fragmento MP4/i)).toBeDefined()
  })

  it('updates start and end values safely', () => {
    render(
      <TimeRangeSnipper
        mediaUrl="https://example.com/stream.m3u8"
        maxDuration={120}
        title="Epic Play"
      />
    )

    const startInput = screen.getByLabelText('Tiempo de inicio')
    const endInput = screen.getByLabelText('Tiempo de fin')

    fireEvent.change(startInput, { target: { value: '00:15' } })
    fireEvent.change(endInput, { target: { value: '00:45' } })

    expect(screen.getByText(/Duración: 00:30/i)).toBeDefined()
  })

  it('calls invoke download_media_range on download click and shows success', async () => {
    render(
      <TimeRangeSnipper
        mediaUrl="https://example.com/stream.m3u8"
        maxDuration={120}
        title="Epic Play"
      />
    )

    const downloadBtn = screen.getByRole('button', { name: /Descargar Fragmento MP4/i })
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('download_media_range', expect.objectContaining({
        url: 'https://example.com/stream.m3u8',
        startTime: 0,
        endTime: 60,
      }))
    })

    await waitFor(() => {
      expect(screen.getByText(/¡Fragmento descargado con éxito!/i)).toBeDefined()
    })
  })

  it('shows error message if invoke fails', async () => {
    invoke.mockRejectedValue('Fallo en FFmpeg')

    render(
      <TimeRangeSnipper
        mediaUrl="https://example.com/stream.m3u8"
        maxDuration={120}
        title="Epic Play"
      />
    )

    const downloadBtn = screen.getByRole('button', { name: /Descargar Fragmento MP4/i })
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect(screen.getByText(/Fallo en FFmpeg/i)).toBeDefined()
    })
  })
})

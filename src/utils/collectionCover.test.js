import { describe, expect, it, vi } from 'vitest'
import { prepareCollectionCover } from './collectionCover'

describe('collection cover', () => {
  it('rejects SVG, unknown formats and oversized files before decoding', async () => {
    await expect(prepareCollectionCover(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))).rejects.toThrow('PNG')
    await expect(prepareCollectionCover({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).rejects.toThrow('5 MB')
  })
  it('crops a bounded local JPEG thumbnail and closes decoded resources', async () => {
    const bitmap = { width: 800, height: 600, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    const context = { fillRect: vi.fn(), drawImage: vi.fn() }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,YQ==')
    await expect(prepareCollectionCover(new File(['x'], 'x.jpg', { type: 'image/jpeg' }))).resolves.toBe('data:image/jpeg;base64,YQ==')
    expect(context.drawImage).toHaveBeenCalled()
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
  it('rejects extreme resolution and releases the image', async () => {
    const bitmap = { width: 10000, height: 10000, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    await expect(prepareCollectionCover(new File(['x'], 'x.png', { type: 'image/png' }))).rejects.toThrow('resolución')
    expect(bitmap.close).toHaveBeenCalledOnce()
  })
})

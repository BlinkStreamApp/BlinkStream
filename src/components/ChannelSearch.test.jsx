import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import ChannelSearch from './ChannelSearch'
import { searchChannels } from '../utils/twitch'

vi.mock('../utils/twitch', () => ({ searchChannels: vi.fn() }))
vi.mock('../utils/i18n', () => ({ useT: () => (_key, fallback) => fallback }))
vi.mock('./icons/PhosphorIcon', () => ({ default: () => null }))

const result = login => [{ login, displayName: login, isLive: false }]
const pending = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const advanceSearch = async () => { await act(async () => { vi.advanceTimersByTime(250) }) }
const complete = async (request, value) => { await act(async () => { request.resolve(value) }) }

describe('channel search request lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(searchChannels).mockReset() })
  afterEach(() => { vi.useRealTimers() })

  it('keeps the newest results when an older request finishes last', async () => {
    const old = pending(), latest = pending()
    searchChannels.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    render(<ChannelSearch onSelect={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'old' } })
    await advanceSearch()
    fireEvent.change(input, { target: { value: 'latest' } })
    await advanceSearch()
    await complete(latest, result('latest'))
    await complete(old, result('old'))
    expect(screen.getByRole('button', { name: /latest/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /old/ })).not.toBeInTheDocument()
  })

  it('does not restore suggestions after the input is cleared', async () => {
    const request = pending()
    searchChannels.mockReturnValue(request.promise)
    render(<ChannelSearch onSelect={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'channel' } })
    await advanceSearch()
    fireEvent.change(input, { target: { value: '' } })
    await complete(request, result('channel'))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it.each(['escape', 'outside click'])('dismissal by %s survives a pending response', async method => {
    const request = pending()
    searchChannels.mockReturnValue(request.promise)
    render(<ChannelSearch onSelect={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'channel' } })
    await advanceSearch()
    if (method === 'escape') fireEvent.keyDown(input, { key: 'Escape' })
    else fireEvent.mouseDown(document.body)
    await complete(request, result('channel'))
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('discards a pending search when a channel is selected directly', async () => {
    const request = pending(), onSelect = vi.fn()
    searchChannels.mockReturnValue(request.promise)
    render(<ChannelSearch onSelect={onSelect} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'channel' } })
    await advanceSearch()
    fireEvent.submit(input.closest('form'))
    await complete(request, result('channel'))
    expect(onSelect).toHaveBeenCalledWith('channel')
    expect(input).toHaveValue('')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('a stale failure cannot clear newer successful results', async () => {
    const old = pending(), latest = pending()
    searchChannels.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise)
    render(<ChannelSearch onSelect={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'old' } })
    await advanceSearch()
    fireEvent.change(input, { target: { value: 'latest' } })
    await advanceSearch()
    await complete(latest, result('latest'))
    await act(async () => { old.reject(new Error('old request failed')) })
    expect(screen.getByRole('button', { name: /latest/ })).toBeInTheDocument()
  })

  it('debounces typing and Escape cancels a search before it starts', async () => {
    searchChannels.mockResolvedValue(result('latest'))
    render(<ChannelSearch onSelect={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'first' } })
    fireEvent.change(input, { target: { value: 'latest' } })
    await advanceSearch()
    expect(searchChannels).toHaveBeenCalledTimes(1)
    expect(searchChannels).toHaveBeenCalledWith('latest')
    fireEvent.change(input, { target: { value: 'cancelled' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    await advanceSearch()
    expect(searchChannels).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('clears old suggestions immediately when editing and never submits an old highlighted result', async () => {
    searchChannels.mockResolvedValue(result('old'))
    const onSelect = vi.fn()
    render(<ChannelSearch onSelect={onSelect} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'old' } })
    await advanceSearch()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.change(input, { target: { value: 'latest' } })
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('supports selecting a current suggestion with arrows and Enter', async () => {
    searchChannels.mockResolvedValue(result('channel'))
    const onSelect = vi.fn()
    render(<ChannelSearch onSelect={onSelect} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'chan' } })
    await advanceSearch()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('channel')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('a channel change discards a pending search and hides old results', async () => {
    const request = pending()
    searchChannels.mockReturnValue(request.promise)
    const { rerender } = render(<ChannelSearch onSelect={vi.fn()} currentChannel="first" />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'query' } })
    await advanceSearch()
    rerender(<ChannelSearch onSelect={vi.fn()} currentChannel="second" />)
    await complete(request, result('query'))
    expect(input).toHaveValue('')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('unmount cancels the debounce and discards an in-flight failure', async () => {
    const request = pending()
    searchChannels.mockReturnValue(request.promise)
    const { unmount } = render(<ChannelSearch onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'query' } })
    await advanceSearch()
    unmount()
    await act(async () => { request.reject(new Error('late failure')) })
    const next = render(<ChannelSearch onSelect={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'pending' } })
    next.unmount()
    await advanceSearch()
    expect(searchChannels).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+K focuses search but modified or consumed shortcuts do not', () => {
    render(<ChannelSearch onSelect={vi.fn()} />)
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(window, { code: 'KeyK', ctrlKey: true, shiftKey: true })
    expect(input).not.toHaveFocus()
    const consumed = new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true, cancelable: true })
    consumed.preventDefault()
    window.dispatchEvent(consumed)
    expect(input).not.toHaveFocus()
    fireEvent.keyDown(window, { code: 'KeyK', ctrlKey: true })
    expect(input).toHaveFocus()
  })
})

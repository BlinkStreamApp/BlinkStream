import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MultiStreamGrid from './MultiStreamGrid'

vi.mock('../../utils/i18n', () => ({ useT: () => (_key, fallback) => fallback }))
vi.mock('../Chat', () => ({ default: ({ channel, channels, onSelectDestination }) => <div data-testid="grid-chat" data-channels={channels?.join(',')} data-destination={channel}>{channel}{channels && <button onClick={() => onSelectDestination(channels.at(-1))}>Choose last destination</button>}</div> }))
vi.mock('./GridCell', () => ({ default: ({ index, channel, isAudioFocused, isChatActive, onSetChannel, onRemove, onFocusAudio, onSelectChat }) => <div data-testid={`cell-${index}`} data-channel={channel} data-audio={isAudioFocused} data-chat={isChatActive}>
  <button onClick={() => onSetChannel(index, `channel${index}`)}>Load {index}</button>
  <button onClick={() => onRemove(index)}>Remove {index}</button>
  <button onClick={() => onFocusAudio(index)}>Audio {index}</button>
  <button onClick={() => onSelectChat(index)}>Chat {index}</button>
</div> }))

describe('MultiStreamGrid', () => {
  it('merges only visible unique rooms and requires an explicit new destination when the old one disappears', async () => {
    render(<MultiStreamGrid initialChannel="first" />)
    fireEvent.click(screen.getByRole('button', { name: 'Quad (2×2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Unificado', exact: true }))
    const chat = await screen.findByTestId('grid-chat')
    expect(chat).toHaveAttribute('data-channels', 'first,channel3')
    expect(chat).toHaveAttribute('data-destination', 'first')
    fireEvent.click(screen.getByRole('button', { name: 'Choose last destination' }))
    expect(chat).toHaveAttribute('data-destination', 'channel3')
    fireEvent.click(screen.getByRole('button', { name: 'Dual (2)' }))
    expect(screen.getByTestId('grid-chat')).toHaveAttribute('data-channels', 'first')
    expect(screen.getByTestId('grid-chat')).toHaveAttribute('data-destination', '')
    fireEvent.click(screen.getByRole('button', { name: 'Individual', exact: true }))
    expect(screen.getByTestId('grid-chat')).not.toHaveAttribute('data-channels')
    expect(screen.getByTestId('grid-chat')).toHaveTextContent('first')
  })
  it('moves audio and chat to visible channels when reducing the layout, keeping hidden slots recoverable', async () => {
    render(<MultiStreamGrid initialChannel="first" />)
    fireEvent.click(screen.getByRole('button', { name: 'Quad (2×2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Audio 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chat 3' }))
    expect(await screen.findByTestId('grid-chat')).toHaveTextContent('channel3')
    fireEvent.click(screen.getByRole('button', { name: 'Dual (2)' }))
    expect(screen.getByTestId('cell-0')).toHaveAttribute('data-audio', 'true')
    expect(screen.getByTestId('cell-0')).toHaveAttribute('data-chat', 'true')
    expect(screen.getByTestId('grid-chat')).toHaveTextContent('first')
    expect(within(screen.getByRole('complementary')).queryByRole('button', { name: 'channel3' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quad (2×2)' }))
    expect(screen.getByTestId('cell-3')).toHaveAttribute('data-channel', 'channel3')
  })

  it('reassigns removed audio/chat and never displays a hidden channel when visible slots are empty', async () => {
    render(<MultiStreamGrid initialChannel="first" />)
    fireEvent.click(screen.getByRole('button', { name: 'Quad (2×2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dual (2)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove 0' }))
    expect(await screen.findByTestId('grid-chat')).toHaveTextContent('channel1')
    expect(screen.getByTestId('cell-1')).toHaveAttribute('data-audio', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1' }))
    expect(screen.queryByTestId('grid-chat')).not.toBeInTheDocument()
    expect(screen.getByText('Añade un canal al grid para ver su chat.')).toBeInTheDocument()
  })

  it('focuses audio on the first channel loaded in an initially empty second slot', async () => {
    render(<MultiStreamGrid />)
    fireEvent.click(screen.getByRole('button', { name: 'Load 1' }))
    expect(screen.getByTestId('cell-1')).toHaveAttribute('data-audio', 'true')
    expect(await screen.findByTestId('grid-chat')).toHaveTextContent('channel1')
  })

  it('reopens a hidden chat when selected from a cell', async () => {
    render(<MultiStreamGrid initialChannel="first" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar chat' }))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Chat 0' }))
    expect(await screen.findByTestId('grid-chat')).toHaveTextContent('first')
    expect(screen.getByRole('button', { name: 'Ocultar chat' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('positions left/right chat in matching DOM and keyboard order', () => {
    const { container, rerender } = render(<MultiStreamGrid initialChannel="first" chatOnRight={false} />)
    expect(container.firstElementChild.firstElementChild.tagName).toBe('ASIDE')
    rerender(<MultiStreamGrid initialChannel="first" chatOnRight />)
    expect(container.firstElementChild.lastElementChild.tagName).toBe('ASIDE')
    expect(screen.getByRole('button', { name: 'Dual (2)' })).toHaveAttribute('aria-pressed', 'true')
  })
})

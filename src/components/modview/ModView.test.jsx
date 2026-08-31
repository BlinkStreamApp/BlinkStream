import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModQuickActionsBar } from './ModQuickActionsBar'
import { UserInspectorCard } from './UserInspectorCard'
import { ModActionFeed } from './ModActionFeed'
import { AutoModQueue } from './AutoModQueue'
import { ActivityFeed } from './ActivityFeed'
import { RewardsQueuePanel } from './RewardsQueuePanel'
import { ModViewLayoutDrawer } from './ModViewLayoutDrawer'


describe('ModQuickActionsBar', () => {
  it('renders channel name and mode toggles correctly', () => {
    const onSetMode = vi.fn()
    const onExit = vi.fn()

    render(
      <ModQuickActionsBar
        channel="testchannel"
        activeModes={{ slow: '10', emoteonly: true }}
        onSetMode={onSetMode}
        onExit={onExit}
        remainingActions={18}
      />
    )

    expect(screen.getByText('testchannel')).toBeInTheDocument()
    expect(screen.getByText('Mod View')).toBeInTheDocument()
    expect(screen.getByText('Solo Emotes')).toBeInTheDocument()
    expect(screen.getByText(/Lento \(10s\)/)).toBeInTheDocument()
    expect(screen.getByText(/18\/20/)).toBeInTheDocument()

    // Test Exit click
    fireEvent.click(screen.getByTitle(/Salir de la Vista de Moderador/i))
    expect(onExit).toHaveBeenCalled()

    // Test Emote-only toggle (active -> emoteonlyoff)
    fireEvent.click(screen.getByTitle('Solo Emotes'))
    expect(onSetMode).toHaveBeenCalledWith('emoteonlyoff')
  })

  it('triggers Shield Mode when clicked', () => {
    const onSetMode = vi.fn()

    render(
      <ModQuickActionsBar
        channel="testchannel"
        activeModes={{}}
        onSetMode={onSetMode}
      />
    )

    const shieldBtn = screen.getByTitle(/Activar Modo Escudo/i)
    fireEvent.click(shieldBtn)

    expect(onSetMode).toHaveBeenCalledWith('emoteonly')
    expect(onSetMode).toHaveBeenCalledWith('subscribers')
    expect(onSetMode).toHaveBeenCalledWith('slow', '30')
  })

  it('handles Clear Chat with confirmation dialog', () => {
    const onClearChat = vi.fn()

    render(
      <ModQuickActionsBar
        channel="testchannel"
        onClearChat={onClearChat}
      />
    )

    // First click: prompts confirmation
    fireEvent.click(screen.getByTitle('Vaciar Chat del Canal'))
    expect(screen.getByText('¿Vaciar?')).toBeInTheDocument()

    // Confirm click: calls onClearChat
    fireEvent.click(screen.getByText('Sí'))
    expect(onClearChat).toHaveBeenCalled()
  })
})

describe('UserInspectorCard', () => {
  const targetUser = {
    userId: 'user-123',
    username: 'troll_user',
    displayName: 'Troll_User',
    isSub: true,
    isVip: false,
    isMod: false,
  }

  const recentMessages = [
    { id: 'm1', user: 'troll_user', text: 'Hello spam 1', timestamp: Date.now() - 5000 },
    { id: 'm2', user: 'other_user', text: 'Normal msg', timestamp: Date.now() - 4000 },
    { id: 'm3', user: 'troll_user', text: 'Hello spam 2', timestamp: Date.now() - 1000 },
  ]

  it('renders search bar and recent chatters list when no user is selected', () => {
    const onSelectUser = vi.fn()
    render(
      <UserInspectorCard
        targetUser={null}
        recentMessages={recentMessages}
        onSelectUser={onSelectUser}
      />
    )
    expect(screen.getByText(/Inspector & Buscador de Usuario/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Buscar o escribir @usuario.../i)).toBeInTheDocument()
    expect(screen.getByText(/Participantes Recientes/i)).toBeInTheDocument()
    expect(screen.getByText('troll_user')).toBeInTheDocument()

    // Click on chatter selects user
    fireEvent.click(screen.getByText('troll_user'))
    expect(onSelectUser).toHaveBeenCalledWith(expect.objectContaining({ username: 'troll_user' }))
  })

  it('renders selected user details and session history', () => {
    render(
      <UserInspectorCard
        targetUser={targetUser}
        recentMessages={recentMessages}
      />
    )

    expect(screen.getByText('Troll_User')).toBeInTheDocument()
    expect(screen.getByText('@troll_user')).toBeInTheDocument()
    expect(screen.getByText('SUB')).toBeInTheDocument()
    expect(screen.getByText('Hello spam 1')).toBeInTheDocument()
    expect(screen.getByText('Hello spam 2')).toBeInTheDocument()
  })

  it('triggers timeout when 1s purge is clicked', async () => {
    const onTimeout = vi.fn().mockResolvedValue(true)
    render(
      <UserInspectorCard
        targetUser={targetUser}
        onTimeout={onTimeout}
      />
    )

    fireEvent.click(screen.getByText('1s Purga'))
    expect(onTimeout).toHaveBeenCalledWith('user-123', 'troll_user', 1, expect.any(String))
  })

  it('triggers ban when Ban button is clicked', async () => {
    const onBan = vi.fn().mockResolvedValue(true)
    render(
      <UserInspectorCard
        targetUser={targetUser}
        onBan={onBan}
      />
    )

    fireEvent.click(screen.getByText('Banear'))
    expect(onBan).toHaveBeenCalledWith('user-123', 'troll_user', expect.any(String))
  })

  it('triggers unban when Unban button is clicked', async () => {
    const onUnban = vi.fn().mockResolvedValue(true)
    render(
      <UserInspectorCard
        targetUser={targetUser}
        onUnban={onUnban}
      />
    )

    fireEvent.click(screen.getByText('Perdonar / Unban'))
    expect(onUnban).toHaveBeenCalledWith('user-123', 'troll_user')
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <UserInspectorCard
        targetUser={targetUser}
        onClose={onClose}
      />
    )

    fireEvent.click(screen.getByTitle('Cerrar Inspector'))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ModActionFeed', () => {
  it('renders empty state when audit log is empty', () => {
    render(<ModActionFeed auditLog={[]} />)
    expect(screen.getByText('Sin acciones recientes')).toBeInTheDocument()
  })

  it('renders chronological actions with labels and targets', () => {
    const onInspectUser = vi.fn()
    const auditLog = [
      { id: '1', action: 'timeout', target: 'u1', targetName: 'toxic_viewer', duration: 600, reason: 'Spamming', success: true, timestamp: Date.now() },
      { id: '2', action: 'ban', target: 'u2', targetName: 'hater99', reason: 'Hate speech', success: true, timestamp: Date.now() },
    ]

    render(<ModActionFeed auditLog={auditLog} onInspectUser={onInspectUser} />)

    expect(screen.getByText('TIMEOUT (600s)')).toBeInTheDocument()
    expect(screen.getByText('BAN PERMANENTE')).toBeInTheDocument()
    expect(screen.getByText('@toxic_viewer')).toBeInTheDocument()
    expect(screen.getByText('@hater99')).toBeInTheDocument()
    expect(screen.getByText('Hate speech')).toBeInTheDocument()

    // Click on target name triggers inspect
    fireEvent.click(screen.getByText('@toxic_viewer'))
    expect(onInspectUser).toHaveBeenCalledWith({ username: 'toxic_viewer', userId: 'u1' })
  })
})

describe('AutoModQueue', () => {
  it('renders empty state when no held messages exist', () => {
    render(<AutoModQueue heldMessages={[]} />)
    expect(screen.getByText('Sin mensajes retenidos')).toBeInTheDocument()
  })

  it('renders held message and triggers ALLOW / DENY callbacks', async () => {
    const onRemoveMessage = vi.fn()
    const held = [
      { id: 'msg-1', user: 'bad_user', userId: 'u9', text: 'Offensive word here', category: 'hostility' },
    ]

    render(
      <AutoModQueue
        broadcasterId="b1"
        userId="mod1"
        heldMessages={held}
        onRemoveMessage={onRemoveMessage}
      />
    )

    expect(screen.getByText('@bad_user')).toBeInTheDocument()
    expect(screen.getByText('"Offensive word here"')).toBeInTheDocument()
    expect(screen.getByText('hostility')).toBeInTheDocument()
    expect(screen.getByText('Permitir')).toBeInTheDocument()
    expect(screen.getByText('Denegar')).toBeInTheDocument()
  })
})

describe('ActivityFeed', () => {
  it('renders empty state when no activities present', () => {
    render(<ActivityFeed messages={[]} />)
    expect(screen.getByText('Sin actividad reciente')).toBeInTheDocument()
  })

  it('renders parsed subscription, raid, bits, and channel point reward events', () => {
    const msgs = [
      { id: '1', msg_id: 'sub', user: 'sub_user', user_id: 'u1', message: 'First sub!', timestamp: Date.now() },
      { id: '2', msg_id: 'raid', user: 'raider_streamer', user_id: 'u2', message: 'Raid with 50 viewers', timestamp: Date.now() },
      { id: '3', eventType: 'bits', user: 'cheer_fan', user_id: 'u3', message: 'Cheer1000 Love stream', timestamp: Date.now() },
      { id: '4', eventType: 'reward', user: 'AlbertPlayXD', user_id: 'u4', eventHeader: '🎁 AlbertPlayXD ha canjeado Estiiiiiiiiira 🐸 250', message: '', timestamp: Date.now() },
    ]

    render(<ActivityFeed messages={msgs} />)

    expect(screen.getByText('⭐ Nueva Suscripción')).toBeInTheDocument()
    expect(screen.getByText('@sub_user')).toBeInTheDocument()
    expect(screen.getByText('🚀 Raid Entrante!')).toBeInTheDocument()
    expect(screen.getByText('@raider_streamer')).toBeInTheDocument()
    expect(screen.getByText('💎 Donación de Bits')).toBeInTheDocument()
    expect(screen.getByText('@cheer_fan')).toBeInTheDocument()
    expect(screen.getByText('🎁 AlbertPlayXD ha canjeado Estiiiiiiiiira 🐸 250')).toBeInTheDocument()
    expect(screen.getByText('@AlbertPlayXD')).toBeInTheDocument()
  })
})

describe('RewardsQueuePanel', () => {
  it('renders empty state when no redemptions pending', () => {
    render(<RewardsQueuePanel pendingRedemptions={[]} />)
    expect(screen.getByText('Sin solicitudes pendientes')).toBeInTheDocument()
  })

  it('renders pending redemption with user input and handles fulfill', async () => {
    const onFulfill = vi.fn().mockResolvedValue(true)
    const pending = [
      {
        id: 'red-1',
        reward: { id: 'rew-1', title: 'Canta una canción', cost: 5000 },
        user_name: 'music_lover',
        user_input: 'Canta Bohemian Rhapsody por favor',
        redeemed_at: new Date().toISOString(),
      },
    ]

    render(
      <RewardsQueuePanel
        pendingRedemptions={pending}
        onFulfillRedemption={onFulfill}
      />
    )

    expect(screen.getByText('Canta una canción')).toBeInTheDocument()
    expect(screen.getByText(/5[,. ]?000\s*pts/i)).toBeInTheDocument()
    expect(screen.getByText('@music_lover')).toBeInTheDocument()
    expect(screen.getByText('"Canta Bohemian Rhapsody por favor"')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cumplir'))
    expect(onFulfill).toHaveBeenCalledWith('rew-1', 'red-1')
  })

  it('handles cancel redemption', async () => {
    const onCancel = vi.fn().mockResolvedValue(true)
    const pending = [
      {
        id: 'red-2',
        reward: { id: 'rew-2', title: 'Dibujo rápido', cost: 1000 },
        user_name: 'art_fan',
        user_input: 'Dibuja un gato',
      },
    ]

    render(
      <RewardsQueuePanel
        pendingRedemptions={pending}
        onCancelRedemption={onCancel}
      />
    )

    fireEvent.click(screen.getByText('Rechazar'))
    expect(onCancel).toHaveBeenCalledWith('rew-2', 'red-2')
  })
})

describe('ModViewLayoutDrawer', () => {
  it('renders presets and handles toggling tabs and closing', () => {
    const onChangeConfig = vi.fn()
    const onClose = vi.fn()

    render(
      <ModViewLayoutDrawer
        isOpen={true}
        onClose={onClose}
        config={{
          preset: 'standard',
          showPlayer: true,
          showInspector: true,
          enabledTabs: ['audit', 'users'],
        }}
        onChangeConfig={onChangeConfig}
      />
    )

    expect(screen.getByText('Personalizar Vista de Moderación')).toBeInTheDocument()
    expect(screen.getByText('Estándar (Vídeo | Chat | Herramientas)')).toBeInTheDocument()

    // Toggle player
    fireEvent.click(screen.getByText('Reproductor de Vídeo'))
    expect(onChangeConfig).toHaveBeenCalledWith(expect.objectContaining({ showPlayer: false }))

    // Close button
    fireEvent.click(screen.getByText('Guardar & Cerrar'))
    expect(onClose).toHaveBeenCalled()
  })
})





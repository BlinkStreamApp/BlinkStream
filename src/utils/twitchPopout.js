import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauriEnv'

export async function openTwitchChatPopoutWindow(channelName, alwaysOnTop = false, authToken = null, username = null) {
  if (!channelName) return
  const cleanChannel = channelName.trim().toLowerCase()
  if (isTauri()) {
    try {
      await invoke('open_twitch_popout_window', {
        channel: cleanChannel,
        alwaysOnTop,
        authToken,
        username,
      })
      return
    } catch (err) {
      console.warn('[TwitchChatPopout] invoke open_twitch_popout_window failed:', err)
    }
  }
  const url = `https://twitch.tv/popout/${encodeURIComponent(cleanChannel)}/chat?popout=`
  window.open(url, `twitch_chat_${cleanChannel}`, 'width=380,height=620,menubar=no,toolbar=no,location=no,status=no,noopener,noreferrer') // ALLOWED-REGRESSION: popup window
}

export async function openTwitchDropsWindow(alwaysOnTop = false) {
  if (isTauri()) {
    try {
      await invoke('open_twitch_drops_window', { alwaysOnTop })
      return
    } catch (err) {
      console.warn('[TwitchDropsPopout] invoke open_twitch_drops_window failed:', err)
    }
  }
  window.open('https://www.twitch.tv/drops/inventory', 'twitch_drops_inventory', 'width=520,height=750,menubar=no,toolbar=no,location=no,status=no,noopener,noreferrer') // ALLOWED-REGRESSION: popup window
}


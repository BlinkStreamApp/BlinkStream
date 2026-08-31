import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './tauriEnv'

export async function openTwitchChatPopoutWindow(channelName, alwaysOnTop = false) {
  if (!channelName) return
  const cleanChannel = channelName.trim().toLowerCase()
  if (isTauri()) {
    try {
      await invoke('open_twitch_popout_window', {
        channel: cleanChannel,
        alwaysOnTop,
      })
      return
    } catch (err) {
      console.warn('[TwitchChatPopout] invoke open_twitch_popout_window failed:', err)
    }
  }
  const url = `https://twitch.tv/popout/${encodeURIComponent(cleanChannel)}/chat?popout=`
  window.open(url, `twitch_chat_${cleanChannel}`, 'width=380,height=620,menubar=no,toolbar=no,location=no,status=no')
}

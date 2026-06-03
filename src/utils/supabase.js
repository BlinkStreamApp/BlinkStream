export const SUPABASE_URL = 'https://oncbojnqxpxctwnhehau.supabase.co'

const EDGE_FN = `${SUPABASE_URL}/functions/v1/twitch-auth`

export async function pollAuthToken(requestId, { signal, interval = 1500 } = {}) {
  const pollUrl = `${EDGE_FN}?fetch=${encodeURIComponent(requestId)}`

  while (!signal?.aborted) {
    try {
      const res = await fetch(pollUrl)
      if (!res.ok) {
        await sleep(interval, signal)
        continue
      }

      const data = await res.json()
      if (data?.found && data?.access_token) {
        return { access_token: data.access_token, username: data.username || 'twitch_user' }
      }
    } catch {
    }

    await sleep(interval, signal)
  }
  return null
}

function sleep(ms, signal) {
  return new Promise(r => {
    const timer = setTimeout(r, ms)
    if (signal) {
      signal.addEventListener('abort', () => { clearTimeout(timer); r(); }, { once: true })
    }
  })
}

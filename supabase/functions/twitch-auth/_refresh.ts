export type AuthPostBody =
  | { action: "refresh"; refreshToken: string }
  | {
    action: "logout";
    twitchAccessToken: string | null;
    supabaseAccessToken: string | null;
    supabaseRefreshToken: string | null;
  };

function boundedString(value: unknown, min: number, max: number): string | null {
  return typeof value === "string" && value.length >= min && value.length <= max
    ? value
    : null;
}

export async function readAuthBody(req: Request): Promise<AuthPostBody | null> {
  if (req.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return null;
  }
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12_288) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    const action = data?.action ?? (data?.refresh_token ? "refresh" : null);

    if (action === "refresh") {
      const refreshToken = boundedString(data?.refresh_token, 20, 2_048);
      return refreshToken ? { action, refreshToken } : null;
    }

    if (action === "logout") {
      const twitchAccessToken = boundedString(data?.twitch_access_token, 20, 2_048);
      const supabaseAccessToken = boundedString(data?.supabase_access_token, 20, 8_192);
      const supabaseRefreshToken = boundedString(data?.supabase_refresh_token, 20, 2_048);
      if (!twitchAccessToken && !supabaseAccessToken && !supabaseRefreshToken) return null;
      return { action, twitchAccessToken, supabaseAccessToken, supabaseRefreshToken };
    }

    return null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

// Compatibility for focused parser tests and callers that only refresh.
export async function readRefreshBody(req: Request): Promise<string | null> {
  const body = await readAuthBody(req);
  return body?.action === "refresh" ? body.refreshToken : null;
}

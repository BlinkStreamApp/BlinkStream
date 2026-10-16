export async function readRefreshBody(req: Request): Promise<string | null> {
  if (req.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return null;
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return typeof data?.refresh_token === "string" && data.refresh_token.length >= 20 && data.refresh_token.length <= 500
      ? data.refresh_token : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

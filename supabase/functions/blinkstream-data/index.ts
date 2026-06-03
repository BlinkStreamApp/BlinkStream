// BlinkStream Data Sync
// CRUD de favoritos via PostgreSQL directo
//
// Endpoints:
//   GET  /blinkstream-data?action=list&username=NAME
//   POST /blinkstream-data  body: { action, username, channel }

import postgres from "npm:postgres";

const DB_URL = Deno.env.get("SUPABASE_DB_URL") || "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sql = DB_URL ? postgres(DB_URL, { max: 3, idle_timeout: 10 }) : null;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const username = url.searchParams.get("username");

  // ─── Debug ───
  if (url.searchParams.has("debug")) {
    return json({ db_url_set: !!DB_URL, sql_ready: !!sql });
  }

  // ─── Asegurar tabla en cada request ───
  if (sql) {
    await sql`CREATE TABLE IF NOT EXISTS public.favorites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username TEXT NOT NULL,
      channel TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(username, channel)
    )`.catch(() => {});
    await sql`CREATE INDEX IF NOT EXISTS idx_favorites_username ON public.favorites(username)`.catch(() => {});
  }

  // ─── GET: listar favoritos ───
  if (req.method === "GET" && action === "list" && username) {
    return handleList(username);
  }

  // ─── POST: añadir/quitar ───
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (body.action === "fav_add" && body.username && body.channel) {
        return handleAdd(body.username, body.channel);
      }
      if (body.action === "fav_remove" && body.username && body.channel) {
        return handleRemove(body.username, body.channel);
      }
    } catch { /* invalid JSON */ }
  }

  return new Response(JSON.stringify({ ok: false, error: "invalid request" }), {
    status: 400,
    headers: { "Content-Type": "application/json", ...CORS },
  });
});

async function handleList(username: string) {
  if (!sql) return json({ ok: false, error: "DB offline" });
  try {
    const rows = await sql`SELECT channel, created_at FROM public.favorites WHERE username = ${username} ORDER BY created_at ASC`;
    return json({ ok: true, channels: rows.map(r => r.channel) });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

async function handleAdd(username: string, channel: string) {
  if (!sql) return json({ ok: false, error: "DB offline" });
  try {
    await sql`INSERT INTO public.favorites (username, channel) VALUES (${username}, ${channel}) ON CONFLICT (username, channel) DO NOTHING`;
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

async function handleRemove(username: string, channel: string) {
  if (!sql) return json({ ok: false, error: "DB offline" });
  try {
    await sql`DELETE FROM public.favorites WHERE username = ${username} AND channel = ${channel}`;
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

function json(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// BlinkStream Twitch OAuth Helper v4
// Usa PostgreSQL directo porque REST API no responde
//
// Endpoints:
//   GET /twitch-auth?request_id=ID → redirige a Twitch OAuth
//   GET /twitch-auth?code=...&state=... → callback de Twitch
//   GET /twitch-auth?fetch=ID → polling (JSON)
//   GET /twitch-auth?debug=1 → diagnóstico

import postgres from "npm:postgres";

const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") || "";
const TWITCH_CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") || "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") || "";
const REDIRECT_URI = "https://oncbojnqxpxctwnhehau.supabase.co/functions/v1/twitch-auth";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pool global (reutilizado entre requests)
const sql = DB_URL ? postgres(DB_URL, { max: 3, idle_timeout: 10 }) : null;

// Asegurar que la tabla existe
if (sql) {
  sql`CREATE TABLE IF NOT EXISTS public.auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    username TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`.catch(() => {});
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");

  // ─── Debug ───
  if (url.searchParams.has("debug")) {
    let dbg: Record<string, unknown> = { db_url_set: !!DB_URL, sql_ready: !!sql, has_client_id: !!TWITCH_CLIENT_ID, has_client_secret: !!TWITCH_CLIENT_SECRET, client_id_preview: TWITCH_CLIENT_ID.slice(0, 8) + "..." };
    if (sql) {
      try {
        const dbInfo = await sql`SELECT current_database() as db, current_schema() as sc, COUNT(*)::int as cnt FROM public.auth_tokens`;
        dbg.db_name = dbInfo[0]?.db;
        dbg.schema = dbInfo[0]?.sc;
        dbg.row_count = dbInfo[0]?.cnt;

        // Auto-test: insertar y leer inmediatamente
        const testId = "debug-test-" + Date.now();
        try {
          await sql`INSERT INTO public.auth_tokens (request_id, access_token, username) VALUES (${testId}, 'auto_test_token', 'autotest')`;
          const readback = await sql`SELECT request_id, username FROM public.auth_tokens WHERE request_id = ${testId} LIMIT 1`;
          dbg.test_insert_read = readback.length > 0 ? "OK: " + readback[0].username : "FAIL: no se pudo leer lo insertado";
          // Cleanup
          await sql`DELETE FROM public.auth_tokens WHERE request_id = ${testId}`;
        } catch (e) {
          dbg.test_insert_read = "ERROR: " + (e.message || String(e));
        }
      } catch (e) {
        dbg.db_error = e.message || String(e);
      }
    }
    return new Response(JSON.stringify(dbg, null, 2), { headers: { "Content-Type": "application/json", ...CORS } });
  }

  // ─── Polling ───
  const fetchId = url.searchParams.get("fetch");
  if (fetchId) {
    return handleFetch(fetchId);
  }

  // ─── Error de Twitch ───
  if (errParam) {
    return html(getErrorHtml("Twitch rechazó la autorización: " + errParam));
  }

  // ─── Callback de Twitch ───
  if (code && state) {
    return handleCallback(code, state);
  }

  // ─── Inicio: redirigir a Twitch OAuth ───
  const requestId = url.searchParams.get("request_id") || crypto.randomUUID();
  if (!TWITCH_CLIENT_ID) {
    return html(getErrorHtml("Falta configurar TWITCH_CLIENT_ID en la Edge Function"));
  }

  const authUrl = new URL(TWITCH_AUTH_URL);
  authUrl.searchParams.set("client_id", TWITCH_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "chat:read chat:edit user:edit:follows user:read:follows");
  authUrl.searchParams.set("state", requestId);
  authUrl.searchParams.set("force_verify", "true");

  return Response.redirect(authUrl.toString(), 302);
});

// ─── Polling: buscar token por request_id ───
async function handleFetch(requestId: string) {
  if (!sql) {
    return json({ found: false, error: "DB no disponible" });
  }
  try {
    const rows = await sql`SELECT access_token, username FROM public.auth_tokens WHERE request_id = ${requestId} LIMIT 1`;
    if (rows.length > 0) {
      // Limpiar (no esperar)
      sql`DELETE FROM public.auth_tokens WHERE request_id = ${requestId}`.catch(() => {});
      return json({ found: true, access_token: rows[0].access_token, username: rows[0].username });
    }
    return json({ found: false });
  } catch (err) {
    return json({ found: false, error: "DB error: " + (err.message || err) });
  }
}

// ─── Callback de Twitch: intercambiar code por token ───
async function handleCallback(code: string, requestId: string) {
  try {
    const body = new URLSearchParams({
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }).toString();

    const tokenRes = await fetch(TWITCH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const rawText = await tokenRes.text();
    let tokenData;
    try { tokenData = JSON.parse(rawText); } catch { tokenData = {}; }

    if (!tokenData.access_token) {
      return html(getErrorHtml(
        "Error de Twitch (" + tokenRes.status + "): " +
        (tokenData.message || rawText || "sin respuesta")
      ));
    }

    const accessToken = tokenData.access_token;

    // Obtener username
    let username = "desconocido";
    try {
      const userRes = await fetch("https://api.twitch.tv/helix/users", {
        headers: { Authorization: `Bearer ${accessToken}`, "Client-ID": TWITCH_CLIENT_ID },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        username = userData.data?.[0]?.login || username;
      }
    } catch { /* ok */ }

    // Guardar en DB via PostgreSQL directo
    if (sql) {
      try {
        await sql`INSERT INTO public.auth_tokens (request_id, access_token, username) VALUES (${requestId}, ${accessToken}, ${username})`;
      } catch (dbErr) {
        console.error("DB insert error:", dbErr.message || dbErr);
        // Continuar de todas formas
      }
    }

    return html(getSuccessHtml(username));

  } catch (err) {
    return html(getErrorHtml("Error interno: " + (err.message || err)));
  }
}

// ─── Helpers ───
function html(body: string) {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8", ...CORS } });
}
function json(data: Record<string, unknown>) {
  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...CORS } });
}

// ─── HTML Templates ───
function getSuccessHtml(username: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BlinkStream - Conectado</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f1a;color:#efeff1;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:1rem}
.card{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:16px;padding:2rem;max-width:420px;width:100%;text-align:center}
.icon{font-size:3rem;margin-bottom:1rem;color:#4ade80}
h2{color:#4ade80;font-size:1.3rem;margin-bottom:0.5rem}
p{color:#9a9abf;font-size:0.9rem;line-height:1.5;margin-bottom:0.5rem}
.username{color:#9147ff;font-weight:700;font-size:1.1rem}
.close-hint{color:#5a5a7a;font-size:0.75rem;margin-top:1.5rem;padding-top:1rem;border-top:1px solid #2a2a4a}
</style>
</head>
<body>
<div class="card">
<div class="icon">✅</div>
<h2>¡Conectado!</h2>
<p>Has iniciado sesión como <span class="username">${escapeHtml(username)}</span></p>
<p>Ya puedes cerrar esta ventana y volver a BlinkStream.</p>
<div class="close-hint">La app detectará la sesión automáticamente en unos segundos.</div>
</div>
</body>
</html>`;
}

function getErrorHtml(msg: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BlinkStream - Error</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f1a;color:#efeff1;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;padding:1rem}
.card{background:#1a1a2e;border:1px solid #2a2a4a;border-radius:16px;padding:2rem;max-width:420px;width:100%;text-align:center}
.icon{font-size:3rem;margin-bottom:1rem}
h2{color:#ff6b6b;font-size:1.1rem;margin-bottom:0.75rem}
.msg{color:#9a9abf;font-size:0.85rem;line-height:1.5;margin-bottom:1.5rem}
.btn{display:inline-block;padding:0.6rem 1.25rem;border-radius:8px;background:#9147ff;color:#fff;font-size:0.85rem;font-weight:600;text-decoration:none;transition:background .2s}
.btn:hover{background:#772ce8}
</style>
</head>
<body>
<div class="card">
<div class="icon">⚠</div>
<h2>Algo salió mal</h2>
<div class="msg">${escapeHtml(msg).replace(/\n/g, '<br>')}</div>
<a class="btn" href="/">Intentar de nuevo</a>
</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

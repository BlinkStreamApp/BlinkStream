// BlinkStream Twitch OAuth Helper v5
// F-1 fix: ademas del access_token de Twitch, emite un JWT de Supabase
// firmado por el service role. Este JWT lo valida blinkstream-data con
// supabase.auth.getUser() (P0-2 hardening). El username viaja en
// user_metadata.username para que blinkstream-data pueda compararlo con
// el body/query (lineas 142-145 y 312 de su index.ts).
//
// Endpoints:
//   GET /twitch-auth?request_id=ID     -> redirige a Twitch OAuth
//   GET /twitch-auth?code=...&state=.. -> callback de Twitch
//   GET /twitch-auth?fetch=ID          -> polling (JSON, incluye supabase_jwt)
//   GET /twitch-auth?refresh=RT        -> intercambia refresh_token Supabase por nuevo par
//   GET /twitch-auth?debug=1           -> diagnostico

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  buildCorsHeaders,
  checkGeneralRate,
  checkPollingRate,
  getClientIp,
  isDebugEnabled,
  isValidUuidV4,
  logSuspicious,
  validateOriginReferer,
} from "./_security.ts";

const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") || "";
const TWITCH_CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") || "";
// F-1 fix: envs para emitir Supabase JWT firmado. Si faltan, la emision
// se desactiva y blinkstream-data seguira dando 401 (degradacion explicita).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const REDIRECT_URI = "https://oncbojnqxpxctwnhehau.supabase.co/functions/v1/twitch-auth";

// Headers de seguridad estandar aplicados a TODAS las respuestas (Issue P0-3)
function buildSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
  };
}

// Headers CORS para polling: usa * porque el Tauri WebView puede no enviar
// Origin header, lo que haria que buildCorsHeaders() devuelva null y la
// respuesta sea opaque (ilegible para fetch en el frontend).
const pollingCors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

// Pool global (reutilizado entre requests)
// Cliente Supabase con service_role. SOLO se usa server-side para emitir
// sesiones firmadas a usuarios legitimos (los que pasaron OAuth de Twitch).
// NUNCA exponer SERVICE_ROLE_KEY al cliente.
const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;


// ============= F-1 fix: Emision de Supabase JWT =============
//
// Genera un usuario "virtual" unico por twitch login y emite una sesion
// firmada con signInWithPassword usando una password random por sesion.
// Es seguro porque:
//   1. Solo emitimos tokens a usuarios que YA autenticaron con Twitch
//      (probado por el code+state del callback de Twitch).
//   2. La password random nunca sale del server ni se reutiliza.
//   3. El user resultante tiene user_metadata.username = twitch login,
//      que es exactamente lo que blinkstream-data espera comparar.
//
// Si SUPABASE_URL o SERVICE_ROLE_KEY faltan, supabaseAdmin es null y la
// emision se omite silenciosamente. El polling seguira funcionando con
// el access_token de Twitch; blinkstream-data dara 401 (degradacion
// explicita y detectable por logs).

interface SupabaseSession {
  supabase_jwt: string;
  supabase_refresh_token: string;
  supabase_expires_in: number;
  supabase_user_id: string;
}

async function issueSupabaseSession(twitchLogin: string): Promise<SupabaseSession | null> {
  if (!supabaseAdmin) return null;
  const email = `twitch-${twitchLogin.toLowerCase()}@blinkstream.local`;
  const randomPwd = crypto.randomUUID() + crypto.randomUUID();

  try {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: randomPwd,
      email_confirm: true,
      user_metadata: { username: twitchLogin, provider: "twitch" },
    });

    if (createErr) {
      // "User already registered" o similar: rotar password.
      // Usamos RPC get_user_id_by_email (SQL directo, O(1) con indice)
      // en vez de paginar listUsers (que era O(n) y degradaba con escala).
      let existing: { id: string; email?: string } | null = null;
      try {
        const { data: userId, error: rpcErr } = await supabaseAdmin.rpc(
          "get_user_id_by_email",
          { target_email: email },
        );
        if (rpcErr) {
          console.error("issueSupabaseSession rpc error:", rpcErr.message);
        } else if (userId) {
          existing = { id: userId as string, email };
        }
      } catch (e) {
        console.error("issueSupabaseSession rpc error:", (e as Error).message);
      }
      if (existing) {
        const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
          existing.id,
          { password: randomPwd, user_metadata: { username: twitchLogin, provider: "twitch" } },
        );
        if (updateErr) {
          console.error("issueSupabaseSession update error:", updateErr.message);
          return null;
        }
      } else {
        console.error("issueSupabaseSession create error:", createErr.message);
        return null;
      }
    }

    const { data, error: signInErr } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: randomPwd,
    });

    if (signInErr || !data?.session || !data?.user) {
      console.error("issueSupabaseSession signIn error:", signInErr?.message);
      return null;
    }

    return {
      supabase_jwt: data.session.access_token,
      supabase_refresh_token: data.session.refresh_token,
      supabase_expires_in: data.session.expires_in ?? 3600,
      supabase_user_id: data.user.id,
    };
  } catch (err) {
    console.error("issueSupabaseSession unhandled:", (err as Error).message || err);
    return null;
  }
}

async function refreshSupabaseSession(refreshToken: string): Promise<SupabaseSession | null> {
  if (!supabaseAdmin || !refreshToken) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data?.session || !data?.user) {
      console.error("refreshSupabaseSession error:", error?.message || error);
      return null;
    }
    return {
      supabase_jwt: data.session.access_token,
      supabase_refresh_token: data.session.refresh_token,
      supabase_expires_in: data.session.expires_in ?? 3600,
      supabase_user_id: data.user.id,
    };
  } catch (err) {
    console.error("refreshSupabaseSession unhandled:", (err as Error).message || err);
    return null;
  }
}

// ============= Router principal (P0-3 hardened) =============
// Issues cerrados de ERR-WT-20260624-008:
//   #1  Debug gateado con isDebugEnabled() (sin auto-INSERT)
//   #4  validateOriginReferer() con excepcion para callback de Twitch
//   #5  Rate limits separados: general(10/min) + polling(60/min)
//   #6  Whitelist de User-Agent (bloquea curl/wget/bots)
//   #7  Validacion UUID v4 en request_id, fetch y state
//   #8  logSuspicious() centralizado, sin secretos
//   #10 CORS via buildCorsHeaders() sin fallback "null"/"*"
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const ip = getClientIp(req);
  const origin = req.headers.get("Origin");
  const securityHeaders = buildSecurityHeaders();
  const corsHeaders = buildCorsHeaders(origin) ?? {};

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");
  const isTwitchCallback = !!code && !!state;
  const isDebug = url.searchParams.has("debug");
  const fetchId = url.searchParams.get("fetch");
  const isPolling = !!fetchId;
  const requestIdParam = url.searchParams.get("request_id");
  const refreshTokenParam = url.searchParams.get("refresh");

  // === Issue #4: Validar Origin/Referer ===
  // EXCEPCION: callback de Twitch (server-to-server, sin Origin), debug,
  // auth redirect (sistema operativo abre navegador sin Origin/Referer) y
  // polling (token single-use + UUID v4 + rate limit 60/min como defensa).
  const isAuthRedirect = !!requestIdParam;
  const originCheck = validateOriginReferer(req, {
    isTwitchCallback,
    isAuthRedirect,
    isPolling,
    isDebug,
  });
  if (!originCheck.valid) {
    logSuspicious({
      reason: originCheck.reason ?? "origin_validation_failed",
      ip,
      endpoint: url.pathname,
      method: req.method,
      ua: req.headers.get("User-Agent") ?? undefined,
    });
    return new Response("Forbidden", {
      status: 403,
      headers: { ...securityHeaders, ...corsHeaders },
    });
  }

  // === OPTIONS preflight CORS ===
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...securityHeaders, ...corsHeaders },
    });
  }

  // === Issue #5: Rate limiting separado por endpoint ===
  // Polling (60/min) mas permisivo que general (10/min) para UX
  // Callback de Twitch no se rate-limita aqui (Twitch es server legitimo;
  // si abusa, se detecta por logs de Twitch API errors)
  let rateCheck: { allowed: boolean; remaining: number; resetAt: number } | null = null;
  if (isPolling) {
    rateCheck = checkPollingRate(ip);
  } else if (!isTwitchCallback && !isDebug) {
    rateCheck = checkGeneralRate(ip);
  }
  if (rateCheck && !rateCheck.allowed) {
    logSuspicious({
      reason: "rate_limit_exceeded",
      ip,
      endpoint: url.pathname,
      method: req.method,
      extra: { rate_type: isPolling ? "polling" : "general" },
    });
    const retryAfter = Math.ceil((rateCheck.resetAt - Date.now()) / 1000);
    return new Response("Rate limit exceeded", {
      status: 429,
      headers: {
        ...securityHeaders,
        ...corsHeaders,
        "Retry-After": String(retryAfter),
      },
    });
  }

  // === Issue #1: Debug gateado ===
  if (isDebug) {
    if (!isDebugEnabled()) {
      return new Response("Debug mode disabled", {
        status: 404,
        headers: { ...securityHeaders, ...corsHeaders },
      });
    }
    const dbg: Record<string, unknown> = {
      debug_enabled: true,

      has_client_id: !!TWITCH_CLIENT_ID,
      has_client_secret: !!TWITCH_CLIENT_SECRET,
      client_id_preview: TWITCH_CLIENT_ID.slice(0, 8) + "...",
      redirect_uri: REDIRECT_URI,
      supabase_admin_ready: !!supabaseAdmin,
      ts: new Date().toISOString(),
    };
    return new Response(JSON.stringify(dbg, null, 2), {
      status: 200,
      headers: {
        ...securityHeaders,
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  // === Issue #3 + Polling: ?fetch=ID ===
  if (isPolling) {
    return await handleFetch(fetchId!, securityHeaders, pollingCors);
  }

  // === F-1 fix: Refresh de Supabase JWT ===
  if (refreshTokenParam) {
    if (refreshTokenParam.length < 20 || refreshTokenParam.length > 500) {
      return json(
        { ok: false, error: "invalid_refresh_token_format" },
        400,
        securityHeaders,
        corsHeaders,
      );
    }
    const fresh = await refreshSupabaseSession(refreshTokenParam);
    if (fresh) {
      return json({
        ok: true,
        supabase_jwt: fresh.supabase_jwt,
        supabase_refresh_token: fresh.supabase_refresh_token,
        supabase_expires_in: fresh.supabase_expires_in,
      }, 200, securityHeaders, corsHeaders);
    }
    return json(
      { ok: false, error: "refresh_failed" },
      400,
      securityHeaders,
      corsHeaders,
    );
  }

  // === Error de Twitch (?error=...) ===
  if (errParam) {
    logSuspicious({
      reason: "twitch_oauth_error",
      ip,
      endpoint: url.pathname,
      method: req.method,
      extra: { twitch_error: errParam },
    });
    return html(
      getErrorHtml("Twitch rechazo la autorizacion: " + errParam),
      securityHeaders,
      corsHeaders,
    );
  }

  // === Callback de Twitch (?code=&state=) ===
  if (isTwitchCallback) {
    return await handleCallback(code!, state!, securityHeaders, corsHeaders);
  }

  // === Init: redirigir a Twitch OAuth (?request_id=) ===
  if (requestIdParam) {
    return handleAuthRedirect(requestIdParam, securityHeaders, corsHeaders);
  }

  return new Response("Bad request: missing required params", {
    status: 400,
    headers: { ...securityHeaders, ...corsHeaders },
  });
});

// ============= handleFetch (P0-3 hardened) =============
// Issues: #3 (single-use atomico), #7 (UUID v4)
async function handleFetch(
  fetchId: string,
  securityHeaders: Record<string, string>,
  corsHeaders: Record<string, string>,
) {
  if (!isValidUuidV4(fetchId)) {
    return json(
      { found: false, error: "Invalid fetch id (must be UUID v4)" },
      400,
      securityHeaders,
      corsHeaders,
    );
  }
  if (!supabaseAdmin) {
    return json(
      { found: false, error: "DB no disponible" },
      503,
      securityHeaders,
      corsHeaders,
    );
  }
  try {
    // Atomic delete-and-return (single-use pattern)
    const { data, error } = await supabaseAdmin
      .from("auth_tokens")
      .delete()
      .match({ request_id: fetchId })
      .select();

    if (error || !data || data.length === 0) {
      return json(
        { found: false },
        404,
        securityHeaders,
        corsHeaders,
      );
    }

    const row = data[0] as {
      access_token: string;
      refresh_token: string | null;
      username: string;
    };

    // F-1: emitir Supabase JWT firmado
    const response: Record<string, unknown> = {
      found: true,
      access_token: row.access_token,
      username: row.username,
    };
    const session = await issueSupabaseSession(row.username);
    if (session) {
      response.supabase_jwt = session.supabase_jwt;
      response.supabase_refresh_token = session.supabase_refresh_token;
      response.supabase_expires_in = session.supabase_expires_in;
      response.supabase_user_id = session.supabase_user_id;
    }
    return json(response, 200, securityHeaders, corsHeaders);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(
      { found: false, error: "DB error: " + msg },
      500,
      securityHeaders,
      corsHeaders,
    );
  }
}
// ============= handleCallback (P0-3 hardened) =============
// Issues: #7 (UUID v4 en state), integracion F-1 (issueSupabaseSession)
async function handleCallback(
  code: string,
  requestId: string,
  securityHeaders: Record<string, string>,
  corsHeaders: Record<string, string>,
) {
  // Issue #7: validar UUID v4 en state
  if (!isValidUuidV4(requestId)) {
    return html(
      getErrorHtml("State invalido (must be UUID v4)"),
      securityHeaders,
      corsHeaders,
    );
  }
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
    let tokenData: Record<string, unknown> = {};
    try {
      tokenData = JSON.parse(rawText);
    } catch {
      tokenData = {};
    }

    if (!tokenData.access_token) {
      const errMsg = "Error de Twitch (" + tokenRes.status + "): " +
        (String(tokenData.message ?? "") || rawText || "sin respuesta");
      return html(getErrorHtml(errMsg), securityHeaders, corsHeaders);
    }

    const accessToken = String(tokenData.access_token);
    const refreshToken = tokenData.refresh_token
      ? String(tokenData.refresh_token)
      : null;

    // Obtener username via Twitch Helix
    let username = "desconocido";
    try {
      const userRes = await fetch("https://api.twitch.tv/helix/users", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-ID": TWITCH_CLIENT_ID,
        },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        username = userData?.data?.[0]?.login || username;
      }
    } catch { /* ok, mantener default */ }

    // Guardar en DB con ON CONFLICT para idempotencia
    if (!supabaseAdmin) {
      return html(getErrorHtml("Base de datos no disponible"), securityHeaders, corsHeaders);
    }
    try {
      const { error: dbErr } = await supabaseAdmin
        .from('auth_tokens')
        .upsert({
          request_id: requestId,
          access_token: accessToken,
          refresh_token: refreshToken,
          username: username,
          consumed_at: null,
          created_at: new Date().toISOString(),
        }, { onConflict: 'request_id', ignoreDuplicates: false })
      if (dbErr) {
        console.error("[twitch-auth] DB upsert error:", dbErr.message);
        return html(getErrorHtml("Error guardando sesion: " + dbErr.message), securityHeaders, corsHeaders);
      }
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error("[twitch-auth] DB upsert exception:", msg);
      return html(getErrorHtml("Error guardando sesion: " + msg), securityHeaders, corsHeaders);
    }

    // âœ… Mostrar pagina de exito. El frontend hara polling para obtener el token.
    return html(getSuccessHtml(username), securityHeaders, corsHeaders);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return html(getErrorHtml("Error interno: " + msg), securityHeaders, corsHeaders);
  }
}

// ============= handleAuthRedirect (P0-3 hardened) =============
// Issues: #7 (UUID v4 en request_id)
function handleAuthRedirect(
  requestId: string,
  securityHeaders: Record<string, string>,
  corsHeaders: Record<string, string>,
): Response {
  // Issue #7: validar UUID v4
  if (!isValidUuidV4(requestId)) {
    return new Response("Invalid request_id (must be UUID v4)", {
      status: 400,
      headers: { ...securityHeaders, ...corsHeaders },
    });
  }
  if (!TWITCH_CLIENT_ID) {
    return new Response("Falta configurar TWITCH_CLIENT_ID en la Edge Function", {
      status: 500,
      headers: { ...securityHeaders, ...corsHeaders },
    });
  }
  const authUrl = new URL(TWITCH_AUTH_URL);
  authUrl.searchParams.set("client_id", TWITCH_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  // F-2 fix: scopes actualizados (chat + moderaciÃ³n + channel points).
  // === TWITCH OAUTH SCOPES (11 total) ===
  // Chat (IRC):
  //   chat:read                       - leer mensajes via IRC (USERSTATE, PRIVMSG, etc.)
  //   chat:edit                       - enviar mensajes via IRC
  // Follows:
  //   user:edit:follows               - follow/unfollow programÃ¡tico
  //   user:read:follows               - listar follows del usuario
  // ModeraciÃ³n (requiere ser mod en el canal objetivo):
  //   moderator:manage:chat_messages  - /delete, /clear, pin/unpin
  //   moderator:manage:banned_users   - /ban, /unban, /timeout, /untimeout
  //   moderator:manage:chat_settings  - /slow, /followers, /emoteonly, /subscribers
  //   moderation:read                 - listar mods, bans, timeouts (Helix)
  // Channel Points (requiere ser broadcaster del canal):
  //   channel:read:redemptions        - listar rewards y redenciones
  //   channel:manage:redemptions      - crear/editar rewards, fulfill/cancel redenciones
  //   channel:read:subscriptions      - subs (gating de features por sub)
  //
  // RE-AUTH REQUERIDA: usuarios existentes deben re-autorizar para obtener
  // los nuevos scopes. Twitch omite silenciosamente scopes que el usuario
  // no puede tener (no es mod / no es broadcaster); NO genera error.
  authUrl.searchParams.set(
    "scope",
    "chat:read chat:edit user:edit:follows user:read:follows moderator:manage:chat_messages moderator:manage:banned_users moderator:manage:chat_settings moderation:read channel:read:redemptions channel:manage:redemptions channel:read:subscriptions",
  );
  authUrl.searchParams.set("state", requestId);
  authUrl.searchParams.set("force_verify", "true");

  return new Response(null, {
    status: 302,
    headers: {
      ...securityHeaders,
      ...corsHeaders,
      Location: authUrl.toString(),
    },
  });
}

function html(
  body: string,
  securityHeaders: Record<string, string>,
  corsHeaders: Record<string, string>,
): Response {
  const headers = new Headers({
    ...securityHeaders,
    ...corsHeaders,
    "content-type": "text/html; charset=utf-8",
  });
  return new Response(body, { status: 200, headers });
}
function json(
  data: Record<string, unknown>,
  status: number,
  securityHeaders: Record<string, string>,
  corsHeaders: Record<string, string>,
): Response {
  const headers = new Headers({
    ...securityHeaders,
    ...corsHeaders,
    "content-type": "application/json; charset=utf-8",
  });
  return new Response(JSON.stringify(data), { status, headers });
}

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
<div class="icon">&#10004;</div>
<h2>Conectado!</h2>
<p>Has iniciado sesion como <span class="username">${escapeHtml(username)}</span></p>
<p>Ya puedes cerrar esta ventana y volver a BlinkStream.</p>
<div class="close-hint">La app detectara la sesion automaticamente en unos segundos.</div>
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
<div class="icon">&#9888;</div>
<h2>Algo salio mal</h2>
<div class="msg">${escapeHtml(msg).replace(/\n/g, '<br>')}</div>
<a class="btn" href="/">Intentar de nuevo</a>
</div>
</body>
</html>`;
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

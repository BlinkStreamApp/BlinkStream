// supabase/functions/twitch-auth/index.ts
// Twitch OAuth Helper - Versión hardened
//
// Issues cerrados (de ERR-WT-20260624-008):
//   #1  Auto-INSERT destructivo con ?debug=1: gateado con isDebugEnabled()
//   #2  verify_jwt=true → false en supabase/config.toml
//   #3  Tokens single-use: consumeSingleUseToken() con UPDATE atómico
//   #4  validateOriginReferer() rechaza sin Origin/Referer
//   #5  Rate limits separados: general(10/min) + polling(60/min)
//   #6  Whitelist UA: navegadores + Tauri, bloquea curl/wget
//   #7  Validación UUID v4 en request_id
//   #8  logSuspicious() centralizado, sin secretos
//   #9  constantTimeEqual() para timing-safe compare
//   #10 CORS sin fallback "null", retorna null si origin inválido

import postgres from "npm:postgres@^3.4.5";
import {
  buildCorsHeaders,
  checkGeneralRate,
  checkPollingRate,
  consumeSingleUseToken,
  constantTimeEqual,
  getClientIp,
  isDebugEnabled,
  isValidUuidV4,
  logSuspicious,
  validateOriginReferer,
} from "./_security.ts";

// ============= Config =============
const TWITCH_AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_CLIENT_ID = Deno.env.get("TWITCH_CLIENT_ID") || "";
const TWITCH_CLIENT_SECRET = Deno.env.get("TWITCH_CLIENT_SECRET") || "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") || "";
const REDIRECT_URI =
  Deno.env.get("REDIRECT_URI") ||
  "https://oncbojnqxpxctwnhehau.supabase.co/functions/v1/twitch-auth";

// Pool global (reutilizado entre requests)
const sql = DB_URL ? postgres(DB_URL, { max: 3, idle_timeout: 10 }) : null;

// Headers de seguridad estándar (aplicados a TODAS las respuestas)
function buildSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Content-Security-Policy":
      "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'",
  };
}

// ============= Handlers =============

// GET /twitch-auth?request_id=ID → redirige a Twitch OAuth
function handleAuthRedirect(req: Request): Response {
  const url = new URL(req.url);
  const requestId = url.searchParams.get("request_id");

  // Validar formato UUID v4 (Issue #7)
  if (!requestId || !isValidUuidV4(requestId)) {
    return new Response("Invalid request_id (must be UUID v4)", {
      status: 400,
    });
  }

  const authUrl = new URL(TWITCH_AUTH_URL);
  authUrl.searchParams.set("client_id", TWITCH_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    "chat:read chat:edit user:edit:follows user:read:follows",
  );
  authUrl.searchParams.set("state", requestId);
  authUrl.searchParams.set("force_verify", "true");

  return new Response(null, {
    status: 302,
    headers: { Location: authUrl.toString() },
  });
}

// GET /twitch-auth?code=...&state=... → callback de Twitch
async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response("Missing code or state", { status: 400 });
  }

  // Validar UUID v4 en state (Issue #7)
  if (!isValidUuidV4(state)) {
    return new Response("Invalid state (must be UUID v4)", { status: 400 });
  }

  // Intercambiar code por access_token
  const body = new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });

  const tokenRes = await fetch(TWITCH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    return new Response(`Twitch token exchange failed: ${tokenRes.status}`, {
      status: 502,
    });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;

  if (!accessToken) {
    return new Response("No access_token in Twitch response", { status: 502 });
  }

  // Guardar tokens en DB (campo consumed_at inicializado a NULL)
  if (sql) {
    try {
      await sql`
        INSERT INTO public.auth_tokens (request_id, access_token, refresh_token, username, created_at)
        VALUES (${state}, ${accessToken}, ${refreshToken ?? null}, ${""}, NOW())
        ON CONFLICT (request_id) DO UPDATE SET
          access_token = EXCLUDED.access_token,
          refresh_token = EXCLUDED.refresh_token,
          consumed_at = NULL,
          created_at = NOW()
      `;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return new Response(`DB error: ${errMsg}`, { status: 500 });
    }
  }

  return new Response("Authorization complete. You may close this window.", {
    status: 200,
  });
}

// GET /twitch-auth?fetch=ID → polling, retorna token y lo invalida (single-use)
async function handleFetch(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const fetchId = url.searchParams.get("fetch");

  // Validar UUID v4 (Issue #7)
  if (!fetchId || !isValidUuidV4(fetchId)) {
    return new Response("Invalid fetch id (must be UUID v4)", {
      status: 400,
    });
  }

  if (!sql) {
    return new Response("DB not available", { status: 503 });
  }

  // Issue #3: Consumir token de forma atómica (single-use)
  // Solo el primer poll exitoso obtiene el token. Los siguientes reciben 404.
  const consumed = await consumeSingleUseToken(sql, fetchId);
  if (!consumed) {
    return new Response(
      JSON.stringify({ found: false, error: "Token already consumed or not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Leer el token recién consumido
  const rows = await sql`
    SELECT access_token, refresh_token, username
    FROM public.auth_tokens
    WHERE request_id = ${fetchId} AND consumed_at IS NOT NULL
  `;

  if (!Array.isArray(rows) || rows.length === 0) {
    return new Response(
      JSON.stringify({ found: false, error: "Token not found after consume" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const row = rows[0] as {
    access_token: string;
    refresh_token: string | null;
    username: string;
  };

  return new Response(
    JSON.stringify({
      found: true,
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      username: row.username,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

// GET /twitch-auth?debug=1 → diagnóstico (SOLO si ENABLE_DEBUG=true)
function handleDebug(req: Request): Response {
  // Issue #1: Gate con env flag. Por defecto DESHABILITADO.
  if (!isDebugEnabled()) {
    return new Response("Debug mode disabled", { status: 404 });
  }

  const url = new URL(req.url);
  const dbg: Record<string, unknown> = {
    db_url_set: !!DB_URL,
    sql_ready: !!sql,
    has_client_id: !!TWITCH_CLIENT_ID,
    has_client_secret: !!TWITCH_CLIENT_SECRET,
    client_id_preview: TWITCH_CLIENT_ID.slice(0, 8) + "...",
  };
  // NO incluir secrets, tokens, ni datos de DB
  void url;
  void req;
  return new Response(JSON.stringify(dbg, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ============= Router principal =============
Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  const ip = getClientIp(req);
  const url = new URL(req.url);

  // Construir headers de seguridad base
  const securityHeaders = buildSecurityHeaders();
  const corsHeaders = buildCorsHeaders(origin) ?? {}; // null si origin inválido
  const allHeaders = { ...securityHeaders, ...corsHeaders };

  // Issue #4: Validar Origin/Referer y UA
  const originCheck = validateOriginReferer(req);
  if (!originCheck.valid) {
    logSuspicious({
      reason: originCheck.reason ?? "origin_validation_failed",
      ip,
      endpoint: url.pathname,
      method: req.method,
      ua: req.headers.get("User-Agent") ?? undefined,
    });
    return new Response("Forbidden", { status: 403, headers: securityHeaders });
  }

  // OPTIONS preflight: responder con CORS si origin válido
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: allHeaders });
  }

  // Issue #5: Rate limiting separado por endpoint
  const isPolling = url.searchParams.has("fetch");
  const rateCheck = isPolling ? checkPollingRate(ip) : checkGeneralRate(ip);
  if (!rateCheck.allowed) {
    logSuspicious({
      reason: "rate_limit_exceeded",
      ip,
      endpoint: url.pathname,
      method: req.method,
      extra: { rate_type: isPolling ? "polling" : "general" },
    });
    return new Response("Rate limit exceeded", {
      status: 429,
      headers: {
        ...securityHeaders,
        "Retry-After": String(
          Math.ceil((rateCheck.resetAt - Date.now()) / 1000),
        ),
      },
    });
  }

  // Issue #1: Debug endpoint gateado
  if (url.searchParams.has("debug")) {
    return new Response(handleDebug(req).body, {
      status: handleDebug(req).status,
      headers: { ...allHeaders, "Content-Type": "application/json" },
    });
  }

  // Issue #3: Polling endpoint (fetch)
  if (isPolling) {
    const res = await handleFetch(req);
    // Combinar headers de la respuesta con los de seguridad
    const newHeaders = new Headers(res.headers);
    for (const [k, v] of Object.entries(allHeaders)) {
      newHeaders.set(k, v);
    }
    return new Response(res.body, { status: res.status, headers: newHeaders });
  }

  // Callback endpoint
  if (url.searchParams.has("code") && url.searchParams.has("state")) {
    const res = await handleCallback(req);
    const newHeaders = new Headers(res.headers);
    for (const [k, v] of Object.entries(allHeaders)) {
      newHeaders.set(k, v);
    }
    return new Response(res.body, { status: res.status, headers: newHeaders });
  }

  // Auth redirect endpoint
  if (url.searchParams.has("request_id")) {
    const res = handleAuthRedirect(req);
    const newHeaders = new Headers(res.headers);
    for (const [k, v] of Object.entries(allHeaders)) {
      newHeaders.set(k, v);
    }
    return new Response(res.body, { status: res.status, headers: newHeaders });
  }

  return new Response("Bad request", { status: 400, headers: allHeaders });
});

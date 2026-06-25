// supabase/functions/twitch-auth/_security.ts
// Helpers de seguridad centralizados para twitch-auth edge function
//
// Issues cubiertos (de ERR-WT-20260624-008):
//   #1  isDebugEnabled()  -> gate del endpoint ?debug=1
//   #4  validateOriginReferer(req, opts)  -> valida origen con excepcion para callback
//   #5  checkGeneralRate / checkPollingRate  -> rate limits separados
//   #6  isAllowedUserAgent  -> whitelist navegadores reales + Tauri
//   #7  isValidUuidV4  -> validacion RFC 4122 v4 estricta
//   #8  logSuspicious  -> logging centralizado, sin secretos
//   #9  constantTimeEqual  -> comparacion timing-safe
//   #10 buildCorsHeaders  -> CORS sin fallback "null"/"*"
//   #3  consumeSingleUseToken  -> invalidacion atomica de tokens
//
// IMPORTANTE: twitch-auth es un callback OAuth PUBLICO de Twitch.
// Twitch redirige al usuario desde su servidor (server-to-server redirect),
// por lo que NO envia Origin ni Referer. La validacion de origen debe
// tener una excepcion explicita para el path de callback (?code=&state=).

// ============= UUID v4 Validation (Issue #7) =============
// RFC 4122 v4: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx (version=4, variant=10xx)
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_REGEX.test(value);
}

// ============= Constant-Time Compare (Issue #9) =============
// Comparacion timing-safe. Util para evitar que un atacante distinga
// por latencia entre "no encontrado" y "encontrado pero no coincide".
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const ac = i < a.length ? a.charCodeAt(i) : 0;
    const bc = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ac ^ bc;
  }
  return diff === 0;
}

// ============= User-Agent Whitelist (Issue #6) =============
// Whitelist por categorias (evita regex de alternancia con backtracking).
// Bloquea: curl, wget, python-requests, httpclient, scrapy, bot, crawler, spider.
const BLOCKED_UA_REGEX =
  /(curl\/|wget\/|python-requests|httpclient|scrapy|\bbot\b|crawler|spider)/i;

export function isAllowedUserAgent(ua: string | null | undefined): boolean {
  if (!ua || typeof ua !== "string") return false;
  if (BLOCKED_UA_REGEX.test(ua)) return false;
  // Navegadores reales (todos usan Mozilla/5.0 + token de motor)
  if (
    /^Mozilla\/5\.0/i.test(ua) &&
    /(Chrome|Chromium|Safari|Firefox|Edg|OPR|Opera)/i.test(ua)
  ) return true;
  // Tauri WebView (desktop wrapper)
  if (/^Tauri\//i.test(ua)) return true;
  // Deno (para testing/debug)
  if (/^Deno\//i.test(ua)) return true;
  return false;
}

// ============= Log Suspicious Activity (Issue #8) =============
// Logging centralizado. NUNCA incluye:
//   - access_token, refresh_token, code, state (secrets de OAuth)
//   - client_secret (credencial de app)
//   - campos cuyo nombre matchee /token|secret|password|key|auth|code|state/i
//
// Solo metadatos: timestamp, IP, endpoint, motivo, clasificacion de UA.
export interface SuspiciousEvent {
  reason: string;
  ip?: string;
  endpoint?: string;
  method?: string;
  ua?: string;
  extra?: Record<string, unknown>;
}

const SECRET_KEY_REGEX = /token|secret|password|^key$|auth|^code$|state/i;

export function logSuspicious(event: SuspiciousEvent): void {
  const sanitized: Record<string, unknown> = {
    ts: new Date().toISOString(),
    reason: event.reason,
  };
  if (event.ip) sanitized.ip = event.ip;
  if (event.endpoint) sanitized.endpoint = event.endpoint;
  if (event.method) sanitized.method = event.method;
  if (event.ua) {
    const blocked = BLOCKED_UA_REGEX.exec(event.ua);
    if (blocked) {
      sanitized.ua_class = `blocked:${blocked[0].toLowerCase()}`;
    } else if (isAllowedUserAgent(event.ua)) {
      sanitized.ua_class = "allowed";
    } else {
      sanitized.ua_class = "unknown";
    }
  }
  if (event.extra) {
    for (const [k, v] of Object.entries(event.extra)) {
      if (SECRET_KEY_REGEX.test(k)) continue;
      sanitized[k] = v;
    }
  }
  console.warn(`[twitch-auth-security] ${JSON.stringify(sanitized)}`);
}

// ============= CORS (Issue #4, #10) =============
// Whitelist explicita. SIN fallback "*" ni "null".
// Si origin no esta en whitelist -> retorna null (no se envian headers CORS).
//
// Whitelist incluye:
//   - Dominios de Twitch (el callback llega desde alli via redirect)
//   - El propio Supabase project (frontend React hace polling desde ahi)
//   - Tauri localhost (app desktop en dev)
//   - localhost:1420 / 3000 (Vite/CRA dev servers)
const ALLOWED_ORIGINS = new Set<string>([
  // Twitch (callback redirect)
  "https://twitch.tv",
  "https://www.twitch.tv",
  "https://id.twitch.tv",
  // Frontend BlinkStream
  "https://oncbojnqxpxctwnhehau.supabase.co",
  "http://localhost:1420",
  "http://localhost:3000",
  // Tauri desktop
  "tauri://localhost",
  "https://tauri.localhost",
]);

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  return !!origin && ALLOWED_ORIGINS.has(origin);
}

export function buildCorsHeaders(
  origin: string | null | undefined,
): Record<string, string> | null {
  if (!isAllowedOrigin(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin!,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ============= Validate Origin/Referer (Issue #4) =============
// EXCEPCION CRITICA: el callback de Twitch (?code=&state=) NO lleva Origin
// ni Referer porque es un redirect server-to-server. Rechazarlo rompe OAuth.
// Por eso se exime cuando isTwitchCallback=true.
export interface OriginCheckResult {
  valid: boolean;
  reason?: string;
}

export function validateOriginReferer(
  req: Request,
  opts: { isTwitchCallback: boolean; isDebug: boolean },
): OriginCheckResult {
  // Callback de Twitch: eximir validacion de Origin/Referer
  if (opts.isTwitchCallback) {
    return { valid: true };
  }
  // Debug endpoint: el gate real esta en isDebugEnabled() upstream
  if (opts.isDebug) {
    return { valid: true };
  }
  // OPTIONS preflight de CORS: dejar pasar (los headers CORS ya se filtran
  // por whitelist en buildCorsHeaders)
  if (req.method === "OPTIONS") {
    return { valid: true };
  }

  const origin = req.headers.get("Origin");
  const referer = req.headers.get("Referer");
  const ua = req.headers.get("User-Agent");

  // Sin Origin NI Referer: cliente no-navegador directo (script, server).
  if (!origin && !referer) {
    return { valid: false, reason: "missing_origin_and_referer" };
  }
  // Si hay Origin, debe estar en whitelist
  if (origin && !isAllowedOrigin(origin)) {
    return { valid: false, reason: "origin_not_allowed" };
  }
  // Si solo hay Referer (caso de redirect), validar dominio
  if (!origin && referer) {
    try {
      const refUrl = new URL(referer);
      const refOrigin = `${refUrl.protocol}//${refUrl.host}`;
      if (!isAllowedOrigin(refOrigin)) {
        return { valid: false, reason: "referer_not_allowed" };
      }
    } catch {
      return { valid: false, reason: "referer_malformed" };
    }
  }
  // User-Agent bloqueado (curl, wget, bots)
  if (ua && !isAllowedUserAgent(ua)) {
    return { valid: false, reason: "user_agent_not_allowed" };
  }
  return { valid: true };
}

// ============= Rate Limiting (Issue #5) =============
// Dos buckets separados por IP:
//   - general: 10 req/min  (init, callback, debug -> anti brute force)
//   - polling: 60 req/min  (polling legitimo del frontend cada ~1.5s)
const RATE_LIMIT_GENERAL_MAX = 10;
const RATE_LIMIT_GENERAL_WINDOW_MS = 60_000;
const RATE_LIMIT_POLLING_MAX = 60;
const RATE_LIMIT_POLLING_WINDOW_MS = 60_000;

interface RateBucket {
  count: number;
  resetAt: number;
}

const generalBuckets = new Map<string, RateBucket>();
const pollingBuckets = new Map<string, RateBucket>();

function checkRate(
  buckets: Map<string, RateBucket>,
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  return {
    allowed: bucket.count <= max,
    remaining: Math.max(0, max - bucket.count),
    resetAt: bucket.resetAt,
  };
}

export function checkGeneralRate(
  ip: string,
): { allowed: boolean; remaining: number; resetAt: number } {
  return checkRate(
    generalBuckets,
    ip,
    RATE_LIMIT_GENERAL_MAX,
    RATE_LIMIT_GENERAL_WINDOW_MS,
  );
}

export function checkPollingRate(
  ip: string,
): { allowed: boolean; remaining: number; resetAt: number } {
  return checkRate(
    pollingBuckets,
    ip,
    RATE_LIMIT_POLLING_MAX,
    RATE_LIMIT_POLLING_WINDOW_MS,
  );
}

// ============= Client IP Extraction =============
// Considera proxies standard. Edge runtime de Supabase reenvia x-forwarded-for.
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

// ============= Single-Use Token (Issue #3) =============
// Invalida el token inmediatamente despues de la primera lectura exitosa.
// Usa UPDATE atomico con condicion consumed_at IS NULL para evitar
// race conditions entre polls concurrentes.
//
// NOTA: Si la columna consumed_at no existe (schema legacy), fallback
// a DELETE (que ya es single-use por naturaleza).
type SqlTemplate = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export async function consumeSingleUseToken(
  sql: SqlTemplate,
  requestId: string,
): Promise<boolean> {
  try {
    const result = await sql`
      UPDATE public.auth_tokens
      SET consumed_at = NOW()
      WHERE request_id = ${requestId} AND consumed_at IS NULL
      RETURNING request_id
    `;
    return Array.isArray(result) && result.length > 0;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (/column .*consumed_at/i.test(errMsg) || /does not exist/i.test(errMsg)) {
      const del = await sql`
        DELETE FROM public.auth_tokens
        WHERE request_id = ${requestId}
        RETURNING request_id
      `;
      return Array.isArray(del) && del.length > 0;
    }
    throw err;
  }
}

// ============= Debug Mode Gate (Issue #1) =============
// El endpoint ?debug=1 SOLO esta activo si ENABLE_DEBUG=true.
// Por defecto DESHABILITADO en produccion.
export function isDebugEnabled(): boolean {
  return Deno.env.get("ENABLE_DEBUG") === "true";
}
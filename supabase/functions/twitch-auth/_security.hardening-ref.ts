// supabase/functions/twitch-auth/_security.ts
// Helpers de seguridad centralizados para twitch-auth
//
// Issues cubiertos:
//   #6  Whitelist de User-Agents (navegadores reales + Tauri, bloquea curl/wget/bots)
//   #7  Validación de UUID v4 según RFC 4122
//   #8  logSuspicious() centralizado con sanitización de secretos
//   #9  constantTimeEqual() para comparación timing-safe
//   #4  validateOriginReferer() rechaza peticiones sin Origin/Referer
//   #10 buildCorsHeaders() sin fallback a "null" o "*"
//   #5  Rate limits separados: general (10/min) + polling (60/min)
//   #3  consumeSingleUseToken() con UPDATE atómico
//   #1  isDebugEnabled() gate para endpoint ?debug=1
//   #2  (verificar verify_jwt=false en supabase/config.toml)

import { getLogger } from "jsr:@std/log@^0.224.0";

// ============= UUID v4 Validation (Issue #7) =============
// Valida que un string sea un UUID v4 según RFC 4122.
// Formato: xxxxxxxx-xxxx-4xxx-[8-b]xxx-xxxxxxxxxxxx
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuidV4(value: unknown): boolean {
  return typeof value === "string" && UUID_V4_REGEX.test(value);
}

// ============= Constant-Time Compare (Issue #9) =============
// Comparación timing-safe para evitar ataques de timing.
// Útil para tokens, secrets, fingerprints, etc.
// Mantiene tiempo de ejecución constante incluso con longitudes distintas.
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (i < a.length ? a.charCodeAt(i) : 0) ^
      (i < b.length ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

// ============= User-Agent Whitelist (Issue #6) =============
// Whitelist de User-Agents permitidos: navegadores reales + Tauri + Deno.
// Bloquea scripts automatizados, curl, wget, python-requests, etc.
// Implementación por categorías para evitar backtracking en regex de alternancia.
const BLOCKED_UA_REGEX =
  /(curl\/|wget\/|python-requests|httpclient|scrapy|bot|crawler|spider)/i;

export function isAllowedUserAgent(ua: string | null | undefined): boolean {
  if (!ua || typeof ua !== "string") return false;
  if (BLOCKED_UA_REGEX.test(ua)) return false;
  if (/^Mozilla\/5\.0/i.test(ua) && /(Chrome|Safari|Firefox|Edge|Opera)/i.test(ua)) return true;
  if (/^Tauri\//i.test(ua)) return true;
  if (/^Deno\//i.test(ua)) return true;
  return false;
}

// ============= Log Suspicious Activity (Issue #8) =============
// Logging centralizado de actividad sospechosa.
// NUNCA incluye tokens, secrets, passwords o datos sensibles.
// Solo metadatos: timestamp, IP, endpoint, razón.
const logger = getLogger("twitch-auth-security");

export interface SuspiciousEvent {
  reason: string;
  ip?: string;
  endpoint?: string;
  method?: string;
  ua?: string;
  extra?: Record<string, unknown>;
}

export function logSuspicious(event: SuspiciousEvent): void {
  // Sanitizar: nunca loggear campos que puedan contener secretos
  const sanitized: Record<string, unknown> = {
    ts: new Date().toISOString(),
    reason: event.reason,
  };
  if (event.ip) sanitized.ip = event.ip;
  if (event.endpoint) sanitized.endpoint = event.endpoint;
  if (event.method) sanitized.method = event.method;
  // Para UA solo loggear clasificación (no el UA completo para evitar fingerprinting)
  if (event.ua) {
    const blocked = BLOCKED_UA_REGEX.exec(event.ua);
    sanitized.ua_class = blocked ? `blocked:${blocked[0]}` : "allowed";
  }
  if (event.extra) {
    for (const [k, v] of Object.entries(event.extra)) {
      // Nunca loggear campos sensibles
      if (/token|secret|password|key|auth/i.test(k)) continue;
      sanitized[k] = v;
    }
  }
  logger.warning(JSON.stringify(sanitized));
}

// ============= CORS Origin Validation (Issue #4, #10) =============
// Lista de orígenes permitidos para el callback de Twitch.
const ALLOWED_ORIGINS = new Set<string>([
  "https://twitch.tv",
  "https://www.twitch.tv",
  "https://id.twitch.tv",
  "tauri://localhost",
  "http://localhost:1420", // dev Tauri
]);

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  return !!origin && ALLOWED_ORIGINS.has(origin);
}

// Headers CORS seguros (Issue #10). Sin fallback a "null" o "*".
// Devuelve null si el origin no es válido -> no se incluyen headers CORS.
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
// Rechaza peticiones sin Origin o Referer (excepto callbacks legítimos de Twitch).
// Previene ataques CSRF y peticiones server-to-server no autorizadas.
export function validateOriginReferer(
  req: Request,
): { valid: boolean; reason?: string } {
  const origin = req.headers.get("Origin");
  const referer = req.headers.get("Referer");
  const ua = req.headers.get("User-Agent");

  // Si ambos están ausentes, es un cliente no-navegador
  if (!origin && !referer) {
    return { valid: false, reason: "missing_origin_and_referer" };
  }

  // Si hay Origin, debe estar en la whitelist
  if (origin && !isAllowedOrigin(origin)) {
    return { valid: false, reason: "origin_not_allowed" };
  }

  // Si solo hay Referer (caso de redirección), validar dominio
  if (!origin && referer) {
    try {
      const refUrl = new URL(referer);
      const refOrigin = `${refUrl.protocol}//${refUrl.host}`;
      if (!ALLOWED_ORIGINS.has(refOrigin)) {
        return { valid: false, reason: "referer_not_allowed" };
      }
    } catch {
      return { valid: false, reason: "referer_malformed" };
    }
  }

  // Validar UA si está presente
  if (ua && !isAllowedUserAgent(ua)) {
    return { valid: false, reason: "user_agent_not_allowed" };
  }

  return { valid: true };
}

// ============= Rate Limiting (Issue #5) =============
// Rate limits separados:
//   - General: 10 requests / minuto (estricto, anti-fuerza-bruta)
//   - Polling: 60 requests / minuto (más permisivo para UX de polling)
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

// Helper para extraer IP del request (considera proxies)
export function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
}

// ============= Single-Use Token Invalidation (Issue #3) =============
// Marca un token como usado inmediatamente después de la primera lectura exitosa.
// Devuelve true si el token fue consumido, false si ya estaba usado.
// Usa UPDATE atómico para evitar race conditions entre polls concurrentes.
type SqlTemplate = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<unknown[]>;

export async function consumeSingleUseToken(
  sql: SqlTemplate,
  requestId: string,
): Promise<boolean> {
  // UPDATE atómico: solo invalida si el token aún no fue consumido.
  // El campo consumed_at se setea en la primera lectura.
  const result = await sql`
    UPDATE public.auth_tokens
    SET consumed_at = NOW()
    WHERE request_id = ${requestId} AND consumed_at IS NULL
    RETURNING request_id
  `;
  return Array.isArray(result) && result.length > 0;
}

// ============= Debug Mode Gate (Issue #1) =============
// El endpoint ?debug=1 SOLO está activo si ENABLE_DEBUG=true.
// Por defecto DESHABILITADO en producción.
export function isDebugEnabled(): boolean {
  return Deno.env.get("ENABLE_DEBUG") === "true";
}

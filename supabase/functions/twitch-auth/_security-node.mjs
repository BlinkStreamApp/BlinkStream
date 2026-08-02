// _security-node.mjs - Versión Node-compatible para tests de verificación
// Mantiene paridad funcional con _security.ts

// ============= UUID v4 (Issue #7) =============
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuidV4(value) {
  return typeof value === "string" && UUID_V4_REGEX.test(value);
}

// ============= Constant-Time Compare (Issue #9) =============
export function constantTimeEqual(a, b) {
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
const BLOCKED_UA_REGEX =
  /(curl\/|wget\/|python-requests|httpclient|scrapy|bot|crawler|spider)/i;

export function isAllowedUserAgent(ua) {
  if (!ua || typeof ua !== "string") return false;
  if (BLOCKED_UA_REGEX.test(ua)) return false;
  // Whitelist por categorías (evita problemas de backtracking con alternancia)
  if (/^Mozilla\/5\.0/i.test(ua) && /(Chrome|Safari|Firefox|Edge|Opera)/i.test(ua)) return true;
  if (/^Tauri\//i.test(ua)) return true;
  if (/^Deno\//i.test(ua)) return true;
  return false;
}

// ============= CORS (Issue #4, #10) =============
const ALLOWED_ORIGINS = new Set([
  "https://twitch.tv",
  "https://www.twitch.tv",
  "https://id.twitch.tv",
  "tauri://localhost",
  "http://localhost:1420",
]);

export function isAllowedOrigin(origin) {
  return !!origin && ALLOWED_ORIGINS.has(origin);
}

export function buildCorsHeaders(origin) {
  if (!isAllowedOrigin(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ============= validateOriginReferer (Issue #4) =============
export function validateOriginReferer(req) {
  const origin = req.headers.get("Origin");
  const referer = req.headers.get("Referer");
  const ua = req.headers.get("User-Agent");

  if (!origin && !referer) {
    return { valid: false, reason: "missing_origin_and_referer" };
  }
  if (origin && !isAllowedOrigin(origin)) {
    return { valid: false, reason: "origin_not_allowed" };
  }
  if (!origin && referer) {
    try {
      const refUrl = new URL(referer);
      if (!ALLOWED_ORIGINS.has(`${refUrl.protocol}//${refUrl.host}`)) {
        return { valid: false, reason: "referer_not_allowed" };
      }
    } catch {
      return { valid: false, reason: "referer_malformed" };
    }
  }
  if (ua && !isAllowedUserAgent(ua)) {
    return { valid: false, reason: "user_agent_not_allowed" };
  }
  return { valid: true };
}

// ============= Rate Limiting (Issue #5) =============
const RATE_LIMIT_GENERAL_MAX = 10;
const RATE_LIMIT_GENERAL_WINDOW_MS = 60_000;
const RATE_LIMIT_POLLING_MAX = 60;
const RATE_LIMIT_POLLING_WINDOW_MS = 60_000;

const generalBuckets = new Map();
const pollingBuckets = new Map();

function checkRate(buckets, key, max, windowMs) {
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

export function checkGeneralRate(ip) {
  return checkRate(generalBuckets, ip, RATE_LIMIT_GENERAL_MAX, RATE_LIMIT_GENERAL_WINDOW_MS);
}

export function checkPollingRate(ip) {
  return checkRate(pollingBuckets, ip, RATE_LIMIT_POLLING_MAX, RATE_LIMIT_POLLING_WINDOW_MS);
}

export function isDebugEnabled() {
  return process?.env?.ENABLE_DEBUG === "true" || Deno?.env?.get?.("ENABLE_DEBUG") === "true";
}

export function logSuspicious(event) {
  const sanitized = { ts: new Date().toISOString(), reason: event.reason };
  if (event.ip) sanitized.ip = event.ip;
  if (event.endpoint) sanitized.endpoint = event.endpoint;
  if (event.method) sanitized.method = event.method;
  if (event.ua) {
    const blocked = BLOCKED_UA_REGEX.exec(event.ua);
    sanitized.ua_class = blocked ? `blocked:${blocked[0]}` : "allowed";
  }
  if (event.extra) {
    for (const [k, v] of Object.entries(event.extra)) {
      if (/token|secret|password|key|auth/i.test(k)) continue;
      sanitized[k] = v;
    }
  }
  console.warn(JSON.stringify(sanitized));
}

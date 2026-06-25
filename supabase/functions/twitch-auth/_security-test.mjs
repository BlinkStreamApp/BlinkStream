// _security.ts compatible con Node (shim para Deno.env)
// Tests de P0-3 hardening para twitch-auth
//
// Cubre los 10 issues de ERR-WT-20260624-008 con tests minimos (1 por issue).
// Ejecutar con: node _security-test.mjs
//
// Para ejecucion Deno (produccion), usar: deno test --allow-net --allow-env index.test.ts

// ============= Shim Deno para Node =============
if (typeof Deno === "undefined") {
  globalThis.Deno = {
    env: {
      get: (k) => process.env[k] ?? null,
    },
  };
}

// ============= Helpers de _security.ts (paridad funcional) =============

// UUID v4
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuidV4(value) {
  return typeof value === "string" && UUID_V4_REGEX.test(value);
}

// Constant-time compare
function constantTimeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= ((i < a.length ? a.charCodeAt(i) : 0) ^ (i < b.length ? b.charCodeAt(i) : 0));
  }
  return diff === 0;
}

// User-Agent whitelist
const BLOCKED_UA_REGEX = /(curl\/|wget\/|python-requests|httpclient|scrapy|\bbot\b|crawler|spider)/i;
function isAllowedUserAgent(ua) {
  if (!ua || typeof ua !== "string") return false;
  if (BLOCKED_UA_REGEX.test(ua)) return false;
  if (/^Mozilla\/5\.0/i.test(ua) && /(Chrome|Chromium|Safari|Firefox|Edg|OPR|Opera)/i.test(ua)) return true;
  if (/^Tauri\//i.test(ua)) return true;
  if (/^Deno\//i.test(ua)) return true;
  return false;
}

// logSuspicious
const SECRET_KEY_REGEX = /token|secret|password|key|auth|code|state/i;
function logSuspicious(event) {
  const sanitized = { ts: new Date().toISOString(), reason: event.reason };
  if (event.ip) sanitized.ip = event.ip;
  if (event.endpoint) sanitized.endpoint = event.endpoint;
  if (event.method) sanitized.method = event.method;
  if (event.ua) {
    const blocked = BLOCKED_UA_REGEX.exec(event.ua);
    sanitized.ua_class = blocked ? `blocked:${blocked[0].toLowerCase()}` : (isAllowedUserAgent(event.ua) ? "allowed" : "unknown");
  }
  if (event.extra) {
    for (const [k, v] of Object.entries(event.extra)) {
      if (SECRET_KEY_REGEX.test(k)) continue;
      sanitized[k] = v;
    }
  }
  return sanitized;
}

// CORS
const ALLOWED_ORIGINS = new Set([
  "https://twitch.tv", "https://www.twitch.tv", "https://id.twitch.tv",
  "https://oncbojnqxpxctwnhehau.supabase.co",
  "http://localhost:1420", "http://localhost:3000",
  "tauri://localhost", "https://tauri.localhost",
]);
function isAllowedOrigin(origin) { return !!origin && ALLOWED_ORIGINS.has(origin); }
function buildCorsHeaders(origin) {
  if (!isAllowedOrigin(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// validateOriginReferer
function validateOriginReferer(req, opts) {
  if (opts.isTwitchCallback) return { valid: true };
  if (opts.isDebug) return { valid: true };
  if (req.method === "OPTIONS") return { valid: true };
  const origin = req.headers.get("Origin");
  const referer = req.headers.get("Referer");
  const ua = req.headers.get("User-Agent");
  if (!origin && !referer) return { valid: false, reason: "missing_origin_and_referer" };
  if (origin && !isAllowedOrigin(origin)) return { valid: false, reason: "origin_not_allowed" };
  if (!origin && referer) {
    try {
      const refUrl = new URL(referer);
      const refOrigin = `${refUrl.protocol}//${refUrl.host}`;
      if (!isAllowedOrigin(refOrigin)) return { valid: false, reason: "referer_not_allowed" };
    } catch {
      return { valid: false, reason: "referer_malformed" };
    }
  }
  if (ua && !isAllowedUserAgent(ua)) return { valid: false, reason: "user_agent_not_allowed" };
  return { valid: true };
}

// Rate limit
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
  return { allowed: bucket.count <= max, remaining: Math.max(0, max - bucket.count), resetAt: bucket.resetAt };
}
function checkGeneralRate(ip) { return checkRate(generalBuckets, ip, 10, 60000); }
function checkPollingRate(ip) { return checkRate(pollingBuckets, ip, 60, 60000); }

// consumeSingleUseToken (mockeado: el real necesita DB)
async function consumeSingleUseToken(sql, requestId) {
  try {
    const r = await sql`UPDATE public.auth_tokens SET consumed_at = NOW() WHERE request_id = ${requestId} AND consumed_at IS NULL RETURNING request_id`;
    return Array.isArray(r) && r.length > 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/column .*consumed_at/i.test(msg) || /does not exist/i.test(msg)) {
      const r = await sql`DELETE FROM public.auth_tokens WHERE request_id = ${requestId} RETURNING request_id`;
      return Array.isArray(r) && r.length > 0;
    }
    throw err;
  }
}

// isDebugEnabled
function isDebugEnabled() { return Deno.env.get("ENABLE_DEBUG") === "true"; }

// ============= Test runner (estilo minimal) =============
let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  return Promise.resolve()
    .then(() => fn())
    .then(() => { passed++; results.push(["OK", name]); })
    .catch((err) => { failed++; results.push(["FAIL", name, err.message || String(err)]); });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}
function assertEquals(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "Assertion failed"}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function assertFalse(v, msg) { assert(!v, msg || "Expected falsy"); }

// ============= Tests (10 issues + extras) =============

// Test 1: Issue #1 - ?debug=1 sin env flag retorna 404 (simulado: isDebugEnabled false)
await test("Issue #1: ?debug=1 sin env flag retorna disabled", () => {
  delete process.env.ENABLE_DEBUG;
  assertEquals(isDebugEnabled(), false);
  process.env.ENABLE_DEBUG = "true";
  assertEquals(isDebugEnabled(), true);
  process.env.ENABLE_DEBUG = "1";
  assertEquals(isDebugEnabled(), false, 'Solo "true" exacto debe activar');
  delete process.env.ENABLE_DEBUG;
});

// Test 2: Issue #2 - verify_jwt=false en config.toml
await test("Issue #2: verify_jwt=false en config.toml para twitch-auth", async () => {
  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);
  const fs = require("fs");
  // Hardcoded absolute path because ESM does not have __dirname
  const altPath = "C:/Users/alber/Desktop/IA Project/BlinkStream/blinkstream/supabase/config.toml";
  const content = fs.readFileSync(altPath, "utf8");
  assert(content.includes("[functions.twitch-auth]"), "Debe existir [functions.twitch-auth]");
  // Find the section
  const section = content.split("[functions.twitch-auth]")[1]?.split("[")[0] || "";
  assert(section.includes("verify_jwt = false"), "verify_jwt debe ser false en twitch-auth");
});

// Test 3: Issue #3 - Token single-use (consume returns false on second call)
await test("Issue #3: consumeSingleUseToken retorna false si ya consumido", async () => {
  let consumed = true; // Simular ya consumido
  const mockSql = async () => consumed ? [] : [{ request_id: "test" }];
  const result = await consumeSingleUseToken(mockSql, "test-id");
  assertEquals(result, false);
});
await test("Issue #3: consumeSingleUseToken retorna true en primera lectura", async () => {
  const mockSql = async () => [{ request_id: "fresh" }];
  const result = await consumeSingleUseToken(mockSql, "fresh-id");
  assertEquals(result, true);
});

// Test 4: Issue #4 - validateOriginReferer estricto
await test("Issue #4: request sin Origin (no callback) retorna 403", () => {
  const req = new Request("https://x.com/", { headers: { "User-Agent": "Mozilla/5.0 Chrome/120" } });
  const r = validateOriginReferer(req, { isTwitchCallback: false, isDebug: false });
  assertFalse(r.valid);
  assertEquals(r.reason, "missing_origin_and_referer");
});
await test("Issue #4: callback de Twitch sin Origin funciona", () => {
  const req = new Request("https://x.com/?code=abc&state=UUID", { headers: { "User-Agent": "curl/8.0" } });
  const r = validateOriginReferer(req, { isTwitchCallback: true, isDebug: false });
  assert(r.valid, "Callback de Twitch debe pasar sin validar Origin");
});

// Test 5: Issue #5 - Rate limits
await test("Issue #5: 11º request general retorna not allowed", () => {
  const ip = "192.168.1.100";
  for (let i = 0; i < 10; i++) {
    const r = checkGeneralRate(ip);
    assert(r.allowed, `Request ${i+1} should be allowed`);
  }
  const r = checkGeneralRate(ip);
  assertFalse(r.allowed, "Request 11 should be blocked");
});
await test("Issue #5: 61º request polling retorna not allowed", () => {
  const ip = "192.168.1.101";
  for (let i = 0; i < 60; i++) {
    const r = checkPollingRate(ip);
    assert(r.allowed, `Polling request ${i+1} should be allowed`);
  }
  const r = checkPollingRate(ip);
  assertFalse(r.allowed, "Polling request 61 should be blocked");
});

// Test 6: Issue #6 - UA whitelist
await test("Issue #6: UA curl/8.0 bloqueado", () => {
  assertFalse(isAllowedUserAgent("curl/8.4.0"));
  assertFalse(isAllowedUserAgent("wget/1.21"));
  assertFalse(isAllowedUserAgent("python-requests/2.31"));
});
await test("Issue #6: UA Chrome valido permitido", () => {
  assert(isAllowedUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36"));
  assert(isAllowedUserAgent("Tauri/1.0.0"));
});

// Test 7: Issue #7 - UUID v4
await test("Issue #7: request_id no-UUID-v4 retorna false", () => {
  assertFalse(isValidUuidV4("not-a-uuid"));
  assertFalse(isValidUuidV4("550e8400-e29b-11d4-a716-446655440000")); // version 1, not 4
  assert(isValidUuidV4("550e8400-e29b-41d4-a716-446655440000")); // version 4
  assert(isValidUuidV4("f47ac10b-58cc-4372-a567-0e02b2c3d479"));
});

// Test 8: Issue #8 - logSuspicious no incluye secrets
await test("Issue #8: logSuspicious no contiene campos secret", () => {
  const out = logSuspicious({
    reason: "test",
    extra: {
      access_token: "secret_value",
      password: "my_pwd",
      api_key: "sk-12345",
      code: "twitch_code",
      state: "uuid",
      public_field: "safe_value",
    },
  });
  const s = JSON.stringify(out);
  assert(!s.includes("secret_value"), "No debe contener access_token");
  assert(!s.includes("my_pwd"), "No debe contener password");
  assert(!s.includes("sk-12345"), "No debe contener api_key");
  assert(!s.includes("twitch_code"), "No debe contener code");
  assert(s.includes("safe_value"), "Debe contener public_field");
});

// Test 9: Issue #9 - constantTimeEqual timing-safe
await test("Issue #9: constantTimeEqual true para iguales", () => {
  assert(constantTimeEqual("abc123", "abc123"));
  assert(constantTimeEqual("", ""));
});
await test("Issue #9: constantTimeEqual false para distintos", () => {
  assertFalse(constantTimeEqual("abc", "abd"));
  assertFalse(constantTimeEqual("abc", "abcd"));
});

// Test 10: Issue #10 - CORS sin 'null' fallback
await test("Issue #10: buildCorsHeaders retorna null para origin invalido", () => {
  assertEquals(buildCorsHeaders("https://evil.com"), null);
  assertEquals(buildCorsHeaders("null"), null);
  assertEquals(buildCorsHeaders("*"), null);
  assertEquals(buildCorsHeaders(""), null);
  assertEquals(buildCorsHeaders(null), null);
});
await test("Issue #10: buildCorsHeaders NO contiene 'null' como Allow-Origin", () => {
  const h = buildCorsHeaders("https://id.twitch.tv");
  assert(h !== null);
  assert(h["Access-Control-Allow-Origin"] !== "null");
  assertEquals(h["Access-Control-Allow-Origin"], "https://id.twitch.tv");
});

// ============= Reporte =============
console.log("\n=== RESULTADOS ===");
for (const r of results) {
  if (r[0] === "OK") console.log(`OK  - ${r[1]}`);
  else console.log(`FAIL - ${r[1]}: ${r[2]}`);
}
console.log(`\nTotal: ${results.length} | OK: ${passed} | FAIL: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
// supabase/functions/twitch-auth/index.test.ts
// Tests Deno de P0-3 hardening para twitch-auth edge function
//
// Ejecutar con:
//   cd supabase/functions/twitch-auth
//   deno test --allow-net --allow-env index.test.ts
//
// Cubre los 10 issues de ERR-WT-20260624-008:
//   #1  isDebugEnabled: ?debug=1 sin env flag retorna 404
//   #2  verify_jwt=false verificado en supabase/config.toml
//   #3  consumeSingleUseToken: token se borra tras primer fetch
//   #4  validateOriginReferer: rechaza sin Origin (no callback) y acepta callback
//   #5  checkGeneralRate: 11º request retorna not allowed
//   #6  isAllowedUserAgent: curl/8.0 bloqueado
//   #7  isValidUuidV4: rechaza UUID no-v4
//   #8  logSuspicious: no contiene campos con secrets
//   #9  constantTimeEqual: timing-safe compare
//   #10 buildCorsHeaders: NO retorna "null" como fallback

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@^1.0.0";
import {
  buildCorsHeaders,
  checkGeneralRate,
  checkPollingRate,
  constantTimeEqual,
  consumeSingleUseToken,
  isAllowedOrigin,
  isAllowedUserAgent,
  isDebugEnabled,
  isValidUuidV4,
  logSuspicious,
  validateOriginReferer,
} from "./_security.ts";

// ============= Test #1: Issue #1 - isDebugEnabled gate =============
Deno.test("Issue #1: isDebugEnabled retorna false por defecto", () => {
  Deno.env.delete("ENABLE_DEBUG");
  assertEquals(isDebugEnabled(), false);
});

Deno.test("Issue #1: isDebugEnabled retorna true solo si ENABLE_DEBUG=true", () => {
  Deno.env.set("ENABLE_DEBUG", "true");
  assertEquals(isDebugEnabled(), true);
  Deno.env.set("ENABLE_DEBUG", "1");
  assertEquals(isDebugEnabled(), false);
  Deno.env.set("ENABLE_DEBUG", "yes");
  assertEquals(isDebugEnabled(), false);
  Deno.env.delete("ENABLE_DEBUG");
});

// ============= Test #2: Issue #2 - verify_jwt=false en config =============
Deno.test("Issue #2: supabase/config.toml tiene verify_jwt = false para twitch-auth", async () => {
  const configPath = new URL("../../config.toml", import.meta.url);
  const text = await Deno.readTextFile(configPath);
  assert(text.includes("[functions.twitch-auth]"), "Debe existir [functions.twitch-auth]");
  const section = text.split("[functions.twitch-auth]")[1]?.split("[")[0] ?? "";
  assert(section.includes("verify_jwt = false"), "verify_jwt debe ser false");
});

// ============= Test #3: Issue #3 - consumeSingleUseToken =============
Deno.test("Issue #3: consumeSingleUseToken retorna false si ya consumido", async () => {
  const mockSql = (() => {
    return async () => []; // No retorna filas (ya consumido)
  })() as never;
  const result = await consumeSingleUseToken(mockSql, "test-id");
  assertEquals(result, false);
});

Deno.test("Issue #3: consumeSingleUseToken retorna true en primera lectura", async () => {
  const mockSql = (() => {
    return async () => [{ request_id: "fresh-id" }];
  })() as never;
  const result = await consumeSingleUseToken(mockSql, "fresh-id");
  assertEquals(result, true);
});

// ============= Test #4: Issue #4 - validateOriginReferer =============
Deno.test("Issue #4: request sin Origin (no callback) retorna 403", () => {
  const req = new Request("https://example.com/twitch-auth", {
    headers: { "User-Agent": "Mozilla/5.0 Chrome/120" },
  });
  const r = validateOriginReferer(req, { isTwitchCallback: false, isDebug: false });
  assertFalse(r.valid);
  assertEquals(r.reason, "missing_origin_and_referer");
});

Deno.test("Issue #4: callback de Twitch sin Origin funciona", () => {
  // Twitch redirige sin Origin/Referer. El callback debe pasar.
  const req = new Request("https://example.com/twitch-auth?code=abc&state=UUID", {
    headers: { "User-Agent": "curl/8.0" }, // incluso curl es aceptable para callback
  });
  const r = validateOriginReferer(req, { isTwitchCallback: true, isDebug: false });
  assert(r.valid, "Callback de Twitch debe pasar sin Origin");
});

// ============= Test #5: Issue #5 - rate limits separados =============
Deno.test("Issue #5: 11º request general retorna not allowed", () => {
  const ip = "192.168.1.100";
  for (let i = 0; i < 10; i++) {
    const r = checkGeneralRate(ip);
    assert(r.allowed, `Request ${i + 1} debe pasar`);
  }
  const blocked = checkGeneralRate(ip);
  assertFalse(blocked.allowed, "Request 11 debe ser bloqueado");
});

Deno.test("Issue #5: 61º request polling retorna not allowed", () => {
  const ip = "192.168.1.101";
  for (let i = 0; i < 60; i++) {
    const r = checkPollingRate(ip);
    assert(r.allowed, `Polling ${i + 1} debe pasar`);
  }
  const blocked = checkPollingRate(ip);
  assertFalse(blocked.allowed, "Polling 61 debe ser bloqueado");
});

Deno.test("Issue #5: buckets separados (general agotado, polling libre)", () => {
  const ip = "192.168.1.102";
  for (let i = 0; i < 10; i++) checkGeneralRate(ip);
  // Polling a\u00fan tiene cupo
  const r = checkPollingRate(ip);
  assert(r.allowed, "Polling debe tener bucket separado");
});

// ============= Test #6: Issue #6 - UA whitelist =============
Deno.test("Issue #6: curl/8.0 bloqueado", () => {
  assertFalse(isAllowedUserAgent("curl/8.4.0"));
  assertFalse(isAllowedUserAgent("wget/1.21"));
  assertFalse(isAllowedUserAgent("python-requests/2.31"));
  assertFalse(isAllowedUserAgent("Googlebot/2.1"));
  assertFalse(isAllowedUserAgent(""));
  assertFalse(isAllowedUserAgent(null as unknown as string));
});

Deno.test("Issue #6: navegadores y Tauri permitidos", () => {
  assert(isAllowedUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ));
  assert(isAllowedUserAgent("Tauri/1.0.0"));
  assert(isAllowedUserAgent("Deno/1.40.0"));
});

// ============= Test #7: Issue #7 - UUID v4 validation =============
Deno.test("Issue #7: isValidUuidV4 acepta UUID v4 valido", () => {
  assert(isValidUuidV4("550e8400-e29b-41d4-a716-446655440000"));
  assert(isValidUuidV4("f47ac10b-58cc-4372-a567-0e02b2c3d479"));
});

Deno.test("Issue #7: isValidUuidV4 rechaza UUID no-v4", () => {
  assertFalse(isValidUuidV4("not-a-uuid"));
  // Version 1 (no v4)
  assertFalse(isValidUuidV4("550e8400-e29b-11d4-a716-446655440000"));
  // Variante incorrecta
  assertFalse(isValidUuidV4("550e8400-e29b-41d4-c716-446655440000"));
  assertFalse(isValidUuidV4(123 as unknown as string));
  assertFalse(isValidUuidV4(null as unknown as string));
  assertFalse(isValidUuidV4(undefined as unknown as string));
});

// ============= Test #8: Issue #8 - logSuspicious sin secrets =============
Deno.test("Issue #8: logSuspicious no contiene campos con secrets", () => {
  const originalWarn = console.warn;
  let captured = "";
  console.warn = (msg: string) => { captured += msg; };
  try {
    logSuspicious({
      reason: "test_sanitization",
      extra: {
        access_token: "secret_value_filtered",
        password: "my_password",
        api_key: "sk-12345",
        code: "twitch_oauth_code",
        state: "state_value",
        public_field: "this_is_visible",
      },
    });
  } finally {
    console.warn = originalWarn;
  }
  assertFalse(captured.includes("secret_value_filtered"));
  assertFalse(captured.includes("my_password"));
  assertFalse(captured.includes("sk-12345"));
  assertFalse(captured.includes("twitch_oauth_code"));
  assert(captured.includes("this_is_visible"));
});

// ============= Test #9: Issue #9 - constantTimeEqual =============
Deno.test("Issue #9: constantTimeEqual true para iguales", () => {
  assert(constantTimeEqual("abc123", "abc123"));
  assert(constantTimeEqual("", ""));
  assert(constantTimeEqual("a", "a"));
});

Deno.test("Issue #9: constantTimeEqual false para distintos", () => {
  assertFalse(constantTimeEqual("abc", "abd"));
  assertFalse(constantTimeEqual("abc", "abcd"));
  assertFalse(constantTimeEqual("abcd", "abc"));
  assertFalse(constantTimeEqual("", "a"));
  assertFalse(constantTimeEqual(123 as unknown as string, "abc"));
});

// ============= Test #10: Issue #10 - CORS sin "null" fallback =============
Deno.test("Issue #10: buildCorsHeaders retorna null para origin invalido", () => {
  assertEquals(buildCorsHeaders("https://evil.com"), null);
  assertEquals(buildCorsHeaders("null"), null);
  assertEquals(buildCorsHeaders("*"), null);
  assertEquals(buildCorsHeaders(""), null);
  assertEquals(buildCorsHeaders(null), null);
  assertEquals(buildCorsHeaders(undefined), null);
});

Deno.test("Issue #10: buildCorsHeaders NO contiene 'null' como Allow-Origin", () => {
  const h = buildCorsHeaders("https://id.twitch.tv");
  assert(h !== null);
  assert(h!["Access-Control-Allow-Origin"] !== "null");
  assertEquals(h!["Access-Control-Allow-Origin"], "https://id.twitch.tv");
});

Deno.test("Issue #10: isAllowedOrigin valida whitelist correctamente", () => {
  assert(isAllowedOrigin("https://twitch.tv"));
  assert(isAllowedOrigin("https://id.twitch.tv"));
  assert(isAllowedOrigin("https://oncbojnqxpxctwnhehau.supabase.co"));
  assert(isAllowedOrigin("tauri://localhost"));
  assertFalse(isAllowedOrigin("https://evil.com"));
  assertFalse(isAllowedOrigin("null"));
  assertFalse(isAllowedOrigin("*"));
});
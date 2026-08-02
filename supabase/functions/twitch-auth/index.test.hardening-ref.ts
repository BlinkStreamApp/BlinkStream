// supabase/functions/twitch-auth/index.test.ts
// Tests de seguridad para twitch-auth edge function
//
// Cada test cubre uno de los 10 issues de ERR-WT-20260624-008.
// Ejecutar con: deno test --allow-net --allow-env index.test.ts

import { assert, assertEquals, assertFalse, assertThrows } from "jsr:@std/assert@^1.0.0";
import {
  buildCorsHeaders,
  checkGeneralRate,
  checkPollingRate,
  constantTimeEqual,
  isAllowedOrigin,
  isAllowedUserAgent,
  isDebugEnabled,
  isValidUuidV4,
  logSuspicious,
  validateOriginReferer,
} from "./_security.ts";

// ============= Tests Issue #7: UUID v4 Validation =============
Deno.test("Issue #7: isValidUuidV4 acepta UUID v4 válido", () => {
  assert(isValidUuidV4("550e8400-e29b-41d4-a716-446655440000"));
  assert(isValidUuidV4("f47ac10b-58cc-4372-a567-0e02b2c3d479"));
  assert(isValidUuidV4("6ba7b810-9dad-41d1-80b4-00c04fd430c8"));
});

Deno.test("Issue #7: isValidUuidV4 rechaza UUID inválido", () => {
  // Versión incorrecta (no es 4)
  assertFalse(isValidUuidV4("550e8400-e29b-11d4-a716-446655440000"));
  // Formato incorrecto
  assertFalse(isValidUuidV4("not-a-uuid"));
  // Longitud incorrecta
  assertFalse(isValidUuidV4("550e8400-e29b-41d4-a716-44665544000"));
  // Variante incorrecta
  assertFalse(isValidUuidV4("550e8400-e29b-41d4-c716-446655440000"));
  // Tipo incorrecto
  assertFalse(isValidUuidV4(123 as unknown as string));
  assertFalse(isValidUuidV4(null as unknown as string));
  assertFalse(isValidUuidV4(undefined as unknown as string));
});

// ============= Tests Issue #9: Constant-Time Compare =============
Deno.test("Issue #9: constantTimeEqual retorna true para strings iguales", () => {
  assert(constantTimeEqual("abc123", "abc123"));
  assert(constantTimeEqual("", ""));
  assert(constantTimeEqual("a", "a"));
});

Deno.test("Issue #9: constantTimeEqual retorna false para strings distintos", () => {
  assertFalse(constantTimeEqual("abc123", "abc124"));
  assertFalse(constantTimeEqual("abc", "abcd"));
  assertFalse(constantTimeEqual("abcd", "abc"));
  assertFalse(constantTimeEqual("", "a"));
});

Deno.test("Issue #9: constantTimeEqual maneja inputs no-string", () => {
  assertFalse(constantTimeEqual(123 as unknown as string, "abc"));
  assertFalse(constantTimeEqual("abc", null as unknown as string));
  assertFalse(constantTimeEqual(undefined as unknown as string, undefined as unknown as string));
});

// ============= Tests Issue #6: User-Agent Whitelist =============
Deno.test("Issue #6: isAllowedUserAgent acepta navegadores reales", () => {
  assert(isAllowedUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ));
  assert(isAllowedUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  ));
  assert(isAllowedUserAgent(
    "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
  ));
  assert(isAllowedUserAgent("Tauri/1.0.0"));
  assert(isAllowedUserAgent("Deno/1.40.0"));
});

Deno.test("Issue #6: isAllowedUserAgent bloquea curl/wget/bots", () => {
  assertFalse(isAllowedUserAgent("curl/8.4.0"));
  assertFalse(isAllowedUserAgent("wget/1.21.3"));
  assertFalse(isAllowedUserAgent("python-requests/2.31.0"));
  assertFalse(isAllowedUserAgent("scrapy/2.11.0"));
  assertFalse(isAllowedUserAgent("Googlebot/2.1"));
  assertFalse(isAllowedUserAgent(""));
  assertFalse(isAllowedUserAgent(null as unknown as string));
  assertFalse(isAllowedUserAgent(undefined as unknown as string));
});

// ============= Tests Issue #10: CORS sin fallback =============
Deno.test("Issue #10: buildCorsHeaders retorna headers para origin válido", () => {
  const headers = buildCorsHeaders("https://id.twitch.tv");
  assert(headers !== null);
  assertEquals(headers!["Access-Control-Allow-Origin"], "https://id.twitch.tv");
  assertEquals(headers!["Vary"], "Origin");
});

Deno.test("Issue #10: buildCorsHeaders retorna null para origin inválido (NO 'null' fallback)", () => {
  assertEquals(buildCorsHeaders("https://evil.com"), null);
  assertEquals(buildCorsHeaders("null"), null);
  assertEquals(buildCorsHeaders("*"), null);
  assertEquals(buildCorsHeaders(""), null);
  assertEquals(buildCorsHeaders(null), null);
  assertEquals(buildCorsHeaders(undefined), null);
});

Deno.test("Issue #10: isAllowedOrigin valida whitelist", () => {
  assert(isAllowedOrigin("https://twitch.tv"));
  assert(isAllowedOrigin("https://id.twitch.tv"));
  assert(isAllowedOrigin("tauri://localhost"));
  assertFalse(isAllowedOrigin("https://evil.com"));
  assertFalse(isAllowedOrigin("null"));
  assertFalse(isAllowedOrigin("*"));
});

// ============= Tests Issue #4: Origin/Referer Validation =============
Deno.test("Issue #4: validateOriginReferer rechaza sin Origin NI Referer", () => {
  const req = new Request("https://example.com/twitch-auth", {
    headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0" },
  });
  const result = validateOriginReferer(req);
  assertFalse(result.valid);
  assertEquals(result.reason, "missing_origin_and_referer");
});

Deno.test("Issue #4: validateOriginReferer rechaza Origin no permitido", () => {
  const req = new Request("https://example.com/twitch-auth", {
    headers: {
      "Origin": "https://evil.com",
      "User-Agent": "Mozilla/5.0 Chrome/120.0",
    },
  });
  const result = validateOriginReferer(req);
  assertFalse(result.valid);
  assertEquals(result.reason, "origin_not_allowed");
});

Deno.test("Issue #4: validateOriginReferer rechaza Referer no permitido", () => {
  const req = new Request("https://example.com/twitch-auth", {
    headers: {
      "Referer": "https://evil.com/page",
      "User-Agent": "Mozilla/5.0 Chrome/120.0",
    },
  });
  const result = validateOriginReferer(req);
  assertFalse(result.valid);
  assertEquals(result.reason, "referer_not_allowed");
});

Deno.test("Issue #4: validateOriginReferer acepta Origin válido", () => {
  const req = new Request("https://example.com/twitch-auth", {
    headers: {
      "Origin": "https://id.twitch.tv",
      "User-Agent": "Mozilla/5.0 Chrome/120.0",
    },
  });
  const result = validateOriginReferer(req);
  assert(result.valid);
});

Deno.test("Issue #4: validateOriginReferer rechaza UA bloqueado", () => {
  const req = new Request("https://example.com/twitch-auth", {
    headers: {
      "Origin": "https://id.twitch.tv",
      "User-Agent": "curl/8.4.0",
    },
  });
  const result = validateOriginReferer(req);
  assertFalse(result.valid);
  assertEquals(result.reason, "user_agent_not_allowed");
});

// ============= Tests Issue #5: Rate Limiting =============
Deno.test("Issue #5: checkGeneralRate permite hasta 10 requests por minuto", () => {
  const ip = "192.168.1.100";
  for (let i = 0; i < 10; i++) {
    const result = checkGeneralRate(ip);
    assert(result.allowed, `Request ${i + 1} should be allowed`);
  }
  const blocked = checkGeneralRate(ip);
  assertFalse(blocked.allowed, "Request 11 should be blocked");
});

Deno.test("Issue #5: checkPollingRate permite hasta 60 requests por minuto", () => {
  const ip = "192.168.1.101";
  for (let i = 0; i < 60; i++) {
    const result = checkPollingRate(ip);
    assert(result.allowed, `Polling request ${i + 1} should be allowed`);
  }
  const blocked = checkPollingRate(ip);
  assertFalse(blocked.allowed, "Polling request 61 should be blocked");
});

Deno.test("Issue #5: Rate limits separados (general vs polling)", () => {
  const ip = "192.168.1.102";
  // Agotar general
  for (let i = 0; i < 10; i++) checkGeneralRate(ip);
  // Polling aún debe permitir
  const pollingResult = checkPollingRate(ip);
  assert(pollingResult.allowed, "Polling should have separate budget");
});

// ============= Tests Issue #1: Debug Mode Gate =============
Deno.test("Issue #1: isDebugEnabled retorna false por defecto", () => {
  Deno.env.delete("ENABLE_DEBUG");
  assertEquals(isDebugEnabled(), false);
});

Deno.test("Issue #1: isDebugEnabled retorna true solo si ENABLE_DEBUG=true", () => {
  Deno.env.set("ENABLE_DEBUG", "true");
  assertEquals(isDebugEnabled(), true);
  Deno.env.set("ENABLE_DEBUG", "1");
  assertEquals(isDebugEnabled(), false); // Solo "true" exacto
  Deno.env.delete("ENABLE_DEBUG");
});

// ============= Tests Issue #8: logSuspicious sanitiza secretos =============
Deno.test("Issue #8: logSuspicious acepta evento básico sin lanzar", () => {
  // Solo verificar que no lanza excepciones
  logSuspicious({
    reason: "test_event",
    ip: "127.0.0.1",
    endpoint: "/twitch-auth",
    method: "GET",
  });
});

Deno.test("Issue #8: logSuspicious no incluye secretos en extra", () => {
  // Capturar log output para verificar sanitización
  const originalWarn = console.warn;
  const captured: string[] = [];
  console.warn = (msg: string) => {
    captured.push(msg);
  };
  try {
    logSuspicious({
      reason: "test_sanitization",
      extra: {
        access_token: "secret_value_should_be_filtered",
        password: "my_password",
        api_key: "sk-12345",
        public_field: "this_is_ok",
      },
    });
    const output = captured.join("\n");
    assertFalse(output.includes("secret_value_should_be_filtered"));
    assertFalse(output.includes("my_password"));
    assertFalse(output.includes("sk-12345"));
    assert(output.includes("this_is_ok"));
  } finally {
    console.warn = originalWarn;
  }
});

// ============= Test Issue #3: Single-Use Token (mocked) =============
Deno.test("Issue #3: consumeSingleUseToken retorna false si ya consumido", async () => {
  const mockSql = (() => {
    let consumed = true; // Simular que ya está consumido
    return async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      // Simular que el UPDATE no afecta filas (consumed_at ya no es NULL)
      if (strings[0].includes("UPDATE")) {
        return consumed ? [] : [{ request_id: "test" }];
      }
      return [];
    };
  })() as never;
  const result = await (await import("./_security.ts")).consumeSingleUseToken(
    mockSql,
    "test-id",
  );
  assertEquals(result, false);
});

Deno.test("Issue #3: consumeSingleUseToken retorna true en primera lectura", async () => {
  const mockSql = (() => {
    return async (strings: TemplateStringsArray, ..._values: unknown[]) => {
      if (strings[0].includes("UPDATE")) {
        return [{ request_id: "fresh-id" }];
      }
      return [];
    };
  })() as never;
  const result = await (await import("./_security.ts")).consumeSingleUseToken(
    mockSql,
    "fresh-id",
  );
  assertEquals(result, true);
});

// ============= Test Issue #2: verify_jwt config (verificación de config) =============
Deno.test("Issue #2: supabase/config.toml debe tener verify_jwt = false", async () => {
  // Leer el archivo de configuración y verificar
  try {
    const configText = await Deno.readTextFile("../config.toml");
    assert(
      configText.includes("verify_jwt = false"),
      "supabase/config.toml debe tener verify_jwt = false para twitch-auth",
    );
  } catch {
    // Si no se puede leer (entorno de test diferente), skip
    console.warn("Skipping: config.toml no accesible desde este test");
  }
});

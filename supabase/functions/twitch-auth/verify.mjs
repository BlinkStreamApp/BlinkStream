// verify.mjs - Test runner con Node para verificar la lógica de _security.ts
// Ejecuta los 10 tests de los issues sin necesidad de Deno

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildCorsHeaders,
  checkGeneralRate,
  checkPollingRate,
  constantTimeEqual,
  isAllowedOrigin,
  isAllowedUserAgent,
  isValidUuidV4,
  validateOriginReferer,
} from "./_security-node.mjs";

test("Issue #7: isValidUuidV4 acepta UUID v4 válido", () => {
  assert.equal(isValidUuidV4("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isValidUuidV4("f47ac10b-58cc-4372-a567-0e02b2c3d479"), true);
});

test("Issue #7: isValidUuidV4 rechaza UUID inválido", () => {
  assert.equal(isValidUuidV4("550e8400-e29b-11d4-a716-446655440000"), false);
  assert.equal(isValidUuidV4("not-a-uuid"), false);
  assert.equal(isValidUuidV4(""), false);
  assert.equal(isValidUuidV4(null), false);
  assert.equal(isValidUuidV4(undefined), false);
  assert.equal(isValidUuidV4(123), false);
});

test("Issue #9: constantTimeEqual retorna true para iguales", () => {
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("", ""), true);
});

test("Issue #9: constantTimeEqual retorna false para distintos", () => {
  assert.equal(constantTimeEqual("abc", "abd"), false);
  assert.equal(constantTimeEqual("abc", "abcd"), false);
  assert.equal(constantTimeEqual("abcd", "abc"), false);
});

test("Issue #6: isAllowedUserAgent acepta navegadores", () => {
  assert.equal(
    isAllowedUserAgent(
      "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36"
    ),
    true
  );
  assert.equal(isAllowedUserAgent("Tauri/1.0.0"), true);
  assert.equal(isAllowedUserAgent("Deno/1.40.0"), true);
});

test("Issue #6: isAllowedUserAgent bloquea curl/wget/bots", () => {
  assert.equal(isAllowedUserAgent("curl/8.4.0"), false);
  assert.equal(isAllowedUserAgent("wget/1.21.3"), false);
  assert.equal(isAllowedUserAgent("python-requests/2.31.0"), false);
  assert.equal(isAllowedUserAgent("Googlebot/2.1"), false);
  assert.equal(isAllowedUserAgent(""), false);
  assert.equal(isAllowedUserAgent(null), false);
});

test("Issue #10: buildCorsHeaders retorna headers para origin válido", () => {
  const h = buildCorsHeaders("https://id.twitch.tv");
  assert.ok(h !== null);
  assert.equal(h["Access-Control-Allow-Origin"], "https://id.twitch.tv");
});

test("Issue #10: buildCorsHeaders retorna null para origin inválido (NO 'null' fallback)", () => {
  assert.equal(buildCorsHeaders("https://evil.com"), null);
  assert.equal(buildCorsHeaders("null"), null);
  assert.equal(buildCorsHeaders("*"), null);
  assert.equal(buildCorsHeaders(""), null);
  assert.equal(buildCorsHeaders(null), null);
});

test("Issue #4: validateOriginReferer rechaza sin Origin NI Referer", () => {
  const req = new Request("https://example.com/", {
    headers: { "User-Agent": "Mozilla/5.0 Chrome/120.0" },
  });
  const r = validateOriginReferer(req);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "missing_origin_and_referer");
});

test("Issue #4: validateOriginReferer rechaza Origin no permitido", () => {
  const req = new Request("https://example.com/", {
    headers: {
      Origin: "https://evil.com",
      "User-Agent": "Mozilla/5.0 Chrome/120.0",
    },
  });
  const r = validateOriginReferer(req);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "origin_not_allowed");
});

test("Issue #4: validateOriginReferer acepta Origin válido", () => {
  const req = new Request("https://example.com/", {
    headers: {
      Origin: "https://id.twitch.tv",
      "User-Agent": "Mozilla/5.0 Chrome/120.0",
    },
  });
  const r = validateOriginReferer(req);
  assert.equal(r.valid, true);
});

test("Issue #5: checkGeneralRate permite hasta 10/min", () => {
  const ip = "10.0.0.1";
  for (let i = 0; i < 10; i++) {
    assert.equal(checkGeneralRate(ip).allowed, true, `req ${i + 1}`);
  }
  assert.equal(checkGeneralRate(ip).allowed, false, "req 11");
});

test("Issue #5: checkPollingRate permite hasta 60/min", () => {
  const ip = "10.0.0.2";
  for (let i = 0; i < 60; i++) {
    assert.equal(checkPollingRate(ip).allowed, true, `polling ${i + 1}`);
  }
  assert.equal(checkPollingRate(ip).allowed, false, "polling 61");
});

test("Issue #5: Rate limits separados", () => {
  const ip = "10.0.0.3";
  for (let i = 0; i < 10; i++) checkGeneralRate(ip);
  // General agotado, polling aún tiene cupo
  assert.equal(checkPollingRate(ip).allowed, true);
});

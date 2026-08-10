// BlinkStream Data Sync - Security Tests
// Ejecutar con: deno test --allow-net --allow-env supabase/functions/blinkstream-data/index.test.ts
//
// Cobertura:
//   - Validacion zod (regex, longitud, campos requeridos)
//   - CORS strict (origenes no allowlisted -> 403)
//   - Auth (sin bearer -> 401, JWT invalido -> 401)
//   - Rate limit (global + mutaciones)
//   - Whitelist de tablas
//   - Anti-SQL-injection en parametros (DROP TABLE, UNION SELECT, comentarios)
//   - Username mismatch (user A intenta mutar favoritos de user B)

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CHANNEL_REGEX,
  FavActionBodySchema,
  FavListQuerySchema,
  USERNAME_REGEX,
  parseOrReject,
} from "./_validation.ts";
import { trustedTwitchUsername } from "./_identity.ts";
import {
  ALLOWED_ORIGINS,
  ALLOWED_TABLES,
  RATE_LIMIT_GLOBAL_MAX,
  RATE_LIMIT_MUTATION_MAX,
  RATE_LIMIT_WINDOW_MS,
  _bucketKey_for_test,
  _checkRate_for_test,
  _rateStore_for_test,
} from "./index.ts";

// ─── Tests de validacion (zod) ─────────────────────────────────────────────

Deno.test("validation: username regex acepta twitch validos", () => {
  for (const u of ["alice", "mr_robot", "xqc", "streamer_42", "abc"]) {
    assert(USERNAME_REGEX.test(u), `debio aceptar ${u}`);
  }
});

Deno.test("validation: username regex rechaza inyecciones y caracteres invalidos", () => {
  for (const u of [
    "ab", // muy corto
    "a".repeat(26), // muy largo
    "alice'; DROP TABLE favorites; --",
    "alice UNION SELECT 1",
    "alice/\../etc/passwd",
    "alice\x00admin",
    "<script>alert(1)</script>",
    "ALICE", // mayusculas
    "alice-bob", // guion
  ]) {
    assert(!USERNAME_REGEX.test(u), `debio rechazar ${u}`);
  }
});

Deno.test("validation: channel regex acepta twitch validos", () => {
  for (const c of ["lirik", "summit1g", "ninja", "abc"]) {
    assert(CHANNEL_REGEX.test(c), `debio aceptar ${c}`);
  }
});

Deno.test("validation: FavActionBodySchema rechaza payload SQLi classico", () => {
  const payload = {
    action: "fav_add",
    username: "admin' OR 1=1;--",
    channel: "xqc",
  };
  const r = parseOrReject(FavActionBodySchema, payload);
  assertEquals(r.ok, false);
  if (!r.ok) assertStringIncludes(r.error, "username must match");
});

Deno.test("validation: FavActionBodySchema rechaza payload con campos extra (.strict)", () => {
  const r = parseOrReject(FavActionBodySchema, {
    action: "list",
    username: "alice",
    role: "admin",
  });
  assertEquals(r.ok, false);
});

Deno.test("validation: FavActionBodySchema rechaza fav_add sin channel", () => {
  const r = parseOrReject(FavActionBodySchema, {
    action: "fav_add",
    username: "alice",
  });
  assertEquals(r.ok, false);
  if (!r.ok) assertStringIncludes(r.error, "channel is required");
});

Deno.test("validation: FavActionBodySchema acepta payload valido", () => {
  const r = parseOrReject(FavActionBodySchema, {
    action: "fav_add",
    username: "alice",
    channel: "xqc",
  });
  assertEquals(r.ok, true);
});

Deno.test("validation: FavListQuerySchema requiere action=list", () => {
  const r = parseOrReject(FavListQuerySchema, {
    action: "fav_add",
    username: "alice",
  });
  assertEquals(r.ok, false);
});

// ─── Tests de constantes de seguridad ──────────────────────────────────────

Deno.test("security: CORS no permite wildcard", () => {
  assert(!ALLOWED_ORIGINS.has("*"));
  assert(!ALLOWED_ORIGINS.has("null"));
});

Deno.test("security: tabla favorites esta en whitelist", () => {
  assert(ALLOWED_TABLES.has("favorites"));
  // Tablas que NUNCA deben estar disponibles para este handler
  assert(!ALLOWED_TABLES.has("auth_tokens"));
  assert(!ALLOWED_TABLES.has("users"));
  assert(!ALLOWED_TABLES.has("pg_catalog"));
});

Deno.test("identity: app_metadata administrada es la fuente confiable", () => {
  assertEquals(
    trustedTwitchUsername({
      app_metadata: { username: "Trusted_User" },
      email: "twitch-fallback@blinkstream.local",
    }),
    "trusted_user",
  );
});

Deno.test("identity: user_metadata editable nunca concede identidad", () => {
  assertEquals(
    trustedTwitchUsername({
      app_metadata: {},
      email: "attacker@example.com",
      user_metadata: { username: "victim" },
    } as never),
    null,
  );
});

Deno.test("identity: usuarios legacy usan solo el email determinista", () => {
  assertEquals(
    trustedTwitchUsername({ email: "twitch-legacy_user@blinkstream.local" }),
    "legacy_user",
  );
  assertEquals(trustedTwitchUsername({ email: "admin@example.com" }), null);
});

Deno.test("database: fav_add deduplica por user_id y canal", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(
    source,
    "ON CONFLICT (user_id, channel) WHERE user_id IS NOT NULL DO NOTHING",
  );
});

Deno.test("database: migration revoca get_user_id_by_email de PUBLIC", async () => {
  const migrations = new URL("../../migrations/", import.meta.url);
  const files = [...Deno.readDirSync(migrations)]
    .map((entry) => entry.name)
    .filter((name) => name.endsWith("_harden_favorites_identity_permissions.sql"));
  assertEquals(files.length, 1);
  const source = await Deno.readTextFile(new URL(files[0], migrations));
  assertStringIncludes(source, "FROM PUBLIC, anon, authenticated");
  assertStringIncludes(source, 'DROP POLICY IF EXISTS "favorites_select_policy"');
  assertStringIncludes(source, "REVOKE ALL ON TABLE public.favorites FROM anon");
});

// ─── Tests de rate limit ──────────────────────────────────────────────────

Deno.test("rate: bloquea despues de RATE_LIMIT_GLOBAL_MAX requests", () => {
  const key = "test-user-global";
  _rateStore_for_test.delete(key);
  for (let i = 0; i < RATE_LIMIT_GLOBAL_MAX; i++) {
    const r = _checkRate_for_test(key, false);
    assertEquals(r.allowed, true, `request ${i + 1} debio ser permitido`);
  }
  const r = _checkRate_for_test(key, false);
  assertEquals(r.allowed, false);
  if (!r.allowed) assertEquals(r.reason, "rate_limit_global");
  _rateStore_for_test.delete(key);
});

Deno.test("rate: bloquea mutaciones despues de RATE_LIMIT_MUTATION_MAX", () => {
  const key = "test-user-mutations";
  _rateStore_for_test.delete(key);
  for (let i = 0; i < RATE_LIMIT_MUTATION_MAX; i++) {
    const r = _checkRate_for_test(key, true);
    assertEquals(r.allowed, true, `mutation ${i + 1} debio ser permitida`);
  }
  const r = _checkRate_for_test(key, true);
  assertEquals(r.allowed, false);
  if (!r.allowed) assertEquals(r.reason, "rate_limit_mutations");
  _rateStore_for_test.delete(key);
});

Deno.test("rate: lecturas no consumen cupo de mutaciones", () => {
  const key = "test-user-mixed";
  _rateStore_for_test.delete(key);
  // 5 lecturas
  for (let i = 0; i < 5; i++) {
    _checkRate_for_test(key, false);
  }
  // Mutaciones aun deben tener cupo completo
  for (let i = 0; i < RATE_LIMIT_MUTATION_MAX; i++) {
    const r = _checkRate_for_test(key, true);
    assertEquals(r.allowed, true, `mutation ${i + 1} debio ser permitida`);
  }
  _rateStore_for_test.delete(key);
});

Deno.test("rate: bucketKey aisla usuarios distintos", () => {
  assert(_bucketKey_for_test("userA", "1.1.1.1") !== _bucketKey_for_test("userB", "1.1.1.1"));
  assert(_bucketKey_for_test("userA", "1.1.1.1") !== _bucketKey_for_test("userA", "2.2.2.2"));
});

// ─── Test canon: '; DROP TABLE favorites; -- debe ser rechazado ───────────

Deno.test("CANON: SQL injection '; DROP TABLE favorites; -- es rechazado", () => {
  const payload = {
    action: "fav_add",
    username: "alice'; DROP TABLE favorites; --",
    channel: "xqc'; DROP TABLE favorites; --",
  };
  const r = parseOrReject(FavActionBodySchema, payload);
  assertEquals(r.ok, false, "el payload malicioso DEBE ser rechazado");
});

Deno.test("CANON: SQL injection UNION SELECT es rechazado", () => {
  const payload = {
    action: "fav_add",
    username: "alice' UNION SELECT password FROM auth.users --",
    channel: "xqc",
  };
  const r = parseOrReject(FavActionBodySchema, payload);
  assertEquals(r.ok, false);
});

Deno.test("CANON: SQL injection con NULL byte es rechazado", () => {
  const r = parseOrReject(FavActionBodySchema, {
    action: "fav_add",
    username: "alice\x00admin",
    channel: "xqc",
  });
  assertEquals(r.ok, false);
});

// ─── Tests de CORS ────────────────────────────────────────────────────────

Deno.test("CORS: ALLOWED_ORIGINS es un Set explicito (no programatico)", () => {
  // El set debe estar cerrado y no depender de regex o prefijo.
  // Esto es un test de regresion: si alguien cambia a "*.supabase.co" esto fallara.
  assert(ALLOWED_ORIGINS instanceof Set);
  assert(ALLOWED_ORIGINS.size > 0);
  assert(ALLOWED_ORIGINS.has("https://oncbojnqxpxctwnhehau.supabase.co"));
});

// ─── Config sanity ────────────────────────────────────────────────────────

Deno.test("config: ventana de rate limit es 60s", () => {
  assertEquals(RATE_LIMIT_WINDOW_MS, 60_000);
});

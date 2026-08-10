// BlinkStream Data Sync - HARDENED v2
// CRUD de favoritos con auth real, CORS estricto, rate limiting y queries parametrizadas.
//
// Endpoints (compatibles con v1):
//   GET  /blinkstream-data?action=list&username=NAME   (requiere JWT)
//   POST /blinkstream-data  body: { action, username, channel }  (requiere JWT)
//
// Acciones permitidas (whitelist):
//   - list        -> SELECT
//   - fav_add     -> INSERT (ON CONFLICT DO NOTHING)
//   - fav_remove  -> DELETE
//
// Seguridad:
//   - verify_jwt=true a nivel plataforma (ver config.toml)
//   - Validacion adicional con supabase.auth.getUser(jwt) para evitar tokens forjados
//   - CORS estricto: solo origins allowlisted
//   - Rate limit: 60 req/min general + 10 mutaciones/min por (userId + ip)
//   - Todas las queries son parametrizadas (postgres.js template tags)
//   - Validacion de input con zod (regex ^[a-z0-9_]{3,25}$)
//   - Logging estructurado sin PII

import postgres from "npm:postgres@3.4.5";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  ALLOWED_ACTIONS,
  FavActionBodySchema,
  FavListQuerySchema,
  parseOrReject,
} from "./_validation.ts";
import { trustedTwitchUsername } from "./_identity.ts";

// ─── Config ────────────────────────────────────────────────────────────────
const DB_URL = Deno.env.get("SUPABASE_DB_URL") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// CORS estricto. NO usar "*" en endpoints autenticados.
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "https://oncbojnqxpxctwnhehau.supabase.co",
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://tauri.localhost",
  "tauri://localhost",
]);

// Whitelist de tablas que este handler puede tocar.
const ALLOWED_TABLES: ReadonlySet<string> = new Set(["favorites"]);

// Rate limit config.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_GLOBAL_MAX = 60;
const RATE_LIMIT_MUTATION_MAX = 10;

// ─── Bootstrap ─────────────────────────────────────────────────────────────
const sql = DB_URL
  ? postgres(DB_URL, { max: 3, idle_timeout: 10, prepare: false })
  : null;

// Cliente supabase con SERVICE_ROLE para validar JWT firmados server-side.
// NUNCA exponer esta key al cliente.
const supabaseAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  : null;

// ─── Rate limiter en memoria (best-effort, suficiente para 1 worker) ──────
interface RateBucket {
  global: number[];
  mutation: number[];
}
const rateStore = new Map<string, RateBucket>();

function bucketKey(userId: string, ip: string): string {
  return `${userId}::${ip}`;
}

function pruneBucket(arr: number[], now: number): void {
  while (arr.length > 0 && arr[0] < now - RATE_LIMIT_WINDOW_MS) {
    arr.shift();
  }
}

function checkRate(
  key: string,
  isMutation: boolean,
): { allowed: true } | { allowed: false; reason: string } {
  const now = Date.now();
  let bucket = rateStore.get(key);
  if (!bucket) {
    bucket = { global: [], mutation: [] };
    rateStore.set(key, bucket);
  }
  pruneBucket(bucket.global, now);
  pruneBucket(bucket.mutation, now);

  if (bucket.global.length >= RATE_LIMIT_GLOBAL_MAX) {
    return { allowed: false, reason: "rate_limit_global" };
  }
  if (isMutation && bucket.mutation.length >= RATE_LIMIT_MUTATION_MAX) {
    return { allowed: false, reason: "rate_limit_mutations" };
  }
  bucket.global.push(now);
  if (isMutation) bucket.mutation.push(now);
  return { allowed: true };
}

// ─── Auth ──────────────────────────────────────────────────────────────────
interface AuthOk {
  ok: true;
  userId: string;
  username: string;
}
interface AuthFail {
  ok: false;
  status: number;
  reason: string;
}

async function authenticate(req: Request): Promise<AuthOk | AuthFail> {
  // Extraer JWT
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) {
    return { ok: false, status: 401, reason: "missing_bearer" };
  }
  const jwt = bearerMatch[1].trim();

  // Sin servicio admin no podemos validar firma -> 503
  if (!supabaseAdmin) {
    return { ok: false, status: 503, reason: "auth_unavailable" };
  }

  // supabase.auth.getUser(jwt) valida firma contra JWKS y expiracion.
  // A diferencia de atob(), NO confia en el payload del cliente.
  const { data, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !data?.user) {
    return { ok: false, status: 401, reason: "invalid_token" };
  }

  const userId = data.user.id;
  if (!userId) {
    return { ok: false, status: 401, reason: "no_user_id" };
  }

  // app_metadata solo puede modificarlo el servidor. Para usuarios antiguos,
  // aceptamos exclusivamente el email determinista creado por twitch-auth.
  const username = trustedTwitchUsername(data.user);
  if (!username) {
    return { ok: false, status: 401, reason: "missing_trusted_username" };
  }

  return { ok: true, userId, username };
}

// ─── Helpers de respuesta ──────────────────────────────────────────────────
function corsHeaders(origin: string | null): HeadersInit {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(
  data: Record<string, unknown>,
  status = 200,
  origin: string | null = null,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
}

function logEvent(event: string, fields: Record<string, unknown>): void {
  // Logging estructurado. NUNCA incluir tokens, passwords o inputs crudos.
  const safe = {
    ts: new Date().toISOString(),
    fn: "blinkstream-data",
    event,
    ...fields,
  };
  console.log(JSON.stringify(safe));
}

// ─── Handlers (operan SIEMPRE con userId autenticado) ──────────────────────
async function handleList(userId: string, origin: string | null) {
  if (!sql) return json({ ok: false, error: "db_offline" }, 503, origin);
  if (!ALLOWED_TABLES.has("favorites")) return json({ ok: false, error: "table_blocked" }, 403, origin);
  try {
    // Query parametrizada: ${userId} se envia como placeholder seguro, NUNCA interpolado al SQL.
    const rows = await sql<{ channel: string; created_at: Date }[]>`
      SELECT channel, created_at
      FROM public.favorites
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `;
    return json(
      { ok: true, channels: rows.map((r) => r.channel) },
      200,
      origin,
    );
  } catch (err) {
    logEvent("list_error", { userId, msg: (err as Error).message });
    return json({ ok: false, error: "internal_error" }, 500, origin);
  }
}

async function handleAdd(userId: string, username: string, channel: string, origin: string | null) {
  if (!sql) return json({ ok: false, error: "db_offline" }, 503, origin);
  if (!ALLOWED_TABLES.has("favorites")) return json({ ok: false, error: "table_blocked" }, 403, origin);
  try {
    await sql`
      INSERT INTO public.favorites (user_id, username, channel)
      VALUES (${userId}, ${username}, ${channel})
      ON CONFLICT (user_id, channel) WHERE user_id IS NOT NULL DO NOTHING
    `;
    return json({ ok: true }, 200, origin);
  } catch (err) {
    logEvent("add_error", { userId, channel, msg: (err as Error).message });
    return json({ ok: false, error: "internal_error" }, 500, origin);
  }
}

async function handleRemove(userId: string, channel: string, origin: string | null) {
  if (!sql) return json({ ok: false, error: "db_offline" }, 503, origin);
  if (!ALLOWED_TABLES.has("favorites")) return json({ ok: false, error: "table_blocked" }, 403, origin);
  try {
    await sql`
      DELETE FROM public.favorites
      WHERE user_id = ${userId} AND channel = ${channel}
    `;
    return json({ ok: true }, 200, origin);
  } catch (err) {
    logEvent("remove_error", { userId, channel, msg: (err as Error).message });
    return json({ ok: false, error: "internal_error" }, 500, origin);
  }
}

// ─── Entry point ───────────────────────────────────────────────────────────
export async function handleRequest(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Solo GET y POST
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405, origin);
  }

  // CORS: si el Origin viene y NO esta allowlisted, rechazar 403.
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    logEvent("cors_rejected", { origin });
    return json({ ok: false, error: "origin_not_allowed" }, 403, null);
  }

  // Auth
  const auth = await authenticate(req);
  if (!auth.ok) {
    logEvent("auth_failed", { reason: auth.reason, ip: clientIp(req) });
    return json({ ok: false, error: auth.reason }, auth.status, origin);
  }

  // Rate limit
  const isMutation = req.method === "POST";
  const rl = checkRate(bucketKey(auth.userId, clientIp(req)), isMutation);
  if (!rl.allowed) {
    logEvent("rate_limited", { reason: rl.reason, userId: auth.userId });
    return json({ ok: false, error: rl.reason }, 429, origin);
  }

  // Router
  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const raw = {
        action: url.searchParams.get("action") ?? "",
        username: url.searchParams.get("username") ?? "",
      };
      const parsed = parseOrReject(FavListQuerySchema, raw);
      if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400, origin);
      // El username del query DEBE coincidir con el del JWT. Evita que user A liste favoritos de user B.
      if (parsed.data.username !== auth.username) {
        logEvent("username_mismatch", { userId: auth.userId });
        return json({ ok: false, error: "forbidden" }, 403, origin);
      }
      return await handleList(auth.userId, origin);
    }

    // POST
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400, origin);
    }
    const parsed = parseOrReject(FavActionBodySchema, body);
    if (!parsed.ok) return json({ ok: false, error: parsed.error }, 400, origin);

    // El username del body DEBE coincidir con el del JWT.
    if (parsed.data.username !== auth.username) {
      logEvent("username_mismatch", { userId: auth.userId, action: parsed.data.action });
      return json({ ok: false, error: "forbidden" }, 403, origin);
    }

    switch (parsed.data.action) {
      case "list":
        return await handleList(auth.userId, origin);
      case "fav_add":
        if (!parsed.data.channel) return json({ ok: false, error: "channel_required" }, 400, origin);
        return await handleAdd(auth.userId, auth.username, parsed.data.channel, origin);
      case "fav_remove":
        if (!parsed.data.channel) return json({ ok: false, error: "channel_required" }, 400, origin);
        return await handleRemove(auth.userId, parsed.data.channel, origin);
      default: {
        // Exhaustiveness check via never
        const _exhaustive: never = parsed.data.action;
        return json({ ok: false, error: "unsupported_action" }, 400, origin);
      }
    }
  } catch (err) {
    logEvent("unhandled_error", { msg: (err as Error).message });
    return json({ ok: false, error: "internal_error" }, 500, origin);
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

// Re-export para tests
export {
  ALLOWED_ORIGINS,
  ALLOWED_TABLES,
  ALLOWED_ACTIONS,
  authenticate as _authenticate_for_test,
  checkRate as _checkRate_for_test,
  bucketKey as _bucketKey_for_test,
  handleList as _handleList_for_test,
  handleAdd as _handleAdd_for_test,
  handleRemove as _handleRemove_for_test,
  rateStore as _rateStore_for_test,
  RATE_LIMIT_GLOBAL_MAX,
  RATE_LIMIT_MUTATION_MAX,
  RATE_LIMIT_WINDOW_MS,
};

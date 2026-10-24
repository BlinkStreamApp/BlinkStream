export interface TwitchIdentity {
  userId: string;
  login: string;
  scopes: string[];
  expiresIn: number;
}

export const REQUESTED_TWITCH_SCOPES = [
  "chat:read",
  "chat:edit",
  "user:read:follows",
  "moderator:manage:chat_messages",
  "moderator:manage:banned_users",
  "moderator:manage:chat_settings",
  "moderation:read",
  "moderator:read:chatters",
  "channel:read:redemptions",
  "channel:manage:redemptions",
  "channel:read:predictions",
  "channel:manage:predictions",
  "channel:read:polls",
  "channel:manage:polls",
  "moderator:read:automod_settings",
  "moderator:manage:automod",
  "moderator:read:unban_requests",
  "moderator:manage:unban_requests",
] as const;

const REQUIRED_TWITCH_SCOPES = new Set([
  "chat:read",
  "chat:edit",
  "user:read:follows",
]);
const TWITCH_USER_ID = /^[1-9][0-9]{0,31}$/;
const TWITCH_LOGIN = /^[a-z0-9_]{3,25}$/;

export function parseTwitchIdentity(
  value: unknown,
  expectedClientId: string,
): TwitchIdentity | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const clientId = typeof data.client_id === "string" ? data.client_id : "";
  const userId = typeof data.user_id === "string" ? data.user_id : "";
  const login = typeof data.login === "string" ? data.login.toLowerCase() : "";
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 0;
  const scopes = Array.isArray(data.scopes)
    ? data.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];

  if (!expectedClientId || clientId !== expectedClientId) return null;
  if (!TWITCH_USER_ID.test(userId) || !TWITCH_LOGIN.test(login)) return null;
  if (!Number.isSafeInteger(expiresIn) || expiresIn <= 0) return null;
  if ([...REQUIRED_TWITCH_SCOPES].some((scope) => !scopes.includes(scope))) return null;

  return { userId, login, scopes, expiresIn };
}

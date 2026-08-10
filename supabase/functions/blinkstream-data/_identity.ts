import { USERNAME_REGEX } from "./_validation.ts";

interface AuthIdentity {
  app_metadata?: unknown;
  email?: string | null;
}

const TWITCH_EMAIL_PATTERN = /^twitch-([a-z0-9_]{3,25})@blinkstream\.local$/;

export function trustedTwitchUsername(user: AuthIdentity): string | null {
  const appMetadata = user.app_metadata;
  if (appMetadata && typeof appMetadata === "object") {
    const username = (appMetadata as Record<string, unknown>).username;
    if (typeof username === "string") {
      const normalized = username.toLowerCase();
      if (USERNAME_REGEX.test(normalized)) return normalized;
    }
  }

  const emailMatch = user.email?.toLowerCase().match(TWITCH_EMAIL_PATTERN);
  return emailMatch?.[1] ?? null;
}

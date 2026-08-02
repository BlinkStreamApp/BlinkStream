// BlinkStream Data Sync - Validation Schemas
// Schemas zod para validar inputs de la edge function.

import { z } from "https://deno.land/x/zod@v3.23.8/mod.ts";

export const ALLOWED_ACTIONS = ["list", "fav_add", "fav_remove"] as const;

export const USERNAME_REGEX = /^[a-z0-9_]{3,25}$/;
export const CHANNEL_REGEX = /^[a-z0-9_]{3,25}$/;

const ActionSchema = z.enum(ALLOWED_ACTIONS);

const UsernameSchema = z
  .string()
  .min(3)
  .max(25)
  .regex(USERNAME_REGEX, { message: "username must match ^[a-z0-9_]{3,25}$" });

const ChannelSchema = z
  .string()
  .min(3)
  .max(25)
  .regex(CHANNEL_REGEX, { message: "channel must match ^[a-z0-9_]{3,25}$" });

export const FavActionBodySchema = z
  .object({
    action: ActionSchema,
    username: UsernameSchema,
    channel: ChannelSchema.optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.action === "fav_add" || data.action === "fav_remove") {
        return typeof data.channel === "string" && data.channel.length > 0;
      }
      return true;
    },
    { message: "channel is required for fav_add and fav_remove", path: ["channel"] },
  );

export type FavActionBody = z.infer<typeof FavActionBodySchema>;

export const FavListQuerySchema = z.object({
  action: z.literal("list"),
  username: UsernameSchema,
});

export type FavListQuery = z.infer<typeof FavListQuerySchema>;

export function parseOrReject<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "invalid input" };
}

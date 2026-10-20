-- Finalize the two-phase rollout after twitch-auth v37 started persisting the
-- immutable Twitch user id on every handoff.
DELETE FROM public.auth_tokens
WHERE twitch_user_id IS NULL
   OR expires_at <= now();

ALTER TABLE public.auth_tokens
  ALTER COLUMN twitch_user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_tokens_twitch_user_id_check'
      AND conrelid = 'public.auth_tokens'::regclass
  ) THEN
    ALTER TABLE public.auth_tokens
      ADD CONSTRAINT auth_tokens_twitch_user_id_check
      CHECK (twitch_user_id ~ '^[1-9][0-9]{0,31}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_tokens_username_check'
      AND conrelid = 'public.auth_tokens'::regclass
  ) THEN
    ALTER TABLE public.auth_tokens
      ADD CONSTRAINT auth_tokens_username_check
      CHECK (username ~ '^[a-z0-9_]{3,25}$');
  END IF;
END
$$;

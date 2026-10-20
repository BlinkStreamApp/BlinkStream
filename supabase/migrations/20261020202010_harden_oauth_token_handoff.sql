-- OAuth handoff rows contain Twitch bearer credentials and must never be
-- reachable through the public Data API. Only trusted Edge Functions use
-- this table through service_role.

DROP POLICY IF EXISTS "auth_tokens_select_policy" ON public.auth_tokens;
DROP POLICY IF EXISTS "auth_tokens_insert_policy" ON public.auth_tokens;
DROP POLICY IF EXISTS "auth_tokens_delete_policy" ON public.auth_tokens;

REVOKE ALL ON TABLE public.auth_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.auth_tokens TO service_role;

ALTER TABLE public.auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_tokens FORCE ROW LEVEL SECURITY;

-- All pre-existing handoffs are expired. Purge them before tightening the
-- schema so no bearer credential survives longer than the OAuth exchange.
DELETE FROM public.auth_tokens
WHERE expires_at IS NULL
   OR expires_at <= now()
   OR created_at IS NULL
   OR created_at < now() - interval '10 minutes';

ALTER TABLE public.auth_tokens
  ADD COLUMN IF NOT EXISTS twitch_user_id TEXT;

ALTER TABLE public.auth_tokens
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN expires_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_tokens_request_id_uuid_v4_check'
      AND conrelid = 'public.auth_tokens'::regclass
  ) THEN
    ALTER TABLE public.auth_tokens
      ADD CONSTRAINT auth_tokens_request_id_uuid_v4_check
      CHECK (request_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'auth_tokens_short_lifetime_check'
      AND conrelid = 'public.auth_tokens'::regclass
  ) THEN
    ALTER TABLE public.auth_tokens
      ADD CONSTRAINT auth_tokens_short_lifetime_check
      CHECK (
        expires_at > created_at
        AND expires_at <= created_at + interval '10 minutes'
      );
  END IF;
END
$$;

-- request_id already has a UNIQUE index; remove the redundant legacy index.
DROP INDEX IF EXISTS public.idx_auth_tokens_request_id;

-- Stable lookup for legacy accounts whose synthetic email was based on the
-- mutable Twitch login. This privileged RPC is callable only by service_role.
CREATE OR REPLACE FUNCTION public.get_user_id_by_twitch_id(target_twitch_user_id TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO pg_catalog, auth
AS $$
  SELECT id
  FROM auth.users
  WHERE raw_app_meta_data ->> 'twitch_user_id' = target_twitch_user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_twitch_id(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_twitch_id(TEXT)
  TO service_role;

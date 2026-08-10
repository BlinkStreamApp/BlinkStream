-- Favorites used to be keyed only by username. The hardened Edge Function
-- authorizes by the Supabase user id, so keep username for compatibility but
-- make user_id the authoritative ownership column.
ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Existing users created by twitch-auth have a deterministic local email.
-- This backfills legacy rows without using editable user metadata for auth.
UPDATE public.favorites AS f
SET user_id = u.id
FROM auth.users AS u
WHERE f.user_id IS NULL
  AND lower(u.email) = 'twitch-' || lower(f.username) || '@blinkstream.local';

CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_id_channel_key
  ON public.favorites (user_id, channel)
  WHERE user_id IS NOT NULL;

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "favorites_select_own" ON public.favorites;
CREATE POLICY "favorites_select_own"
  ON public.favorites
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "favorites_insert_own" ON public.favorites;
CREATE POLICY "favorites_insert_own"
  ON public.favorites
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "favorites_delete_own" ON public.favorites;
CREATE POLICY "favorites_delete_own"
  ON public.favorites
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

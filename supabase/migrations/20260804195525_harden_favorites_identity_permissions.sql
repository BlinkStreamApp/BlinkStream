-- SECURITY DEFINER functions inherit EXECUTE for PUBLIC unless it is revoked
-- explicitly. Keep this auth lookup callable only by trusted Edge Functions.
ALTER FUNCTION public.get_user_id_by_email(TEXT)
  SET search_path TO pg_catalog, auth;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT)
  TO service_role;

-- Remove legacy policies created before migrations were tracked. They overlap
-- with the user_id policies and were broad enough to trigger anonymous-access
-- and per-row auth evaluation warnings in the database advisors.
DROP POLICY IF EXISTS "favorites_select_policy" ON public.favorites;
DROP POLICY IF EXISTS "favorites_insert_policy" ON public.favorites;
DROP POLICY IF EXISTS "favorites_delete_policy" ON public.favorites;

REVOKE ALL ON TABLE public.favorites FROM anon;

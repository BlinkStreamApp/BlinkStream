-- Función para buscar un usuario de auth por email en O(1).
-- Reemplaza la paginación listUsers O(n) en twitch-auth/index.ts.
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(target_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE email = target_email LIMIT 1;
$$;

-- Solo accesible con service_role (edge functions).
REVOKE ALL ON FUNCTION public.get_user_id_by_email(TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO service_role;

-- ============================================================================
-- Restore get_my_permissions() to the permission-KEY definition (audit P0-M1
-- prerequisite — found during the server-convergence work).
-- ============================================================================
-- 20260614150000_permissions_system.sql §4 defined:
--     get_my_permissions() RETURNS SETOF text     -- effective permission keys
-- but a later Lovable schema-sync migration (20260618064914) redefined it:
--     get_my_permissions() RETURNS JSONB          -- {roles:[...]}, the OLD shape
--
-- Postgres CANNOT change a function's return type via CREATE OR REPLACE, so the
-- two migrations raced on apply and the live DB ended up on the JSONB version:
-- src/integrations/supabase/types.ts (regenerated from live) shows
--     get_my_permissions: { Args: never; Returns: Json }
--
-- Consequence on the client (AuthContext.fetchUserData):
--     const { data: permRows } = await supabase.rpc('get_my_permissions');
--     setPermissions(new Set((permRows as string[]) ?? []));
-- With a JSONB object, `new Set(object)` throws (not iterable) -> the catch runs
-- -> setPermissions(fallbackPermsFor(role)). So EVERY user silently runs on
-- legacy-role defaults and rights-template grants/revokes (and the P0-H1 revoke
-- fix, and the P0-M2/H2 can() nav+route gates) do nothing. This restores the
-- permission-key version so templates actually take effect.
--
-- Safe + idempotent: no SQL object references get_my_permissions (only the client
-- RPC), so DROP needs no CASCADE; and re-creating the SETOF text body is a no-op
-- if the live function is already correct. Body is identical to 20260614150000 §4.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_my_permissions();

CREATE FUNCTION public.get_my_permissions()
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid  uuid := auth.uid();
  up   public.user_permissions;
  tmpl public.rights_templates;
  eff  text[];
BEGIN
  IF uid IS NULL THEN RETURN; END IF;

  -- Owners resolve to every permission.
  IF public.has_role(uid, 'owner'::app_role) THEN
    RETURN QUERY SELECT key FROM public.permissions; RETURN;
  END IF;

  -- No explicit assignment -> fall back to the built-in template for the user's
  -- legacy role (no lockout); otherwise use the assigned template.
  SELECT * INTO up FROM public.user_permissions WHERE user_id = uid;
  IF up.user_id IS NULL THEN
    SELECT t.* INTO tmpl
    FROM public.rights_templates t
    JOIN public.user_roles ur ON ur.user_id = uid AND ur.role::text = t.role_key
    LIMIT 1;
  ELSE
    SELECT * INTO tmpl FROM public.rights_templates WHERE id = up.template_id;
  END IF;

  IF tmpl.id IS NOT NULL AND tmpl.is_owner THEN
    RETURN QUERY SELECT key FROM public.permissions; RETURN;
  END IF;

  -- effective = (template ∪ granted) − revoked
  eff := COALESCE(tmpl.permissions, '{}');
  IF up.granted IS NOT NULL THEN eff := eff || up.granted; END IF;
  IF up.revoked IS NOT NULL AND array_length(up.revoked, 1) IS NOT NULL THEN
    eff := ARRAY(SELECT unnest(eff) EXCEPT SELECT unnest(up.revoked));
  END IF;

  RETURN QUERY SELECT DISTINCT unnest(eff);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;

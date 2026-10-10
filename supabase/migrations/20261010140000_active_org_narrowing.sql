-- ---------------------------------------------------------------------------
-- Narrow to the organisation the user is actually looking at.
--
-- Tenant isolation stops you reading another company's rows. It does not stop
-- you reading ALL of your own companies at once: someone who holds roles in
-- two organisations gets both merged into one staff list, one payroll, one
-- ledger. The app picks an active organisation, but a bare select still
-- returns everything RLS allows.
--
-- The alternative was adding .eq('organization_id', active) to every query in
-- the client -- fifty-odd call sites, each one a chance to forget, and the
-- ones that are forgotten fail by silently showing another company's data.
-- This does it once, in the policy.
--
-- The client sends the active organisation as the x-active-org header.
-- PostgREST exposes request headers as a GUC, so the policy can read it.
--
-- WHY A CLIENT-SUPPLIED VALUE IS SAFE HERE: it can only ever narrow. The
-- membership test is still ANDed in front of it, so naming an organisation
-- you do not belong to returns nothing rather than someone else's data. The
-- header is a view preference, not a grant. If it is absent, malformed, or
-- not a uuid, it is ignored and you see every organisation you belong to --
-- which is exactly the behaviour before this migration.
-- ---------------------------------------------------------------------------

-- The header, or NULL when there isn't a usable one. Deliberately total: a
-- malformed header must not error a query, it must simply not narrow.
CREATE OR REPLACE FUNCTION public.active_org()
RETURNS uuid
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $fn$
DECLARE v text;
BEGIN
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-active-org';
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;   -- no headers, not json, not a uuid: do not narrow
END;
$fn$;

REVOKE ALL ON FUNCTION public.active_org() FROM public;
GRANT EXECUTE ON FUNCTION public.active_org() TO authenticated, anon;

COMMENT ON FUNCTION public.active_org() IS
  'The organisation named by the x-active-org request header, or NULL. Used by the tenant_isolation policies to narrow a multi-organisation user to the one they are viewing. It can only narrow: membership is still enforced separately.';


-- Rewrite every tenant_isolation policy to AND the narrowing in.
--
-- Both calls are wrapped in a scalar subquery so the planner hoists them into
-- an InitPlan and evaluates them once per query rather than once per row --
-- the same mistake that made RLS 65x slower here before.
DO $do$
DECLARE
  r record;
  col text;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
     WHERE p.polname = 'tenant_isolation'
     ORDER BY c.relname
  LOOP
    -- organizations scopes on its own id; everything else on organization_id.
    col := CASE WHEN r.tbl = 'organizations' THEN 'id' ELSE 'organization_id' END;

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.tbl);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON public.%I AS RESTRICTIVE FOR ALL TO public
        USING (
          %I IN (SELECT public.my_org_ids())
          AND ((SELECT public.active_org()) IS NULL OR %I = (SELECT public.active_org()))
        )
        WITH CHECK (
          %I IN (SELECT public.my_org_ids())
          AND ((SELECT public.active_org()) IS NULL OR %I = (SELECT public.active_org()))
        )$p$, r.tbl, col, col, col, col);
  END LOOP;
END
$do$;

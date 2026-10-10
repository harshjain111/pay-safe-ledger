-- ---------------------------------------------------------------------------
-- The organisations list must not narrow to the active organisation.
--
-- The previous migration applied the x-active-org narrowing to every
-- tenant_isolation policy, organizations included. That makes the switcher a
-- one-way door: once a header is set, `select * from organizations` returns
-- just that one, the switcher sees a single option, canSwitch goes false, and
-- the user can never pick the other company again.
--
-- Caught by asking the database directly -- a user belonging to two
-- organisations, with the header set to one, could see 1 organisation where
-- the switcher needs 2.
--
-- organizations is the switcher's own source of truth, so it enforces
-- membership and nothing more. Narrowing stays on all 57 data tables, which
-- is where the merged-companies problem actually lives.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS tenant_isolation ON public.organizations;
CREATE POLICY tenant_isolation ON public.organizations AS RESTRICTIVE FOR ALL TO public
  USING (id IN (SELECT public.my_org_ids()))
  WITH CHECK (id IN (SELECT public.my_org_ids()));

COMMENT ON POLICY tenant_isolation ON public.organizations IS
  'Membership only, deliberately not narrowed by x-active-org: this table is what the organisation switcher reads, and narrowing it would hide every organisation except the one already active.';

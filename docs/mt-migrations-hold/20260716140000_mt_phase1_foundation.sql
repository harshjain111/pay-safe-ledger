-- ============================================================================
-- MULTI-TENANT — Phase 1: Foundation (additive, safe on the live DB)
--
-- Introduces the org model + per-org feature entitlements + current_org_id(),
-- and backfills the existing single-company data as "Org #1". NOTHING existing
-- is altered here (no org_id on tenant tables yet, no RLS rewrites), so the app
-- keeps working exactly as before. Phase 2 stamps org_id onto the 57 tenant
-- tables; Phase 3 rewrites RLS to fence every row by org.
--
-- Org #1 uses a fixed sentinel UUID so later phases can backfill against it.
-- ============================================================================

-- Fixed id for the existing company so Phase-2 backfills can reference it.
--   00000000-0000-0000-0000-000000000001

-- ---------------------------------------------------------------------------
-- organizations: one row per tenant company
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  short_code text,
  logo_url   text,
  plan       text NOT NULL DEFAULT 'standard',
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed Org #1 from the current single-tenant profile (name + logo if present).
INSERT INTO public.organizations (id, name, logo_url)
SELECT '00000000-0000-0000-0000-000000000001',
       COALESCE(NULLIF(btrim(op.trade_name), ''), NULLIF(btrim(op.legal_name), ''), 'Organization 1'),
       op.logo_url
FROM public.organization_profile op
LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- Fallback if there is no organization_profile row at all.
INSERT INTO public.organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Organization 1')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- organization_members: which users belong to which org (one org each for now)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org  ON public.organization_members(org_id);

-- Backfill: every existing auth user is a member of Org #1.
INSERT INTO public.organization_members (org_id, user_id, is_primary)
SELECT '00000000-0000-0000-0000-000000000001', u.id, true
FROM auth.users u
ON CONFLICT (user_id, org_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- current_org_id(): the caller's org, resolved server-side (never client input)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.organization_members
  WHERE user_id = auth.uid()
  ORDER BY is_primary DESC, created_at ASC
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- org_features: per-org feature/module entitlements (DENYLIST — a feature is
-- enabled unless a row disables it, so new modules are never accidentally
-- hidden for existing orgs). The catalog of feature keys lives in code.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_features (
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, feature_key)
);
ALTER TABLE public.org_features ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS for the tenancy tables themselves.
-- current_org_id() is SECURITY DEFINER, so it reads organization_members
-- without tripping these policies (no recursion).
-- ---------------------------------------------------------------------------

-- organizations: members read their own org; owner manages it.
DROP POLICY IF EXISTS "Members read their org" ON public.organizations;
CREATE POLICY "Members read their org"
  ON public.organizations FOR SELECT TO authenticated
  USING (id IN (SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Owner manages their org" ON public.organizations;
CREATE POLICY "Owner manages their org"
  ON public.organizations FOR UPDATE TO authenticated
  USING      (id = public.current_org_id() AND public.has_role(auth.uid(), 'owner'))
  WITH CHECK (id = public.current_org_id() AND public.has_role(auth.uid(), 'owner'));

-- organization_members: a user sees their own memberships + co-members in their
-- org; owner manages membership within their org (cross-org provisioning of a
-- brand-new org's first member is done via a SECURITY DEFINER function in Phase 5).
DROP POLICY IF EXISTS "Read my memberships" ON public.organization_members;
CREATE POLICY "Read my memberships"
  ON public.organization_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR org_id = public.current_org_id());

DROP POLICY IF EXISTS "Owner manages members in org" ON public.organization_members;
CREATE POLICY "Owner manages members in org"
  ON public.organization_members FOR ALL TO authenticated
  USING      (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'owner'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'owner'));

-- org_features: members read their org's entitlements; owner toggles them.
DROP POLICY IF EXISTS "Members read org features" ON public.org_features;
CREATE POLICY "Members read org features"
  ON public.org_features FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());

DROP POLICY IF EXISTS "Owner manages org features" ON public.org_features;
CREATE POLICY "Owner manages org features"
  ON public.org_features FOR ALL TO authenticated
  USING      (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'owner'))
  WITH CHECK (org_id = public.current_org_id() AND public.has_role(auth.uid(), 'owner'));

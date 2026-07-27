-- ============================================================================
-- Org-level toggle for the break-time concept (start/end break, break timer,
-- break-minutes). Default TRUE — breaks stay available for every org. Konnect 2
-- Hospitality opts out (they don't use breaks). When the multi-tenant
-- org_features system lands, this can move under it.
-- ============================================================================

alter table public.organization_profile
  add column if not exists breaks_enabled boolean not null default true;

-- Hide breaks for Konnect 2 Hospitality only; other orgs keep the default (on).
update public.organization_profile
set breaks_enabled = false
where trade_name = 'Konnect 2 Hospitality';

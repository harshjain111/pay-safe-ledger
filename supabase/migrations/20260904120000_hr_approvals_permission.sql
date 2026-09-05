-- ============================================================================
-- Give the HR template the "Approve advances & expenses" right by default.
--
-- /approvals is gated on approvals.approve (migration-era change in
-- route-permissions.ts), which HR did not hold — so the queue disappeared from
-- HR's sidebar. The client wants HR working that queue by default.
--
-- REMOVABLE, deliberately. get_my_permissions() resolves
--   effective = (template ∪ granted) − revoked
-- so this default can be taken away two ways, both from the UI and neither
-- needing a migration:
--   * Rights Templates -> HR -> untick "Approve advances & expenses" (removes
--     it for every HR user), or
--   * the per-user overrides -> revoke it for one person, which wins over the
--     template.
-- This grants a default; it does not pin one.
--
-- Idempotent and non-destructive: it appends to whatever the HR template holds
-- at the time, so an owner's other customisations are untouched, and it does
-- nothing if the right is already there.
-- ============================================================================

UPDATE public.rights_templates
   SET permissions = permissions || ARRAY['approvals.approve']
 WHERE role_key = 'hr'
   AND NOT ('approvals.approve' = ANY(permissions));

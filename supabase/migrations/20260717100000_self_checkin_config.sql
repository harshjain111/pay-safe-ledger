-- ============================================================================
-- Self check-in configuration.
--
-- The in-app "Ready for your shift?" self check-in/out (photo + gelocation) is
-- now OPTIONAL and controlled from admin settings:
--   * organization_profile.self_checkin_enabled  — master on/off for the org.
--   * staff.self_checkin_allowed                 — per-employee allow flag, so
--     admins can grant self check-in to only some people (e.g. field staff /
--     managers) while everyone else relies on the biometric device.
-- Both default to TRUE to preserve today's behaviour; an admin turns them off.
-- ============================================================================

alter table public.organization_profile
  add column if not exists self_checkin_enabled boolean not null default true;

alter table public.staff
  add column if not exists self_checkin_allowed boolean not null default true;

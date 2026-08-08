-- ============================================================================
-- Turn ON in-app mobile self check-in for everyone.
--
-- Staff attendance is accepted from EITHER source — the biometric device
-- (thumbprint) OR the in-app "Ready for your shift?" self check-in (selfie +
-- geolocation) — or both. They write independent attendance_sessions rows
-- (source = 'biometric' vs the self-checkin source), so enabling this does not
-- disturb device punches; it just gives staff a working fallback whenever the
-- device / connector is unavailable.
--
--   * organization_profile.self_checkin_enabled  — org master switch → ON
--   * staff.self_checkin_allowed                  — per-employee allow → ON for all
-- Admins can still narrow "who can self check-in" afterwards from
-- Settings → Attendance (SelfCheckinCard).
-- ============================================================================

update public.organization_profile
  set self_checkin_enabled = true
  where self_checkin_enabled is distinct from true;

update public.staff
  set self_checkin_allowed = true
  where self_checkin_allowed is distinct from true;

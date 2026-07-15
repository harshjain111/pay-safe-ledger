-- ============================================================================
-- Per-staff "remote check-in" allowance (field / work-from-home staff).
--
-- The branch geofence is all-or-nothing: a branch in 'block' mode rejects every
-- off-site punch, so field or WFH staff can never check in from where they are.
-- This flag is the per-person exception: when true, an out-of-area check-in is
-- FLAGGED for manager review (with the selfie + GPS as proof) instead of blocked.
-- Default false → existing geofence behaviour is unchanged for everyone.
-- ============================================================================

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS remote_attendance_allowed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff.remote_attendance_allowed IS
  'When true, the staff member may check in from outside their branch geofence '
  '(field / work-from-home). Off-site punches are flagged for review, not blocked.';

-- ============================================================================
-- Idempotent upsert key for imported/biometric attendance sessions: one session
-- per (staff, check-in instant). Lets the eTimeTrackLite backfill re-run safely
-- (a session is identified by who + when they checked in). Dedupe any existing
-- collisions from earlier partial imports before creating the unique index.
-- ============================================================================

DELETE FROM public.attendance_sessions a
USING public.attendance_sessions b
WHERE a.ctid < b.ctid
  AND a.staff_id = b.staff_id
  AND a.check_in_at = b.check_in_at;

CREATE UNIQUE INDEX IF NOT EXISTS attendance_sessions_staff_checkin_uq
  ON public.attendance_sessions (staff_id, check_in_at);

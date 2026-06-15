-- ============================================================================
-- GEOFENCED LOCATION-BASED ATTENDANCE
--
-- Branches (outlets) gain a centre point + allowed radius + an enforcement mode.
-- On an app check-in the device location is compared against the staff member's
-- branch; outside the radius the punch is either BLOCKED (rejected) or FLAGGED
-- (soft) for manager review in Approvals.
-- ============================================================================

ALTER TABLE public.outlets
  ADD COLUMN IF NOT EXISTS latitude              numeric,
  ADD COLUMN IF NOT EXISTS longitude             numeric,
  ADD COLUMN IF NOT EXISTS allowed_radius_meters integer,
  -- off  = no geofence; flag = allow but mark for review; block = reject.
  ADD COLUMN IF NOT EXISTS geofence_enforcement  text NOT NULL DEFAULT 'off';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outlets_geofence_enforcement_check') THEN
    ALTER TABLE public.outlets
      ADD CONSTRAINT outlets_geofence_enforcement_check CHECK (geofence_enforcement IN ('off', 'flag', 'block'));
  END IF;
END $$;

-- ---- per-session geofence outcome ------------------------------------------
ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS geo_flagged    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geo_distance_m numeric,
  -- null = no decision needed / pending; 'approved' = manager accepted the
  -- out-of-area punch; 'rejected' = manager marked it invalid.
  ADD COLUMN IF NOT EXISTS geo_review     text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_geo_review_check') THEN
    ALTER TABLE public.attendance_sessions
      ADD CONSTRAINT attendance_sessions_geo_review_check CHECK (geo_review IS NULL OR geo_review IN ('approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS attendance_sessions_geo_flagged_idx
  ON public.attendance_sessions(geo_flagged) WHERE geo_flagged = true;

-- Admins (not only owners) need to resolve flagged punches in Approvals.
DROP POLICY IF EXISTS "Admins update attendance sessions" ON public.attendance_sessions;
CREATE POLICY "Admins update attendance sessions"
  ON public.attendance_sessions FOR UPDATE TO authenticated
  USING      (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

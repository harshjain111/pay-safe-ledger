-- ============================================================================
-- BIOMETRIC / FACE ATTENDANCE SUBSYSTEM
--
--   biometric_devices  -> registered hardware (fingerprint / face readers)
--   biometric_enrolments -> which staff are enrolled on which device
--   punch_events       -> idempotent raw inbox of device punches
--
-- Device punches are NORMALISED into the SAME `attendance_sessions` table the
-- in-app check-in widget writes to, so they flow into settlements identically.
-- There is exactly one attendance pipeline; nothing is forked.
-- ============================================================================

-- ---- 0. attendance_sessions: make it punch-source aware ---------------------
-- Staff enrolled for biometric attendance may have no app login (staff.user_id
-- is NULL), so a session's user_id can no longer be mandatory. The existing
-- partial unique index on user_id keeps treating NULLs as distinct, so userless
-- sessions never collide with one another. Biometric pairing is by staff_id.
ALTER TABLE public.attendance_sessions ALTER COLUMN user_id DROP NOT NULL;

-- `source` records how a session was created: app check-in, a biometric/face
-- device punch, or a manual admin entry. Existing rows backfill to 'app'.
ALTER TABLE public.attendance_sessions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_sessions_source_check'
  ) THEN
    ALTER TABLE public.attendance_sessions
      ADD CONSTRAINT attendance_sessions_source_check
      CHECK (source IN ('app', 'biometric', 'face', 'manual'));
  END IF;
END $$;

-- ---- 1. biometric_devices ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.biometric_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label          text NOT NULL,
  outlet_id      uuid REFERENCES public.outlets(id) ON DELETE SET NULL,
  type           text NOT NULL DEFAULT 'fingerprint',
  serial         text,
  status         text NOT NULL DEFAULT 'offline',
  last_seen_at   timestamptz,
  -- Only the SHA-256 hash of a device's API key is stored. The plaintext key is
  -- shown once at provisioning time and never persisted.
  api_key_hash   text,
  api_key_prefix text,
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT biometric_devices_type_check    CHECK (type   IN ('fingerprint', 'face')),
  CONSTRAINT biometric_devices_status_check  CHECK (status IN ('online', 'offline')),
  CONSTRAINT biometric_devices_serial_unique UNIQUE (serial)
);

CREATE INDEX IF NOT EXISTS biometric_devices_outlet_idx ON public.biometric_devices(outlet_id);

ALTER TABLE public.biometric_devices ENABLE ROW LEVEL SECURITY;

-- Device rows carry the API-key hash, so reads are owner/admin only.
DROP POLICY IF EXISTS "Owners and admins view devices"   ON public.biometric_devices;
DROP POLICY IF EXISTS "Owners and admins manage devices" ON public.biometric_devices;

CREATE POLICY "Owners and admins view devices"
  ON public.biometric_devices FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners and admins manage devices"
  ON public.biometric_devices FOR ALL TO authenticated
  USING      (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER biometric_devices_set_updated_at
  BEFORE UPDATE ON public.biometric_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- 2. biometric_enrolments ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.biometric_enrolments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  -- NULL device_id = a "global" enrolment usable on any device.
  device_id       uuid REFERENCES public.biometric_devices(id) ON DELETE SET NULL,
  kind            text NOT NULL DEFAULT 'fingerprint',
  -- Fingerprint template ref OR face vector ref. We store only references,
  -- never raw fingerprint images or face photos.
  template_ref    text,
  face_vector_ref text,
  status          text NOT NULL DEFAULT 'pending',
  enrolled_at     timestamptz,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT biometric_enrolments_kind_check   CHECK (kind   IN ('fingerprint', 'face')),
  CONSTRAINT biometric_enrolments_status_check CHECK (status IN ('pending', 'enrolled', 'failed')),
  CONSTRAINT biometric_enrolments_staff_device_unique UNIQUE (staff_id, device_id)
);

-- One global (device-independent) enrolment per staff. The UNIQUE above allows
-- repeated NULL device_id, so guard the global case explicitly.
CREATE UNIQUE INDEX IF NOT EXISTS biometric_enrolments_one_global_per_staff
  ON public.biometric_enrolments(staff_id) WHERE device_id IS NULL;

CREATE INDEX IF NOT EXISTS biometric_enrolments_staff_idx  ON public.biometric_enrolments(staff_id);
CREATE INDEX IF NOT EXISTS biometric_enrolments_status_idx ON public.biometric_enrolments(status);

ALTER TABLE public.biometric_enrolments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own or privileged enrolments"   ON public.biometric_enrolments;
DROP POLICY IF EXISTS "Owners and admins manage enrolments" ON public.biometric_enrolments;

-- Staff may see their own enrolment status; owner/admin/ca see all.
CREATE POLICY "View own or privileged enrolments"
  ON public.biometric_enrolments FOR SELECT TO authenticated
  USING (
    staff_id = public.get_user_staff_id(auth.uid())
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ca'::app_role)
  );

CREATE POLICY "Owners and admins manage enrolments"
  ON public.biometric_enrolments FOR ALL TO authenticated
  USING      (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER biometric_enrolments_set_updated_at
  BEFORE UPDATE ON public.biometric_enrolments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- 3. punch_events (idempotent raw inbox) ---------------------------------
CREATE TABLE IF NOT EXISTS public.punch_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  device_id  uuid REFERENCES public.biometric_devices(id) ON DELETE SET NULL,
  ts         timestamptz NOT NULL,
  direction  text NOT NULL,
  method     text NOT NULL DEFAULT 'biometric',
  raw_ref    text,
  outlet_id  uuid REFERENCES public.outlets(id) ON DELETE SET NULL,
  geo        jsonb,
  -- The attendance_sessions row this punch opened or closed (set by ingest).
  session_id uuid REFERENCES public.attendance_sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT punch_events_direction_check CHECK (direction IN ('in', 'out')),
  CONSTRAINT punch_events_method_check    CHECK (method    IN ('biometric', 'face', 'app', 'manual')),
  -- Idempotency: the same physical punch (device, instant, staff) lands once.
  CONSTRAINT punch_events_dedup_unique UNIQUE (device_id, ts, staff_id)
);

CREATE INDEX IF NOT EXISTS punch_events_staff_ts_idx  ON public.punch_events(staff_id, ts DESC);
CREATE INDEX IF NOT EXISTS punch_events_device_ts_idx ON public.punch_events(device_id, ts DESC);

ALTER TABLE public.punch_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Privileged view punch events" ON public.punch_events;
DROP POLICY IF EXISTS "Owners manage punch events"   ON public.punch_events;

-- Raw punch log is audit data: privileged read only. Writes go through the
-- ingest edge function (service role, which bypasses RLS).
CREATE POLICY "Privileged view punch events"
  ON public.punch_events FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ca'::app_role)
  );

CREATE POLICY "Owners manage punch events"
  ON public.punch_events FOR ALL TO authenticated
  USING      (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

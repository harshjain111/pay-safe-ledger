-- ============================================================================
-- Phase B — Attendance policy engine (config model).
--
-- Configurable late / missed-punch / operation-day rules, resolvable at three
-- scopes with override precedence: per-STAFF (special treatment) > per-OUTLET >
-- GLOBAL default. Covers:
--   item 2  late/on-time (grace_minutes, half_day_after_minutes)
--   item 3  missed punch -> cancel/half-day the day, outlet-wise + per-user
--   item 14 outlet operation-day different from the calendar day (day_start_hour)
-- The pure resolution + evaluation logic lives in src/lib/attendance-policy.ts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attendance_policies (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                  text NOT NULL CHECK (scope IN ('global', 'outlet', 'staff')),
  outlet_id              uuid REFERENCES public.outlets(id) ON DELETE CASCADE,
  staff_id               uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  -- Late if check-in is more than this many minutes after shift start.
  grace_minutes          integer NOT NULL DEFAULT 10 CHECK (grace_minutes >= 0),
  -- If late by more than this, count the day as a half day (NULL = never).
  half_day_after_minutes integer CHECK (half_day_after_minutes IS NULL OR half_day_after_minutes >= 0),
  -- What to do when a punch (in or out) is missing for the day.
  missed_punch_action    text NOT NULL DEFAULT 'flag'
                         CHECK (missed_punch_action IN ('none', 'flag', 'half_day', 'cancel_day')),
  -- Operation day boundary: hour (0-23, local) at which a new work-day begins.
  -- 0 = calendar day; e.g. 5 = the work-day runs 5am..4:59am next day (night shifts).
  day_start_hour         integer NOT NULL DEFAULT 0 CHECK (day_start_hour BETWEEN 0 AND 23),
  is_active              boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- scope columns must match the scope
  CONSTRAINT attendance_policies_scope_cols CHECK (
    (scope = 'global' AND outlet_id IS NULL AND staff_id IS NULL) OR
    (scope = 'outlet' AND outlet_id IS NOT NULL AND staff_id IS NULL) OR
    (scope = 'staff'  AND staff_id  IS NOT NULL AND outlet_id IS NULL)
  )
);

-- One policy per scope target.
CREATE UNIQUE INDEX IF NOT EXISTS attendance_policies_global_uq ON public.attendance_policies ((true)) WHERE scope = 'global';
CREATE UNIQUE INDEX IF NOT EXISTS attendance_policies_outlet_uq ON public.attendance_policies (outlet_id) WHERE scope = 'outlet';
CREATE UNIQUE INDEX IF NOT EXISTS attendance_policies_staff_uq  ON public.attendance_policies (staff_id)  WHERE scope = 'staff';

ALTER TABLE public.attendance_policies ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can READ (the attendance/settlement engine needs it).
DROP POLICY IF EXISTS "Read attendance policies" ON public.attendance_policies;
CREATE POLICY "Read attendance policies"
  ON public.attendance_policies FOR SELECT TO authenticated USING (true);

-- Manage: owners, or anyone granted the attendance-settings permission.
DROP POLICY IF EXISTS "Manage attendance policies" ON public.attendance_policies;
CREATE POLICY "Manage attendance policies"
  ON public.attendance_policies FOR ALL TO authenticated
  USING      (public.has_permission(auth.uid(), 'settings.attendance.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.attendance.edit'));

DROP TRIGGER IF EXISTS attendance_policies_set_updated_at ON public.attendance_policies;
CREATE TRIGGER attendance_policies_set_updated_at
  BEFORE UPDATE ON public.attendance_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the global default so resolution always has a base.
INSERT INTO public.attendance_policies (scope, grace_minutes, missed_punch_action, day_start_hour)
VALUES ('global', 10, 'flag', 0)
ON CONFLICT DO NOTHING;

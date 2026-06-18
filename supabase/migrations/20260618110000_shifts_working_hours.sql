-- ============================================================================
-- SHIFTS & ROSTER (1/2) — per-weekday shift timings + working-hour config
-- ============================================================================
-- Extends the EXISTING shifts table + hr_pay_rules scorer (read by
-- computeDayBreakdown / the settlement engine) rather than forking them.
-- ============================================================================

-- 1. shifts: alias / colour / description / per-day toggle / break / Open Shift
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS alias                text,
  ADD COLUMN IF NOT EXISTS color                text,
  ADD COLUMN IF NOT EXISTS description          text,
  ADD COLUMN IF NOT EXISTS is_one_time_all_days boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_break            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_open              boolean NOT NULL DEFAULT false; -- Open Shift = no fixed timing

-- Per-weekday timing table (0=Sun .. 6=Sat). Open shifts simply have no rows.
CREATE TABLE IF NOT EXISTS public.shift_day_timing (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id    uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  time,
  end_time    time,
  break_start time,
  break_end   time,
  CONSTRAINT shift_day_timing_unique UNIQUE (shift_id, weekday)
);
CREATE INDEX IF NOT EXISTS shift_day_timing_shift_idx ON public.shift_day_timing(shift_id);

ALTER TABLE public.shift_day_timing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view shift day timings"
  ON public.shift_day_timing FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners and admins manage shift day timings"
  ON public.shift_day_timing FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- Backfill: each existing shift becomes one-time-all-days with its single
-- check_in/check_out replicated across all 7 weekdays (no data lost).
INSERT INTO public.shift_day_timing (shift_id, weekday, start_time, end_time)
SELECT s.id, gs.wd, s.check_in_time, s.check_out_time
FROM public.shifts s
CROSS JOIN generate_series(0, 6) AS gs(wd)
WHERE s.check_in_time IS NOT NULL
ON CONFLICT (shift_id, weekday) DO NOTHING;

-- 2. working-hour config — extend the existing hr_pay_rules scorer ------------
ALTER TABLE public.hr_pay_rules
  ADD COLUMN IF NOT EXISTS attendance_mode        text NOT NULL DEFAULT 'ALL_PUNCH',
  ADD COLUMN IF NOT EXISTS is_shift_wise_work_hrs boolean NOT NULL DEFAULT false; -- false = FIXED hrs/day

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hr_pay_rules_attendance_mode_check') THEN
    ALTER TABLE public.hr_pay_rules ADD CONSTRAINT hr_pay_rules_attendance_mode_check
      CHECK (attendance_mode IN ('ALL_PUNCH', 'FIRST_LAST_ONLY', 'SINGLE_PUNCH_FULL', 'DEFAULT_FULL'));
  END IF;
END $$;

-- Config history so changes take effect "from the next day" and stay auditable.
-- The scorer reads the row whose effective_from is the latest <= the scored date.
CREATE TABLE IF NOT EXISTS public.working_hour_config_history (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from         date NOT NULL,
  full_day_minutes       integer NOT NULL,
  half_day_minutes       integer NOT NULL,
  attendance_mode        text NOT NULL,
  is_shift_wise_work_hrs boolean NOT NULL DEFAULT false,
  created_by             uuid REFERENCES auth.users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whc_thresholds CHECK (half_day_minutes >= 0 AND full_day_minutes >= half_day_minutes),
  CONSTRAINT whc_mode_check CHECK (attendance_mode IN ('ALL_PUNCH', 'FIRST_LAST_ONLY', 'SINGLE_PUNCH_FULL', 'DEFAULT_FULL'))
);
CREATE INDEX IF NOT EXISTS whc_effective_idx ON public.working_hour_config_history(effective_from);

ALTER TABLE public.working_hour_config_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view working hour history"
  ON public.working_hour_config_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners and admins manage working hour history"
  ON public.working_hour_config_history FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- Seed history from the current singleton so the scorer always finds a row.
INSERT INTO public.working_hour_config_history (effective_from, full_day_minutes, half_day_minutes, attendance_mode, is_shift_wise_work_hrs)
SELECT '2000-01-01'::date, full_day_minutes, half_day_minutes, attendance_mode, is_shift_wise_work_hrs
FROM public.hr_pay_rules
LIMIT 1;

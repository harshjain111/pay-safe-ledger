-- ============================================================================
-- SHIFTS & ROSTER (2/2) — weekly template + §7 sparse roster / auto-promote
-- ============================================================================
-- shift_assignment + week_off = the repeating WEEKLY template.
-- staff_roster gains status/source so it implements the §7 model:
--   no row OR status='OFF'  -> OFF (the engine's unscheduled_is_off already
--                              treats a missing row as off, so "sparse = off"
--                              already holds); a check-in upserts an AUTO_PRESENT
--                              row (source AUTO_CHECKIN). is_off stays in sync so
--                              the existing settlement engine read is unchanged.
-- ============================================================================

-- 1. Weekly shift assignment (per employee per weekday) ----------------------
CREATE TABLE IF NOT EXISTS public.shift_assignment (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id  uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  weekday   smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  shift_id  uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shift_assignment_unique UNIQUE (staff_id, weekday)
);
CREATE INDEX IF NOT EXISTS shift_assignment_staff_idx ON public.shift_assignment(staff_id);

-- 2. Weekly off pattern (tri-state per weekday) ------------------------------
CREATE TABLE IF NOT EXISTS public.week_off (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id  uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  weekday   smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  state     text NOT NULL DEFAULT 'WORKING'
              CHECK (state IN ('WORKING', 'WEEK_OFF', 'OCCASIONAL_WEEK_OFF')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT week_off_unique UNIQUE (staff_id, weekday)
);
CREATE INDEX IF NOT EXISTS week_off_staff_idx ON public.week_off(staff_id);

ALTER TABLE public.shift_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.week_off         ENABLE ROW LEVEL SECURITY;

-- Reviewers + the staff member read their own template; owners/admins manage.
CREATE POLICY "Reviewers and own staff read shift assignment"
  ON public.shift_assignment FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR staff_id = public.get_user_staff_id(auth.uid())
  );
CREATE POLICY "Owners and admins manage shift assignment"
  ON public.shift_assignment FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Reviewers and own staff read week off"
  ON public.week_off FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR staff_id = public.get_user_staff_id(auth.uid())
  );
CREATE POLICY "Owners and admins manage week off"
  ON public.week_off FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER shift_assignment_set_updated_at
  BEFORE UPDATE ON public.shift_assignment
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER week_off_set_updated_at
  BEFORE UPDATE ON public.week_off
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. staff_roster: §7 status + source (sparse roster + auto-promote) ---------
ALTER TABLE public.staff_roster
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'SCHEDULED',
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_roster_status_check') THEN
    ALTER TABLE public.staff_roster ADD CONSTRAINT staff_roster_status_check
      CHECK (status IN ('SCHEDULED', 'OFF', 'AUTO_PRESENT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_roster_source_check') THEN
    ALTER TABLE public.staff_roster ADD CONSTRAINT staff_roster_source_check
      CHECK (source IN ('TEMPLATE', 'MANUAL', 'AUTO_CHECKIN'));
  END IF;
END $$;

-- Backfill status from the legacy is_off flag (kept in sync going forward so the
-- existing settlement-engine read of is_off is unchanged).
UPDATE public.staff_roster SET status = CASE WHEN is_off THEN 'OFF' ELSE 'SCHEDULED' END
WHERE status = 'SCHEDULED';

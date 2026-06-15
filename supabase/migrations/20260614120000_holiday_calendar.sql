-- ============================================================================
-- HOLIDAY CALENDAR
--
--   holidays            -> a holiday (name, date, type, paid?, recurring?)
--   holiday_assignments -> which outlets / staff a non-org-wide holiday covers
--
-- A mandatory (type='public') PAID holiday that applies to a staff member is
-- injected into computeDayBreakdown as a paid non-working (off) day — so it
-- pays like a weekly-off and, when worked, earns the existing comp-off/OT.
-- Optional / restricted holidays are shown on the calendar but not auto-applied.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.holidays (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  date             date NOT NULL,
  type             text NOT NULL DEFAULT 'public',
  -- Paid non-working day when true (the common case); a per-holiday override of
  -- the "holidays are paid" rule.
  is_paid          boolean NOT NULL DEFAULT true,
  -- The day/month repeats every year (e.g. 26 Jan). The stored `date` is the
  -- canonical occurrence; other years are projected from its month+day.
  recurring_yearly boolean NOT NULL DEFAULT false,
  -- true = applies to everyone; false = scoped by holiday_assignments.
  org_wide         boolean NOT NULL DEFAULT true,
  note             text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT holidays_type_check CHECK (type IN ('public', 'optional', 'restricted'))
);

CREATE INDEX IF NOT EXISTS holidays_date_idx ON public.holidays(date);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view holidays"      ON public.holidays;
DROP POLICY IF EXISTS "Owners and admins manage holidays" ON public.holidays;

-- All signed-in users can see the holiday calendar; owner/admin manage it.
CREATE POLICY "Authenticated view holidays"
  ON public.holidays FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners and admins manage holidays"
  ON public.holidays FOR ALL TO authenticated
  USING      (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER holidays_set_updated_at
  BEFORE UPDATE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- assignments (only used when org_wide = false) -------------------------
CREATE TABLE IF NOT EXISTS public.holiday_assignments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_id uuid NOT NULL REFERENCES public.holidays(id) ON DELETE CASCADE,
  outlet_id  uuid REFERENCES public.outlets(id) ON DELETE CASCADE,
  staff_id   uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- An assignment targets either an outlet (branch) or a single staff member.
  CONSTRAINT holiday_assignments_target_check CHECK (outlet_id IS NOT NULL OR staff_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS holiday_assignments_holiday_idx ON public.holiday_assignments(holiday_id);
CREATE INDEX IF NOT EXISTS holiday_assignments_outlet_idx  ON public.holiday_assignments(outlet_id);
CREATE INDEX IF NOT EXISTS holiday_assignments_staff_idx   ON public.holiday_assignments(staff_id);

ALTER TABLE public.holiday_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view holiday assignments"      ON public.holiday_assignments;
DROP POLICY IF EXISTS "Owners and admins manage holiday assignments" ON public.holiday_assignments;

CREATE POLICY "Authenticated view holiday assignments"
  ON public.holiday_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Owners and admins manage holiday assignments"
  ON public.holiday_assignments FOR ALL TO authenticated
  USING      (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

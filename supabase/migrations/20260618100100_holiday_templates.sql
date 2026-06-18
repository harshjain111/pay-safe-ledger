-- ============================================================================
-- HOLIDAY TEMPLATES — named bundles of (multi-day) holidays, assigned per staff
-- ============================================================================
-- Additive layer over the existing holiday subsystem. A template groups holidays
-- (each can span a date range). Assigning a template to a staff member makes its
-- dates count for that person — the settlement engine's resolveHolidayDatesForStaff
-- is extended (in the service layer) to UNION these dates, so template holidays
-- affect pay exactly like the existing scoped holidays. One active template per
-- staff member (re-assign replaces).
--
-- Note: the per-holiday table is named holiday_template_days (the spec's "holiday")
-- to avoid colliding with the existing public.holidays table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.holiday_template (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.holiday_template_days (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.holiday_template(id) ON DELETE CASCADE,
  name        text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT holiday_template_days_range_check CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS holiday_template_days_template_idx ON public.holiday_template_days(template_id);

CREATE TABLE IF NOT EXISTS public.employee_holiday_template (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.holiday_template(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  -- One active template per employee; re-assigning replaces (handled in service via upsert).
  CONSTRAINT employee_holiday_template_unique UNIQUE (staff_id)
);
CREATE INDEX IF NOT EXISTS employee_holiday_template_template_idx ON public.employee_holiday_template(template_id);

ALTER TABLE public.holiday_template          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holiday_template_days     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_holiday_template ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may read templates + their days (needed for the enrollment
-- dropdowns and the settlement engine's holiday resolution); a staff member sees
-- their own assignment, reviewers see all.
CREATE POLICY "Authenticated read holiday templates"
  ON public.holiday_template FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read holiday template days"
  ON public.holiday_template_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "Reviewers and own staff read holiday assignment"
  ON public.employee_holiday_template FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR staff_id = public.get_user_staff_id(auth.uid())
  );

-- Owners/admins manage templates, their days, and assignments.
CREATE POLICY "Owners and admins manage holiday templates"
  ON public.holiday_template FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners and admins manage holiday template days"
  ON public.holiday_template_days FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners and admins manage holiday assignment"
  ON public.employee_holiday_template FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER holiday_template_set_updated_at
  BEFORE UPDATE ON public.holiday_template
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

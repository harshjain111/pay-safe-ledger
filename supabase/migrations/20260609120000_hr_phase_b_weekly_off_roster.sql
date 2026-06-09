-- =============================================================================
-- HR Module — Phase B: weekly off + duty roster
-- =============================================================================
-- 6. Week-off per staff: a recurring weekly off day (0=Sunday .. 6=Saturday).
-- 7. Duty roster: one row per staff per date assigning either a shift or an off
--    day. The roster is the per-date schedule that the salary engine (item 14)
--    will later treat off days as PAID and detect "off day worked" against.
-- Non-breaking: new column is nullable; the new table is additive.
-- =============================================================================

-- 6. Weekly off day -----------------------------------------------------------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS weekly_off_day smallint
    CONSTRAINT staff_weekly_off_day_range
    CHECK (weekly_off_day IS NULL OR (weekly_off_day BETWEEN 0 AND 6));

-- 7. Duty roster --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_roster (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  roster_date date NOT NULL,
  shift_id    uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
  is_off      boolean NOT NULL DEFAULT false,
  note        text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_roster_unique UNIQUE (staff_id, roster_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_roster_date  ON public.staff_roster(roster_date);
CREATE INDEX IF NOT EXISTS idx_staff_roster_staff ON public.staff_roster(staff_id);

ALTER TABLE public.staff_roster ENABLE ROW LEVEL SECURITY;

-- Owners/admins (the managers) prepare the roster; finance roles can view it;
-- staff can see their own schedule.
CREATE POLICY "Owners and admins manage roster"
  ON public.staff_roster FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Finance roles view roster"
  ON public.staff_roster FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
    OR public.has_role(auth.uid(), 'ca'::app_role)
  );

CREATE POLICY "Staff view own roster"
  ON public.staff_roster FOR SELECT TO authenticated
  USING (staff_id = public.get_user_staff_id(auth.uid()));

CREATE TRIGGER trg_staff_roster_updated_at
  BEFORE UPDATE ON public.staff_roster
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

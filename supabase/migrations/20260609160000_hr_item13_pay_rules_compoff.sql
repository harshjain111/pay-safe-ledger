-- =============================================================================
-- HR Module — Item 13 + configurable attendance/pay rules
-- =============================================================================
-- The organization manager sets the day-classification + comp-off rules; changes
-- apply to settlements computed thereafter.
--   * full/half day worked-minute thresholds (present vs half vs absent)
--   * unscheduled_is_off: a day with NO shift allotted in the roster is treated as
--     an OFF day (paid), so a staff member is only ever "absent" on a day they were
--     actually scheduled to work but didn't attend (and had no approved leave).
--   * comp_off_enabled: working a rostered OFF day earns a carried-forward leave.
--
-- Comp-off is credited efficiently: each settlement persists that month's
-- off-days-worked; the pending-leave balance adds the year's sum to the quota.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hr_pay_rules (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_day_minutes   integer NOT NULL DEFAULT 480,
  half_day_minutes   integer NOT NULL DEFAULT 240,
  unscheduled_is_off boolean NOT NULL DEFAULT true,
  comp_off_enabled   boolean NOT NULL DEFAULT true,
  singleton          boolean NOT NULL DEFAULT true,
  updated_by         uuid REFERENCES auth.users(id),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_pay_rules_singleton UNIQUE (singleton),
  CONSTRAINT hr_pay_rules_thresholds CHECK (half_day_minutes >= 0 AND full_day_minutes >= half_day_minutes)
);

ALTER TABLE public.hr_pay_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view pay rules"
  ON public.hr_pay_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Owners and admins manage pay rules"
  ON public.hr_pay_rules FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.hr_pay_rules (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TRIGGER trg_hr_pay_rules_updated_at
  BEFORE UPDATE ON public.hr_pay_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Comp-off earned (off-days worked) recorded per settlement, for the balance.
ALTER TABLE public.salary_settlements
  ADD COLUMN IF NOT EXISTS comp_off_earned numeric;

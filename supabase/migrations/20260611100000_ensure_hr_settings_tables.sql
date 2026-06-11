-- =============================================================================
-- Ensure the HR settings tables exist: leave_settings + hr_pay_rules
-- =============================================================================
-- Symptom: the Settings page shows "Could not load leave settings" and
-- "Could not load attendance & pay rules" because these two tables are missing
-- from the live database — the original item-12/13 migrations
-- (20260609150000 / 20260609160000) were never applied to it.
--
-- This migration is fully IDEMPOTENT: it (re)creates the tables, RLS policies,
-- singleton seed rows and triggers only as needed, so it is safe whether the
-- tables already exist or not. It references functions/types that the live DB
-- already has (update_updated_at_column, has_role, app_role).
-- =============================================================================

-- ── Leave entitlement settings ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leave_settings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annual_quota numeric NOT NULL DEFAULT 12,
  accrual      text NOT NULL DEFAULT 'annual' CHECK (accrual IN ('annual', 'monthly')),
  singleton    boolean NOT NULL DEFAULT true,
  updated_by   uuid REFERENCES auth.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leave_settings_singleton UNIQUE (singleton)
);

ALTER TABLE public.leave_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view leave settings" ON public.leave_settings;
CREATE POLICY "Authenticated view leave settings"
  ON public.leave_settings FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Owners and admins manage leave settings" ON public.leave_settings;
CREATE POLICY "Owners and admins manage leave settings"
  ON public.leave_settings FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.leave_settings (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

DROP TRIGGER IF EXISTS trg_leave_settings_updated_at ON public.leave_settings;
CREATE TRIGGER trg_leave_settings_updated_at
  BEFORE UPDATE ON public.leave_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Attendance & pay rules ───────────────────────────────────────────────────
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

DROP POLICY IF EXISTS "Authenticated view pay rules" ON public.hr_pay_rules;
CREATE POLICY "Authenticated view pay rules"
  ON public.hr_pay_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Owners and admins manage pay rules" ON public.hr_pay_rules;
CREATE POLICY "Owners and admins manage pay rules"
  ON public.hr_pay_rules FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'owner'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.hr_pay_rules (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

DROP TRIGGER IF EXISTS trg_hr_pay_rules_updated_at ON public.hr_pay_rules;
CREATE TRIGGER trg_hr_pay_rules_updated_at
  BEFORE UPDATE ON public.hr_pay_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Column the comp-off balance + settlement code reads/writes.
ALTER TABLE public.salary_settlements
  ADD COLUMN IF NOT EXISTS comp_off_earned numeric;

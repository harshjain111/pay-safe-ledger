-- ============================================================================
-- PAYROLL GROUPS (batch processing + shared policy)
--
--   payroll_groups       -> a named policy (pay cycle, statutory defaults,
--                           rounding, default payment mode)
--   staff.payroll_group_id -> the group a staff belongs to (one each; NULL =
--                           the default group)
--
-- The group's policy applies to its members when running a batch settlement;
-- per-staff settlement (with manual overrides) keeps working for exceptions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_groups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  pay_cycle           text NOT NULL DEFAULT 'monthly',
  pf_default          boolean NOT NULL DEFAULT true,
  esi_default         boolean NOT NULL DEFAULT true,
  pt_default          boolean NOT NULL DEFAULT true,
  rounding            text NOT NULL DEFAULT 'none',
  payment_mode_default text NOT NULL DEFAULT 'bank_transfer',
  is_default          boolean NOT NULL DEFAULT false,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_groups_name_unique UNIQUE (name),
  CONSTRAINT payroll_groups_pay_cycle_check CHECK (pay_cycle IN ('monthly', 'weekly', 'biweekly')),
  CONSTRAINT payroll_groups_rounding_check  CHECK (rounding IN ('none', 'nearest', 'up', 'down'))
);

ALTER TABLE public.payroll_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view payroll groups" ON public.payroll_groups;
DROP POLICY IF EXISTS "Payroll managers manage groups"    ON public.payroll_groups;

CREATE POLICY "Authenticated view payroll groups"
  ON public.payroll_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Payroll managers manage groups"
  ON public.payroll_groups FOR ALL TO authenticated
  USING      (public.has_permission(auth.uid(), 'settings.payroll.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.payroll.edit'));

CREATE TRIGGER payroll_groups_set_updated_at
  BEFORE UPDATE ON public.payroll_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- A staff member belongs to one group (NULL falls back to the default group).
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS payroll_group_id uuid REFERENCES public.payroll_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS staff_payroll_group_idx ON public.staff(payroll_group_id);

-- Seed a single default group (the fallback for unassigned staff).
INSERT INTO public.payroll_groups (name, pay_cycle, is_default)
VALUES ('Default', 'monthly', true)
ON CONFLICT (name) DO NOTHING;

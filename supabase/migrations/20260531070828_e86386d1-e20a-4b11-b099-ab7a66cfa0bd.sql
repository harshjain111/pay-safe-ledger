
-- ============================================================
-- PAYROLL EXPANSION: structure, PT, loans, payslip snapshots
-- ============================================================

-- 1) Staff salary structure + PT exemption
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS basic_salary numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hra numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowances numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pt_exempt boolean NOT NULL DEFAULT false;

-- Backfill: existing rows treat current monthly_salary as Basic
UPDATE public.staff
SET basic_salary = monthly_salary
WHERE basic_salary = 0 AND monthly_salary > 0;

-- 2) Professional Tax settings on the singleton
ALTER TABLE public.payroll_statutory_settings
  ADD COLUMN IF NOT EXISTS pt_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pt_monthly_amount numeric NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS pt_min_gross numeric NOT NULL DEFAULT 15000;

-- 3) Settlement snapshot + new earnings/deductions
ALTER TABLE public.salary_settlements
  ADD COLUMN IF NOT EXISTS earnings_basic numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earnings_hra numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earnings_allowances numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS incentives numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_auto numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_override_reason text,
  ADD COLUMN IF NOT EXISTS pt_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loan_emi_total numeric NOT NULL DEFAULT 0;

-- 4) Staff loans
CREATE TABLE IF NOT EXISTS public.staff_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  principal numeric NOT NULL,
  emi_amount numeric NOT NULL,
  start_month text NOT NULL,        -- YYYY-MM
  remaining_balance numeric NOT NULL,
  status text NOT NULL DEFAULT 'active',  -- active | paused | closed
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_loans TO authenticated;
GRANT ALL ON public.staff_loans TO service_role;

ALTER TABLE public.staff_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage staff loans"
ON public.staff_loans FOR ALL TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Staff view own loans"
ON public.staff_loans FOR SELECT TO authenticated
USING (staff_id = get_user_staff_id(auth.uid()));

CREATE TRIGGER trg_staff_loans_updated_at
BEFORE UPDATE ON public.staff_loans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_staff_loans_staff ON public.staff_loans(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_loans_status ON public.staff_loans(status);

-- 5) Per-settlement loan deductions
CREATE TABLE IF NOT EXISTS public.salary_settlement_loan_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL,
  loan_id uuid NOT NULL,
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.salary_settlement_loan_deductions TO authenticated;
GRANT ALL ON public.salary_settlement_loan_deductions TO service_role;

ALTER TABLE public.salary_settlement_loan_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage loan deductions"
ON public.salary_settlement_loan_deductions FOR ALL TO authenticated
USING (has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Staff view own loan deductions"
ON public.salary_settlement_loan_deductions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.salary_settlements ss
  WHERE ss.id = settlement_id
    AND ss.staff_id = get_user_staff_id(auth.uid())
));

CREATE INDEX IF NOT EXISTS idx_loan_ded_settlement ON public.salary_settlement_loan_deductions(settlement_id);
CREATE INDEX IF NOT EXISTS idx_loan_ded_loan ON public.salary_settlement_loan_deductions(loan_id);

-- 6) Seed new accounts (idempotent)
INSERT INTO public.accounts (code, account_type, name, is_system, is_active)
VALUES
  ('1250', 'asset', 'Staff Loans', true, true),
  ('2300', 'liability', 'Professional Tax Payable', true, true),
  ('5070', 'expense', 'Bonus Expense', true, true),
  ('5080', 'expense', 'Overtime Expense', true, true)
ON CONFLICT (code) DO NOTHING;

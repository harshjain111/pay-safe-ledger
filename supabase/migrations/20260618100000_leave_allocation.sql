-- ============================================================================
-- LEAVES MODULE — auto-allocation / carry-forward cap / encashment + balances
-- ============================================================================
-- Extends the EXISTING leave subsystem (leave_types / leave_balances /
-- leave_records) rather than forking it, so the salary settlement engine stays
-- the single source of truth (it docks pay from approved leave_records).
--
-- Mapping vs the spec:
--   spec employee_id            -> staff_id (repo employee table = staff)
--   spec alias                  -> existing leave_types.code (unique short code)
--   spec carry_forward_leaves   -> the carry cap (supersedes the old bool + max_balance)
--   leave entitlement balances  -> employee_leave_balance (stored, job-maintained)
--   pay docking                 -> unchanged (leave_records.deduction_days)
-- ============================================================================

-- 1. leave_types: allocation / carry-forward / encashment config ------------
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS no_of_auto_allocation_leaves numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_allocation_period       text    NOT NULL DEFAULT 'MONTH',
  ADD COLUMN IF NOT EXISTS carry_forward_leaves         numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carry_forward_period         text    NOT NULL DEFAULT 'MONTH',
  ADD COLUMN IF NOT EXISTS encashment_enabled           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encashment_limit             numeric,
  ADD COLUMN IF NOT EXISTS encashment_period            text;

-- Period / conditional-encashment guards (idempotent add).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_types_auto_period_check') THEN
    ALTER TABLE public.leave_types ADD CONSTRAINT leave_types_auto_period_check
      CHECK (auto_allocation_period IN ('MONTH','YEAR'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_types_carry_period_check') THEN
    ALTER TABLE public.leave_types ADD CONSTRAINT leave_types_carry_period_check
      CHECK (carry_forward_period IN ('MONTH','YEAR'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leave_types_encash_check') THEN
    ALTER TABLE public.leave_types ADD CONSTRAINT leave_types_encash_check
      CHECK (
        (encashment_period IS NULL OR encashment_period IN ('MONTH','YEAR'))
        AND (NOT encashment_enabled OR encashment_limit IS NOT NULL)
      );
  END IF;
END $$;

-- Backfill the new columns from the legacy accrual/quota/carry config so the
-- existing live leave view and the new jobs start from the same numbers.
UPDATE public.leave_types SET
  no_of_auto_allocation_leaves = COALESCE(default_quota, 0),
  auto_allocation_period       = CASE WHEN accrual = 'monthly' THEN 'MONTH' ELSE 'YEAR' END,
  carry_forward_period         = CASE WHEN accrual = 'monthly' THEN 'MONTH' ELSE 'YEAR' END,
  carry_forward_leaves         = CASE WHEN carry_forward THEN COALESCE(max_balance, default_quota, 0) ELSE 0 END
WHERE no_of_auto_allocation_leaves = 0 AND carry_forward_leaves = 0;

-- 2. employee_leave_balance: the assign link + stored entitlement balance ----
CREATE TABLE IF NOT EXISTS public.employee_leave_balance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  balance       numeric(6,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_leave_balance_unique UNIQUE (staff_id, leave_type_id)
);
CREATE INDEX IF NOT EXISTS employee_leave_balance_staff_idx ON public.employee_leave_balance(staff_id);

ALTER TABLE public.employee_leave_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewers and own staff read leave balances"
  ON public.employee_leave_balance FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')  OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR staff_id = public.get_user_staff_id(auth.uid())
  );

CREATE POLICY "Owners and admins manage leave balances"
  ON public.employee_leave_balance FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER employee_leave_balance_set_updated_at
  BEFORE UPDATE ON public.employee_leave_balance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. leave_balance_adjustment: mandatory-remarks audit trail -----------------
CREATE TABLE IF NOT EXISTS public.leave_balance_adjustment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id      uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  old_balance   numeric(6,2) NOT NULL,
  new_balance   numeric(6,2) NOT NULL,
  remarks       text NOT NULL,
  adjusted_by   uuid REFERENCES auth.users(id),
  adjusted_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leave_balance_adjustment_staff_idx ON public.leave_balance_adjustment(staff_id, leave_type_id);

ALTER TABLE public.leave_balance_adjustment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviewers read leave adjustments"
  ON public.leave_balance_adjustment FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
  );

CREATE POLICY "Owners and admins write leave adjustments"
  ON public.leave_balance_adjustment FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

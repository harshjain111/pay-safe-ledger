-- ============================================================================
-- SALARY ARREARS (back-pay / recovery)
--
--   salary_arrears -> a signed adjustment (amount > 0 = back-pay, < 0 = recovery)
--                     for a staff member, relating to some period, to be paid in
--                     a chosen settlement month.
--
-- When the chosen month is settled, pending arrears for that staff are added as
-- a distinct line to net pay and posted to the ledger as their own balanced
-- double-entry, then marked settled + linked to the settlement.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.salary_arrears (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  amount           numeric NOT NULL, -- signed: + back-pay, - recovery
  reason           text NOT NULL,
  period_label     text,             -- the period this relates to (e.g. "Apr 2026")
  settlement_month text NOT NULL,    -- yyyy-MM: when it should be paid
  status           text NOT NULL DEFAULT 'pending',
  settlement_id    uuid REFERENCES public.salary_settlements(id) ON DELETE SET NULL,
  settled_at       timestamptz,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT salary_arrears_status_check CHECK (status IN ('pending', 'settled', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS salary_arrears_pending_idx ON public.salary_arrears(staff_id, settlement_month, status);

ALTER TABLE public.salary_arrears ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own or finance arrears" ON public.salary_arrears;
DROP POLICY IF EXISTS "Payroll managers manage arrears" ON public.salary_arrears;

CREATE POLICY "View own or finance arrears"
  ON public.salary_arrears FOR SELECT TO authenticated
  USING (
    staff_id = public.get_user_staff_id(auth.uid())
    OR has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
  );

CREATE POLICY "Payroll managers manage arrears"
  ON public.salary_arrears FOR ALL TO authenticated
  USING      (public.has_permission(auth.uid(), 'settings.payroll.edit'))
  WITH CHECK (public.has_permission(auth.uid(), 'settings.payroll.edit'));

CREATE TRIGGER salary_arrears_set_updated_at
  BEFORE UPDATE ON public.salary_arrears
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Persist the arrears total folded into each settlement (for display + audit).
ALTER TABLE public.salary_settlements
  ADD COLUMN IF NOT EXISTS arrears numeric NOT NULL DEFAULT 0;

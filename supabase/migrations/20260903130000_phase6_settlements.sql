-- ============================================================================
-- PHASE 6 (Attendo rebuild): the Settlements group.
--
-- 1. staff_loans grows a display name and an instrument type (Advance | Loan)
--    for the Advances page, gains an audit trigger, and finance users
--    (payouts.execute) can manage instruments — the page is finance-facing.
-- 2. salary_arrears learns 'written_off': an abrupt leaver's unpaid liability
--    must close VISIBLY (reason + reversing journal), not vanish. Also gains
--    an updated status check and the write-off audit columns.
-- 3. salary_settlement_loan_deductions accepts permission-based writes (the
--    settle path now records per-loan recoveries and decrements balances).
-- 4. approvals.approve narrowed to Owner + Administrator only (client
--    decision: advances are approved by Admin; the maker-checker trigger
--    already blocks self-approval and stays untouched).
-- ============================================================================

-- ---- 1. staff_loans ---------------------------------------------------------
ALTER TABLE public.staff_loans
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS loan_type text NOT NULL DEFAULT 'loan';

DO $$ BEGIN
  ALTER TABLE public.staff_loans
    ADD CONSTRAINT staff_loans_type_check CHECK (loan_type IN ('advance', 'loan'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS audit_staff_loans ON public.staff_loans;
CREATE TRIGGER audit_staff_loans
AFTER INSERT OR UPDATE OR DELETE ON public.staff_loans
FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();

DROP POLICY IF EXISTS "Finance can manage staff loans" ON public.staff_loans;
CREATE POLICY "Finance can manage staff loans"
  ON public.staff_loans FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'payouts.execute'))
  WITH CHECK (public.has_permission(auth.uid(), 'payouts.execute'));

-- ---- 2. salary_arrears: written_off ----------------------------------------
ALTER TABLE public.salary_arrears
  ADD COLUMN IF NOT EXISTS written_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS written_off_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS written_off_reason text;

ALTER TABLE public.salary_arrears DROP CONSTRAINT IF EXISTS salary_arrears_status_check;
ALTER TABLE public.salary_arrears
  ADD CONSTRAINT salary_arrears_status_check
  CHECK (status IN ('pending', 'settled', 'cancelled', 'written_off'));

-- ---- 3. loan deduction rows from the settle path ---------------------------
DROP POLICY IF EXISTS "Settlement runners record loan deductions" ON public.salary_settlement_loan_deductions;
CREATE POLICY "Settlement runners record loan deductions"
  ON public.salary_settlement_loan_deductions FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'settlements.run'));

-- ---- 4. narrow advance/expense approval to Owner + Administrator -----------
UPDATE public.rights_templates
   SET permissions = array_remove(permissions, 'approvals.approve')
 WHERE is_builtin
   AND NOT is_owner
   AND role_key IS DISTINCT FROM 'admin'
   AND permissions @> '{approvals.approve}'::text[];

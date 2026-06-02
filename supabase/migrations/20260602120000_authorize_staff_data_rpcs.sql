-- =============================================================================
-- Per-function authorization for SECURITY DEFINER staff-data RPCs
-- =============================================================================
-- Finding (lint 0029): several SECURITY DEFINER functions accept a _staff_id and
-- return that staff member's financial data, but perform NO authorization check.
-- Because they run as definer (bypassing RLS), ANY signed-in user could call them
-- with an arbitrary _staff_id and read another staff member's salary, advances,
-- payables, leave records, settlement status, etc. (an IDOR).
--
-- We do NOT blanket-revoke EXECUTE (lint 0028/0029's blunt suggestion): some of
-- these helpers -- and the role helpers they rely on -- are invoked as the
-- authenticated user and must stay executable, and several RPCs are called
-- legitimately from the client. Instead each function now authorizes its caller
-- in-body via a small assert helper, mapped to the role(s) that legitimately use
-- it (verified against every frontend call-site + the role-segmented nav):
--
--   owner only ............. get_staff_salary_for_month, is_salary_settled,
--                            validate_settlement, get_system_deduction_days,
--                            get_monthly_leave_records       (Settlements / owner nav)
--   finance or admin ....... get_advances_outstanding (SalariesAdvances, owner nav;
--                            owner is a finance user), get_reconciliation_status
--                            (no client caller), get_staff_journal_balance (unused helper)
--   finance/admin OR self .. get_staff_advances_from_journals,
--                            get_staff_payable_from_journals (useStaffBalance ->
--                            StaffDashboard reads the caller's OWN id; also used by
--                            owner on Settlements)
--   reporting roles ........ get_trial_balance (Reports nav: owner, accountant,
--                            admin, ca)
--
-- auth.uid() inside a SECURITY DEFINER function reads the request JWT claim, so it
-- correctly identifies the calling user. The role helpers (has_role,
-- is_finance_user, is_admin, get_user_staff_id) are themselves SECURITY DEFINER and
-- already exist. Each function body is reproduced verbatim with a single PERFORM
-- guard inserted as the first statement; nothing else changes.
-- =============================================================================

-- 0. Authorization helpers ----------------------------------------------------
-- Raise a 42501 (insufficient_privilege) so PostgREST surfaces a clean 403 to the
-- client instead of leaking any row. void return; falling through = authorized.

CREATE OR REPLACE FUNCTION public.assert_owner()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'owner') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_finance_or_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_finance_user(auth.uid()) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_staff_finance_access(_staff_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_finance_user(auth.uid())
    OR public.is_admin(auth.uid())
    OR _staff_id = public.get_user_staff_id(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_reporting_access()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_finance_user(auth.uid())
    OR public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'ca')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- 1. owner-only ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_staff_salary_for_month(_staff_id uuid, _month text)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  month_start DATE;
  month_end DATE;
  salary NUMERIC;
  staff_current_salary NUMERIC;
BEGIN
  PERFORM public.assert_owner();

  -- Convert YYYY-MM to date range
  month_start := (_month || '-01')::DATE;
  month_end := (month_start + INTERVAL '1 month - 1 day')::DATE;

  -- First, get the current staff salary as fallback
  SELECT monthly_salary INTO staff_current_salary
  FROM public.staff
  WHERE id = _staff_id;

  -- Get the MOST RECENT salary that was effective during or before this month
  SELECT monthly_salary INTO salary
  FROM public.salary_history
  WHERE staff_id = _staff_id
    AND effective_from <= month_end
  ORDER BY effective_from DESC
  LIMIT 1;

  -- If no history found OR history salary is 0, use current staff salary
  -- This handles cases where salary was set after the settlement month
  IF salary IS NULL OR salary = 0 THEN
    salary := staff_current_salary;
  END IF;

  RETURN COALESCE(salary, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_salary_settled(_staff_id UUID, _month TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_owner();

  RETURN EXISTS (
    SELECT 1
    FROM public.salary_settlements
    WHERE staff_id = _staff_id
      AND settlement_month = _month
      AND status = 'settled'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_settlement(_staff_id UUID, _month TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_record RECORD;
  month_date DATE;
  result JSONB;
  is_settled BOOLEAN;
BEGIN
  PERFORM public.assert_owner();

  -- Parse month
  month_date := (_month || '-01')::DATE;

  -- Get staff record
  SELECT * INTO staff_record FROM public.staff WHERE id = _staff_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Staff not found');
  END IF;

  -- Check if already settled
  SELECT EXISTS(
    SELECT 1 FROM public.salary_settlements
    WHERE staff_id = _staff_id AND settlement_month = _month AND status = 'settled'
  ) INTO is_settled;

  IF is_settled THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Salary for this month is already settled');
  END IF;

  -- Check if month is in future
  IF month_date > date_trunc('month', CURRENT_DATE) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cannot settle future months');
  END IF;

  -- Check if month is before joining
  IF month_date < date_trunc('month', staff_record.date_of_joining) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cannot settle month before staff joining date');
  END IF;

  -- Check if staff is active
  IF NOT staff_record.is_active THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Staff is inactive', 'warning', true);
  END IF;

  RETURN jsonb_build_object('valid', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_system_deduction_days(_staff_id UUID, _month TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  month_start DATE;
  month_end DATE;
  total_deduction NUMERIC;
BEGIN
  PERFORM public.assert_owner();

  month_start := (_month || '-01')::DATE;
  month_end := (month_start + INTERVAL '1 month - 1 day')::DATE;

  SELECT COALESCE(SUM(deduction_days), 0)
  INTO total_deduction
  FROM public.leave_records
  WHERE staff_id = _staff_id
    AND leave_date >= month_start
    AND leave_date <= month_end
    AND status = 'approved';

  RETURN total_deduction;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_monthly_leave_records(_staff_id UUID, _month TEXT)
RETURNS TABLE (
  id UUID,
  leave_date DATE,
  leave_type leave_type,
  deduction_days NUMERIC,
  remarks TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  month_start DATE;
  month_end DATE;
BEGIN
  PERFORM public.assert_owner();

  month_start := (_month || '-01')::DATE;
  month_end := (month_start + INTERVAL '1 month - 1 day')::DATE;

  RETURN QUERY
  SELECT
    lr.id,
    lr.leave_date,
    lr.leave_type,
    lr.deduction_days,
    lr.remarks
  FROM public.leave_records lr
  WHERE lr.staff_id = _staff_id
    AND lr.leave_date >= month_start
    AND lr.leave_date <= month_end
    AND lr.status = 'approved'
  ORDER BY lr.leave_date;
END;
$$;

-- 2. finance or admin ---------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_advances_outstanding(_staff_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total NUMERIC;
BEGIN
  PERFORM public.assert_finance_or_admin();

  SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0) INTO total
  FROM public.ledger_entries
  WHERE staff_id = _staff_id
    AND tag = 'advance';

  RETURN total;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_reconciliation_status(_staff_id UUID, _month TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settlement_record RECORD;
  total_ledger_credit NUMERIC;
  result JSONB;
BEGIN
  PERFORM public.assert_finance_or_admin();

  -- Get settlement
  SELECT * INTO settlement_record
  FROM public.salary_settlements
  WHERE staff_id = _staff_id AND settlement_month = _month;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_settled',
      'matched', false,
      'message', 'No settlement found for this month'
    );
  END IF;

  -- Get total credits from ledger for this month
  SELECT COALESCE(SUM(credit), 0) INTO total_ledger_credit
  FROM public.ledger_entries
  WHERE staff_id = _staff_id
    AND reference_month = _month
    AND voucher_type = 'settlement';

  -- Check if amounts match
  IF total_ledger_credit = settlement_record.balance_payable THEN
    RETURN jsonb_build_object(
      'status', 'matched',
      'matched', true,
      'settlement_amount', settlement_record.balance_payable,
      'ledger_amount', total_ledger_credit,
      'message', 'Settlement and ledger amounts match'
    );
  ELSE
    RETURN jsonb_build_object(
      'status', 'mismatch',
      'matched', false,
      'settlement_amount', settlement_record.balance_payable,
      'ledger_amount', total_ledger_credit,
      'difference', settlement_record.balance_payable - total_ledger_credit,
      'message', 'Mismatch between settlement and ledger'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_staff_journal_balance(_staff_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  balance NUMERIC;
BEGIN
  PERFORM public.assert_finance_or_admin();

  -- Credit balance = Smokzy owes staff (positive = payable to staff)
  -- Debit balance = Staff owes Smokzy (negative = receivable from staff)
  SELECT COALESCE(SUM(credit) - SUM(debit), 0) INTO balance
  FROM public.journal_lines
  WHERE staff_id = _staff_id;

  RETURN balance;
END;
$$;

-- 3. finance / admin OR the staff member themselves ---------------------------

CREATE OR REPLACE FUNCTION public.get_staff_advances_from_journals(_staff_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  advances NUMERIC;
BEGIN
  PERFORM public.assert_staff_finance_access(_staff_id);

  -- Get balance from Staff Advances account (code 1200)
  -- Debit = staff owes us, Credit = adjustment/repayment
  SELECT COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)
  INTO advances
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  WHERE jl.staff_id = _staff_id
    AND a.code = '1200'; -- Staff Advances account

  RETURN advances;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_staff_payable_from_journals(_staff_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  payable NUMERIC;
BEGIN
  PERFORM public.assert_staff_finance_access(_staff_id);

  -- Get balance from Staff Payable account (code 2000)
  -- Credit = we owe staff, Debit = payment made
  SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)
  INTO payable
  FROM journal_lines jl
  JOIN accounts a ON a.id = jl.account_id
  WHERE jl.staff_id = _staff_id
    AND a.code = '2000'; -- Staff Payable account

  RETURN payable;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 4. reporting roles (owner / accountant / admin / ca) ------------------------

CREATE OR REPLACE FUNCTION public.get_trial_balance()
RETURNS TABLE (
  account_code TEXT,
  account_name TEXT,
  account_type TEXT,
  total_debit NUMERIC,
  total_credit NUMERIC,
  balance NUMERIC
) AS $$
BEGIN
  PERFORM public.assert_reporting_access();

  RETURN QUERY
  SELECT
    a.code AS account_code,
    a.name AS account_name,
    a.account_type,
    COALESCE(SUM(jl.debit), 0) AS total_debit,
    COALESCE(SUM(jl.credit), 0) AS total_credit,
    CASE
      -- Asset & Expense accounts: Debit balance
      WHEN a.account_type IN ('asset', 'expense') THEN
        COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
      -- Liability, Equity & Income accounts: Credit balance
      ELSE
        COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0)
    END AS balance
  FROM accounts a
  LEFT JOIN journal_lines jl ON jl.account_id = a.id
  WHERE a.is_active = true
  GROUP BY a.id, a.code, a.name, a.account_type
  ORDER BY a.code;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

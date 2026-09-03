-- ============================================================================
-- Opening balances for a date-filtered ledger.
--
-- The Ledger page has always had a month dropdown, defaulting to the current
-- month — but the filter was never applied to the query, so the page read every
-- journal line ever written and changing the month did nothing. Applying the
-- filter naively would have been worse than leaving it: the page derives BOTH
-- the running balance column AND each staff member's outstanding balance by
-- summing the rows it fetched, so restricting the rows to one month would have
-- silently reported one month's movement as the amount owed.
--
-- A ledger period therefore needs what it was missing: the balance carried in.
-- This returns, per staff member, the debit/credit totals on the two accounts
-- the page reconciles — 2000 Staff Payable and 1200 Staff Advances — for every
-- entry strictly BEFORE the period start. The page seeds its running balance
-- with it and adds it to each staff balance, so the numbers on screen stay the
-- true position while only one month of rows is fetched.
--
-- Aggregated in SQL on purpose: the point is to avoid shipping the history to
-- the browser, so returning one row per staff rather than every prior line is
-- the whole benefit.
--
-- SECURITY INVOKER: runs as the caller, so the same row-level policies that
-- govern the ledger query itself decide what is counted here. A staff user
-- reads only their own lines, exactly as before.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_staff_ledger_opening(
  _before   date,
  _staff_id uuid DEFAULT NULL
)
RETURNS TABLE (
  staff_id       uuid,
  payable_debit  numeric,
  payable_credit numeric,
  advance_debit  numeric,
  advance_credit numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jl.staff_id,
         COALESCE(SUM(jl.debit)  FILTER (WHERE a.code = '2000'), 0)::numeric,
         COALESCE(SUM(jl.credit) FILTER (WHERE a.code = '2000'), 0)::numeric,
         COALESCE(SUM(jl.debit)  FILTER (WHERE a.code = '1200'), 0)::numeric,
         COALESCE(SUM(jl.credit) FILTER (WHERE a.code = '1200'), 0)::numeric
    FROM public.journal_lines jl
    JOIN public.accounts a        ON a.id = jl.account_id
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
   WHERE jl.staff_id IS NOT NULL
     AND (_staff_id IS NULL OR jl.staff_id = _staff_id)
     AND je.entry_date < _before
   GROUP BY jl.staff_id;
$$;

COMMENT ON FUNCTION public.get_staff_ledger_opening(date, uuid) IS
  'Per-staff opening balances (accounts 2000/1200) for entries before _before. Lets the Ledger fetch one period of rows without misreporting the amount owed.';

GRANT EXECUTE ON FUNCTION public.get_staff_ledger_opening(date, uuid) TO authenticated;

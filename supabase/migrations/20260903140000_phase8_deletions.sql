-- ============================================================================
-- PHASE 8 (Attendo rebuild): delete the modules the client does not want.
-- Order and scope follow the plan exactly; the load-bearing pieces stay:
--   * KEPT: bulk_update_salaries (only writer of salary_history),
--     staff_roster (input to pay + storage behind Bulk Attendance),
--     every holiday table (the engine reads them; empty = harmless no-op),
--     all historical journal_entries / journal_lines (Trial Balance),
--     the 'petty_cash' value of the payment_mode enum (removing an enum
--     value means recreating the type across two tables — left defined and
--     unused), and Shifts (client decision: keep for now).
-- ============================================================================

-- ---- 1. Payroll Groups ------------------------------------------------------
-- settlement-engine.ts never reads payroll_group_id; the FK was SET NULL.
ALTER TABLE public.staff DROP COLUMN IF EXISTS payroll_group_id;
DROP TABLE IF EXISTS public.payroll_groups CASCADE;

-- ---- 3. Petty Cash ----------------------------------------------------------
-- The petty_cash payment mode and its transaction insert were removed from
-- Payouts in Phase 6; the table and balance RPC can now go.
DROP TABLE IF EXISTS public.petty_cash_transactions CASCADE;
DROP FUNCTION IF EXISTS public.get_petty_cash_balance();

-- Deactivate (NEVER delete) the Petty Cash account — historical journal_lines
-- may reference it.
UPDATE public.accounts SET is_active = false WHERE code = '1300';

-- ---- 4. Expenses ------------------------------------------------------------
-- Historical expense_approval / expense_payout journal rows are KEPT (they
-- share journal_entries/journal_lines with salary and advances; deleting them
-- breaks debit = credit). Only the module's own tables go.
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.custom_expense_categories CASCADE;

-- Deactivate (NEVER delete) the expense accounts.
UPDATE public.accounts SET is_active = false
 WHERE code IN ('5100', '5200', '5300', '5400', '5500', '5600', '5700');

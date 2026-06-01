-- =============================================================================
-- Fix: "Edge Function returned a non-2xx status code" when clearing transaction data
-- =============================================================================
-- Root cause:
--   admin_clear_transaction_data() used `SET session_replication_role = 'replica'`
--   to (a) bypass the immutability triggers on ledger_entries / journal_entries and
--   (b) disable FK enforcement during the bulk delete.
--
--   `session_replication_role` is a SUPERUSER-only (PGC_SUSET) GUC. It works in the
--   Supabase SQL editor (run as the privileged `postgres` role) but is DENIED when the
--   function is invoked through the edge function with the `service_role` key, so the
--   RPC raised `permission denied to set parameter "session_replication_role"`, the
--   edge function returned HTTP 500, and the UI showed a generic non-2xx error.
--
-- Fix:
--   Replace the superuser GUC with `ALTER TABLE ... DISABLE/ENABLE TRIGGER USER`, which
--   only requires TABLE OWNERSHIP. This function is SECURITY DEFINER and owned by
--   `postgres`, which owns these tables, so it can toggle their user triggers without
--   superuser. Disabling USER triggers turns off the immutability + audit triggers but
--   (unlike replica mode) LEAVES FOREIGN-KEY enforcement ON. We therefore:
--     1. Detach any out-of-range rows that reference an in-range parent (NULL the FK),
--     2. Delete the referencing/child tables before their parents (FK-safe order).
--
-- Net effect: identical data outcome, but it now works through the service-role edge
-- function. The whole body runs in the function's implicit subtransaction, so if any
-- statement fails the DISABLE TRIGGER changes are rolled back automatically (triggers
-- are restored) before the error is re-raised.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_clear_transaction_data(
  _date_from DATE,
  _date_to DATE,
  _owner_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_counts JSONB;
  je_count INTEGER := 0;
  jl_count INTEGER := 0;
  le_count INTEGER := 0;
  ss_count INTEGER := 0;
  pr_count INTEGER := 0;
  exp_count INTEGER := 0;
  notif_count INTEGER := 0;
  from_month TEXT;
  to_month TEXT;
  _date_to_end TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Verify the caller is an owner
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _owner_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Only owners can clear transaction data';
  END IF;

  -- Convert dates to month format for settlement lookup
  from_month := TO_CHAR(_date_from, 'YYYY-MM');
  to_month := TO_CHAR(_date_to, 'YYYY-MM');

  -- Convert end date to end of day timestamp for proper range comparison
  _date_to_end := (_date_to + INTERVAL '1 day')::TIMESTAMP WITH TIME ZONE;

  -- Temporarily disable USER triggers (immutability + audit) so immutable rows can be
  -- deleted. Requires only table ownership, NOT superuser, so it works via service_role.
  ALTER TABLE public.ledger_entries     DISABLE TRIGGER USER;
  ALTER TABLE public.journal_entries    DISABLE TRIGGER USER;
  ALTER TABLE public.journal_lines      DISABLE TRIGGER USER;
  ALTER TABLE public.salary_settlements DISABLE TRIGGER USER;
  ALTER TABLE public.expenses           DISABLE TRIGGER USER;
  ALTER TABLE public.payment_requests   DISABLE TRIGGER USER;

  -- FK enforcement stays ON, so detach any rows OUTSIDE the delete window that still
  -- point at an in-range parent we are about to remove (prevents FK violations without
  -- expanding the delete scope).
  UPDATE public.salary_settlements SET journal_entry_id = NULL
  WHERE journal_entry_id IN (
    SELECT id FROM public.journal_entries WHERE entry_date >= _date_from AND entry_date <= _date_to
  );

  UPDATE public.salary_settlements SET payout_journal_entry_id = NULL
  WHERE payout_journal_entry_id IN (
    SELECT id FROM public.journal_entries WHERE entry_date >= _date_from AND entry_date <= _date_to
  );

  UPDATE public.salary_settlements SET ledger_entry_id = NULL
  WHERE ledger_entry_id IN (
    SELECT id FROM public.ledger_entries WHERE entry_date >= _date_from AND entry_date <= _date_to
  );

  UPDATE public.expenses SET ledger_entry_id = NULL
  WHERE ledger_entry_id IN (
    SELECT id FROM public.ledger_entries WHERE entry_date >= _date_from AND entry_date <= _date_to
  );

  UPDATE public.payment_requests SET ledger_entry_id = NULL
  WHERE ledger_entry_id IN (
    SELECT id FROM public.ledger_entries WHERE entry_date >= _date_from AND entry_date <= _date_to
  );

  -- Delete in FK-safe order: children / referencing rows first, then their parents.

  -- 1. journal_lines (child of journal_entries)
  DELETE FROM public.journal_lines
  WHERE journal_entry_id IN (
    SELECT id FROM public.journal_entries
    WHERE entry_date >= _date_from AND entry_date <= _date_to
  );
  GET DIAGNOSTICS jl_count = ROW_COUNT;

  -- 2. salary_settlements (references journal_entries AND ledger_entries)
  DELETE FROM public.salary_settlements
  WHERE settlement_month >= from_month AND settlement_month <= to_month;
  GET DIAGNOSTICS ss_count = ROW_COUNT;

  -- 3. expenses (references ledger_entries)
  DELETE FROM public.expenses
  WHERE expense_date >= _date_from AND expense_date <= _date_to;
  GET DIAGNOSTICS exp_count = ROW_COUNT;

  -- 4. payment_requests (references ledger_entries)
  DELETE FROM public.payment_requests
  WHERE created_at >= _date_from::TIMESTAMP WITH TIME ZONE
    AND created_at < _date_to_end;
  GET DIAGNOSTICS pr_count = ROW_COUNT;

  -- 5. journal_entries (now unreferenced)
  DELETE FROM public.journal_entries
  WHERE entry_date >= _date_from AND entry_date <= _date_to;
  GET DIAGNOSTICS je_count = ROW_COUNT;

  -- 6. ledger_entries (now unreferenced)
  DELETE FROM public.ledger_entries
  WHERE entry_date >= _date_from AND entry_date <= _date_to;
  GET DIAGNOSTICS le_count = ROW_COUNT;

  -- 7. notifications (independent)
  DELETE FROM public.notifications
  WHERE created_at >= _date_from::TIMESTAMP WITH TIME ZONE
    AND created_at < _date_to_end;
  GET DIAGNOSTICS notif_count = ROW_COUNT;

  -- Re-enable USER triggers
  ALTER TABLE public.ledger_entries     ENABLE TRIGGER USER;
  ALTER TABLE public.journal_entries    ENABLE TRIGGER USER;
  ALTER TABLE public.journal_lines      ENABLE TRIGGER USER;
  ALTER TABLE public.salary_settlements ENABLE TRIGGER USER;
  ALTER TABLE public.expenses           ENABLE TRIGGER USER;
  ALTER TABLE public.payment_requests   ENABLE TRIGGER USER;

  -- Build result
  deleted_counts := jsonb_build_object(
    'journal_lines', jl_count,
    'journal_entries', je_count,
    'ledger_entries', le_count,
    'salary_settlements', ss_count,
    'payment_requests', pr_count,
    'expenses', exp_count,
    'notifications', notif_count,
    'total', jl_count + je_count + le_count + ss_count + pr_count + exp_count + notif_count
  );

  RETURN deleted_counts;

EXCEPTION
  WHEN OTHERS THEN
    -- The implicit subtransaction created by this EXCEPTION block rolls back every
    -- statement above (including the ALTER TABLE ... DISABLE TRIGGER), so the triggers
    -- are automatically restored. Just surface the real error to the edge function.
    RAISE;
END;
$$;

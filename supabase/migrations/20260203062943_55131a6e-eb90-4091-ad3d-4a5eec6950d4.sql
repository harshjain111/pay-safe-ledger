-- Add INSERT policy for admins to create staff (without salary - they set salary to 0)
CREATE POLICY "Admins can create staff without salary"
ON public.staff
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  AND monthly_salary = 0
);

-- Add INSERT policy for accountants to create staff (without salary - they set salary to 0)
CREATE POLICY "Accountants can create staff without salary"
ON public.staff
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'accountant'::app_role) 
  AND monthly_salary = 0
);

-- Update admin_clear_transaction_data to also clear notifications
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

  -- Temporarily disable triggers to allow deletion of immutable records
  SET session_replication_role = 'replica';

  -- Delete in correct order (respecting foreign keys)
  
  -- 1. Delete journal_lines first (FK to journal_entries)
  DELETE FROM public.journal_lines
  WHERE journal_entry_id IN (
    SELECT id FROM public.journal_entries
    WHERE entry_date >= _date_from AND entry_date <= _date_to
  );
  GET DIAGNOSTICS jl_count = ROW_COUNT;

  -- 2. Delete journal_entries
  DELETE FROM public.journal_entries
  WHERE entry_date >= _date_from AND entry_date <= _date_to;
  GET DIAGNOSTICS je_count = ROW_COUNT;

  -- 3. Delete ledger_entries
  DELETE FROM public.ledger_entries
  WHERE entry_date >= _date_from AND entry_date <= _date_to;
  GET DIAGNOSTICS le_count = ROW_COUNT;

  -- 4. Delete salary_settlements (by settlement_month)
  DELETE FROM public.salary_settlements
  WHERE settlement_month >= from_month AND settlement_month <= to_month;
  GET DIAGNOSTICS ss_count = ROW_COUNT;

  -- 5. Delete payment_requests (by created_at - use proper timestamp range)
  DELETE FROM public.payment_requests
  WHERE created_at >= _date_from::TIMESTAMP WITH TIME ZONE 
    AND created_at < _date_to_end;
  GET DIAGNOSTICS pr_count = ROW_COUNT;

  -- 6. Delete expenses (by expense_date)
  DELETE FROM public.expenses
  WHERE expense_date >= _date_from AND expense_date <= _date_to;
  GET DIAGNOSTICS exp_count = ROW_COUNT;

  -- 7. Delete notifications (by created_at)
  DELETE FROM public.notifications
  WHERE created_at >= _date_from::TIMESTAMP WITH TIME ZONE 
    AND created_at < _date_to_end;
  GET DIAGNOSTICS notif_count = ROW_COUNT;

  -- Re-enable triggers
  SET session_replication_role = 'origin';

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
    -- Always re-enable triggers on error
    SET session_replication_role = 'origin';
    RAISE;
END;
$$;
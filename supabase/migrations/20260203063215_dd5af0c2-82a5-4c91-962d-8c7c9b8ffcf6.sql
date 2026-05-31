-- Clear all transaction data by temporarily disabling triggers
DO $$
BEGIN
  -- Temporarily disable triggers
  SET session_replication_role = 'replica';
  
  -- Delete in correct order (respecting foreign keys)
  DELETE FROM public.journal_lines;
  DELETE FROM public.journal_entries;
  DELETE FROM public.ledger_entries;
  DELETE FROM public.salary_settlements;
  DELETE FROM public.payment_requests;
  DELETE FROM public.expenses;
  DELETE FROM public.notifications;
  
  -- Re-enable triggers
  SET session_replication_role = 'origin';
END;
$$;
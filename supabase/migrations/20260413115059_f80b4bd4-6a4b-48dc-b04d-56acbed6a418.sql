
CREATE OR REPLACE FUNCTION public.generate_journal_ref(_transaction_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prefix TEXT;
  next_num INTEGER;
BEGIN
  prefix := CASE _transaction_type
    WHEN 'salary_settlement' THEN 'SAL-SET'
    WHEN 'salary_payout' THEN 'SAL-PAY'
    WHEN 'expense_approval' THEN 'EXP-APP'
    WHEN 'expense_payout' THEN 'EXP-PAY'
    WHEN 'advance_paid' THEN 'ADV-PAY'
    WHEN 'advance_adjustment' THEN 'ADV-ADJ'
    WHEN 'rectification' THEN 'REC'
    WHEN 'cancellation' THEN 'CAN'
    ELSE 'JRN'
  END;
  
  SELECT COALESCE(MAX(SUBSTRING(reference_no FROM '[0-9]+$')::INTEGER), 0) + 1
  INTO next_num
  FROM public.journal_entries
  WHERE transaction_type = _transaction_type;
  
  RETURN prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYMM') || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$function$;

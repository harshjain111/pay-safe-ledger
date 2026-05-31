-- Fix generate_voucher_no function to include 'expense' voucher type
CREATE OR REPLACE FUNCTION public.generate_voucher_no(_voucher_type voucher_type)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prefix TEXT;
  next_num INTEGER;
BEGIN
  prefix := CASE _voucher_type
    WHEN 'payment' THEN 'PAY'
    WHEN 'journal' THEN 'JRN'
    WHEN 'settlement' THEN 'SET'
    WHEN 'advance' THEN 'ADV'
    WHEN 'deduction' THEN 'DED'
    WHEN 'expense' THEN 'EXP'
  END;
  
  SELECT COALESCE(MAX(SUBSTRING(voucher_no FROM '[0-9]+')::INTEGER), 0) + 1
  INTO next_num
  FROM public.ledger_entries
  WHERE voucher_type = _voucher_type;
  
  RETURN prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYMM') || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$function$;
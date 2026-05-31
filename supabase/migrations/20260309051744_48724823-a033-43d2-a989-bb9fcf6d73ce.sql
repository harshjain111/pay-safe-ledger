
-- Update get_payment_account_code to handle petty_cash using plpgsql to avoid enum literal issue
CREATE OR REPLACE FUNCTION public.get_payment_account_code(_payment_mode payment_mode)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN CASE _payment_mode::text
    WHEN 'cash' THEN '1000'
    WHEN 'upi' THEN '1100'
    WHEN 'bank_transfer' THEN '1100'
    WHEN 'cheque' THEN '1100'
    WHEN 'petty_cash' THEN '1300'
    ELSE '1000'
  END;
END;
$function$;

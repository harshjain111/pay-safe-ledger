-- Update the function to use the salary that was effective at the START of the month
-- This means if salary was changed mid-month, we should still use the new salary for that entire month
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
BEGIN
  -- Convert YYYY-MM to date range
  month_start := (_month || '-01')::DATE;
  month_end := (month_start + INTERVAL '1 month - 1 day')::DATE;
  
  -- Get the MOST RECENT salary that was effective during or before this month
  -- Priority: Find salary effective during this month, falling back to most recent before
  SELECT monthly_salary INTO salary
  FROM public.salary_history
  WHERE staff_id = _staff_id
    AND effective_from <= month_end  -- Was set at any point during or before the month
  ORDER BY effective_from DESC  -- Get the most recent one
  LIMIT 1;
  
  -- If no history found, use current staff salary
  IF salary IS NULL THEN
    SELECT monthly_salary INTO salary
    FROM public.staff
    WHERE id = _staff_id;
  END IF;
  
  RETURN COALESCE(salary, 0);
END;
$function$;
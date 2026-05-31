-- Fix salary lookup to prioritize non-zero salary values and use current staff salary as fallback
-- when historical records show 0 (which indicates salary was updated retroactively)
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
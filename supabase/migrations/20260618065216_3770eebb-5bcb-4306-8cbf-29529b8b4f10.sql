-- ===== missing columns =====
ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS note TEXT;

ALTER TABLE public.leave_records ADD COLUMN IF NOT EXISTS leave_type_id UUID;

ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE public.salary_settlements ADD COLUMN IF NOT EXISTS arrears NUMERIC DEFAULT 0;

ALTER TABLE public.salary_arrears ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE public.salary_arrears ADD COLUMN IF NOT EXISTS period_label TEXT;
ALTER TABLE public.salary_arrears ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS department_id UUID;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS weekly_off_day INT;

-- ===== get_comp_off_earned_by_staff RPC =====
CREATE OR REPLACE FUNCTION public.get_comp_off_earned_by_staff(_year INT)
RETURNS TABLE(staff_id UUID, comp_off NUMERIC)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id AS staff_id, 0::NUMERIC AS comp_off
  FROM public.staff s
  WHERE _year IS NOT NULL
  LIMIT 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_comp_off_earned_by_staff(INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_comp_off_earned_by_staff(INT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
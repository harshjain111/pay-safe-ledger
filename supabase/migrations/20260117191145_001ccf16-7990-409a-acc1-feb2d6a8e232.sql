-- Fix the security definer view issue by using security_invoker
DROP VIEW IF EXISTS public.staff_public;

CREATE VIEW public.staff_public
WITH (security_invoker = on) AS
SELECT 
  id,
  user_id,
  employee_id,
  full_name,
  email,
  phone,
  department,
  designation,
  date_of_joining,
  is_active,
  created_at,
  updated_at
FROM public.staff;

-- 1. Penalties master switch
ALTER TABLE public.discipline_rules
  ADD COLUMN IF NOT EXISTS penalties_enabled boolean NOT NULL DEFAULT true;

-- 2. Soft-cancel fields on discipline log
ALTER TABLE public.attendance_discipline_log
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid,
  ADD COLUMN IF NOT EXISTS cancelled_by_name text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- 3. RLS: admins can manage discipline rules
DROP POLICY IF EXISTS "Admins manage discipline rules" ON public.discipline_rules;
CREATE POLICY "Admins manage discipline rules"
  ON public.discipline_rules
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4. RLS: admins can manage discipline log (cancel/restore)
DROP POLICY IF EXISTS "Admins manage discipline log" ON public.attendance_discipline_log;
CREATE POLICY "Admins manage discipline log"
  ON public.attendance_discipline_log
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5. Allow admins to update staff.attendance_tracked but block other column changes
DROP POLICY IF EXISTS "Admins can update staff attendance_tracked" ON public.staff;
CREATE POLICY "Admins can update staff attendance_tracked"
  ON public.staff
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.restrict_admin_staff_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owners may update anything
  IF public.has_role(auth.uid(), 'owner'::app_role) THEN
    RETURN NEW;
  END IF;
  -- Admins may only change attendance_tracked (updated_at auto-managed)
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.full_name IS DISTINCT FROM OLD.full_name
      OR NEW.email IS DISTINCT FROM OLD.email
      OR NEW.phone IS DISTINCT FROM OLD.phone
      OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
      OR NEW.designation IS DISTINCT FROM OLD.designation
      OR NEW.department IS DISTINCT FROM OLD.department
      OR NEW.date_of_joining IS DISTINCT FROM OLD.date_of_joining
      OR NEW.monthly_salary IS DISTINCT FROM OLD.monthly_salary
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'Admins can only modify attendance_tracked on staff';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_admin_staff_updates ON public.staff;
CREATE TRIGGER trg_restrict_admin_staff_updates
  BEFORE UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.restrict_admin_staff_updates();

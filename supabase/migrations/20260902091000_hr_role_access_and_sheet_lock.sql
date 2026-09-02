-- ============================================================================
-- HR ROLE (part 2/2): permissions, template, RLS access + monthly sheet lock.
--
-- The HR user is the app's day-to-day operator for people ops. This migration:
--   1. adds two permission keys: payslips.download (download anyone's payslip)
--      and settlements.lock (lock the monthly salary sheet),
--   2. seeds the built-in "HR" rights template (role_key 'hr'), so
--      has_permission() resolves HR users with no explicit assignment,
--   3. grants the hr role server-side (RLS) access to the people-ops tables it
--      manages (staff, attendance, shifts/roster, leave, holidays) and read
--      access to salary settlements for payslip downloads,
--   4. creates salary_sheet_locks — one row locks a month's salary sheet; a
--      trigger then blocks ANY insert/update/delete of that month's settlements
--      until the lock is removed. Locking/unlocking requires settlements.lock
--      (HR template; owners pass via the has_permission short-circuit).
-- ============================================================================

-- ---- 1. permission catalog --------------------------------------------------
INSERT INTO public.permissions (key, module, label, sort_order) VALUES
  ('payslips.download', 'Payroll', 'Download all payslips', 53),
  ('settlements.lock',  'Payroll', 'Lock monthly salary sheet', 54)
ON CONFLICT (key) DO NOTHING;

-- ---- 2. built-in HR template ------------------------------------------------
INSERT INTO public.rights_templates (name, description, permissions, is_owner, is_builtin, role_key)
VALUES
  ('HR', 'People operations: staff, attendance, shifts, leave, holidays, payslips & salary sheet lock.',
    ARRAY['dashboard.view',
          'staff.view','staff.create','staff.edit',
          'users.view',
          'attendance.view','attendance.create','attendance.edit','attendance.manage',
          'roster.manage','holidays.manage',
          'leave.view','leave.record','leave.edit','leave.approve',
          'advances.view',
          'salaries.view','payslips.download','settlements.lock',
          'reports.view',
          'settings.attendance.edit']::text[], false, true, 'hr')
ON CONFLICT (name) DO NOTHING;

-- ---- 3. RLS: hr role access -------------------------------------------------
-- Staff records: HR manages people (view/add/edit; delete stays owner-only).
-- NOTE: like admins/accountants today, this exposes the base staff row; the
-- client hides salary fields behind salaries.view, which HR holds anyway.
DROP POLICY IF EXISTS "HR can view all staff" ON public.staff;
CREATE POLICY "HR can view all staff"
  ON public.staff FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'hr'::app_role));

DROP POLICY IF EXISTS "HR can insert staff" ON public.staff;
CREATE POLICY "HR can insert staff"
  ON public.staff FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'hr'::app_role));

DROP POLICY IF EXISTS "HR can update staff" ON public.staff;
CREATE POLICY "HR can update staff"
  ON public.staff FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'hr'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'hr'::app_role));

-- Payslips: anyone holding payslips.download (HR template, or granted) can read
-- every settlement row — needed to render/download payslips for all staff.
DROP POLICY IF EXISTS "Payslip downloaders can view settlements" ON public.salary_settlements;
CREATE POLICY "Payslip downloaders can view settlements"
  ON public.salary_settlements FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'payslips.download'));

-- People-ops tables: HR gets full manage parity (same shape as the admin
-- role-based policies these tables already carry).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'attendance_sessions',
    'attendance_breaks',
    'attendance_discipline_log',
    'biometric_enrolments',
    'staff_roster',
    'shifts',
    'staff_shift_assignments',
    'leave_records',
    'leave_types',
    'leave_balances',
    'leave_settings',
    'holidays',
    'holiday_assignments',
    'departments',
    'designations',
    'employment_history',
    'staff_documents'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "HR can manage %s" ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY "HR can manage %s" ON public.%I FOR ALL TO authenticated
           USING (public.has_role(auth.uid(), ''hr''::app_role))
           WITH CHECK (public.has_role(auth.uid(), ''hr''::app_role))', t, t);
    END IF;
  END LOOP;
END $$;

-- ---- 4. monthly salary sheet lock ------------------------------------------
CREATE TABLE IF NOT EXISTS public.salary_sheet_locks (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month     text NOT NULL UNIQUE CHECK (month ~ '^\d{4}-\d{2}$'),
  locked_by uuid NOT NULL REFERENCES auth.users(id),
  locked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.salary_sheet_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated view sheet locks" ON public.salary_sheet_locks;
CREATE POLICY "Authenticated view sheet locks"
  ON public.salary_sheet_locks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Lock salary sheet" ON public.salary_sheet_locks;
CREATE POLICY "Lock salary sheet"
  ON public.salary_sheet_locks FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'settlements.lock') AND locked_by = auth.uid());

DROP POLICY IF EXISTS "Unlock salary sheet" ON public.salary_sheet_locks;
CREATE POLICY "Unlock salary sheet"
  ON public.salary_sheet_locks FOR DELETE TO authenticated
  USING (public.has_permission(auth.uid(), 'settlements.lock'));

DROP TRIGGER IF EXISTS audit_salary_sheet_locks ON public.salary_sheet_locks;
CREATE TRIGGER audit_salary_sheet_locks
AFTER INSERT OR UPDATE OR DELETE ON public.salary_sheet_locks
FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();

-- Enforcement: once a month is locked, its settlement rows are frozen for
-- EVERYONE (owner included) until the lock row is deleted.
CREATE OR REPLACE FUNCTION public.block_locked_salary_sheet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    m := OLD.settlement_month;
  ELSE
    m := NEW.settlement_month;
  END IF;

  IF EXISTS (SELECT 1 FROM public.salary_sheet_locks WHERE month = m)
     -- an UPDATE moving a row OUT of a locked month is equally forbidden
     OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.salary_sheet_locks WHERE month = OLD.settlement_month))
  THEN
    RAISE EXCEPTION 'The salary sheet for % is locked. Unlock it before changing settlements.', m
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_salary_sheet_lock ON public.salary_settlements;
CREATE TRIGGER enforce_salary_sheet_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.salary_settlements
FOR EACH ROW EXECUTE FUNCTION public.block_locked_salary_sheet();

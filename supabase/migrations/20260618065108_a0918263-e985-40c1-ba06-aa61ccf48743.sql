-- ===== columns on existing tables =====
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS outlet_id UUID;
ALTER TABLE public.biometric_devices ADD COLUMN IF NOT EXISTS status TEXT;

-- ===== helper trigger to maintain updated_at already exists: public.update_updated_at_column() =====

-- ===== hr_pay_rules: singleton settings table (permissive) =====
CREATE TABLE IF NOT EXISTS public.hr_pay_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_day_minutes INT NOT NULL DEFAULT 480,
  half_day_minutes INT NOT NULL DEFAULT 240,
  unscheduled_is_off BOOLEAN NOT NULL DEFAULT false,
  comp_off_enabled BOOLEAN NOT NULL DEFAULT false,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_pay_rules TO authenticated;
GRANT ALL ON public.hr_pay_rules TO service_role;
ALTER TABLE public.hr_pay_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read hr_pay_rules" ON public.hr_pay_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage hr_pay_rules" ON public.hr_pay_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_hr_pay_rules_updated_at BEFORE UPDATE ON public.hr_pay_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== leave_settings: permissive settings =====
CREATE TABLE IF NOT EXISTS public.leave_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_settings TO authenticated;
GRANT ALL ON public.leave_settings TO service_role;
ALTER TABLE public.leave_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read leave_settings" ON public.leave_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage leave_settings" ON public.leave_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_leave_settings_updated_at BEFORE UPDATE ON public.leave_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== holidays =====
CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'public',
  is_paid BOOLEAN NOT NULL DEFAULT true,
  recurring_yearly BOOLEAN NOT NULL DEFAULT false,
  org_wide BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read holidays" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage holidays" ON public.holidays FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_holidays_updated_at BEFORE UPDATE ON public.holidays FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== holiday_assignments =====
CREATE TABLE IF NOT EXISTS public.holiday_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_id UUID NOT NULL REFERENCES public.holidays(id) ON DELETE CASCADE,
  outlet_id UUID,
  staff_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holiday_assignments TO authenticated;
GRANT ALL ON public.holiday_assignments TO service_role;
ALTER TABLE public.holiday_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read holiday_assignments" ON public.holiday_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage holiday_assignments" ON public.holiday_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

-- ===== biometric_enrolments =====
CREATE TABLE IF NOT EXISTS public.biometric_enrolments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL,
  device_id UUID,
  kind TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  enrolled_at TIMESTAMPTZ,
  face_vector_ref TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biometric_enrolments TO authenticated;
GRANT ALL ON public.biometric_enrolments TO service_role;
ALTER TABLE public.biometric_enrolments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read biometric_enrolments" ON public.biometric_enrolments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage biometric_enrolments" ON public.biometric_enrolments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_biometric_enrolments_updated_at BEFORE UPDATE ON public.biometric_enrolments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== leave_balances =====
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL,
  leave_type_id UUID NOT NULL,
  year INT NOT NULL,
  opening NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, leave_type_id, year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_balances TO authenticated;
GRANT ALL ON public.leave_balances TO service_role;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read leave_balances" ON public.leave_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage leave_balances" ON public.leave_balances FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_leave_balances_updated_at BEFORE UPDATE ON public.leave_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== login_reset_requests =====
CREATE TABLE IF NOT EXISTS public.login_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL,
  reason TEXT NOT NULL,
  requested_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_reset_requests TO authenticated;
GRANT ALL ON public.login_reset_requests TO service_role;
ALTER TABLE public.login_reset_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read login_reset_requests" ON public.login_reset_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage login_reset_requests" ON public.login_reset_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_login_reset_requests_updated_at BEFORE UPDATE ON public.login_reset_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== payroll_groups =====
CREATE TABLE IF NOT EXISTS public.payroll_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pay_cycle TEXT,
  pf_default BOOLEAN NOT NULL DEFAULT false,
  esi_default BOOLEAN NOT NULL DEFAULT false,
  pt_default BOOLEAN NOT NULL DEFAULT false,
  rounding TEXT,
  payment_mode_default TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_groups TO authenticated;
GRANT ALL ON public.payroll_groups TO service_role;
ALTER TABLE public.payroll_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read payroll_groups" ON public.payroll_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage payroll_groups" ON public.payroll_groups FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_payroll_groups_updated_at BEFORE UPDATE ON public.payroll_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== rights_templates =====
CREATE TABLE IF NOT EXISTS public.rights_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_owner BOOLEAN NOT NULL DEFAULT false,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  role_key TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rights_templates TO authenticated;
GRANT ALL ON public.rights_templates TO service_role;
ALTER TABLE public.rights_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read rights_templates" ON public.rights_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage rights_templates" ON public.rights_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_rights_templates_updated_at BEFORE UPDATE ON public.rights_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== salary_arrears =====
CREATE TABLE IF NOT EXISTS public.salary_arrears (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL,
  settlement_month TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  settlement_id UUID,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_arrears TO authenticated;
GRANT ALL ON public.salary_arrears TO service_role;
ALTER TABLE public.salary_arrears ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read salary_arrears" ON public.salary_arrears FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage salary_arrears" ON public.salary_arrears FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_salary_arrears_updated_at BEFORE UPDATE ON public.salary_arrears FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== staff_roster =====
CREATE TABLE IF NOT EXISTS public.staff_roster (
  staff_id UUID NOT NULL,
  roster_date DATE NOT NULL,
  shift_id UUID,
  is_off BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, roster_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_roster TO authenticated;
GRANT ALL ON public.staff_roster TO service_role;
ALTER TABLE public.staff_roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read staff_roster" ON public.staff_roster FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage staff_roster" ON public.staff_roster FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_staff_roster_updated_at BEFORE UPDATE ON public.staff_roster FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== user_permissions =====
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id UUID PRIMARY KEY,
  template_id UUID,
  granted JSONB NOT NULL DEFAULT '[]'::jsonb,
  revoked JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own user_permissions" ON public.user_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Manage user_permissions" ON public.user_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_user_permissions_updated_at BEFORE UPDATE ON public.user_permissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Re-create notify_users_by_role to accept an array of roles =====
DROP FUNCTION IF EXISTS public.notify_users_by_role(app_role, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.notify_users_by_role(
  _roles app_role[],
  _title TEXT,
  _message TEXT,
  _type TEXT DEFAULT 'info',
  _reference_type TEXT DEFAULT NULL,
  _reference_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserted_count INT;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
  SELECT DISTINCT ur.user_id, _title, _message, _type, _reference_type, _reference_id
  FROM public.user_roles ur
  WHERE ur.role = ANY(_roles)
    AND ur.user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_users_by_role(app_role[], TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_users_by_role(app_role[], TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
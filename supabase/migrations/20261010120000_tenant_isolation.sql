-- ---------------------------------------------------------------------------
-- Tenant isolation.
--
-- The structure migration gave outlets and staff an organization_id, but every
-- one of the 252 RLS policies still answered "may this user see this row?"
-- with no notion of WHICH company's row it was. With one organisation that was
-- harmless. With two it means organisation A reads organisation B's payroll.
--
-- Two decisions shape this.
--
-- RESTRICTIVE policies, not edits to the existing 252. A restrictive policy
-- ANDs with the permissive ones, so tenancy holds no matter what any
-- permissive policy allows -- including one added later by someone who forgets
-- tenancy exists. Rewriting 252 policy bodies by hand to add an org clause
-- would have been 252 chances to get an access rule subtly wrong.
--
-- organization_id denormalised onto every table, not derived by joining to
-- staff. This database has just been through a 65x RLS problem caused by
-- per-row work; a subquery into staff for every row of attendance_sessions
-- would walk straight back into it. The column is read off the row.
--
-- The cost of denormalising is that a child row could carry a different
-- organisation from its parent, so child tables derive it from the parent on
-- insert rather than trusting the caller.
--
-- `permissions` is deliberately NOT scoped: it is the catalogue of permission
-- keys the product ships with ('leave.approve' and so on), identical for every
-- tenant and holding no customer data.
-- ---------------------------------------------------------------------------

-- Which organisations the caller may act in. SECURITY DEFINER so it reads
-- user_roles as the owner, which is exempt from RLS -- without that, the
-- restrictive policy on user_roles would recurse into itself.
CREATE OR REPLACE FUNCTION public.my_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT organization_id FROM public.user_roles WHERE user_id = (SELECT auth.uid()) $$;

REVOKE ALL ON FUNCTION public.my_org_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.my_org_ids() TO authenticated, anon;

-- A child row takes its organisation from its parent, so it can never be
-- filed under a company the parent does not belong to.
CREATE OR REPLACE FUNCTION public.set_org_from_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_org uuid; v_parent text := TG_ARGV[0]; v_col text := TG_ARGV[1]; v_fk uuid;
BEGIN
  EXECUTE format('SELECT (%L::public.%I).%I', NEW, TG_TABLE_NAME, v_col) INTO v_fk;
  IF v_fk IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT organization_id FROM public.%I WHERE id = %L', v_parent, v_fk) INTO v_org;
  IF v_org IS NOT NULL THEN NEW.organization_id := v_org; END IF;
  RETURN NEW;
END;
$$;

-- 1. Give every tenant table the column --------------------------------------

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.attendance_breaks ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.attendance_discipline_log ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.attendance_policies ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.attendance_sessions ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.biometric_enrolments ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.discipline_rules ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.employee_holiday_template ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.employee_leave_balance ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.employment_history ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.grievances ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.holiday_assignments ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.holiday_groups ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.holiday_template ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.holiday_template_days ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.holidays ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.leave_balance_adjustment ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.leave_encashment ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.leave_records ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.leave_type_overrides ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.login_reset_requests ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.payment_requests ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.punch_events ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.salary_arrears ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.salary_history ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.salary_settlement_loan_deductions ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.salary_settlements ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.salary_sheet_locks ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.saved_reports ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.shift_assignment ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.shift_day_timing ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.staff_documents ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.staff_loans ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.staff_roster ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.staff_shift_assignments ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.week_off ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.whatsapp_notification_log ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.working_hour_config_history ADD COLUMN IF NOT EXISTS organization_id uuid;

-- 2. Backfill from the parent where there is one, else the one organisation
UPDATE public.attendance_discipline_log c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.attendance_policies c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.attendance_sessions c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.biometric_enrolments c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.employee_holiday_template c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.employee_leave_balance c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.employment_history c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.holiday_assignments c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.journal_entries c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.journal_lines c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.leave_balance_adjustment c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.leave_encashment c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.leave_records c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.ledger_entries c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.login_reset_requests c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.payment_requests c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.punch_events c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.salary_arrears c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.salary_history c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.salary_settlements c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.shift_assignment c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.staff_documents c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.staff_loans c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.staff_roster c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.staff_shift_assignments c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.week_off c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.whatsapp_notification_log c SET organization_id = s.organization_id FROM public.staff s WHERE c.staff_id = s.id AND c.organization_id IS NULL;
UPDATE public.attendance_breaks c SET organization_id = p.organization_id FROM public.attendance_sessions p WHERE c.session_id = p.id AND c.organization_id IS NULL;
UPDATE public.holiday_template_days c SET organization_id = p.organization_id FROM public.holiday_template p WHERE c.template_id = p.id AND c.organization_id IS NULL;
UPDATE public.leave_type_overrides c SET organization_id = p.organization_id FROM public.outlets p WHERE c.outlet_id = p.id AND c.organization_id IS NULL;
UPDATE public.shift_day_timing c SET organization_id = p.organization_id FROM public.shifts p WHERE c.shift_id = p.id AND c.organization_id IS NULL;

UPDATE public.accounts SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.attendance_breaks SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.attendance_discipline_log SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.attendance_policies SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.attendance_sessions SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.audit_log SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.biometric_enrolments SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.discipline_rules SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.employee_holiday_template SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.employee_leave_balance SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.employment_history SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.events SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.grievances SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.holiday_assignments SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.holiday_groups SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.holiday_template SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.holiday_template_days SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.holidays SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.journal_entries SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.journal_lines SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.leave_balance_adjustment SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.leave_encashment SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.leave_records SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.leave_type_overrides SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.ledger_entries SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.login_reset_requests SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.notifications SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.payment_requests SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.punch_events SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.salary_arrears SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.salary_history SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.salary_settlement_loan_deductions SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.salary_settlements SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.salary_sheet_locks SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.saved_reports SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.shift_assignment SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.shift_day_timing SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.staff_documents SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.staff_loans SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.staff_roster SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.staff_shift_assignments SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.week_off SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.whatsapp_notification_log SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.working_hour_config_history SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;

-- 3. Lock it down: NOT NULL, default, foreign key, index ---------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','attendance_breaks','attendance_discipline_log','attendance_policies','attendance_sessions','audit_log','biometric_enrolments','discipline_rules','employee_holiday_template','employee_leave_balance','employment_history','events','grievances','holiday_assignments','holiday_groups','holiday_template','holiday_template_days','holidays','journal_entries','journal_lines','leave_balance_adjustment','leave_encashment','leave_records','leave_type_overrides','ledger_entries','login_reset_requests','notifications','payment_requests','punch_events','salary_arrears','salary_history','salary_settlement_loan_deductions','salary_settlements','salary_sheet_locks','saved_reports','shift_assignment','shift_day_timing','staff_documents','staff_loans','staff_roster','staff_shift_assignments','week_off','whatsapp_notification_log','working_hour_config_history'] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organization_id SET DEFAULT public.default_organization_id()', t);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE', t, t || '_organization_id_fkey');
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id)', t || '_org_idx', t);
  END LOOP;
END $$;

-- 4. Children take their organisation from their parent ---------------------
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.attendance_discipline_log;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.attendance_discipline_log
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.attendance_policies;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.attendance_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.attendance_sessions;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.biometric_enrolments;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.biometric_enrolments
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.employee_holiday_template;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.employee_holiday_template
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.employee_leave_balance;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.employee_leave_balance
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.employment_history;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.employment_history
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.holiday_assignments;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.holiday_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.journal_entries;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.journal_lines;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.leave_balance_adjustment;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.leave_balance_adjustment
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.leave_encashment;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.leave_encashment
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.leave_records;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.leave_records
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.ledger_entries;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.login_reset_requests;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.login_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.payment_requests;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.punch_events;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.punch_events
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.salary_arrears;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.salary_arrears
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.salary_history;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.salary_history
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.salary_settlements;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.salary_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.shift_assignment;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.shift_assignment
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.staff_documents;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.staff_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.staff_loans;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.staff_loans
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.staff_roster;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.staff_roster
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.staff_shift_assignments;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.staff_shift_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.week_off;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.week_off
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.whatsapp_notification_log;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF staff_id ON public.whatsapp_notification_log
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('staff', 'staff_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.attendance_breaks;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF session_id ON public.attendance_breaks
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('attendance_sessions', 'session_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.holiday_template_days;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF template_id ON public.holiday_template_days
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('holiday_template', 'template_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.leave_type_overrides;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF outlet_id ON public.leave_type_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('outlets', 'outlet_id');
DROP TRIGGER IF EXISTS trg_org_from_parent ON public.shift_day_timing;
CREATE TRIGGER trg_org_from_parent BEFORE INSERT OR UPDATE OF shift_id ON public.shift_day_timing
  FOR EACH ROW EXECUTE FUNCTION public.set_org_from_parent('shifts', 'shift_id');

-- 5. The isolation itself ----------------------------------------------------
-- One restrictive policy per table. It ANDs with every permissive policy, so a
-- row outside your organisations is unreachable however generous those are.
DROP POLICY IF EXISTS tenant_isolation ON public.accounts;
CREATE POLICY tenant_isolation ON public.accounts AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.attendance_breaks;
CREATE POLICY tenant_isolation ON public.attendance_breaks AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.attendance_discipline_log;
CREATE POLICY tenant_isolation ON public.attendance_discipline_log AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.attendance_policies;
CREATE POLICY tenant_isolation ON public.attendance_policies AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.attendance_sessions;
CREATE POLICY tenant_isolation ON public.attendance_sessions AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.audit_log;
CREATE POLICY tenant_isolation ON public.audit_log AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.biometric_devices;
CREATE POLICY tenant_isolation ON public.biometric_devices AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.biometric_enrolments;
CREATE POLICY tenant_isolation ON public.biometric_enrolments AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.departments;
CREATE POLICY tenant_isolation ON public.departments AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.designations;
CREATE POLICY tenant_isolation ON public.designations AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.discipline_rules;
CREATE POLICY tenant_isolation ON public.discipline_rules AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.employee_holiday_template;
CREATE POLICY tenant_isolation ON public.employee_holiday_template AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.employee_leave_balance;
CREATE POLICY tenant_isolation ON public.employee_leave_balance AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.employment_history;
CREATE POLICY tenant_isolation ON public.employment_history AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.events;
CREATE POLICY tenant_isolation ON public.events AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.grievances;
CREATE POLICY tenant_isolation ON public.grievances AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.holiday_assignments;
CREATE POLICY tenant_isolation ON public.holiday_assignments AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.holiday_groups;
CREATE POLICY tenant_isolation ON public.holiday_groups AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.holiday_template;
CREATE POLICY tenant_isolation ON public.holiday_template AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.holiday_template_days;
CREATE POLICY tenant_isolation ON public.holiday_template_days AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.holidays;
CREATE POLICY tenant_isolation ON public.holidays AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.hr_pay_rules;
CREATE POLICY tenant_isolation ON public.hr_pay_rules AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.journal_entries;
CREATE POLICY tenant_isolation ON public.journal_entries AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.journal_lines;
CREATE POLICY tenant_isolation ON public.journal_lines AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.leave_balance_adjustment;
CREATE POLICY tenant_isolation ON public.leave_balance_adjustment AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.leave_encashment;
CREATE POLICY tenant_isolation ON public.leave_encashment AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.leave_records;
CREATE POLICY tenant_isolation ON public.leave_records AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.leave_settings;
CREATE POLICY tenant_isolation ON public.leave_settings AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.leave_type_overrides;
CREATE POLICY tenant_isolation ON public.leave_type_overrides AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.leave_types;
CREATE POLICY tenant_isolation ON public.leave_types AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.ledger_entries;
CREATE POLICY tenant_isolation ON public.ledger_entries AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.login_reset_requests;
CREATE POLICY tenant_isolation ON public.login_reset_requests AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.notifications;
CREATE POLICY tenant_isolation ON public.notifications AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.outlets;
CREATE POLICY tenant_isolation ON public.outlets AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.payment_requests;
CREATE POLICY tenant_isolation ON public.payment_requests AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.payroll_statutory_settings;
CREATE POLICY tenant_isolation ON public.payroll_statutory_settings AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.punch_events;
CREATE POLICY tenant_isolation ON public.punch_events AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.rights_templates;
CREATE POLICY tenant_isolation ON public.rights_templates AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.salary_arrears;
CREATE POLICY tenant_isolation ON public.salary_arrears AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.salary_history;
CREATE POLICY tenant_isolation ON public.salary_history AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.salary_settlement_loan_deductions;
CREATE POLICY tenant_isolation ON public.salary_settlement_loan_deductions AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.salary_settlements;
CREATE POLICY tenant_isolation ON public.salary_settlements AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.salary_sheet_locks;
CREATE POLICY tenant_isolation ON public.salary_sheet_locks AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.saved_reports;
CREATE POLICY tenant_isolation ON public.saved_reports AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.shift_assignment;
CREATE POLICY tenant_isolation ON public.shift_assignment AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.shift_day_timing;
CREATE POLICY tenant_isolation ON public.shift_day_timing AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.shifts;
CREATE POLICY tenant_isolation ON public.shifts AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.staff;
CREATE POLICY tenant_isolation ON public.staff AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.staff_documents;
CREATE POLICY tenant_isolation ON public.staff_documents AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.staff_loans;
CREATE POLICY tenant_isolation ON public.staff_loans AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.staff_roster;
CREATE POLICY tenant_isolation ON public.staff_roster AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.staff_shift_assignments;
CREATE POLICY tenant_isolation ON public.staff_shift_assignments AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.user_permissions;
CREATE POLICY tenant_isolation ON public.user_permissions AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.user_roles;
CREATE POLICY tenant_isolation ON public.user_roles AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.week_off;
CREATE POLICY tenant_isolation ON public.week_off AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.whatsapp_notification_log;
CREATE POLICY tenant_isolation ON public.whatsapp_notification_log AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS tenant_isolation ON public.working_hour_config_history;
CREATE POLICY tenant_isolation ON public.working_hour_config_history AS RESTRICTIVE FOR ALL TO public
  USING (organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (organization_id IN (SELECT public.my_org_ids()));

-- An organisation row is visible to its own members.
DROP POLICY IF EXISTS tenant_isolation ON public.organizations;
CREATE POLICY tenant_isolation ON public.organizations AS RESTRICTIVE FOR ALL TO public
  USING (id IN (SELECT public.my_org_ids()))
  WITH CHECK (id IN (SELECT public.my_org_ids()));

COMMENT ON TABLE public.permissions IS
  'Global catalogue of permission keys shipped with the product. Deliberately not tenant-scoped: no customer data, identical for every organisation.';


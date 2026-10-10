-- ---------------------------------------------------------------------------
-- Organisation -> Outlet -> Staff.
--
-- The app was single-tenant by construction: organization_profile carried a
-- `singleton` column with a UNIQUE constraint pinning it to exactly one row,
-- src/lib/brand.ts described the organisation as "per-instance and set via
-- env", and not one of the 59 tables had an organization_id. The hierarchy was
-- Outlet -> Staff, two levels, with the company implied by the deployment.
--
-- This makes the organisation a real, first-class row that outlets hang off.
--
-- organization_profile becomes `organizations`. It already held exactly the
-- fields an organisation needs -- trade name, GSTIN, PAN, EPF and ESI numbers,
-- leave year start, attendance day start -- which are per legal entity anyway,
-- so the table keeps its 24 columns and simply stops being a singleton.
--
-- Masters are per-organisation, as chosen: departments, designations, leave
-- types, shifts and rights templates each belong to one organisation, and so
-- do the statutory, pay and leave settings. A second company gets its own job
-- titles and its own PF rates rather than inheriting Konnect 2's.
--
-- Membership is per-organisation too. A role is now held IN an organisation,
-- so being an admin of one grants nothing in another, and one person can hold
-- roles in several -- which is what lets an owner switch between companies.
--
-- Every existing row belongs to the one organisation that already exists, so
-- nothing moves and nothing is orphaned. The operational tables were cleared
-- on 2026-10-08, which is why this costs a backfill of 8 outlets and some
-- masters rather than 47,000 attendance rows.
--
-- SECURITY, READ THIS: this migration is structure only. The 252 RLS policies
-- still answer "may this user see this row?" with no notion of WHICH company's
-- row it is. With one organisation that is harmless -- there is nothing to
-- leak to. Do not create a second organisation until the RLS pass lands.
-- ---------------------------------------------------------------------------

-- 1. The organisation itself ------------------------------------------------

ALTER TABLE public.organization_profile RENAME TO organizations;

-- It held one row by constraint. That is the thing being removed.
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organization_profile_singleton;
ALTER TABLE public.organizations DROP COLUMN IF EXISTS singleton;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

COMMENT ON TABLE public.organizations IS
  'A company. Outlets belong to one, staff belong to an outlet. Was organization_profile, which was pinned to a single row.';

-- A stable handle for the one that already exists, used by the backfills below.
CREATE OR REPLACE FUNCTION public.default_organization_id()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$ SELECT id FROM public.organizations ORDER BY created_at LIMIT 1 $$;


-- 2. Everything that belongs to an organisation ------------------------------

ALTER TABLE public.outlets                    ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.staff                      ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.departments                ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.designations               ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.leave_types                ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.shifts                     ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.rights_templates           ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.payroll_statutory_settings ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.hr_pay_rules               ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.leave_settings             ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.biometric_devices          ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.user_roles                 ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE public.user_permissions           ADD COLUMN IF NOT EXISTS organization_id uuid;

UPDATE public.outlets                    SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.staff                      SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.departments                SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.designations               SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.leave_types                SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.shifts                     SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.rights_templates           SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.payroll_statutory_settings SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.hr_pay_rules               SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.leave_settings             SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.biometric_devices          SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.user_roles                 SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;
UPDATE public.user_permissions           SET organization_id = public.default_organization_id() WHERE organization_id IS NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'outlets','staff','departments','designations','leave_types','shifts','rights_templates',
    'payroll_statutory_settings','hr_pay_rules','leave_settings','biometric_devices',
    'user_roles','user_permissions'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN organization_id SET NOT NULL', t);
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (organization_id) '
      'REFERENCES public.organizations(id) ON DELETE CASCADE', t, t || '_organization_id_fkey');
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (organization_id)', t || '_org_idx', t);
  END LOOP;
END $$;


-- 3. Uniqueness is per organisation, not global ------------------------------
--
-- Two companies may both have a KITCHEN department, a CHEF designation, an
-- outlet called Main, or an employee K2H001. Globally unique names would make
-- the second organisation unable to name anything the first already used.

ALTER TABLE public.departments      DROP CONSTRAINT IF EXISTS departments_name_unique;
ALTER TABLE public.designations     DROP CONSTRAINT IF EXISTS designations_name_unique;
ALTER TABLE public.leave_types      DROP CONSTRAINT IF EXISTS leave_types_code_unique;
ALTER TABLE public.outlets          DROP CONSTRAINT IF EXISTS outlets_name_unique;
ALTER TABLE public.rights_templates DROP CONSTRAINT IF EXISTS rights_templates_name_unique;
ALTER TABLE public.staff            DROP CONSTRAINT IF EXISTS staff_employee_id_key;
ALTER TABLE public.user_roles       DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.departments      ADD CONSTRAINT departments_org_name_key      UNIQUE (organization_id, name);
ALTER TABLE public.designations     ADD CONSTRAINT designations_org_name_key     UNIQUE (organization_id, name);
ALTER TABLE public.leave_types      ADD CONSTRAINT leave_types_org_code_key      UNIQUE (organization_id, code);
ALTER TABLE public.outlets          ADD CONSTRAINT outlets_org_name_key          UNIQUE (organization_id, name);
ALTER TABLE public.rights_templates ADD CONSTRAINT rights_templates_org_name_key UNIQUE (organization_id, name);
ALTER TABLE public.staff            ADD CONSTRAINT staff_org_employee_id_key     UNIQUE (organization_id, employee_id);

-- A role is held IN an organisation. Admin of one is not admin of another.
ALTER TABLE public.user_roles       ADD CONSTRAINT user_roles_org_user_role_key  UNIQUE (organization_id, user_id, role);

-- staff.user_id was globally unique, which would stop one person holding a
-- staff record in two companies. Scope it instead.
ALTER TABLE public.staff            DROP CONSTRAINT IF EXISTS staff_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS staff_org_user_id_key
  ON public.staff (organization_id, user_id) WHERE user_id IS NOT NULL;

-- The settings tables were singletons too; one row each per organisation now.
ALTER TABLE public.payroll_statutory_settings DROP CONSTRAINT IF EXISTS payroll_statutory_settings_singleton;
ALTER TABLE public.hr_pay_rules               DROP CONSTRAINT IF EXISTS hr_pay_rules_singleton;
ALTER TABLE public.leave_settings             DROP CONSTRAINT IF EXISTS leave_settings_singleton;

CREATE UNIQUE INDEX IF NOT EXISTS payroll_statutory_settings_org_key ON public.payroll_statutory_settings (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS hr_pay_rules_org_key               ON public.hr_pay_rules (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS leave_settings_org_key             ON public.leave_settings (organization_id);


-- 4. An outlet's staff cannot belong to a different organisation -------------
--
-- staff carries organization_id directly rather than deriving it through the
-- outlet, because staff may have no outlet yet and because RLS reading it off
-- the row is far cheaper than a join. The cost of denormalising is that the
-- two can disagree, so the database refuses to let them.

CREATE OR REPLACE FUNCTION public.staff_org_matches_outlet()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_org uuid;
BEGIN
  IF NEW.outlet_id IS NULL THEN RETURN NEW; END IF;
  SELECT organization_id INTO v_org FROM public.outlets WHERE id = NEW.outlet_id;
  IF v_org IS NOT NULL AND v_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Outlet belongs to a different organisation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_org_matches_outlet ON public.staff;
CREATE TRIGGER trg_staff_org_matches_outlet
  BEFORE INSERT OR UPDATE OF outlet_id, organization_id ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.staff_org_matches_outlet();


-- 5. Which organisations a user may act in -----------------------------------

CREATE OR REPLACE FUNCTION public.user_organization_ids(_user uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT organization_id FROM public.user_roles WHERE user_id = _user
$$;

COMMENT ON FUNCTION public.user_organization_ids(uuid) IS
  'Every organisation this user holds a role in. The basis of the org switcher and of the RLS pass still to come.';

-- =============================================================================
-- HR Module — Phase A: staff master data + settlement audit trail
-- =============================================================================
-- 1. Outlet & Department master tables (staff are enrolled outlet/department-wise).
-- 2. staff.outlet_id, staff.department_id, staff.date_of_leaving.
-- 3. Seed departments from the existing free-text staff.department values so no
--    current data is lost, then link each staff row to its department.
-- 4. Maker-checker: block self-approval of a payment request at the DB level
--    (the approver must differ from the user who raised the request).
-- All additions are non-breaking: new columns are nullable, the free-text
-- staff.department column is retained for back-compat.
-- =============================================================================

-- 1. Master tables -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outlets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text,
  address     text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlets_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT departments_name_unique UNIQUE (name)
);

ALTER TABLE public.outlets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may read the lists (needed for enrollment dropdowns and to
-- display a staff member's outlet/department). These are non-sensitive lookups.
CREATE POLICY "Authenticated can view outlets"
  ON public.outlets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can view departments"
  ON public.departments FOR SELECT TO authenticated USING (true);

-- Only owners/admins may create / rename / deactivate master records.
CREATE POLICY "Owners and admins manage outlets"
  ON public.outlets FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners and admins manage departments"
  ON public.departments FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER outlets_set_updated_at
  BEFORE UPDATE ON public.outlets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER departments_set_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Staff columns -----------------------------------------------------------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS outlet_id       uuid REFERENCES public.outlets(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id   uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS date_of_leaving date;

CREATE INDEX IF NOT EXISTS idx_staff_outlet     ON public.staff(outlet_id);
CREATE INDEX IF NOT EXISTS idx_staff_department ON public.staff(department_id);

-- 3. Seed departments from existing free-text values, then link staff ---------
INSERT INTO public.departments (name)
SELECT DISTINCT btrim(department)
FROM public.staff
WHERE department IS NOT NULL
  AND btrim(department) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE public.staff s
SET department_id = d.id
FROM public.departments d
WHERE s.department_id IS NULL
  AND s.department IS NOT NULL
  AND btrim(s.department) = d.name;

-- 4. Maker-checker: block self-approval of payment_requests at the DB level ----
-- The app already prevents approving your own *beneficiary* request; this adds
-- the complementary, database-enforced rule that the approver cannot be the same
-- user who raised (keyed) the request, giving a clean two-person audit trail.
CREATE OR REPLACE FUNCTION public.enforce_request_maker_checker()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only police the transition INTO 'approved'.
  IF NEW.status = 'approved' AND COALESCE(OLD.status, 'pending') <> 'approved' THEN
    IF NEW.approved_by IS NULL THEN
      RAISE EXCEPTION 'Approver must be recorded when approving a request'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.approved_by = NEW.requested_by THEN
      RAISE EXCEPTION 'A payment request cannot be approved by the same user who raised it'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_requests_maker_checker ON public.payment_requests;
CREATE TRIGGER payment_requests_maker_checker
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_request_maker_checker();

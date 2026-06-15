-- =============================================================================
-- Designations master list (mirrors the Departments master from Phase A)
-- =============================================================================
-- Staff pick a Designation from this managed list instead of free text.
-- Existing free-text staff.designation values are seeded so none are lost, then
-- each staff row is linked via staff.designation_id. The free-text
-- staff.designation column is retained for back-compat and stores the chosen
-- name (exactly like staff.department mirrors staff.department_id).
-- All additions are non-breaking: the new column is nullable.
-- =============================================================================

-- 1. Master table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.designations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT designations_name_unique UNIQUE (name)
);

ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;

-- Any signed-in user may read the list (needed for the enrollment dropdown and
-- to display a staff member's designation). Non-sensitive lookup.
CREATE POLICY "Authenticated can view designations"
  ON public.designations FOR SELECT TO authenticated USING (true);

-- Only owners/admins may create / rename / deactivate designations.
CREATE POLICY "Owners and admins manage designations"
  ON public.designations FOR ALL TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER designations_set_updated_at
  BEFORE UPDATE ON public.designations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Staff column ------------------------------------------------------------
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS designation_id uuid REFERENCES public.designations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_designation ON public.staff(designation_id);

-- 3. Seed designations from existing free-text values, then link staff --------
INSERT INTO public.designations (name)
SELECT DISTINCT btrim(designation)
FROM public.staff
WHERE designation IS NOT NULL
  AND btrim(designation) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE public.staff s
SET designation_id = d.id
FROM public.designations d
WHERE s.designation_id IS NULL
  AND s.designation IS NOT NULL
  AND btrim(s.designation) = d.name;

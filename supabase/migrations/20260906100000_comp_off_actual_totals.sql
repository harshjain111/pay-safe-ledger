-- ============================================================================
-- get_comp_off_earned_by_staff was a stub.
--
-- It returned `SELECT s.id, 0 FROM staff s LIMIT 0` — zero rows, always. So
-- comp-off was computed by the payroll engine, written to
-- salary_settlements.comp_off_earned and printed on payslips, while every
-- balance that asked for it silently got nothing. An employee who worked their
-- weekly off earned a day that existed only on paper.
--
-- It now sums what the settlements actually recorded, per staff, for the year.
--
-- SECURITY DEFINER is kept deliberately and is the reason this function exists:
-- salary_settlements is owner-only, and an admin looking at the leave balance
-- card has no business reading settlement rows to get one number out of them.
-- The guard replaces that RLS with an explicit one — owner, admin or HR, the
-- roles whose dashboards show the card — so bypassing RLS does not mean
-- bypassing authorisation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_comp_off_earned_by_staff(_year integer)
RETURNS TABLE(staff_id uuid, comp_off numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _year IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'owner'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr'::app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ss.staff_id,
         COALESCE(SUM(ss.comp_off_earned), 0)::numeric
    FROM public.salary_settlements ss
   WHERE ss.staff_id IS NOT NULL
     -- settlement_month is 'YYYY-MM', so the year is its first four characters.
     AND ss.settlement_month LIKE _year::text || '-%'
   GROUP BY ss.staff_id;
END;
$function$;

COMMENT ON FUNCTION public.get_comp_off_earned_by_staff(integer) IS
  'Comp-off days earned per staff in a year, summed from settled months. SECURITY DEFINER so a non-owner can read the total without reading salary_settlements; restricted to owner/admin/HR.';

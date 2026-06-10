-- =============================================================================
-- Fix: admin/accountant could not read comp-off totals for the leave balances.
-- =============================================================================
-- salary_settlements is owner-only (+ staff-own) at the RLS level, so the admin
-- dashboard's comp-off query returned nothing (silent zero). Expose ONLY the
-- per-staff comp-off sum via a SECURITY DEFINER RPC, authorized for finance/admin
-- (reusing assert_finance_or_admin), without leaking any salary figures.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_comp_off_earned_by_staff(_year integer)
RETURNS TABLE (staff_id uuid, comp_off numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_finance_or_admin();
  RETURN QUERY
  SELECT ss.staff_id, COALESCE(SUM(ss.comp_off_earned), 0)::numeric
  FROM public.salary_settlements ss
  WHERE ss.settlement_month LIKE _year::text || '-%'
  GROUP BY ss.staff_id;
END;
$$;

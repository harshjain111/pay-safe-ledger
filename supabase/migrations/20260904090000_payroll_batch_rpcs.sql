-- ============================================================================
-- Batch variants of the two per-staff payroll RPCs.
--
-- A payroll run over 214 employees called get_staff_salary_for_month and
-- get_staff_advances_from_journals once EACH, per employee — 428 round trips
-- out of the ~1,900 a run made. These take the whole id list and answer in one.
--
-- The logic is copied from the single-staff functions verbatim, including the
-- fallbacks, so a batch answer equals the per-staff answer for every id:
--   * salary  = most recent salary_history row effective on or before the month
--               end, falling back to staff.monthly_salary when that is missing
--               OR zero (salary set after the settlement month);
--   * advance = debit − credit on account 1200 (Staff Advances).
--
-- The access checks are preserved exactly, not relaxed: assert_owner() for
-- salaries, and assert_staff_finance_access() for EVERY id requested — asking
-- for a batch grants nothing that asking one at a time would not.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_staff_salaries_for_month(
  _staff_ids uuid[],
  _month     text
)
RETURNS TABLE (staff_id uuid, salary numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  month_start DATE;
  month_end   DATE;
BEGIN
  PERFORM public.assert_owner();

  month_start := (_month || '-01')::DATE;
  month_end   := (month_start + INTERVAL '1 month - 1 day')::DATE;

  RETURN QUERY
  SELECT s.id,
         COALESCE(
           NULLIF((
             SELECT sh.monthly_salary
               FROM public.salary_history sh
              WHERE sh.staff_id = s.id
                AND sh.effective_from <= month_end
              ORDER BY sh.effective_from DESC
              LIMIT 1
           ), 0),
           s.monthly_salary,
           0
         )::numeric
    FROM public.staff s
   WHERE s.id = ANY(_staff_ids);
END;
$function$;

COMMENT ON FUNCTION public.get_staff_salaries_for_month(uuid[], text) IS
  'Batch form of get_staff_salary_for_month — same result per id, one round trip.';


CREATE OR REPLACE FUNCTION public.get_staff_advances_from_journals_bulk(
  _staff_ids uuid[]
)
RETURNS TABLE (staff_id uuid, advances numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sid uuid;
BEGIN
  -- Same per-staff gate as the single-row function, applied to every id asked
  -- for. Raises on the first id the caller may not see.
  FOREACH sid IN ARRAY _staff_ids LOOP
    PERFORM public.assert_staff_finance_access(sid);
  END LOOP;

  RETURN QUERY
  SELECT s.id,
         COALESCE((
           SELECT SUM(jl.debit) - SUM(jl.credit)
             FROM public.journal_lines jl
             JOIN public.accounts a ON a.id = jl.account_id
            WHERE jl.staff_id = s.id
              AND a.code = '1200'
         ), 0)::numeric
    FROM public.staff s
   WHERE s.id = ANY(_staff_ids);
END;
$function$;

COMMENT ON FUNCTION public.get_staff_advances_from_journals_bulk(uuid[]) IS
  'Batch form of get_staff_advances_from_journals — same result per id, one round trip.';


GRANT EXECUTE ON FUNCTION public.get_staff_salaries_for_month(uuid[], text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_advances_from_journals_bulk(uuid[])   TO authenticated;

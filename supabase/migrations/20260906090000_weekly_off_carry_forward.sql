-- ============================================================================
-- Weekly-off carry forward, for designations that need it.
--
-- The weekly off is a MONTHLY QUOTA, not fixed dates: an employee whose off day
-- is Tuesday gets as many paid off days as there are Tuesdays that month, and
-- may take them on any day. Unused quota is discarded at month end — work every
-- day and those days are simply gone, since comp_off_earned is recorded but
-- feeds neither pay nor leave.
--
-- Valets work through the month and take the accumulated days together, so for
-- them the leftover has to survive into the next month. Client's decisions: no
-- cap, and it never expires.
--
-- Carried on the DESIGNATION rather than a hardcoded name, so the rule is
-- configurable and any designation can be given it later without a migration.
-- ============================================================================

ALTER TABLE public.designations
  ADD COLUMN IF NOT EXISTS weekly_off_carry_forward boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.designations.weekly_off_carry_forward IS
  'When true, unused weekly-off quota rolls into the next month instead of lapsing. No cap, no expiry.';

UPDATE public.designations
   SET weekly_off_carry_forward = true
 WHERE name ILIKE 'valet'
   AND NOT weekly_off_carry_forward;

-- The settlement records what the month was entitled to and what it brought in,
-- so the balance is derivable and auditable rather than a number kept in a
-- corner. off_days (already present) is what was USED, so a month's closing
-- balance is off_quota + off_carried_in - off_days.
ALTER TABLE public.salary_settlements
  ADD COLUMN IF NOT EXISTS off_quota numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS off_carried_in numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.salary_settlements.off_quota IS
  'Weekly-off days this month earned in its own right (count of the assigned weekday in the employment window).';
COMMENT ON COLUMN public.salary_settlements.off_carried_in IS
  'Unused weekly-off days brought forward from earlier months. Always 0 unless the designation carries forward.';


-- ---------------------------------------------------------------------------
-- What each employee brings into a month.
--
-- The closing balance of the LATEST settled month before _month, which already
-- includes everything before it — summing every month would double-count, since
-- each row's off_carried_in is the previous row's leftover.
--
-- Returns 0 for anyone whose designation does not carry forward, so the caller
-- can ask for the whole payroll run and let this decide.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_weekly_off_carry_forward(
  _staff_ids uuid[],
  _month     text        -- 'YYYY-MM'; balance as at the START of this month
)
RETURNS TABLE (staff_id uuid, carried numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.id,
         COALESCE((
           SELECT GREATEST(ss.off_quota + ss.off_carried_in - ss.off_days, 0)
             FROM salary_settlements ss
            WHERE ss.staff_id = s.id
              AND ss.settlement_month < _month
            ORDER BY ss.settlement_month DESC
            LIMIT 1
         ), 0)::numeric
    FROM staff s
    JOIN designations d ON d.id = s.designation_id
   WHERE s.id = ANY(_staff_ids)
     AND d.weekly_off_carry_forward;
$$;

COMMENT ON FUNCTION public.get_weekly_off_carry_forward(uuid[], text) IS
  'Unused weekly-off days an employee brings into _month. Empty row for anyone whose designation does not carry forward.';

GRANT EXECUTE ON FUNCTION public.get_weekly_off_carry_forward(uuid[], text) TO authenticated;

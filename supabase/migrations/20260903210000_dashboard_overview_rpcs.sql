-- ============================================================================
-- Dashboard consolidation — three read RPCs that replace 19 client round trips.
--
-- The dashboard was assembling itself from ~32 separate REST calls. The queries
-- themselves are trivial for Postgres (the attendance one plans at 3.7 ms), but
-- each call costs a ~150 ms round trip, and some of them had to WAIT for an
-- earlier call's ids before they could even be issued.
--
-- Worst case was the late-arrivals figure: staff + rules + sessions, THEN
-- staff_shift_assignments (needs the staff ids), THEN shifts (needs the shift
-- ids) — five calls in three sequential waves for a single number.
--
-- All three functions are SECURITY INVOKER on purpose. They run as the caller,
-- so every existing row-level policy still applies untouched: an outlet-scoped
-- Manager keeps seeing only their own outlet, a non-owner still reads no
-- salary_settlements rows. Nothing here grants access anyone did not already
-- have through the REST calls it replaces. Where privileged data IS needed
-- (comp-off, trial balance) they call the existing SECURITY DEFINER helpers
-- rather than reaching into the underlying tables.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Attendance overview — replaces useAttendanceSummary (3 calls) and
--    useLateForDate (5 calls / 3 waves) with one.
--
-- Mirrors the client logic it replaces exactly, including two subtleties:
--   * "present" counts DISTINCT sessions keyed by staff_id, falling back to
--     user_id — and when no outlet filter is given it counts every session on
--     the date, not only those belonging to tracked staff;
--   * a staff member is absent only when they have no session AND no approved
--     leave; "late" needs a rostered shift, so staff without one are skipped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_attendance_overview(
  _date   date,
  _outlet uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH tracked AS (
  SELECT s.id, s.user_id, s.employee_id, s.full_name
    FROM staff s
   WHERE s.is_active
     AND s.attendance_tracked
     AND (_outlet IS NULL OR s.outlet_id = _outlet)
),
sess AS (
  SELECT a.staff_id, a.user_id, a.status, a.check_in_at
    FROM attendance_sessions a
   WHERE a.work_date = _date
     AND (
       _outlet IS NULL
       OR a.staff_id IN (SELECT id FROM tracked)
       OR a.user_id IN (SELECT user_id FROM tracked WHERE user_id IS NOT NULL)
     )
),
-- The set of "someone attended" keys, exactly as the client built it.
present_keys AS (
  SELECT DISTINCT COALESCE(staff_id, user_id) AS k
    FROM sess
   WHERE COALESCE(staff_id, user_id) IS NOT NULL
),
on_leave AS (
  SELECT DISTINCT l.staff_id
    FROM leave_records l
   WHERE l.status = 'approved'
     AND l.leave_date = _date
),
-- Per tracked staff: attended / on leave / absent.
staff_state AS (
  SELECT t.id,
         (t.id IN (SELECT k FROM present_keys)
          OR (t.user_id IS NOT NULL AND t.user_id IN (SELECT k FROM present_keys))) AS attended,
         (t.id IN (SELECT staff_id FROM on_leave)) AS is_on_leave
    FROM tracked t
),
grace AS (
  SELECT COALESCE(
           (SELECT r.grace_minutes_in
              FROM discipline_rules r
             ORDER BY r.updated_at DESC
             LIMIT 1),
           10
         ) AS minutes
),
-- One shift per staff, chosen deterministically (the client's Map kept
-- whichever row happened to come last).
shift_of AS (
  SELECT DISTINCT ON (a.staff_id) a.staff_id, sh.check_in_time
    FROM staff_shift_assignments a
    JOIN shifts sh ON sh.id = a.shift_id
   WHERE a.staff_id IN (SELECT id FROM tracked)
     AND a.shift_id IS NOT NULL
   ORDER BY a.staff_id, a.shift_id
),
-- Earliest check-in per staff on the date.
first_in AS (
  SELECT s.staff_id, MIN(s.check_in_at) AS check_in_at
    FROM sess s
   WHERE s.staff_id IS NOT NULL
     AND s.check_in_at IS NOT NULL
   GROUP BY s.staff_id
),
late AS (
  SELECT t.id AS staff_id,
         t.employee_id,
         t.full_name,
         -- IST wall-clock shift start on _date, expressed as an instant.
         ((_date::timestamp + so.check_in_time) - interval '5 hours 30 minutes')
           AT TIME ZONE 'UTC' AS scheduled_at,
         fi.check_in_at,
         ROUND(EXTRACT(EPOCH FROM (
           fi.check_in_at
           - (((_date::timestamp + so.check_in_time) - interval '5 hours 30 minutes') AT TIME ZONE 'UTC')
         )) / 60)::int - (SELECT minutes FROM grace) AS late_minutes
    FROM tracked t
    JOIN shift_of so ON so.staff_id = t.id
    JOIN first_in fi ON fi.staff_id = t.id
)
SELECT jsonb_build_object(
  'date',         _date,
  'totalTracked', (SELECT count(*) FROM tracked),
  'present',      (SELECT count(*) FROM present_keys),
  'checkedIn',    (SELECT count(*) FROM sess WHERE status = 'active'),
  'onBreak',      (SELECT count(*) FROM sess WHERE status = 'on_break'),
  'completed',    (SELECT count(*) FROM sess WHERE status = 'completed'),
  'onLeave',      (SELECT count(*) FROM staff_state WHERE NOT attended AND is_on_leave),
  'absent',       (SELECT count(*) FROM staff_state WHERE NOT attended AND NOT is_on_leave),
  'late',         COALESCE((
                    SELECT jsonb_agg(x ORDER BY x.late_minutes DESC)
                      FROM (
                        SELECT staff_id,
                               employee_id,
                               full_name,
                               scheduled_at,
                               check_in_at,
                               late_minutes
                          FROM late
                         WHERE late_minutes > 0
                      ) x
                  ), '[]'::jsonb)
);
$$;

COMMENT ON FUNCTION public.get_attendance_overview(date, uuid) IS
  'Live attendance roll-up + late arrivals for one date, optionally scoped to an outlet. SECURITY INVOKER: existing RLS decides what the caller sees.';


-- ---------------------------------------------------------------------------
-- 2. Dashboard stats — replaces the seven parallel calls in useDashboardStats.
--
-- _with_salary mirrors the client's salary-permission branch. It only decides
-- whether the payroll/settlement figures are COMPUTED; it grants nothing,
-- because salary_settlements is still read as the caller (a non-owner reads
-- zero rows regardless of what is passed here).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(_with_salary boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH active_staff AS (
  SELECT s.id, s.monthly_salary
    FROM staff s
   WHERE s.is_active
),
pending_req AS (
  SELECT p.amount FROM payment_requests p WHERE p.status = 'pending'
),
approved_req AS (
  SELECT p.amount
    FROM payment_requests p
   WHERE p.status = 'approved' AND p.paid_at IS NULL
),
pending_settlements AS (
  SELECT ss.balance_payable
    FROM salary_settlements ss
   WHERE _with_salary AND ss.status = 'pending'
),
-- Account 1200 = Staff Advances, taken from the aggregated trial balance so
-- journal_lines is never pulled row by row.
advances AS (
  SELECT COALESCE((
    SELECT tb.balance
      FROM get_trial_balance() tb
     WHERE tb.account_code = '1200'
     LIMIT 1
  ), 0) AS amount
)
SELECT jsonb_build_object(
  'activeStaff',                (SELECT count(*) FROM active_staff),
  'staffMissingSalary',         (SELECT count(*) FROM staff s
                                  WHERE s.is_active
                                    AND (s.monthly_salary IS NULL OR s.monthly_salary = 0)),
  'pendingRequests',            (SELECT count(*) FROM pending_req),
  'approvedRequests',           (SELECT count(*) FROM approved_req),
  'pendingSalarySettlements',   (SELECT count(*) FROM pending_settlements),
  'completedPaymentsToday',     (SELECT count(*) FROM journal_entries j
                                  WHERE j.created_at >= date_trunc('day', now())),
  'totalPendingRequestsAmount', (SELECT COALESCE(sum(amount), 0) FROM pending_req),
  'totalApprovedRequestsAmount',(SELECT COALESCE(sum(amount), 0) FROM approved_req),
  'totalPendingSalaryAmount',   (SELECT COALESCE(sum(balance_payable), 0) FROM pending_settlements),
  'advancesOutstanding',        (SELECT amount FROM advances),
  'monthlyPayroll',             CASE WHEN _with_salary
                                  THEN (SELECT COALESCE(sum(monthly_salary), 0) FROM active_staff)
                                  ELSE 0 END
);
$$;

COMMENT ON FUNCTION public.get_dashboard_stats(boolean) IS
  'Headline dashboard counts and amounts in one call. SECURITY INVOKER: existing RLS decides what the caller sees.';


-- ---------------------------------------------------------------------------
-- 3. Leave balances overview — replaces the four calls behind LeaveBalancesCard
--    (leave settings, leave taken, comp-off, staff list).
--
-- Entitlement follows the default leave type, prorated for monthly accrual the
-- same way entitledForYear() does on the client. Comp-off comes from the
-- existing SECURITY DEFINER helper, so the owner-only salary_settlements table
-- is not touched directly here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_leave_balances_overview(_year int DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH y AS (
  SELECT COALESCE(_year, EXTRACT(YEAR FROM now())::int) AS yr
),
settings AS (
  SELECT COALESCE(t.default_quota, 12) AS quota,
         COALESCE(t.accrual, 'annual') AS accrual
    FROM leave_types t
   WHERE t.is_default AND t.is_active
   ORDER BY t.sort_order
   LIMIT 1
),
entitled AS (
  SELECT CASE
           WHEN (SELECT accrual FROM settings) = 'monthly'
             -- Prorate by months elapsed, exactly as entitledForYear() does.
             THEN ROUND(
                    ((SELECT quota FROM settings) / 12.0)
                    * CASE
                        WHEN EXTRACT(YEAR FROM now())::int > (SELECT yr FROM y) THEN 12
                        WHEN EXTRACT(YEAR FROM now())::int < (SELECT yr FROM y) THEN 0
                        ELSE EXTRACT(MONTH FROM now())::int
                      END, 2)
           ELSE COALESCE((SELECT quota FROM settings), 12)
         END AS days
),
taken AS (
  SELECT l.staff_id, count(*)::numeric AS n
    FROM leave_records l
   WHERE l.status = 'approved'
     AND l.leave_type = 'paid'
     AND l.leave_date >= make_date((SELECT yr FROM y), 1, 1)
     AND l.leave_date <= make_date((SELECT yr FROM y), 12, 31)
   GROUP BY l.staff_id
),
comp AS (
  SELECT c.staff_id, COALESCE(c.comp_off, 0)::numeric AS n
    FROM get_comp_off_earned_by_staff((SELECT yr FROM y)) c
)
SELECT jsonb_build_object(
  'entitled', (SELECT days FROM entitled),
  'rows', COALESCE((
    SELECT jsonb_agg(r ORDER BY r.full_name)
      FROM (
        SELECT sp.id,
               sp.full_name,
               ROUND((SELECT days FROM entitled) + COALESCE(c.n, 0) - COALESCE(tk.n, 0), 2) AS remaining,
               ROUND((SELECT days FROM entitled) + COALESCE(c.n, 0), 2)                     AS available
          FROM staff_public sp
          LEFT JOIN taken tk ON tk.staff_id = sp.id
          LEFT JOIN comp  c  ON c.staff_id  = sp.id
         WHERE sp.is_active
      ) r
  ), '[]'::jsonb)
);
$$;

COMMENT ON FUNCTION public.get_leave_balances_overview(int) IS
  'Per-staff pending paid-leave balance for a year in one call. SECURITY INVOKER: existing RLS decides what the caller sees.';


GRANT EXECUTE ON FUNCTION public.get_attendance_overview(date, uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(boolean)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leave_balances_overview(int)      TO authenticated;

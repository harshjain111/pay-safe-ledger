-- =============================================================================
--  FRESH-START DATA WIPE  —  Supabase SQL Editor script
-- =============================================================================
--
--  ⚠️  THIS PERMANENTLY DELETES DATA AND CANNOT BE UNDONE.
--  ⚠️  TAKE A FULL BACKUP FIRST (see "BACKUP FIRST" below). Do not skip this.
--
--  WHAT THIS DOES (confirmed scope)
--  --------------------------------
--  KEEP (untouched):
--    • Logins .......... auth.users
--    • Roles ........... user_roles
--    • Org / setup ..... accounts (chart of accounts), clubs, events, shifts,
--                        discipline_rules, custom_expense_categories,
--                        payroll_statutory_settings
--    • The OWNER/ADMIN employee record(s) and their own profile sub-rows
--      (documents, loans, employment_history, salary_history, shift assignments)
--
--  DELETE (every row — a clean operational slate):
--    • All accounting / payroll txns: journal_entries, journal_lines,
--      ledger_entries, salary_settlements, salary_settlement_loan_deductions,
--      payment_requests, expenses, petty_cash_transactions
--    • All attendance & leave: attendance_sessions, attendance_breaks,
--      attendance_discipline_log, leave_records
--    • All messaging / audit: notifications, whatsapp_notification_log, audit_log
--
--  DELETE (all EXCEPT the owner/admin's own):
--    • staff and its per-employee sub-tables (staff_documents, staff_loans,
--      employment_history, salary_history, staff_shift_assignments)
--
--  "Owner/admin" = a staff row whose user_id maps to a user_roles row with
--  role 'owner' or 'admin'. A staff row with NO linked login (user_id IS NULL)
--  is treated as a removable employee record.
--
--  BACKUP FIRST (pick one):
--    1. Supabase Dashboard → Database → Backups → take/download a backup, OR
--    2. pg_dump "postgresql://...":  pg_dump --no-owner -Fc -f backup.dump <CONN>
--    3. (Inside the app) Settings → Clear Transaction Data also exports an xlsx
--       of the core ledgers before clearing — handy as a partial safety net.
--
--  HOW TO RUN:
--    • Open Supabase Dashboard → SQL Editor (runs as the postgres role, which is
--      required for SET session_replication_role below).
--    • FIRST run STEP 0 (preview) on its own and eyeball which staff are kept.
--    • Only then run STEP 1 (the BEGIN…COMMIT block) to perform the wipe.
-- =============================================================================


-- =============================================================================
--  STEP 0 — PREVIEW (read-only). Run this ALONE first and confirm the result.
--           Nothing is deleted by this step.
-- =============================================================================
WITH keep_users AS (
  SELECT user_id FROM public.user_roles
  WHERE role IN ('owner','admin') AND user_id IS NOT NULL
)
SELECT
  CASE
    WHEN s.user_id IN (SELECT user_id FROM keep_users) THEN 'KEEP (owner/admin)'
    ELSE 'DELETE'
  END AS action,
  s.employee_id,
  s.full_name,
  s.phone,
  s.user_id
FROM public.staff s
ORDER BY action, s.full_name;


-- =============================================================================
--  STEP 1 — THE WIPE. Run the whole BEGIN…COMMIT block together.
--           Review STEP 0 output BEFORE running this.
-- =============================================================================
BEGIN;

-- Bypass the immutability/protection triggers on the financial tables (this is
-- exactly what the app's admin_clear_transaction_data() routine does). As a side
-- effect FK enforcement is relaxed for this session, so the delete order below
-- cannot trip a constraint. Requires the postgres role (Supabase SQL Editor).
SET session_replication_role = 'replica';

-- The set of logins whose employee record(s) we KEEP.
-- (Re-declared as a CTE inside each statement below for clarity/independence.)

-- -----------------------------------------------------------------------------
-- 1) TRANSACTIONAL / OPERATIONAL TABLES — wipe every row (children before parents)
-- -----------------------------------------------------------------------------

-- Accounting & payroll (children first)
DELETE FROM public.salary_settlement_loan_deductions;  -- → salary_settlements, staff_loans
DELETE FROM public.payment_requests;                   -- → salary_settlements, ledger_entries
DELETE FROM public.expenses;                           -- → ledger_entries
DELETE FROM public.salary_settlements;                 -- → journal_entries, ledger_entries
DELETE FROM public.journal_lines;                      -- → journal_entries
DELETE FROM public.journal_entries;
DELETE FROM public.ledger_entries;
DELETE FROM public.petty_cash_transactions;

-- Attendance / leave / discipline activity
DELETE FROM public.attendance_breaks;                  -- → attendance_sessions
DELETE FROM public.attendance_sessions;
DELETE FROM public.attendance_discipline_log;
DELETE FROM public.leave_records;

-- Messaging / audit
DELETE FROM public.notifications;
DELETE FROM public.whatsapp_notification_log;
DELETE FROM public.audit_log;

-- -----------------------------------------------------------------------------
-- 2) STAFF + PER-EMPLOYEE SUB-TABLES — remove all EXCEPT the owner/admin's own
-- -----------------------------------------------------------------------------

-- Per-employee history/docs belonging to the staff being removed.
DELETE FROM public.staff_documents
WHERE staff_id IN (
  SELECT id FROM public.staff
  WHERE user_id IS NULL
     OR user_id NOT IN (SELECT user_id FROM public.user_roles
                        WHERE role IN ('owner','admin') AND user_id IS NOT NULL)
);

DELETE FROM public.staff_loans
WHERE staff_id IN (
  SELECT id FROM public.staff
  WHERE user_id IS NULL
     OR user_id NOT IN (SELECT user_id FROM public.user_roles
                        WHERE role IN ('owner','admin') AND user_id IS NOT NULL)
);

DELETE FROM public.employment_history
WHERE staff_id IN (
  SELECT id FROM public.staff
  WHERE user_id IS NULL
     OR user_id NOT IN (SELECT user_id FROM public.user_roles
                        WHERE role IN ('owner','admin') AND user_id IS NOT NULL)
);

DELETE FROM public.salary_history
WHERE staff_id IN (
  SELECT id FROM public.staff
  WHERE user_id IS NULL
     OR user_id NOT IN (SELECT user_id FROM public.user_roles
                        WHERE role IN ('owner','admin') AND user_id IS NOT NULL)
);

DELETE FROM public.staff_shift_assignments
WHERE staff_id IN (
  SELECT id FROM public.staff
  WHERE user_id IS NULL
     OR user_id NOT IN (SELECT user_id FROM public.user_roles
                        WHERE role IN ('owner','admin') AND user_id IS NOT NULL)
);

-- Detach self-referencing manager links so a KEPT owner/admin row never points
-- at a staff row we are about to delete (avoids a dangling reporting_manager_id).
UPDATE public.staff
SET reporting_manager_id = NULL
WHERE reporting_manager_id IN (
  SELECT id FROM public.staff
  WHERE user_id IS NULL
     OR user_id NOT IN (SELECT user_id FROM public.user_roles
                        WHERE role IN ('owner','admin') AND user_id IS NOT NULL)
);

-- Finally remove the staff themselves (everyone except owner/admin).
DELETE FROM public.staff
WHERE user_id IS NULL
   OR user_id NOT IN (SELECT user_id FROM public.user_roles
                      WHERE role IN ('owner','admin') AND user_id IS NOT NULL);

-- Restore normal trigger / FK behavior for the session.
SET session_replication_role = 'origin';

-- -----------------------------------------------------------------------------
-- Review the counts in the output, then COMMIT.
-- If anything looks wrong, run  ROLLBACK;  instead of COMMIT; and nothing changes.
-- -----------------------------------------------------------------------------
COMMIT;


-- =============================================================================
--  STEP 2 — VERIFY (read-only). Run after COMMIT to confirm the fresh state.
-- =============================================================================
SELECT 'staff'                  AS table, count(*) FROM public.staff
UNION ALL SELECT 'user_roles',           count(*) FROM public.user_roles
UNION ALL SELECT 'accounts (kept)',      count(*) FROM public.accounts
UNION ALL SELECT 'journal_entries',      count(*) FROM public.journal_entries
UNION ALL SELECT 'ledger_entries',       count(*) FROM public.ledger_entries
UNION ALL SELECT 'salary_settlements',   count(*) FROM public.salary_settlements
UNION ALL SELECT 'payment_requests',     count(*) FROM public.payment_requests
UNION ALL SELECT 'expenses',             count(*) FROM public.expenses
UNION ALL SELECT 'attendance_sessions',  count(*) FROM public.attendance_sessions
UNION ALL SELECT 'leave_records',        count(*) FROM public.leave_records
UNION ALL SELECT 'notifications',        count(*) FROM public.notifications
UNION ALL SELECT 'audit_log',            count(*) FROM public.audit_log
ORDER BY 1;

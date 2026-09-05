-- ============================================================================
-- A leave REQUEST carries no salary effect until someone approves it.
--
-- leave_records.deduction_days defaulted to 1, so any insert that omitted the
-- column — the employee app raising a request, for instance — arrived already
-- claiming a day of salary. The approval dialog then showed that 1 next to a
-- leave type that deducts nothing, which is the contradiction the client hit:
-- "Weekly Off (paid)" sitting above "Salary Deduction: 1".
--
-- The deduction belongs to the DECISION, not the request: the approver picks a
-- leave type and the type's rule sets it (LeaveApprovalDialog now derives it
-- and ignores whatever the pending row carried). Defaulting to 0 makes the
-- database agree with that — a request that nobody has judged yet costs
-- nothing, and the employee's own screen stops showing "-1d salary" against a
-- day that may well be approved as paid.
--
-- Approved rows are unaffected: every write path sets deduction_days
-- explicitly. This only changes what an omitted column falls back to.
-- ============================================================================

ALTER TABLE public.leave_records
  ALTER COLUMN deduction_days SET DEFAULT 0;

-- Pending rows that are still carrying the old default. Nothing has been
-- decided about them, and payroll only counts APPROVED leave, so this changes
-- no pay — it stops the employee app showing a deduction for an undecided day.
UPDATE public.leave_records
   SET deduction_days = 0
 WHERE status = 'pending'
   AND deduction_days = 1
   AND leave_type_id IS NULL;

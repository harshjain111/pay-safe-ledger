-- ============================================================================
-- PHASE 4 (Attendo rebuild): Finalized Payroll + Salary Increments support.
--
-- 1. log_payroll_action(): audited free-form payroll actions (de-finalize
--    with its mandatory reason). SECURITY DEFINER, gated on the same
--    settlements.lock permission that gates locking/unlocking.
-- 2. staff.salary_review_last_notified_at: the "fire once per crossing"
--    marker for the salary-review-due notification (an on-load check, not a
--    cron — chosen for zero new infrastructure).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_payroll_action(_action text, _scope jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec uuid := gen_random_uuid();
BEGIN
  IF NOT public.has_permission(auth.uid(), 'settlements.lock') THEN
    RAISE EXCEPTION 'You do not have permission to perform payroll actions';
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, action, new_data, performed_by)
  VALUES ('payroll_actions', rec, _action, _scope, auth.uid());

  RETURN rec;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_payroll_action(text, jsonb) TO authenticated;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS salary_review_last_notified_at timestamptz;

-- ============================================================================
-- Let HR write the leave-balance audit trail.
--
-- HR already has ALL on employee_leave_balance ("HR can manage employee leave
-- balances"), and the Leave Balance page admits HR (isOwner || isAdmin ||
-- isHR). But leave_balance_adjustment INSERT was owner/admin only, so an HR
-- running Bulk Adjust — or the new "Apply to balances" button in Settings —
-- wrote the balance and then failed on the audit row: the change landed with
-- an error toast and no audit trail. Exactly backwards, since HR is the role
-- that actually does this work.
--
-- Reads stay as they were (owner / admin / accountant); this only adds the
-- writer that was missing.
-- ============================================================================

DROP POLICY IF EXISTS "Owners and admins write leave adjustments" ON public.leave_balance_adjustment;

CREATE POLICY "Owners, admins and HR write leave adjustments"
  ON public.leave_balance_adjustment
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
  );

-- HR must be able to read back what it wrote (the page shows old → new).
DROP POLICY IF EXISTS "Reviewers read leave adjustments" ON public.leave_balance_adjustment;

CREATE POLICY "Reviewers read leave adjustments"
  ON public.leave_balance_adjustment
  FOR SELECT
  USING (
    has_role(auth.uid(), 'owner'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'accountant'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
  );

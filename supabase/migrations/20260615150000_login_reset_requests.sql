-- =============================================================================
-- Login Reset requests — a new approval type for the unified Approvals inbox
-- =============================================================================
-- Staff (or a manager on their behalf) raise a request to have their app login
-- credential reset. It flows through Approvals with the same
-- pending / approved / rejected lifecycle as advances and expenses. Approving
-- triggers the credential reset (reset-user-password edge function, owner-only)
-- and notifies the staff member. Every raise / approve / reject is captured in
-- the Audit Log via the shared log_audit_entry() trigger (same as
-- payment_requests and expenses).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.login_reset_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id         uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  requested_by     uuid REFERENCES auth.users(id),
  reason           text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by      uuid REFERENCES auth.users(id),
  reviewed_by_name text,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_reset_requests_staff  ON public.login_reset_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_login_reset_requests_status ON public.login_reset_requests(status);

ALTER TABLE public.login_reset_requests ENABLE ROW LEVEL SECURITY;

-- Read: reviewers (owner / admin / accountant) see all; a staff member sees
-- their own requests.
CREATE POLICY "Reviewers and owner read login resets"
  ON public.login_reset_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant')
    OR staff_id = public.get_user_staff_id(auth.uid())
  );

-- Raise: a staff member for themselves, or an owner / admin on their behalf.
CREATE POLICY "Staff self or managers raise login resets"
  ON public.login_reset_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (
      staff_id = public.get_user_staff_id(auth.uid())
      OR public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

-- Review (approve / reject): owners and admins. The actual credential reset is
-- enforced owner-only inside the reset-user-password edge function.
CREATE POLICY "Owners and admins review login resets"
  ON public.login_reset_requests FOR UPDATE TO authenticated
  USING      (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER login_reset_requests_set_updated_at
  BEFORE UPDATE ON public.login_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit every raise / approve / reject, mirroring payment_requests & expenses.
CREATE TRIGGER audit_login_reset_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.login_reset_requests
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();

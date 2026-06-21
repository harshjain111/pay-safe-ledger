-- ============================================================================
-- Fix login_reset_requests RLS (audit P3-H1)
-- ============================================================================
-- A blanket migration (20260618065108) added world-readable SELECT
-- ("Read …" USING (true)) and an admin-manage ALL policy to many tables,
-- including login_reset_requests. Being PERMISSIVE (OR'd) with the scoped
-- 20260615150000 policies, the loose ones win: any authenticated user could read
-- every login-reset request, and an admin could flip status='approved' directly
-- even though the actual credential reset (reset-user-password edge fn) is
-- owner-only. Drop the blanket policies and restrict review to OWNER only.
-- ============================================================================

DROP POLICY IF EXISTS "Read login_reset_requests"   ON public.login_reset_requests;
DROP POLICY IF EXISTS "Manage login_reset_requests" ON public.login_reset_requests;

-- Review (approve/reject) is owner-only — matches the owner-only edge function and
-- the app's owner-only login-reset actions (admins must not record a false
-- "approved" without a reset actually happening).
DROP POLICY IF EXISTS "Owners and admins review login resets" ON public.login_reset_requests;
CREATE POLICY "Owners review login resets"
  ON public.login_reset_requests FOR UPDATE TO authenticated
  USING      (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- The scoped SELECT ("Reviewers and owner read login resets") and INSERT
-- ("Staff self or managers raise login resets") from 20260615150000 remain in
-- force and are now the only policies governing this table.

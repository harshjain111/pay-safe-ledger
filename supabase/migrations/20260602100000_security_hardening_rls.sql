-- =============================================================================
-- Security hardening: close over-permissive RLS / grants flagged by the linter
-- =============================================================================
-- Three independent, non-breaking fixes. Each was scoped against the actual
-- frontend/edge usage so existing app flows keep working:
--
--   1. expense-proofs storage: an over-broad SELECT policy let ANY authenticated
--      user read EVERY staff member's expense receipts. Replace it with an
--      ownership-scoped policy so a staff member only sees proofs attached to
--      their OWN expenses. Owners/finance keep their existing view-all policies.
--
--   2. notifications INSERT: the policy only required `auth.uid() IS NOT NULL`,
--      so any logged-in user could insert a notification targeting any user_id
--      (spoofing). All legitimate fan-out goes through create_notification()
--      (SECURITY DEFINER, bypasses RLS); the only direct client insert is the
--      owner-only password-reset dialog. Restrict direct inserts to owner/admin.
--
--   3. admin_clear_transaction_data(): this destructive RPC is only ever invoked
--      by the clear-transaction-data edge function via the service_role key,
--      never from the client. Lock EXECUTE down to service_role (defense in
--      depth -- it already has an internal owner check) so a signed-in non-owner
--      cannot call it directly.
-- =============================================================================

-- 1. expense-proofs ----------------------------------------------------------
-- Drop the broad "any authenticated user can read the whole bucket" policy.
DROP POLICY IF EXISTS "Authenticated users can view expense proofs" ON storage.objects;

-- Staff can read a proof only if it belongs to one of their own expenses.
-- expenses.proof_url stores the exact storage object path (verified in
-- NewExpense.tsx and QuickExpenseForm.tsx), so we match it against
-- storage.objects.name. This works regardless of the folder-prefix scheme used
-- at upload time (the two upload paths use different prefixes). get_user_staff_id
-- is SECURITY DEFINER, so it reliably maps the caller to their own staff_id.
CREATE POLICY "Staff can view proofs for their own expenses"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'expense-proofs'
  AND EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.staff_id = public.get_user_staff_id(auth.uid())
      AND e.proof_url = storage.objects.name
  )
);
-- NOTE: the pre-existing "Users can view own expense proofs" (uid folder prefix),
-- "Finance users can view all expense proofs", and "Owners can manage all expense
-- proofs" policies are intentionally left intact -- they continue to provide
-- owner/finance access. RLS policies are OR'd, so this only ADDS staff self-view.

-- 2. notifications INSERT -----------------------------------------------------
DROP POLICY IF EXISTS "Authenticated can receive notifications" ON public.notifications;

-- Only owners/admins may insert notifications directly. Every staff-triggered
-- notification is created server-side via public.create_notification(), which is
-- SECURITY DEFINER and bypasses RLS, so this does NOT affect staff workflows.
-- The single direct client insert (ResetPasswordDialog) runs as an owner.
CREATE POLICY "Privileged users can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin')
);

-- 3. Lock down the destructive clear RPC -------------------------------------
-- Revoke the default PUBLIC execute grant (which covers anon + authenticated)
-- and re-grant only to service_role, which is what the edge function connects as.
REVOKE EXECUTE ON FUNCTION public.admin_clear_transaction_data(date, date, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_clear_transaction_data(date, date, uuid) TO service_role;

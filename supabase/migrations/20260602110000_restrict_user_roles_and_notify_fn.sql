-- =============================================================================
-- Restrict user_roles SELECT exposure + move notification fan-out server-side
-- =============================================================================
-- Finding: "Authenticated users can view all user roles" (USING true) let ANY
-- logged-in user read the full user_id -> role map (who is owner/admin/etc.).
--
-- The base migration already defines "Users can view their own role"
-- (USING user_id = auth.uid()); the later USING(true) policy simply overrode it.
-- We drop the broad policy (restoring self-only visibility for ordinary staff)
-- and add a privileged-only policy so management/approver UIs that legitimately
-- need the whole map (owner/admin/accountant/ca) keep working.
--
-- The only thing ordinary STAFF used the broad read for was looking up
-- owner/admin/accountant user_ids to fan out notifications client-side
-- (notifications.ts, NewRequest.tsx, NewExpense.tsx). That is replaced by the
-- SECURITY DEFINER function notify_users_by_role() below, which performs the
-- role lookup AND the notification insert entirely server-side, so the client
-- never needs to read user_roles at all.
-- =============================================================================

-- 1. Tighten the SELECT policy ------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view all user roles" ON public.user_roles;

-- (kept: base-migration policy "Users can view their own role" -> user_id = auth.uid())
CREATE POLICY "Privileged users can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'owner')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'accountant')
  OR public.has_role(auth.uid(), 'ca')
);

-- 2. Server-side, role-targeted notification fan-out --------------------------
-- Looks up every user holding one of _roles and inserts a notification for each.
-- SECURITY DEFINER so it bypasses the user_roles SELECT restriction and the
-- notifications INSERT restriction -- this is the single sanctioned path for a
-- non-privileged user to notify owners/admins (e.g. "I submitted an expense").
-- Excludes the caller by default so you are not notified about your own action.
CREATE OR REPLACE FUNCTION public.notify_users_by_role(
  _roles public.app_role[],
  _title TEXT,
  _message TEXT,
  _type TEXT DEFAULT 'info',
  _reference_type TEXT DEFAULT NULL,
  _reference_id UUID DEFAULT NULL,
  _exclude_self BOOLEAN DEFAULT true
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted INTEGER := 0;
  _uid UUID;
BEGIN
  FOR _uid IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = ANY (_roles)
      AND (NOT _exclude_self OR ur.user_id <> auth.uid())
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (_uid, _title, _message, _type, _reference_type, _reference_id);
    _inserted := _inserted + 1;
  END LOOP;

  RETURN _inserted;
END;
$$;

-- ============================================================================
-- Phase A — Notification fan-out backbone.
--
-- The in-app notification centre (bell + realtime) + a per-user create helper
-- already exist. This adds the missing piece: server-side fan-out so any event
-- can notify the RIGHT people (owners, and a staff member's reporting manager)
-- without the caller needing RLS access to resolve them. SECURITY DEFINER.
--
-- First wired event: new-staff enrolment -> owners + the new hire's manager
-- (item 13). More events (setting changes, shift edits) get wired as their
-- feature phases land, all through notify_users / notify_management.
-- ============================================================================

-- Insert one notification per recipient (deduped, skips NULLs).
CREATE OR REPLACE FUNCTION public.notify_users(
  _user_ids uuid[],
  _title text,
  _message text,
  _type text DEFAULT 'info',
  _reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
  SELECT DISTINCT uid, _title, _message, _type, _reference_type, _reference_id
  FROM unnest(_user_ids) AS uid
  WHERE uid IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION public.notify_users(uuid[], text, text, text, text, uuid) TO authenticated, service_role;

-- Notify management: every owner, plus the given staff's reporting manager's
-- login. Excludes the actor (auth.uid()) so no one is pinged about their own action.
CREATE OR REPLACE FUNCTION public.notify_management(
  _title text,
  _message text,
  _type text DEFAULT 'info',
  _staff_id uuid DEFAULT NULL,
  _reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recips uuid[];
  mgr uuid;
BEGIN
  -- All owners (the owner-tier audience; there is no separate 'admin' role).
  SELECT array_agg(DISTINCT ur.user_id) INTO recips
  FROM public.user_roles ur
  WHERE ur.role = 'owner'
    AND ur.user_id IS DISTINCT FROM auth.uid();

  -- The staff member's reporting manager's login, if any.
  IF _staff_id IS NOT NULL THEN
    SELECT mgr_staff.user_id INTO mgr
    FROM public.staff s
    JOIN public.staff mgr_staff ON mgr_staff.id = s.reporting_manager_id
    WHERE s.id = _staff_id
      AND mgr_staff.user_id IS NOT NULL
      AND mgr_staff.user_id IS DISTINCT FROM auth.uid()
    LIMIT 1;
    IF mgr IS NOT NULL THEN
      recips := COALESCE(recips, '{}') || mgr;
    END IF;
  END IF;

  IF recips IS NOT NULL AND array_length(recips, 1) IS NOT NULL THEN
    PERFORM public.notify_users(recips, _title, _message, _type, _reference_type, _reference_id);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.notify_management(text, text, text, uuid, text, uuid) TO authenticated, service_role;

-- ---- First wired event: new staff enrolment -> management (item 13) ----
CREATE OR REPLACE FUNCTION public.trg_notify_new_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_management(
    'New staff enrolled',
    COALESCE(NEW.full_name, 'A new staff member') || ' has been added to the team.',
    'info',
    NEW.id,
    'staff',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_notify_new ON public.staff;
CREATE TRIGGER staff_notify_new
  AFTER INSERT ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_new_staff();

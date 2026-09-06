-- ---------------------------------------------------------------------------
-- Staff could see 32 of their own 236 attendance sessions.
--
-- attendance_sessions carries two owner columns: staff_id, and a denormalised
-- user_id copied from staff.user_id. Everything on the staff side keys off
-- user_id — the RLS SELECT policy, My Attendance → Logs, My Attendance →
-- Summary — and 36,414 of 42,847 rows (85%, all source='biometric') have it
-- NULL. So the staff portal showed only app check-ins and hid every device
-- punch, and the Summary tab's present-day counts were wrong by that margin.
--
-- The NULLs are self-perpetuating: rebuild_sessions_by_gap() reads user_id
-- back out of the existing rows it is about to delete, so every rebuild
-- carried the gap forward. Payroll was never affected — it runs as owner and
-- reads by staff_id.
--
-- Four layers, because one alone leaves the hole open:
--   1. backfill what is already there
--   2. a trigger so it cannot drift again, including through the rebuild
--   3. widen the RLS policy to accept staff_id ownership
--   4. (in the client) read by staff_id, the key that is actually stable
-- ---------------------------------------------------------------------------

-- 1. Backfill. staff.user_id is populated for all 214 active staff, so every
--    orphaned session can be attributed.
UPDATE public.attendance_sessions a
   SET user_id = s.user_id
  FROM public.staff s
 WHERE a.staff_id = s.id
   AND a.user_id IS NULL
   AND s.user_id IS NOT NULL;

-- 2. Keep it filled. Fires only when user_id is absent, so an explicit value
--    (or a staff row with no auth account yet) is left exactly as given.
CREATE OR REPLACE FUNCTION public.attendance_session_fill_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.staff_id IS NOT NULL THEN
    SELECT s.user_id INTO NEW.user_id FROM public.staff s WHERE s.id = NEW.staff_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_session_fill_user_id ON public.attendance_sessions;
CREATE TRIGGER trg_attendance_session_fill_user_id
  BEFORE INSERT OR UPDATE OF staff_id, user_id ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.attendance_session_fill_user_id();

-- 3. Let a staff member read attendance that belongs to their staff record
--    even if the denormalised copy is ever missing again. Ownership is still
--    strictly their own: the subquery is pinned to auth.uid().
DROP POLICY IF EXISTS "Users manage own attendance sessions select" ON public.attendance_sessions;
CREATE POLICY "Users manage own attendance sessions select"
  ON public.attendance_sessions FOR SELECT
  USING (
    user_id = auth.uid()
    OR staff_id IN (SELECT s.id FROM public.staff s WHERE s.user_id = auth.uid())
  );

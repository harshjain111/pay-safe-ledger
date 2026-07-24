-- ============================================================================
-- Anonymous staff grievance / feedback box.
--
-- ANONYMITY IS THE POINT. This table has NO submitter column and NO way to
-- record who raised a complaint — not created_by, not user_id, nothing. Rows are
-- inserted ONLY by the `submit-grievance` edge function (service role); direct
-- client inserts are blocked, so there is no path that could attach an identity.
-- Attachments are uploaded by that same function (service role) so the storage
-- object has no owner. Only the DATE is stored (not the exact time) to blunt
-- timing correlation. Owners review; they see the complaint, never the person.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.grievances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category       text NOT NULL DEFAULT 'other',
  message        text,                         -- typed text (optional)
  photo_path     text,                         -- storage path in 'grievances' bucket (optional)
  voice_path     text,                         -- storage path for the voice note (optional)
  status         text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  reviewer_notes text,
  resolved_at    timestamptz,
  -- Date only (no time) — deliberately coarse so a reviewer can't correlate the
  -- exact submission moment with activity logs to guess the author.
  created_on     date NOT NULL DEFAULT CURRENT_DATE
  -- NOTE: intentionally NO user_id / created_by / actor column.
);

ALTER TABLE public.grievances ENABLE ROW LEVEL SECURITY;

-- Owners are the only reviewers. They can read + update status/notes.
-- There is deliberately NO INSERT policy: only the service-role edge function
-- (which bypasses RLS) may create rows, guaranteeing the anonymizing path.
DROP POLICY IF EXISTS "Owners read grievances" ON public.grievances;
CREATE POLICY "Owners read grievances"
  ON public.grievances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

DROP POLICY IF EXISTS "Owners update grievances" ON public.grievances;
CREATE POLICY "Owners update grievances"
  ON public.grievances FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- Private bucket for grievance attachments (photo + voice). Not public; the
-- edge function writes with the service role, owners read via signed URLs.
INSERT INTO storage.buckets (id, name, public) VALUES ('grievances', 'grievances', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Owners read grievance files" ON storage.objects;
CREATE POLICY "Owners read grievance files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'grievances' AND public.has_role(auth.uid(), 'owner'));
-- (No INSERT policy: uploads happen through the service role in the edge function.)

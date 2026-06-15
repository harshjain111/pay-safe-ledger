-- =============================================================================
-- Saved Reports — reusable definitions for the dynamic Report Builder
-- =============================================================================
-- A saved report stores a report DEFINITION (source + columns + filters +
-- group/sort) as JSON, so a user can re-run and export it later. Each user
-- manages their own saved reports (owners can see all). Data-permission
-- enforcement happens at RUN time in the builder — re-running a saved report
-- only works if the user still has the source's view permission, and the
-- underlying tables' RLS further limits the rows returned.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.saved_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  source      text NOT NULL,
  definition  jsonb NOT NULL,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_reports_created_by ON public.saved_reports(created_by);

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

-- A user sees their own saved reports; owners can see all.
CREATE POLICY "Read own saved reports"
  ON public.saved_reports FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'owner'));

-- A user creates saved reports owned by themselves.
CREATE POLICY "Create own saved reports"
  ON public.saved_reports FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Update own saved reports"
  ON public.saved_reports FOR UPDATE TO authenticated
  USING      (created_by = auth.uid() OR public.has_role(auth.uid(), 'owner'))
  WITH CHECK (created_by = auth.uid() OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Delete own saved reports"
  ON public.saved_reports FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER saved_reports_set_updated_at
  BEFORE UPDATE ON public.saved_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

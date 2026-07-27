-- ============================================================================
-- Optional (opt-in) submitter identity for grievances.
--
-- Anonymous submissions stay identity-free (these columns remain NULL, exactly
-- as before). Identity is recorded ONLY when the submitter unchecks "anonymous",
-- and is resolved server-side from their JWT in submit-grievance (so a submitter
-- can't be impersonated). Kept unreferenced (no FK) to avoid coupling.
-- ============================================================================

alter table public.grievances
  add column if not exists submitted_by      uuid,
  add column if not exists submitted_by_name text;

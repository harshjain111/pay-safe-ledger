-- ============================================================================
-- MULTI-TENANT — Phase 2: Stamp org_id onto every tenant table
--
-- Adds `org_id uuid NOT NULL` to every tenant table, backfills existing rows to
-- Org #1, indexes it, sets a DEFAULT so the app rarely has to pass org_id.
--
-- Still additive/non-breaking: RLS is NOT changed here (Phase 3). DEFAULT is
-- COALESCE(current_org_id(), Org#1) — user-context inserts stamp the caller's org;
-- service/cron/trigger inserts (no auth.uid()) fall back to Org #1. TRANSITIONAL:
-- remove the Org#1 fallback (make service/edge/cron paths org-explicit) before a
-- real 2nd org is onboarded.
--
-- The live DB has schema drift (tables not in local migrations, e.g. a leftover
-- chat feature). Each table is stamped inside its own savepoint: if one can't take
-- the FK, we LOG it and continue rather than aborting the whole migration. Read
-- the NOTICE output to see what was stamped vs skipped, then assess the skips.
-- ============================================================================

DO $$
DECLARE
  t text;
  org_one constant uuid := '00000000-0000-0000-0000-000000000001';
  excluded text[] := ARRAY[
    'permissions',            -- global permission-key catalog (same for all orgs)
    'organizations',          -- IS the org
    'organization_members',   -- already has org_id
    'org_features'            -- already has org_id
  ];
  n_stamped int := 0;
  skipped text[] := '{}';
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> ALL (excluded)
    ORDER BY table_name
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id'
    ) THEN
      CONTINUE;  -- already has org_id (idempotent)
    END IF;

    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN org_id uuid REFERENCES public.organizations(id)', t);
      EXECUTE format('UPDATE public.%I SET org_id = %L WHERE org_id IS NULL', t, org_one);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET DEFAULT COALESCE(public.current_org_id(), %L::uuid)', t, org_one);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (org_id)', 'idx_' || t || '_org_id', t);
      n_stamped := n_stamped + 1;
      RAISE NOTICE 'stamped org_id on %', t;
    EXCEPTION WHEN OTHERS THEN
      skipped := skipped || (t || ' [' || SQLSTATE || ': ' || SQLERRM || ']');
      RAISE NOTICE 'SKIPPED % -> % (%)', t, SQLERRM, SQLSTATE;
    END;
  END LOOP;

  RAISE NOTICE '=== Phase 2: % tables stamped ===', n_stamped;
  IF array_length(skipped, 1) IS NULL THEN
    RAISE NOTICE '=== skipped: none ===';
  ELSE
    RAISE NOTICE '=== skipped (% tables): % ===', array_length(skipped, 1), array_to_string(skipped, ' | ');
  END IF;
END $$;

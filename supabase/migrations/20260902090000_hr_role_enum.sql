-- ============================================================================
-- HR ROLE (part 1/2): add the enum value.
--
-- Kept in its own migration because Postgres forbids USING a freshly added enum
-- value inside the same transaction that adds it — the policies/seeds that
-- reference 'hr'::app_role live in the follow-up migration.
-- ============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';

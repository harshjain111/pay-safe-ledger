-- ============================================================================
-- PHASE 9 (part 1/2): the outlet-scoped Manager role — enum value.
-- Separate migration because a freshly added enum value cannot be USED in the
-- same transaction that adds it.
-- ============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

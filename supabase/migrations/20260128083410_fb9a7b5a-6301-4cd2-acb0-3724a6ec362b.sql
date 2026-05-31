-- ============================================
-- PART 1: ADD ADMIN ROLE
-- ============================================
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
-- Remove the "clubs" feature entirely.
-- Clubs were an optional grouping tag on expenses (expenses.club_id -> clubs.id).
-- This drops the expense column first (removing its FK), then the clubs table
-- (CASCADE also removes the table's RLS policies). Destructive: any club records
-- and the club each past expense was tagged to are permanently lost.

ALTER TABLE public.expenses DROP COLUMN IF EXISTS club_id;

DROP TABLE IF EXISTS public.clubs CASCADE;

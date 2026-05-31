-- Remove the foreign key constraint on staff.user_id since staff may not have auth accounts
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_user_id_fkey;

-- Make user_id nullable for staff without auth accounts
ALTER TABLE public.staff ALTER COLUMN user_id DROP NOT NULL;
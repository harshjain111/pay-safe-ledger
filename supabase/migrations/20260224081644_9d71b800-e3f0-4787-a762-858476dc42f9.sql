
-- Add approved_by_user_name to expenses table
ALTER TABLE public.expenses ADD COLUMN approved_by_user_name text;

-- Add approved_by_user_name to payment_requests table
ALTER TABLE public.payment_requests ADD COLUMN approved_by_user_name text;

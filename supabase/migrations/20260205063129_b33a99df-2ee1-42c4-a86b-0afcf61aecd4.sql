-- Add paid_by_user_name column to journal_entries for denormalized reporting
ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS paid_by uuid NULL,
ADD COLUMN IF NOT EXISTS paid_by_user_name text NULL;

-- Add paid_by_user_name column to salary_settlements (paid_by already exists)
ALTER TABLE public.salary_settlements
ADD COLUMN IF NOT EXISTS paid_by_user_name text NULL;

-- Add paid_by_user_name column to payment_requests (paid_by already exists)
ALTER TABLE public.payment_requests
ADD COLUMN IF NOT EXISTS paid_by_user_name text NULL;

-- Add paid_by_user_name column to expenses (reimbursed_by already exists, using that as paid_by)
ALTER TABLE public.expenses
ADD COLUMN IF NOT EXISTS reimbursed_by_user_name text NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.journal_entries.paid_by IS 'User ID who executed the payout (for payout type entries)';
COMMENT ON COLUMN public.journal_entries.paid_by_user_name IS 'Denormalized name of user who executed the payout (for reporting)';
COMMENT ON COLUMN public.salary_settlements.paid_by_user_name IS 'Denormalized name of user who executed the salary payout';
COMMENT ON COLUMN public.payment_requests.paid_by_user_name IS 'Denormalized name of user who executed the payout';
COMMENT ON COLUMN public.expenses.reimbursed_by_user_name IS 'Denormalized name of user who executed the expense reimbursement';
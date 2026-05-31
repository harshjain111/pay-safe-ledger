-- Add columns to salary_settlements to store advance snapshot data
ALTER TABLE public.salary_settlements
ADD COLUMN IF NOT EXISTS opening_advance_balance NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS closing_advance_balance NUMERIC DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.salary_settlements.opening_advance_balance IS 'Total outstanding advance at the time of settlement';
COMMENT ON COLUMN public.salary_settlements.closing_advance_balance IS 'Remaining advance after adjustment (carries forward to next month)';
COMMENT ON COLUMN public.salary_settlements.advances_adjusted IS 'Amount of advance adjusted against this month salary';
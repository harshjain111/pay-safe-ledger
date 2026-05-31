-- Add paid_at column to payment_requests to track when a request was paid
-- This prevents approved requests from appearing in Payouts after they've been paid

ALTER TABLE public.payment_requests
ADD COLUMN paid_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN paid_by UUID DEFAULT NULL,
ADD COLUMN ledger_entry_id UUID REFERENCES public.ledger_entries(id) DEFAULT NULL;

-- Add index for faster querying of unpaid approved requests
CREATE INDEX idx_payment_requests_pending_payout 
ON public.payment_requests(status, paid_at) 
WHERE status = 'approved' AND paid_at IS NULL;
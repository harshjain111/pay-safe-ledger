-- Add payout_type and settlement_id to payment_requests for salary payout tracking
ALTER TABLE public.payment_requests 
ADD COLUMN IF NOT EXISTS payout_type TEXT DEFAULT 'advance' CHECK (payout_type IN ('advance', 'salary'));

ALTER TABLE public.payment_requests 
ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES public.salary_settlements(id);

-- Add paid_status to salary_settlements to track payment after settlement
ALTER TABLE public.salary_settlements
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS paid_by UUID,
ADD COLUMN IF NOT EXISTS payment_mode TEXT;

-- Create index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_payment_requests_payout_type ON public.payment_requests(payout_type);
CREATE INDEX IF NOT EXISTS idx_payment_requests_settlement_id ON public.payment_requests(settlement_id);

-- Update RLS policies to allow Owner to see salary payout requests
DROP POLICY IF EXISTS "Owners can view salary payout requests" ON public.payment_requests;
CREATE POLICY "Owners can view salary payout requests"
ON public.payment_requests
FOR SELECT
USING (
  payout_type = 'salary' AND has_role(auth.uid(), 'owner'::app_role)
);
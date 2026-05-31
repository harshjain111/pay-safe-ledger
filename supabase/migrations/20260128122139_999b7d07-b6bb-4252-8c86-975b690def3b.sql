-- Allow Accountants to update payment_requests for payout execution (setting paid_at, paid_by, ledger_entry_id)
CREATE POLICY "Accountants can update payment requests for payout"
ON public.payment_requests
FOR UPDATE
USING (has_role(auth.uid(), 'accountant'::app_role) AND status = 'approved')
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));
-- Allow Admins to view accounts for expense approvals
CREATE POLICY "Admins can view accounts"
ON public.accounts FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow Accountants to view accounts for payouts
CREATE POLICY "Accountants can view accounts"
ON public.accounts FOR SELECT
USING (has_role(auth.uid(), 'accountant'::app_role));
-- Fix INSERT policies for expenses table
-- Allow Admin, Accountant to insert expenses (they create on behalf of staff)
-- Fix Staff policy to ensure it works correctly

-- Add INSERT policy for Admin
CREATE POLICY "Admins can create expenses"
ON public.expenses FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add INSERT policy for Accountant (they can create expenses for any staff in accounting mode)
CREATE POLICY "Accountants can create expenses"
ON public.expenses FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role));
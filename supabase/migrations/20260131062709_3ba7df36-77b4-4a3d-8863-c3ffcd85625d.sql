-- Fix RLS policy to allow Admins and Accountants to create journal entries for payouts
-- This is needed because they execute advance/expense payouts

-- First drop the existing restrictive policy
DROP POLICY IF EXISTS "Owners can manage journal entries" ON public.journal_entries;

-- Create new policy that allows Owners, Admins, and Accountants to manage journal entries
CREATE POLICY "Finance users can manage journal entries"
ON public.journal_entries
FOR ALL
USING (
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accountant'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accountant'::app_role)
);

-- Also update journal_lines policy to allow Admins and Accountants
DROP POLICY IF EXISTS "Owners can manage journal lines" ON public.journal_lines;

CREATE POLICY "Finance users can manage journal lines"
ON public.journal_lines
FOR ALL
USING (
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accountant'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'owner'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accountant'::app_role)
);
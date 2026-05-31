-- Fix RLS policies for accountant reimbursement workflow

-- 1. Fix expenses UPDATE policy for accountants - add WITH CHECK clause
DROP POLICY IF EXISTS "Accountants can update approved expenses to reimbursed" ON public.expenses;
CREATE POLICY "Accountants can update approved expenses to reimbursed" 
ON public.expenses 
FOR UPDATE 
USING (has_role(auth.uid(), 'accountant'::app_role) AND status = 'approved'::expense_status)
WITH CHECK (has_role(auth.uid(), 'accountant'::app_role) AND status = 'reimbursed'::expense_status);

-- 2. Ensure accountants can also view their own expenses if they are staff
DROP POLICY IF EXISTS "Accountants can view all approved and reimbursed expenses" ON public.expenses;
CREATE POLICY "Accountants can view all approved and reimbursed expenses" 
ON public.expenses 
FOR SELECT 
USING (has_role(auth.uid(), 'accountant'::app_role));

-- 3. Fix ledger_entries INSERT policy for accountants - ensure they can only insert non-settlement entries
DROP POLICY IF EXISTS "Accountants can insert ledger entries" ON public.ledger_entries;
CREATE POLICY "Accountants can insert non-salary ledger entries" 
ON public.ledger_entries 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'accountant'::app_role) 
  AND voucher_type != 'settlement'::voucher_type
);

-- 4. Ensure admins can also insert ledger entries for non-salary
DROP POLICY IF EXISTS "Admins can insert ledger entries" ON public.ledger_entries;
CREATE POLICY "Admins can insert non-salary ledger entries" 
ON public.ledger_entries 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  AND voucher_type != 'settlement'::voucher_type
);

-- 5. Add policy for accountants/admins to view staff_public for expense display
-- First check if there's already a permissive policy on staff_public view
-- Since staff_public is a view, we need to ensure RLS on the base staff table allows access

-- Create a policy to allow all authenticated users to view staff_public info
DROP POLICY IF EXISTS "Finance users can view staff public" ON public.staff;
CREATE POLICY "Finance users can view staff public" 
ON public.staff 
FOR SELECT 
USING (
  has_role(auth.uid(), 'owner'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accountant'::app_role) OR
  has_role(auth.uid(), 'ca'::app_role) OR
  user_id = auth.uid()
);
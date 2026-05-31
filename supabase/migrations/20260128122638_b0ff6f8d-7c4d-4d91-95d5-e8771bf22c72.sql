-- Drop the restrictive INSERT policies
DROP POLICY IF EXISTS "Accountants can insert non-salary ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Admins can insert non-salary ledger entries" ON public.ledger_entries;

-- Recreate as PERMISSIVE policies (default)
CREATE POLICY "Accountants can insert non-salary ledger entries"
ON public.ledger_entries
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'accountant'::app_role) 
  AND voucher_type <> 'settlement'::voucher_type
);

CREATE POLICY "Admins can insert non-salary ledger entries"
ON public.ledger_entries
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  AND voucher_type <> 'settlement'::voucher_type
);
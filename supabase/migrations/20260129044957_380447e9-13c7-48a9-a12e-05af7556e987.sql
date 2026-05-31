-- Drop the existing owner policy that restricts immutable inserts
DROP POLICY IF EXISTS "Owners can manage all ledger entries" ON public.ledger_entries;

-- Create new owner policy that allows inserting/updating mutable and immutable entries
-- but still prevents updating already-immutable entries (handled by trigger)
CREATE POLICY "Owners can manage all ledger entries" 
ON public.ledger_entries 
FOR ALL 
USING (has_role(auth.uid(), 'owner'::app_role))
WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
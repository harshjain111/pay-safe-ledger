-- Drop the old constraint and create a new one that includes 'expense'
ALTER TABLE public.ledger_entries DROP CONSTRAINT ledger_entries_tag_check;

ALTER TABLE public.ledger_entries ADD CONSTRAINT ledger_entries_tag_check 
CHECK (tag = ANY (ARRAY['salary'::text, 'advance'::text, 'deduction'::text, 'adjustment'::text, 'expense'::text]));
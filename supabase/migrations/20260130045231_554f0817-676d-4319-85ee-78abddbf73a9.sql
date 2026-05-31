-- =====================================================
-- DOUBLE-ENTRY ACCOUNTING SCHEMA (Fixed)
-- =====================================================

-- 1. Create Chart of Accounts table
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  parent_id UUID REFERENCES public.accounts(id),
  is_system BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for accounts (use IF NOT EXISTS pattern via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'accounts' AND policyname = 'Owners can manage accounts') THEN
    CREATE POLICY "Owners can manage accounts" ON public.accounts FOR ALL
      USING (has_role(auth.uid(), 'owner'::app_role))
      WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'accounts' AND policyname = 'Finance users can view accounts') THEN
    CREATE POLICY "Finance users can view accounts" ON public.accounts FOR SELECT
      USING (is_finance_user(auth.uid()) OR has_role(auth.uid(), 'ca'::app_role));
  END IF;
END $$;

-- 2. Insert System Accounts (Chart of Accounts) - use ON CONFLICT
INSERT INTO public.accounts (code, name, account_type, is_system) VALUES
  ('1000', 'Cash', 'asset', true),
  ('1100', 'Bank Account', 'asset', true),
  ('1200', 'Staff Advances (Receivable)', 'asset', true),
  ('2000', 'Staff Payable', 'liability', true),
  ('5000', 'Salary Expense', 'expense', true),
  ('5100', 'Travel Expense', 'expense', true),
  ('5200', 'Food Expense', 'expense', true),
  ('5300', 'Logistics Expense', 'expense', true),
  ('5400', 'Equipment Expense', 'expense', true),
  ('5500', 'Office Supplies Expense', 'expense', true),
  ('5600', 'Communication Expense', 'expense', true),
  ('5700', 'Other Expense', 'expense', true)
ON CONFLICT (code) DO NOTHING;

-- 3. Create Journal Entries table (double-entry transactions)
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_no TEXT NOT NULL,
  description TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('salary_settlement', 'salary_payout', 'expense_approval', 'expense_payout', 'advance_paid', 'advance_adjustment')),
  reference_id UUID,
  reference_type TEXT,
  staff_id UUID REFERENCES public.staff(id),
  is_immutable BOOLEAN NOT NULL DEFAULT false,
  is_legacy BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for journal_entries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_entries' AND policyname = 'Owners can manage journal entries') THEN
    CREATE POLICY "Owners can manage journal entries" ON public.journal_entries FOR ALL
      USING (has_role(auth.uid(), 'owner'::app_role))
      WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_entries' AND policyname = 'CA can view journal entries') THEN
    CREATE POLICY "CA can view journal entries" ON public.journal_entries FOR SELECT
      USING (has_role(auth.uid(), 'ca'::app_role));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_entries' AND policyname = 'Accountants can view journal entries') THEN
    CREATE POLICY "Accountants can view journal entries" ON public.journal_entries FOR SELECT
      USING (has_role(auth.uid(), 'accountant'::app_role));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_entries' AND policyname = 'Admins can view journal entries') THEN
    CREATE POLICY "Admins can view journal entries" ON public.journal_entries FOR SELECT
      USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_entries' AND policyname = 'Staff can view own journal entries') THEN
    CREATE POLICY "Staff can view own journal entries" ON public.journal_entries FOR SELECT
      USING (staff_id = get_user_staff_id(auth.uid()));
  END IF;
END $$;

-- 4. Create Journal Lines table (the actual debits/credits)
CREATE TABLE IF NOT EXISTS public.journal_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id UUID NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id),
  staff_id UUID REFERENCES public.staff(id),
  debit NUMERIC NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT check_debit_credit CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
  )
);

-- Enable RLS
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for journal_lines
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_lines' AND policyname = 'Owners can manage journal lines') THEN
    CREATE POLICY "Owners can manage journal lines" ON public.journal_lines FOR ALL
      USING (has_role(auth.uid(), 'owner'::app_role))
      WITH CHECK (has_role(auth.uid(), 'owner'::app_role));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_lines' AND policyname = 'CA can view journal lines') THEN
    CREATE POLICY "CA can view journal lines" ON public.journal_lines FOR SELECT
      USING (has_role(auth.uid(), 'ca'::app_role));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_lines' AND policyname = 'Accountants can view journal lines') THEN
    CREATE POLICY "Accountants can view journal lines" ON public.journal_lines FOR SELECT
      USING (has_role(auth.uid(), 'accountant'::app_role));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_lines' AND policyname = 'Admins can view journal lines') THEN
    CREATE POLICY "Admins can view journal lines" ON public.journal_lines FOR SELECT
      USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_lines' AND policyname = 'Staff can view own journal lines') THEN
    CREATE POLICY "Staff can view own journal lines" ON public.journal_lines FOR SELECT
      USING (staff_id = get_user_staff_id(auth.uid()));
  END IF;
END $$;

-- 5. Add journal_entry_id columns to salary_settlements
ALTER TABLE public.salary_settlements 
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES public.journal_entries(id);

ALTER TABLE public.salary_settlements 
  ADD COLUMN IF NOT EXISTS payout_journal_entry_id UUID REFERENCES public.journal_entries(id);

-- 6. Add is_legacy column to ledger_entries (default true for new column means all existing are legacy)
ALTER TABLE public.ledger_entries 
  ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT true;

-- 7. Create function to generate journal reference numbers
CREATE OR REPLACE FUNCTION public.generate_journal_ref(_transaction_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  next_num INTEGER;
BEGIN
  prefix := CASE _transaction_type
    WHEN 'salary_settlement' THEN 'SAL-SET'
    WHEN 'salary_payout' THEN 'SAL-PAY'
    WHEN 'expense_approval' THEN 'EXP-APP'
    WHEN 'expense_payout' THEN 'EXP-PAY'
    WHEN 'advance_paid' THEN 'ADV-PAY'
    WHEN 'advance_adjustment' THEN 'ADV-ADJ'
    ELSE 'JRN'
  END;
  
  SELECT COALESCE(MAX(SUBSTRING(reference_no FROM '[0-9]+$')::INTEGER), 0) + 1
  INTO next_num
  FROM public.journal_entries
  WHERE transaction_type = _transaction_type;
  
  RETURN prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYMM') || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- 8. Create function to get account by code
CREATE OR REPLACE FUNCTION public.get_account_id(_code TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT id FROM public.accounts WHERE code = _code LIMIT 1;
$$;

-- 9. Create function to calculate staff balance from journal lines
CREATE OR REPLACE FUNCTION public.get_staff_journal_balance(_staff_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  balance NUMERIC;
BEGIN
  -- Credit balance = Smokzy owes staff (positive = payable to staff)
  -- Debit balance = Staff owes Smokzy (negative = receivable from staff)
  SELECT COALESCE(SUM(credit) - SUM(debit), 0) INTO balance
  FROM public.journal_lines
  WHERE staff_id = _staff_id;
  
  RETURN balance;
END;
$$;

-- 10. Create trigger to prevent modification of immutable journal entries
CREATE OR REPLACE FUNCTION public.prevent_journal_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.is_immutable = true THEN
      RAISE EXCEPTION 'Cannot modify immutable journal entry (ID: %)', OLD.id;
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_journal_entry_modification ON public.journal_entries;
CREATE TRIGGER prevent_journal_entry_modification
  BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_journal_modification();

-- 11. Add audit triggers for new tables
DROP TRIGGER IF EXISTS audit_journal_entries ON public.journal_entries;
CREATE TRIGGER audit_journal_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.log_audit_entry();

DROP TRIGGER IF EXISTS audit_journal_lines ON public.journal_lines;
CREATE TRIGGER audit_journal_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.log_audit_entry();

-- 12. Create function to map expense category to account code
CREATE OR REPLACE FUNCTION public.get_expense_account_code(_category expense_category)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _category
    WHEN 'travel' THEN '5100'
    WHEN 'food' THEN '5200'
    WHEN 'logistics' THEN '5300'
    WHEN 'equipment' THEN '5400'
    WHEN 'office_supplies' THEN '5500'
    WHEN 'communication' THEN '5600'
    ELSE '5700'
  END;
$$;

-- 13. Create function to map payment mode to account code
CREATE OR REPLACE FUNCTION public.get_payment_account_code(_payment_mode payment_mode)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _payment_mode
    WHEN 'cash' THEN '1000'
    WHEN 'upi' THEN '1100'
    WHEN 'bank_transfer' THEN '1100'
    WHEN 'cheque' THEN '1100'
    ELSE '1000'
  END;
$$;
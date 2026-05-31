-- Create petty cash transaction type enum
DO $$ BEGIN
  CREATE TYPE petty_cash_transaction_type AS ENUM ('opening_balance', 'top_up', 'expense_payment', 'advance_payment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create petty cash transactions table
CREATE TABLE IF NOT EXISTS public.petty_cash_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_type petty_cash_transaction_type NOT NULL,
  amount NUMERIC NOT NULL,
  balance_after NUMERIC NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  source TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.petty_cash_transactions ENABLE ROW LEVEL SECURITY;

-- Owner: full access
CREATE POLICY "Owners can manage petty cash"
  ON public.petty_cash_transactions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

-- Admin: SELECT + INSERT only
CREATE POLICY "Admins can view petty cash"
  ON public.petty_cash_transactions FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert petty cash"
  ON public.petty_cash_transactions FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add petty_cash to payment_mode enum if not exists
ALTER TYPE payment_mode ADD VALUE IF NOT EXISTS 'petty_cash';

-- Insert Petty Cash account in chart of accounts
INSERT INTO public.accounts (code, name, account_type, is_system, is_active)
VALUES ('1300', 'Petty Cash', 'asset', true, true)
ON CONFLICT DO NOTHING;

-- Function to get current petty cash balance
CREATE OR REPLACE FUNCTION public.get_petty_cash_balance()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT balance_after FROM petty_cash_transactions ORDER BY created_at DESC LIMIT 1),
    0
  );
$$;
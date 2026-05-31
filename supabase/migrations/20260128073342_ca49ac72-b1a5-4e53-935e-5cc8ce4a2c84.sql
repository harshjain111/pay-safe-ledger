-- Add salary history table to track salary changes
CREATE TABLE public.salary_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  monthly_salary NUMERIC NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  changed_by UUID,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.salary_history ENABLE ROW LEVEL SECURITY;

-- Only owner can manage salary history
CREATE POLICY "Owners can manage salary history"
  ON public.salary_history FOR ALL
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- Staff can view their own salary history
CREATE POLICY "Staff can view own salary history"
  ON public.salary_history FOR SELECT
  USING (staff_id = public.get_user_staff_id(auth.uid()));

-- Create function to get staff salary for a specific month
CREATE OR REPLACE FUNCTION public.get_staff_salary_for_month(_staff_id UUID, _month TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  month_date DATE;
  salary NUMERIC;
BEGIN
  -- Convert YYYY-MM to date
  month_date := (_month || '-01')::DATE;
  
  -- First check salary history
  SELECT monthly_salary INTO salary
  FROM public.salary_history
  WHERE staff_id = _staff_id
    AND effective_from <= month_date
    AND (effective_to IS NULL OR effective_to >= month_date)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  -- If no history found, use current salary
  IF salary IS NULL THEN
    SELECT monthly_salary INTO salary
    FROM public.staff
    WHERE id = _staff_id;
  END IF;
  
  RETURN COALESCE(salary, 0);
END;
$$;

-- Create function to calculate running balance for a staff member
CREATE OR REPLACE FUNCTION public.calculate_running_balance(_staff_id UUID)
RETURNS TABLE (
  entry_id UUID,
  running_balance NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    le.id AS entry_id,
    SUM(COALESCE(le.debit, 0) - COALESCE(le.credit, 0)) OVER (
      ORDER BY le.entry_date, le.created_at
    ) AS running_balance
  FROM public.ledger_entries le
  WHERE le.staff_id = _staff_id
  ORDER BY le.entry_date, le.created_at;
END;
$$;

-- Create function to get advances outstanding for a staff member
CREATE OR REPLACE FUNCTION public.get_advances_outstanding(_staff_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0) INTO total
  FROM public.ledger_entries
  WHERE staff_id = _staff_id
    AND tag = 'advance';
  
  RETURN total;
END;
$$;

-- Create function to check if salary is already settled for a month
CREATE OR REPLACE FUNCTION public.is_salary_settled(_staff_id UUID, _month TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.salary_settlements
    WHERE staff_id = _staff_id
      AND settlement_month = _month
      AND status = 'settled'
  );
END;
$$;

-- Add unique constraint to prevent double settlement
ALTER TABLE public.salary_settlements 
ADD CONSTRAINT unique_staff_month_settlement UNIQUE (staff_id, settlement_month);

-- Add index for performance
CREATE INDEX idx_ledger_staff_date ON public.ledger_entries (staff_id, entry_date, created_at);
CREATE INDEX idx_salary_history_staff ON public.salary_history (staff_id, effective_from);
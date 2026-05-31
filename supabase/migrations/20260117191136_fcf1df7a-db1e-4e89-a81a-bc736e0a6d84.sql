-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('owner', 'accountant', 'staff', 'ca');

-- Create payment mode enum
CREATE TYPE public.payment_mode AS ENUM ('cash', 'upi', 'bank_transfer', 'cheque');

-- Create voucher type enum
CREATE TYPE public.voucher_type AS ENUM ('payment', 'journal', 'settlement', 'advance', 'deduction');

-- Create request status enum
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'rejected');

-- Create settlement status enum
CREATE TYPE public.settlement_status AS ENUM ('pending', 'settled');

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Staff profiles table (linked to auth.users)
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  employee_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  department TEXT,
  designation TEXT,
  date_of_joining DATE NOT NULL DEFAULT CURRENT_DATE,
  monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on staff
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Ledger entries table (Tally-style)
CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE NOT NULL,
  voucher_type voucher_type NOT NULL,
  voucher_no TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  debit NUMERIC(12,2) DEFAULT 0,
  credit NUMERIC(12,2) DEFAULT 0,
  running_balance NUMERIC(12,2) DEFAULT 0,
  tag TEXT CHECK (tag IN ('salary', 'advance', 'deduction', 'adjustment')),
  reference_month TEXT,
  payment_mode payment_mode,
  paid_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  is_immutable BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on ledger_entries
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Payment requests table
CREATE TABLE public.payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID REFERENCES auth.users(id) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  status request_status DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on payment_requests
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

-- Salary settlements table
CREATE TABLE public.salary_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE NOT NULL,
  settlement_month TEXT NOT NULL,
  base_salary NUMERIC(12,2) NOT NULL,
  leave_days INTEGER DEFAULT 0,
  leave_deduction NUMERIC(12,2) DEFAULT 0,
  net_salary NUMERIC(12,2) NOT NULL,
  advances_adjusted NUMERIC(12,2) DEFAULT 0,
  balance_payable NUMERIC(12,2) NOT NULL,
  status settlement_status DEFAULT 'pending',
  settled_at TIMESTAMP WITH TIME ZONE,
  settled_by UUID REFERENCES auth.users(id),
  ledger_entry_id UUID REFERENCES public.ledger_entries(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (staff_id, settlement_month)
);

-- Enable RLS on salary_settlements
ALTER TABLE public.salary_settlements ENABLE ROW LEVEL SECURITY;

-- Audit log table
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  ip_address TEXT
);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get current user's staff_id
CREATE OR REPLACE FUNCTION public.get_user_staff_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.staff WHERE user_id = _user_id LIMIT 1
$$;

-- Function to check if user is owner or accountant
CREATE OR REPLACE FUNCTION public.is_finance_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('owner', 'accountant')
  )
$$;

-- Generate voucher number function
CREATE OR REPLACE FUNCTION public.generate_voucher_no(_voucher_type voucher_type)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefix TEXT;
  next_num INTEGER;
BEGIN
  prefix := CASE _voucher_type
    WHEN 'payment' THEN 'PAY'
    WHEN 'journal' THEN 'JRN'
    WHEN 'settlement' THEN 'SET'
    WHEN 'advance' THEN 'ADV'
    WHEN 'deduction' THEN 'DED'
  END;
  
  SELECT COALESCE(MAX(SUBSTRING(voucher_no FROM '[0-9]+')::INTEGER), 0) + 1
  INTO next_num
  FROM public.ledger_entries
  WHERE voucher_type = _voucher_type;
  
  RETURN prefix || '-' || TO_CHAR(CURRENT_DATE, 'YYMM') || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_staff_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ledger_entries_updated_at
  BEFORE UPDATE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payment_requests_updated_at
  BEFORE UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_salary_settlements_updated_at
  BEFORE UPDATE ON public.salary_settlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies for user_roles
CREATE POLICY "Owners can manage all roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Users can view their own role"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for staff (CRITICAL: Salary protection)
-- Create a view for non-salary data that accountants can see
CREATE VIEW public.staff_public AS
SELECT 
  id,
  user_id,
  employee_id,
  full_name,
  email,
  phone,
  department,
  designation,
  date_of_joining,
  is_active,
  created_at,
  updated_at
FROM public.staff;

-- Owners can see all staff including salary
CREATE POLICY "Owners can manage all staff"
  ON public.staff
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

-- Staff can only see their own record
CREATE POLICY "Staff can view own record"
  ON public.staff
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- RLS Policies for ledger_entries
CREATE POLICY "Owners can manage all ledger entries"
  ON public.ledger_entries
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner') AND (is_immutable = false OR is_immutable IS NULL));

CREATE POLICY "Accountants can create and view ledger entries"
  ON public.ledger_entries
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Accountants can insert ledger entries"
  ON public.ledger_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Staff can view own ledger entries"
  ON public.ledger_entries
  FOR SELECT
  TO authenticated
  USING (staff_id = public.get_user_staff_id(auth.uid()));

CREATE POLICY "CA can view all ledger entries"
  ON public.ledger_entries
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'ca'));

-- RLS Policies for payment_requests
CREATE POLICY "Owners can manage all payment requests"
  ON public.payment_requests
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Accountants can create and view payment requests"
  ON public.payment_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Accountants can insert payment requests"
  ON public.payment_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'accountant'));

CREATE POLICY "Staff can view and create own payment requests"
  ON public.payment_requests
  FOR SELECT
  TO authenticated
  USING (staff_id = public.get_user_staff_id(auth.uid()));

CREATE POLICY "Staff can insert own payment requests"
  ON public.payment_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (staff_id = public.get_user_staff_id(auth.uid()));

-- RLS Policies for salary_settlements
CREATE POLICY "Owners can manage all settlements"
  ON public.salary_settlements
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Staff can view own settlements"
  ON public.salary_settlements
  FOR SELECT
  TO authenticated
  USING (staff_id = public.get_user_staff_id(auth.uid()));

CREATE POLICY "CA can view all settlements"
  ON public.salary_settlements
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'ca'));

-- RLS Policies for audit_log
CREATE POLICY "Owners can view audit log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "CA can view audit log"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'ca'));

-- Create indexes for performance
CREATE INDEX idx_staff_user_id ON public.staff(user_id);
CREATE INDEX idx_staff_employee_id ON public.staff(employee_id);
CREATE INDEX idx_ledger_entries_staff_id ON public.ledger_entries(staff_id);
CREATE INDEX idx_ledger_entries_entry_date ON public.ledger_entries(entry_date);
CREATE INDEX idx_ledger_entries_reference_month ON public.ledger_entries(reference_month);
CREATE INDEX idx_payment_requests_staff_id ON public.payment_requests(staff_id);
CREATE INDEX idx_payment_requests_status ON public.payment_requests(status);
CREATE INDEX idx_salary_settlements_staff_id ON public.salary_settlements(staff_id);
CREATE INDEX idx_salary_settlements_month ON public.salary_settlements(settlement_month);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
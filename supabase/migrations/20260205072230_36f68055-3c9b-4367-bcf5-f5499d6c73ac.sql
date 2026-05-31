-- Create leave type enum
CREATE TYPE public.leave_type AS ENUM ('paid', 'unpaid', 'penalty', 'custom');

-- Create leave status enum
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected');

-- Create leave_records table
CREATE TABLE public.leave_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_date DATE NOT NULL,
  leave_type leave_type NOT NULL DEFAULT 'unpaid',
  deduction_days NUMERIC NOT NULL DEFAULT 1 CHECK (deduction_days >= 0),
  status leave_status NOT NULL DEFAULT 'pending',
  remarks TEXT,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  is_immutable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(staff_id, leave_date)
);

-- Enable RLS
ALTER TABLE public.leave_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leave_records

-- Staff can view own leave records
CREATE POLICY "Staff can view own leave records"
ON public.leave_records
FOR SELECT
USING (staff_id = get_user_staff_id(auth.uid()));

-- Staff can create own leave requests (pending only, deduction_days set by default based on type)
CREATE POLICY "Staff can create own leave requests"
ON public.leave_records
FOR INSERT
WITH CHECK (
  staff_id = get_user_staff_id(auth.uid()) 
  AND status = 'pending'
);

-- Staff can update own pending leave requests
CREATE POLICY "Staff can update own pending leave"
ON public.leave_records
FOR UPDATE
USING (
  staff_id = get_user_staff_id(auth.uid()) 
  AND status = 'pending'
  AND is_immutable = false
);

-- Owners can manage all leave records
CREATE POLICY "Owners can manage all leave records"
ON public.leave_records
FOR ALL
USING (has_role(auth.uid(), 'owner'))
WITH CHECK (has_role(auth.uid(), 'owner'));

-- Admins can view and manage leave records
CREATE POLICY "Admins can view all leave records"
ON public.leave_records
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert leave records"
ON public.leave_records
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update leave records"
ON public.leave_records
FOR UPDATE
USING (has_role(auth.uid(), 'admin') AND is_immutable = false);

-- Accountants can view and manage leave records
CREATE POLICY "Accountants can view all leave records"
ON public.leave_records
FOR SELECT
USING (has_role(auth.uid(), 'accountant'));

CREATE POLICY "Accountants can insert leave records"
ON public.leave_records
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'accountant'));

CREATE POLICY "Accountants can update leave records"
ON public.leave_records
FOR UPDATE
USING (has_role(auth.uid(), 'accountant') AND is_immutable = false);

-- CA can view leave records (read-only)
CREATE POLICY "CA can view leave records"
ON public.leave_records
FOR SELECT
USING (has_role(auth.uid(), 'ca'));

-- Add new columns to salary_settlements for leave deduction tracking
ALTER TABLE public.salary_settlements
ADD COLUMN IF NOT EXISTS system_deduction_days NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_deduction_days NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS deduction_adjustment_reason TEXT,
ADD COLUMN IF NOT EXISTS deduction_adjusted_by UUID,
ADD COLUMN IF NOT EXISTS deduction_adjusted_at TIMESTAMP WITH TIME ZONE;

-- Function to calculate system deduction days for a staff in a month
CREATE OR REPLACE FUNCTION public.get_system_deduction_days(_staff_id UUID, _month TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  month_start DATE;
  month_end DATE;
  total_deduction NUMERIC;
BEGIN
  month_start := (_month || '-01')::DATE;
  month_end := (month_start + INTERVAL '1 month - 1 day')::DATE;
  
  SELECT COALESCE(SUM(deduction_days), 0)
  INTO total_deduction
  FROM public.leave_records
  WHERE staff_id = _staff_id
    AND leave_date >= month_start
    AND leave_date <= month_end
    AND status = 'approved';
  
  RETURN total_deduction;
END;
$$;

-- Function to get leave records for a month
CREATE OR REPLACE FUNCTION public.get_monthly_leave_records(_staff_id UUID, _month TEXT)
RETURNS TABLE (
  id UUID,
  leave_date DATE,
  leave_type leave_type,
  deduction_days NUMERIC,
  remarks TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  month_start DATE;
  month_end DATE;
BEGIN
  month_start := (_month || '-01')::DATE;
  month_end := (month_start + INTERVAL '1 month - 1 day')::DATE;
  
  RETURN QUERY
  SELECT 
    lr.id,
    lr.leave_date,
    lr.leave_type,
    lr.deduction_days,
    lr.remarks
  FROM public.leave_records lr
  WHERE lr.staff_id = _staff_id
    AND lr.leave_date >= month_start
    AND lr.leave_date <= month_end
    AND lr.status = 'approved'
  ORDER BY lr.leave_date;
END;
$$;

-- Trigger to prevent modification of immutable leave records
CREATE OR REPLACE FUNCTION public.prevent_leave_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    IF OLD.is_immutable = true THEN
      RAISE EXCEPTION 'Cannot modify immutable leave record (ID: %)', OLD.id;
    END IF;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_leave_record_modification
BEFORE UPDATE OR DELETE ON public.leave_records
FOR EACH ROW
EXECUTE FUNCTION public.prevent_leave_modification();

-- Trigger to update updated_at
CREATE TRIGGER update_leave_records_updated_at
BEFORE UPDATE ON public.leave_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient queries
CREATE INDEX idx_leave_records_staff_date ON public.leave_records(staff_id, leave_date);
CREATE INDEX idx_leave_records_status ON public.leave_records(status);
CREATE INDEX idx_leave_records_month ON public.leave_records(staff_id, leave_date, status);
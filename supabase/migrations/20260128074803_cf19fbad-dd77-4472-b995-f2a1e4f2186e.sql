-- ===============================================
-- PHASE 3.5: HARDENING & IMMUTABILITY
-- ===============================================

-- 1. Create trigger to prevent updates on immutable ledger entries
CREATE OR REPLACE FUNCTION public.prevent_immutable_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_immutable = true THEN
    RAISE EXCEPTION 'Cannot update immutable ledger entry (ID: %)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_prevent_immutable_update
BEFORE UPDATE ON public.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION public.prevent_immutable_update();

-- 2. Create trigger to prevent deletes on immutable ledger entries
CREATE OR REPLACE FUNCTION public.prevent_immutable_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_immutable = true THEN
    RAISE EXCEPTION 'Cannot delete immutable ledger entry (ID: %)', OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER ledger_prevent_immutable_delete
BEFORE DELETE ON public.ledger_entries
FOR EACH ROW
EXECUTE FUNCTION public.prevent_immutable_delete();

-- 3. Create audit_log table if not exists (using different structure for comprehensive logging)
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  performed_by UUID,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT
);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Owners can view audit log" ON public.audit_log;
DROP POLICY IF EXISTS "CA can view audit log" ON public.audit_log;

-- Only owners and CA can view audit logs
CREATE POLICY "Owners can view audit log" ON public.audit_log
FOR SELECT USING (has_role(auth.uid(), 'owner'));

CREATE POLICY "CA can view audit log" ON public.audit_log
FOR SELECT USING (has_role(auth.uid(), 'ca'));

-- 4. Create audit trigger function
CREATE OR REPLACE FUNCTION public.log_audit_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, new_data, performed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, performed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, performed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- 5. Add audit triggers to financial tables
CREATE TRIGGER audit_ledger_entries
AFTER INSERT OR UPDATE OR DELETE ON public.ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();

CREATE TRIGGER audit_salary_settlements
AFTER INSERT OR UPDATE OR DELETE ON public.salary_settlements
FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();

CREATE TRIGGER audit_expenses
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();

CREATE TRIGGER audit_payment_requests
AFTER INSERT OR UPDATE OR DELETE ON public.payment_requests
FOR EACH ROW EXECUTE FUNCTION public.log_audit_entry();

-- 6. Add validation function for settlement
CREATE OR REPLACE FUNCTION public.validate_settlement(_staff_id UUID, _month TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  staff_record RECORD;
  month_date DATE;
  result JSONB;
  is_settled BOOLEAN;
BEGIN
  -- Parse month
  month_date := (_month || '-01')::DATE;
  
  -- Get staff record
  SELECT * INTO staff_record FROM public.staff WHERE id = _staff_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Staff not found');
  END IF;
  
  -- Check if already settled
  SELECT EXISTS(
    SELECT 1 FROM public.salary_settlements 
    WHERE staff_id = _staff_id AND settlement_month = _month AND status = 'settled'
  ) INTO is_settled;
  
  IF is_settled THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Salary for this month is already settled');
  END IF;
  
  -- Check if month is in future
  IF month_date > date_trunc('month', CURRENT_DATE) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cannot settle future months');
  END IF;
  
  -- Check if month is before joining
  IF month_date < date_trunc('month', staff_record.date_of_joining) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Cannot settle month before staff joining date');
  END IF;
  
  -- Check if staff is active
  IF NOT staff_record.is_active THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Staff is inactive', 'warning', true);
  END IF;
  
  RETURN jsonb_build_object('valid', true);
END;
$$;

-- 7. Add function to get reconciliation status for a staff+month
CREATE OR REPLACE FUNCTION public.get_reconciliation_status(_staff_id UUID, _month TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settlement_record RECORD;
  total_ledger_credit NUMERIC;
  result JSONB;
BEGIN
  -- Get settlement
  SELECT * INTO settlement_record 
  FROM public.salary_settlements 
  WHERE staff_id = _staff_id AND settlement_month = _month;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_settled',
      'matched', false,
      'message', 'No settlement found for this month'
    );
  END IF;
  
  -- Get total credits from ledger for this month
  SELECT COALESCE(SUM(credit), 0) INTO total_ledger_credit
  FROM public.ledger_entries
  WHERE staff_id = _staff_id
    AND reference_month = _month
    AND voucher_type = 'settlement';
  
  -- Check if amounts match
  IF total_ledger_credit = settlement_record.balance_payable THEN
    RETURN jsonb_build_object(
      'status', 'matched',
      'matched', true,
      'settlement_amount', settlement_record.balance_payable,
      'ledger_amount', total_ledger_credit,
      'message', 'Settlement and ledger amounts match'
    );
  ELSE
    RETURN jsonb_build_object(
      'status', 'mismatch',
      'matched', false,
      'settlement_amount', settlement_record.balance_payable,
      'ledger_amount', total_ledger_credit,
      'difference', settlement_record.balance_payable - total_ledger_credit,
      'message', 'Mismatch between settlement and ledger'
    );
  END IF;
END;
$$;

-- 8. Add function to get working days in a month
CREATE OR REPLACE FUNCTION public.get_working_days_in_month(_month TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXTRACT(DAY FROM (date_trunc('month', (_month || '-01')::DATE) + interval '1 month - 1 day'))::INTEGER
$$;
-- Create expense category enum
CREATE TYPE public.expense_category AS ENUM ('travel', 'food', 'logistics', 'equipment', 'office_supplies', 'communication', 'other');

-- Create expense status enum
CREATE TYPE public.expense_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'reimbursed');

-- Create expenses table
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  category expense_category NOT NULL,
  description TEXT NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  proof_url TEXT,
  status expense_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  reimbursed_at TIMESTAMPTZ,
  reimbursed_by UUID,
  ledger_entry_id UUID REFERENCES public.ledger_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Create trigger for updated_at
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for expenses
CREATE POLICY "Staff can view own expenses"
  ON public.expenses FOR SELECT
  USING (staff_id = public.get_user_staff_id(auth.uid()));

CREATE POLICY "Staff can create own expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (staff_id = public.get_user_staff_id(auth.uid()));

CREATE POLICY "Staff can update own draft expenses"
  ON public.expenses FOR UPDATE
  USING (staff_id = public.get_user_staff_id(auth.uid()) AND status = 'draft');

CREATE POLICY "Owners can manage all expenses"
  ON public.expenses FOR ALL
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Accountants can view approved expenses"
  ON public.expenses FOR SELECT
  USING (public.has_role(auth.uid(), 'accountant') AND status IN ('approved', 'reimbursed'));

CREATE POLICY "Accountants can update approved expenses to reimbursed"
  ON public.expenses FOR UPDATE
  USING (public.has_role(auth.uid(), 'accountant') AND status = 'approved');

CREATE POLICY "CA can view all expenses"
  ON public.expenses FOR SELECT
  USING (public.has_role(auth.uid(), 'ca'));

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info',
  reference_type TEXT,
  reference_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid());

-- System can insert notifications (via service role)
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

-- Create storage bucket for expense proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-proofs', 'expense-proofs', false);

-- Storage policies for expense proofs
CREATE POLICY "Users can upload own expense proofs"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'expense-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own expense proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'expense-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Finance users can view all expense proofs"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'expense-proofs' AND public.is_finance_user(auth.uid()));

CREATE POLICY "Owners can manage all expense proofs"
  ON storage.objects FOR ALL
  USING (bucket_id = 'expense-proofs' AND public.has_role(auth.uid(), 'owner'));

-- Add expense voucher type if not exists (extend enum)
ALTER TYPE public.voucher_type ADD VALUE IF NOT EXISTS 'expense';

-- Create function to notify users
CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id UUID,
  _title TEXT,
  _message TEXT,
  _type TEXT DEFAULT 'info',
  _reference_type TEXT DEFAULT NULL,
  _reference_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
  VALUES (_user_id, _title, _message, _type, _reference_type, _reference_id)
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;
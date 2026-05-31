-- ============================================
-- PART 2: SALARY CONFIDENTIALITY ENFORCEMENT
-- ============================================

-- 1. Create function to check if user can view salary data (owner only)
CREATE OR REPLACE FUNCTION public.can_view_salary(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'owner'
  )
$$;

-- 2. Add function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
  )
$$;

-- 3. Drop existing policies on staff table to replace them
DROP POLICY IF EXISTS "Owners can manage all staff" ON public.staff;
DROP POLICY IF EXISTS "Staff can view own record" ON public.staff;

-- 4. Create new policies for staff table
-- Only owner can directly access staff table (includes salary)
CREATE POLICY "Owners can manage all staff"
ON public.staff
FOR ALL
USING (has_role(auth.uid(), 'owner'))
WITH CHECK (has_role(auth.uid(), 'owner'));

-- Staff can view their own record
CREATE POLICY "Staff can view own record"
ON public.staff
FOR SELECT
USING (user_id = auth.uid());

-- 5. Ensure staff_public view doesn't expose monthly_salary
DROP VIEW IF EXISTS public.staff_public;

CREATE VIEW public.staff_public
WITH (security_invoker = on)
AS
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

-- 6. Grant appropriate access to staff_public view
GRANT SELECT ON public.staff_public TO authenticated;

-- 7. Update salary_history policies - only owner can access
DROP POLICY IF EXISTS "Owners can manage salary history" ON public.salary_history;
DROP POLICY IF EXISTS "Staff can view own salary history" ON public.salary_history;

CREATE POLICY "Only owners can access salary history"
ON public.salary_history
FOR ALL
USING (has_role(auth.uid(), 'owner'))
WITH CHECK (has_role(auth.uid(), 'owner'));

-- 8. Update salary_settlements policies - only owner can access
DROP POLICY IF EXISTS "CA can view all settlements" ON public.salary_settlements;
DROP POLICY IF EXISTS "Owners can manage all settlements" ON public.salary_settlements;
DROP POLICY IF EXISTS "Staff can view own settlements" ON public.salary_settlements;

CREATE POLICY "Only owners can manage settlements"
ON public.salary_settlements
FOR ALL
USING (has_role(auth.uid(), 'owner'))
WITH CHECK (has_role(auth.uid(), 'owner'));

CREATE POLICY "Staff can view own settlements"
ON public.salary_settlements
FOR SELECT
USING (staff_id = get_user_staff_id(auth.uid()));

-- 9. Update ledger policies for salary masking
DROP POLICY IF EXISTS "Accountants can create and view ledger entries" ON public.ledger_entries;
DROP POLICY IF EXISTS "Accountants can insert ledger entries" ON public.ledger_entries;

-- Accountants can view all entries (salary masking done at UI level)
CREATE POLICY "Accountants can view ledger entries"
ON public.ledger_entries
FOR SELECT
USING (has_role(auth.uid(), 'accountant'));

-- Accountants can insert ledger entries
CREATE POLICY "Accountants can insert ledger entries"
ON public.ledger_entries
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'accountant'));

-- Admin policies for ledger
CREATE POLICY "Admins can view ledger entries"
ON public.ledger_entries
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert ledger entries"
ON public.ledger_entries
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 10. Update expense policies to allow admin to approve
DROP POLICY IF EXISTS "Accountants can update approved expenses to reimbursed" ON public.expenses;
DROP POLICY IF EXISTS "Accountants can view approved expenses" ON public.expenses;

-- Admin can view and manage expenses
CREATE POLICY "Admins can view all expenses"
ON public.expenses
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update expenses"
ON public.expenses
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

-- Accountants can view approved expenses for reimbursement
CREATE POLICY "Accountants can view approved expenses"
ON public.expenses
FOR SELECT
USING (
  has_role(auth.uid(), 'accountant') 
  AND status IN ('approved', 'reimbursed')
);

CREATE POLICY "Accountants can update approved expenses to reimbursed"
ON public.expenses
FOR UPDATE
USING (
  has_role(auth.uid(), 'accountant') 
  AND status = 'approved'
);

-- 11. Payment requests policies for admin
CREATE POLICY "Admins can view all payment requests"
ON public.payment_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update payment requests"
ON public.payment_requests
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert payment requests"
ON public.payment_requests
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'));
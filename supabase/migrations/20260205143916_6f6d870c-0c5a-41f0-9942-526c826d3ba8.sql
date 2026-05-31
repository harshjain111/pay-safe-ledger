-- Allow all authenticated users to read user_roles for UI purposes (e.g., PaidBySelector)
-- This is safe since roles are not sensitive data

CREATE POLICY "Authenticated users can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);
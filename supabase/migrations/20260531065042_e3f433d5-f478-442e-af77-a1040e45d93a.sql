
-- 1. Statutory settings singleton table
CREATE TABLE public.payroll_statutory_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  pf_enabled boolean NOT NULL DEFAULT false,
  pf_employee_rate numeric NOT NULL DEFAULT 12,
  pf_employer_rate numeric NOT NULL DEFAULT 12,
  pf_base_cap numeric NOT NULL DEFAULT 15000,
  pf_default_enroll boolean NOT NULL DEFAULT false,
  esi_enabled boolean NOT NULL DEFAULT false,
  esi_employer_rate numeric NOT NULL DEFAULT 3.25,
  esi_eligibility_ceiling numeric NOT NULL DEFAULT 21000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.payroll_statutory_settings TO authenticated;
GRANT ALL ON public.payroll_statutory_settings TO service_role;

ALTER TABLE public.payroll_statutory_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view statutory settings"
  ON public.payroll_statutory_settings FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Owners manage statutory settings"
  ON public.payroll_statutory_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

INSERT INTO public.payroll_statutory_settings (singleton) VALUES (true);

-- 2. Per-staff enrollment fields
ALTER TABLE public.staff
  ADD COLUMN pf_enrolled boolean NOT NULL DEFAULT false,
  ADD COLUMN pf_employee_rate_override numeric,
  ADD COLUMN esi_enrolled boolean NOT NULL DEFAULT false,
  ADD COLUMN esi_employee_rate numeric;

-- 3. Settlement snapshot columns
ALTER TABLE public.salary_settlements
  ADD COLUMN pf_employee numeric NOT NULL DEFAULT 0,
  ADD COLUMN pf_employer numeric NOT NULL DEFAULT 0,
  ADD COLUMN esi_employee numeric NOT NULL DEFAULT 0,
  ADD COLUMN esi_employer numeric NOT NULL DEFAULT 0,
  ADD COLUMN pf_rate_employee numeric,
  ADD COLUMN pf_rate_employer numeric,
  ADD COLUMN esi_rate_employee numeric,
  ADD COLUMN esi_rate_employer numeric,
  ADD COLUMN pf_base numeric,
  ADD COLUMN esi_base numeric;

-- 4. New chart of accounts entries
INSERT INTO public.accounts (code, name, account_type, is_system) VALUES
  ('2100', 'EPF Payable', 'liability', true),
  ('2200', 'ESI Payable', 'liability', true),
  ('5050', 'Employer PF Contribution', 'expense', true),
  ('5060', 'Employer ESI Contribution', 'expense', true)
ON CONFLICT DO NOTHING;

-- 5. Migrate auth user pseudo-emails (phone-login)
UPDATE auth.users
SET email = regexp_replace(email, '@phone\.smokzy\.internal$', '@phone.konnect2hospitality.internal')
WHERE email LIKE '%@phone.smokzy.internal';

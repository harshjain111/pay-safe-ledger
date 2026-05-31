
INSERT INTO public.accounts (code, name, account_type, is_system, is_active) VALUES
  ('1000', 'Cash', 'asset', true, true),
  ('1100', 'Bank', 'asset', true, true),
  ('1200', 'Staff Advances', 'asset', true, true),
  ('1300', 'Petty Cash', 'asset', true, true),
  ('2000', 'Staff Payable', 'liability', true, true),
  ('5000', 'Salary Expense', 'expense', true, true),
  ('5100', 'Travel Expense', 'expense', true, true),
  ('5200', 'Food Expense', 'expense', true, true),
  ('5300', 'Logistics Expense', 'expense', true, true),
  ('5400', 'Equipment Expense', 'expense', true, true),
  ('5500', 'Office Supplies Expense', 'expense', true, true),
  ('5600', 'Communication Expense', 'expense', true, true),
  ('5700', 'Other Expense', 'expense', true, true)
ON CONFLICT (code) DO NOTHING;

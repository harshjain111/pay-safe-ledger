-- =======================================================
-- MM Staff import (85 employees from MM_Staff_import_ready.xlsx)
-- Run in Supabase SQL Editor against lwjcunzlxwziokhfmyds
-- =======================================================

BEGIN;

-- 1. Ensure outlet exists
INSERT INTO public.outlets (name, organization_id)
  VALUES ('MILLI MILLI', public.default_organization_id())
  ON CONFLICT (name) DO UPDATE SET organization_id = COALESCE(outlets.organization_id, public.default_organization_id());

-- 2. Upsert all 85 staff
INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL001', 'SOURAV NAG', '8017631197', 'sourav_85nag@yahoo.co.uk',
  'M', '1985-12-22', '2026-05-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM', 'CORPORATE MANAGER', 100000,
  'AGJPN8543L', '478717038327', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL002', 'ABHINANDAN CHATTERJEE', '8108435791', 'abhinandan8787@gmail.com',
  'M', '1987-10-23', '2026-07-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'BEVERAGE MANAGER', 60000,
  'ASZPC7031N', '612851273160', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL003', 'AJANO LOTHA', '9073475358', '',
  'F', '1992-08-03', '2026-04-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'ASSISTANT MANAGER', 37000,
  'AOJPL4616C', '442699679378', '101618225974', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL004', 'SHOUMIK SINHA ROY', '9007567723', 'shoumik87@gmail.com',
  'M', '1987-02-02', '2026-09-16',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'OPS HEAD', 65000,
  'CHCPS7305H', '421527408919', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL005', 'TANDRISA MALLICK', '8670860998', 'mallicktandrisa98@gmail.com',
  'F', '1998-09-23', '2026-09-16',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'CAPTAIN', 23600,
  'FSFPM0992B', '775384056148', '101800430384', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL006', 'SOUVICK GHOSH', '9322438099', 'ghoshsouvick196@gmail.com',
  'M', '1996-07-23', '2026-09-16',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'CAPTAIN', 20000,
  'BOSPG1524A', '233582435070', '101879470014', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL007', 'MAYA KUMARI GOPE', '8210105525', 'mayakumarigope12345@gmail.com',
  'F', '2000-04-05', '2026-09-18',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'CAPTAIN', 21600,
  'DIWPG2122L', '614331475722', '102092216763', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL008', 'SURAJ DASGUPTA', '9874362296', 'surajdasgupta80@gmail.com',
  'M', '1999-06-19', '2026-09-24',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'CAPTAIN', 20000,
  'DXYPD1056B', '657527617141', '101764104197', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL009', 'SOMNATH ISHAR', NULL, 'somnathishar@gmail.com',
  'M', '2002-08-19', '2026-10-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'CAPTAIN', 23600,
  'APBPI0857H', '428828265843', '102318332364', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL010', 'MIRAJUL ISLAM MOLLA', '8282858085', 'mirajulislammolla597@gmail.com',
  'M', '1992-05-18', '2026-09-21',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'SR. STEWART', 18000,
  'CPXPM0774D', '844506626798', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL011', 'GOLDI MINJ', NULL, 'minjgoldi4@gmail.com',
  'M', '2026-09-06', '2026-09-06',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'SR. STEWART', 18000,
  'GTUPM3236D', '59539277986', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL012', 'SOMNATH ROY', '9676317728', 'sr834727@gmail.com',
  'M', '1997-04-12', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'SR.CAPTAIN', 26000,
  'CVNPR8148E', '349185121027', '101624329610', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL013', 'LAWRENCE SUNJIT FRANCIS', '7003466313', 'sanju.francis.85@gmail.com',
  'M', '2026-09-21', '2026-09-21',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'STEWART', 16000,
  'ABCPF4304P', '260950386871', '101669921898', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL014', 'SHREYASHI BHOWMICK', '7908822346', 'shreyashibhowmick09@gmail.com',
  'F', '2005-01-09', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'GRE', 19500,
  'HEDPB1456R', '792721285727', '101989832620', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL015', 'LALHRUAITLUANGA', '9383012772', 'lalhruaitluangakhimgt00@gmailcom',
  'M', '2005-07-22', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'GSA', 15100,
  'CBYPL5719C', '920342775298', '102394027588', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL016', 'SANCHAYITA BHOWMIK', '8116584268', 'sanchayita99b@gmail.com',
  'F', '1999-11-18', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'SR. GRE', 26700,
  'FDRPB3412A', '944828350346', '101686946792', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL017', 'N PILANO LOTHA', NULL, 'pilanohmt18@gmail.com',
  'F', '2001-11-17', '2026-10-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'SR. GRE', 30000,
  'BNNPL6888C', '249741945196', '102398147296', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL018', 'LALHMANGAIHZUALI', '7085963436', 'hmamgaihzuali284@gmailcom',
  'F', '2001-04-28', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'GSA', 16200,
  'BZXPL1388M', '980151451676', '102172755880', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL019', 'NGAHNEIVAH', '7630041085', 'ngahneivahvc@gmail.com',
  'F', '2007-04-06', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'GSA', 16200,
  'DXJPN1656L', '656534419870', '102394008632', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL020', 'RAKHI PAIK', '7003299676', 'rakhipaik0301@gmail.com',
  'F', '2026-09-21', '2026-09-21',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'CAPTAIN', 22000,
  'FOWPB1026N', '968557862882', '102394022943', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL021', 'LHAINEICHING SITLHOU', '9366807627', 'chingnousitlhou2004@gmail.com',
  'F', '2004-10-02', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'GSA', 13000,
  'MDZPS5332R', '533528062346', '102394130665', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL022', 'BIMAL DAS', '8637890335', 'das.bimal523@gmail.com',
  'M', '1998-12-06', '2026-09-21',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'F&B EXECUTIVE', 30000,
  'EZZPD7471N', '440865099487', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL023', 'SANJOY SAMANTA', NULL, 'sanjoysamanta5566@gmail.com',
  'M', '1992-11-14', '2026-10-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'F&B EXECUTIVE', 30000,
  'DYXPS7506B', '640174788121', '101390035770', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL024', 'DEBASIS PATRA', '9836889377', '',
  NULL, NULL, '2026-10-05',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'SR. F&B EXECUTIVE', 35000,
  'BCUPP3218C', '320656355131', '100514605210', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL025', 'SUMAN DAS', '6295979226', 'sumandh2018@gmail.com',
  'M', '2000-03-18', '2026-10-06',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'MM SERVICE(FNB)', 'CASHIER', 26800,
  '1QVPD3097R', '210343142166', '101965990878', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL026', 'RATNADIP MONDAL', '8116755882', 'ratnadip586@gmail.com',
  'M', '1993-04-16', '2026-09-10',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'STORE', 'STORE AND PURCHASE MANAGER', 30000,
  'EBUPM6230H', '416189233573', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL027', 'N.WOTHUNGBENI HUMTSOE', '9022701357', 'wothungbenihumtsoe32@gmail.com',
  'F', '1997-04-10', '2026-09-10',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'MIXOLOGIST', 30000,
  'CBYPH1233F', '337799380784', '101173809104', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL028', 'RAHUL DUTTA', '9123670979', 'duttarh104@gmail.com',
  'M', '1995-05-13', '2026-09-02',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'HEAD MIXOLOGIST', 39000,
  'CKCPD4318Q', '702526534359', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL029', 'SUBHO ROY', '9062853750', 'sunhor940@gmail.com',
  'M', '2001-03-17', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'SR. BARTENDER', 23000,
  'EKHPR3680G', '313491272232', '101968053555', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL030', 'SUBHADIP HALDER', '9330428359', 'lazsubha00@gmail.com',
  'M', '2026-09-21', '2026-09-21',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'SR. BARTENDER', 25000,
  'BDYPH3322N', '996570008089', '101788253464', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL031', 'POULOMI DUTTA', NULL, 'poulamid204@gmail.com',
  'F', '2005-08-29', '2026-08-04',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'BARTENDER', 19500,
  'IHAPD8212A', '699510829846', '102248020886', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL032', 'AKASH DAS', '7866095532', 'akashdas43217@gmail.com',
  'M', '2006-02-04', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'BAR BACKUP', 13000,
  'JDUPD0540N', '226002618788', '102257689063', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL033', 'ANIL KUMAR RAVA', '8013157417', 'anilrava1990@gmail.com',
  'M', '1990-05-08', '2026-09-14',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'MIXOLOGIST', 30000,
  'AXGPR2609K', '322932458433', '102069089630', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL034', 'SUNNY KHAKOLARI', '8348510337', 'sunnykhakolari780@gmail.com',
  'M', '2000-12-16', '2026-09-14',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'BARTENDER', 22000,
  'INHPK9446Q', '755160078371', '101472230328', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL035', 'CHRIS DANIEL BISWAS', '6291831281', 'cda554436@gmail.com',
  'M', '2005-05-19', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'BAR TENDER', 20000,
  'HIVPB5212B', '248105660330', '102042897864', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL036', 'SANI BISWAS', NULL, 'biswassunny8@gmail.com',
  'M', '2006-02-11', '2026-09-25',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'ASSISTANT BAR TENDER', 17000,
  'GUHPB177A', '692194234678', '102395041949', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL037', 'RIMAN MONDAL', '9679485809', 'rimanmandal0012@gmail.com',
  'M', '1998-02-18', '2026-09-21',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'BAR', 'ASSISTANT BAR TENDER', 19000,
  'DIOPM8857A', '532914451426', '101246237212', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL040', 'MANOTOSH SHAW', '7407496284', '',
  'M', '1993-01-01', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'GVQPS8349M', '795835528133', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL041', 'AMAR DAS', '9382388200', '',
  'M', '1974-04-05', '2026-09-19',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'CGUPD45333R', '656274050174', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL042', 'BINOD PASAWAN', '6289536388', '',
  'M', '1980-07-06', '2026-09-16',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'FJGPP6727R', '213287173471', '101632080546', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL043', 'SHYAMAL GHOSH', '9836524173', '',
  'M', '1992-07-08', '2026-09-14',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'BVQPG0640E', '439491780724', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL044', 'RAJKUMAR HALDER', '9831315339', '',
  'M', '1975-04-01', '2026-09-20',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'AIKPH6671A', '278837133992', '100292298603', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL045', 'KHAIRUN NISHA KHATOON', NULL, '',
  'M', '1985-01-03', '2026-10-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'FAUPK0805C', '358616521023', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL046', 'PUJA RAY', '9903555709', '',
  'M', '1987-01-01', '2026-09-20',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'BCEPR4460A', '315613978028', '101263021062', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL047', 'BASUDEV BARIK', NULL, 'bapanbarik407@gmail.com',
  'M', '1991-03-10', '2026-09-12',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'CSPP31488Q', '850556390129', '102400521249', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL048', 'SUMAN BARIK', NULL, 'barik.suman0002@gmail.com',
  'M', '1991-04-21', '2026-10-07',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'BQJPB4716N', '859223202161', '102237145179', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL049', 'SABER HOSSAIN', NULL, '',
  'M', '1983-11-09', '2026-10-05',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'AMCPH1186N', '541940470457', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL050', 'SUNANDA BARIK', NULL, 'sunandabarik7@gmail.com',
  'M', '1992-03-13', '2026-10-12',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'BTIPB025IJ', '684352329755', '102400520211', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL051', 'BIKASH BARIK', '8350017475', '',
  NULL, NULL, '2026-10-12',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'CDMPB2278N', '486263707350', '101824082200', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL052', 'BAPPA DAS', '8513929794', '',
  NULL, NULL, '2026-10-07',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'EC4PD2717K', '520244114900', '102261340992', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL053', 'SALAUDDIN LASKAR', NULL, '',
  'M', '1985-01-01', '2026-10-05',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK & KST SUPERVISOR', 18000,
  'AXQPL4872Q', '501024165199', '102016831224', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL054', 'BARUN MONDAL', '9051445438', '',
  'M', '1986-01-01', '2026-09-20',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'HK', 'HK', 13000,
  'DVWPM0095K', '750054057900', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL055', 'BACHU NASKAR', '9836655807', '',
  'M', '1971-01-01', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'KST', 13000,
  'AKDPN6963E', '707105323407', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL056', 'DEBASISH JELE', '7980226837', '',
  'M', '1990-02-10', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'KST', 13000,
  'BCOPJ6498J', '348087137486', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL057', 'PABITRA ADHIKAIY', '932909643', '',
  'M', '1993-10-16', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'KST', 13000,
  'EZCPA6156A', '257561076973', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL058', 'BILAS HALDER', '9242887213', '',
  'M', '2007-10-25', '2026-09-29',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'KST', 13000,
  'CDNPH9111B', '699799351426', '102303267712', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL059', 'SANAT MONDAL', '7047487550', '',
  'M', '1988-01-01', '2026-09-21',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'KST', 13000,
  'GXPPM4611D', '416569483550', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL060', 'INDRARAJ PANDIT', '7551890594', '',
  'M', '2005-08-05', '2026-09-19',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'KST', 13000,
  'JKUPP5040J', '448348323764', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL061', 'MANNAN LASKAR', NULL, '',
  'M', '1969-01-01', '2026-09-14',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'KST', 13000,
  'BYBPL0954J', '627997828689', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL062', 'RAJESH DAS', NULL, '',
  'M', '1996-01-01', '2026-10-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'KST', 13000,
  'FDKPD1082F', '394640647940', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL063', 'SUBRATA PRAMANIK', NULL, '',
  'M', '2026-10-01', '2026-10-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'KST', 13000,
  'CB0PP2390D', '746333323972', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL064', 'RAJAT PAL', '9609136297', 'rajatpal2832@gmail.com',
  'M', '2000-12-23', '2026-09-13',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'DCDP', 27800,
  'EJZPP8001C', '331312882666', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL065', 'SIMON GAYEN', '8777052464', 'simongayen1694@gmail.com',
  'M', '2001-10-28', '2026-09-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'DCDP', 23000,
  'DJZPG6436H', '858940817072', '101936049265', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL066', 'VAIJANT PUSHKAR', '8923614241', 'vaijaint89@gmail.com',
  'M', '1979-10-21', '2026-09-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'EXE CHEF', 100000,
  'AJRPP6234AF', '360131860023', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL067', 'AVIJIT PAL', '8972553742', 'avijitpal01992@gmail.com',
  'M', '1992-04-04', '2026-09-02',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'SOUS CHEF', 40000,
  'BGQPP3420E', '624432925945', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL068', 'AMIRUL ANSARI', '9508570064', 'amirulansari950857@gmail.com',
  'M', '2000-05-25', '2026-09-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'CDP', 32000,
  'DWEPA7758G', '888384034379', '50100622849191', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL069', 'BIDYUT MANDAL', '8016493134', '',
  'M', '1997-01-12', '2026-09-14',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'CDP', 35000,
  'CVXPM4020M', '582253404429', '102166719258', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL070', 'ABHIJIT SARKAR', '8880914485', 'abhijit14377@gmail.com',
  'M', '1994-05-12', '2026-09-13',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'CDP', 32000,
  'CJPPS3096A', '321852750741', '101365662356', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL071', 'SHANKU MONDAL', '8389906399', 'mondalshanku21121992@gmail.com',
  'M', '1991-12-22', '2026-09-14',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'CDP', 32000,
  'CMYPM2556B', '731925051565', '102394978355', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL072', 'SAMIR KOLEY', '6303615204', 'samirkoley320@gmail.com',
  'M', '1997-01-15', '2026-09-07',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'CDP', 35000,
  'FGOPK5318A', '372269466960', '101482698126', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL073', 'MD IRFAN', '6289482642', 'mdirfan628948@gmail.com',
  'M', '2001-01-05', '2026-09-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMMI-I', 23000,
  'AKUPI6083R', '230879362652', '101788154352', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL074', 'TUFAN BAGDI', '9773621369', 'bagditufan733@gmail.com',
  'M', '1997-03-06', '2026-09-07',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMMI-I', 22000,
  'HPRPB3843F', '338820785627', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL075', 'TAPAS PAL', '7986947599', 'tpal34368@gmail.com',
  'M', '1998-07-19', '2026-09-12',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMMI-I', 23600,
  'FQPPP3519H', '483994993968', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL076', 'PRASENJIT MAHATO', '7865915770', 'prasenjitkumar503@gmail.com',
  'M', '2006-01-15', '2026-09-13',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMMI-I', 23500,
  'KDJPM8515G', '364666372294', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL077', 'MD INJAMAMUL HAQUE', '8252583801', 'injamamulmez2gmail.com',
  'M', '2003-04-13', '2026-09-09',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMMI-I', 22000,
  'BDVPH4829F', '310553399518', '101936049334', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL078', 'ASHAFAK ANSARI', '9523136955', 'khanashfak76668q@gmail.com',
  'M', '2002-02-15', '2026-09-10',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMMI-I', 22000,
  'DGRPA1648L', '840666472637', '101682968059', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL079', 'KAMAL SHIKARI', '6297588474', '',
  'M', '2000-06-07', '2026-09-05',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMMI-II', 18000,
  'KUBPS67516', '544881795751', '101620056389', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL080', 'PRITAM MONDAL', NULL, 'pritam.mondalsxc@gmail.com',
  'M', '2002-01-22', '2026-09-24',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMMI-II', 18000,
  'HLIPM9648L', '698097165397', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL081', 'HAFIZUR RAHMAN', '9088147157', 'hafizur763r@gmail.com',
  'M', '2004-10-10', '2026-09-02',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMMI-III', 14000,
  'GFDPR0546J', '975472765371', '102263097944', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL082', 'JHONATHAN ABRAHAM JENNINGS', NULL, '',
  'M', '2005-09-06', '2026-09-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMM-III', 15000,
  'CXZPJ3610F', '349484599698', '102209376881', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL083', 'SANJAY DHIBAR', NULL, 'sanjoydhibar40@gmail.com',
  'M', '2026-09-28', '2026-09-28',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'KITCHEN STAFF', 'COMMI-III', 16100,
  'JDMPD8599B', '217849916034', NULL, true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL084', 'ASIF HOSSAIN', NULL, 'asifhossain64209@gmail.com',
  'M', '2000-03-12', '2026-10-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'VALET', 'VALET', 15000,
  'AYOPH6666F', '965872897793', '101353676963', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL085', 'JAWEED HUSSAIN', NULL, 'jkhan549693',
  'M', '2000-03-13', '2026-10-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'VALET', 'VALET', 15000,
  'BAUPH3692A', '851527340085', '101431772813', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL086', 'MD SABIR', NULL, 'mdsabir9300@gmail.com',
  'M', '2003-03-19', '2026-10-01',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'VALET', 'VALET', 15000,
  'OEOPS5721E', '361941965766', '102396731061', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

INSERT INTO public.staff (
  employee_id, full_name, phone, email, gender, date_of_birth, date_of_joining,
  outlet_id, department, designation, monthly_salary,
  pan_number, aadhaar_number, uan_number, is_active, organization_id
) VALUES (
  'EDL087', 'SUNNY DEBNATH', NULL, 'sunnybookings@gmail.com',
  'M', '1993-11-14', '2026-09-15',
  (SELECT id FROM public.outlets WHERE name = 'MILLI MILLI' LIMIT 1), 'DJ', 'DJ', 50000,
  'BNMPD6781M', '462179139597', '102397631544', true, public.default_organization_id()
) ON CONFLICT (employee_id) DO UPDATE SET
  full_name        = EXCLUDED.full_name,
  phone            = EXCLUDED.phone,
  email            = COALESCE(NULLIF(EXCLUDED.email,''), staff.email),
  gender           = COALESCE(EXCLUDED.gender, staff.gender),
  date_of_birth    = COALESCE(EXCLUDED.date_of_birth, staff.date_of_birth),
  date_of_joining  = COALESCE(EXCLUDED.date_of_joining, staff.date_of_joining),
  outlet_id        = COALESCE(EXCLUDED.outlet_id, staff.outlet_id),
  department       = COALESCE(EXCLUDED.department, staff.department),
  designation      = COALESCE(EXCLUDED.designation, staff.designation),
  monthly_salary   = COALESCE(EXCLUDED.monthly_salary, staff.monthly_salary),
  pan_number       = COALESCE(EXCLUDED.pan_number, staff.pan_number),
  aadhaar_number   = COALESCE(EXCLUDED.aadhaar_number, staff.aadhaar_number),
  uan_number       = COALESCE(EXCLUDED.uan_number, staff.uan_number),
  organization_id  = COALESCE(staff.organization_id, public.default_organization_id()),
  is_active        = true;

COMMIT;

-- Verify
SELECT COUNT(*) AS total_staff,
       COUNT(outlet_id) AS with_outlet,
       COUNT(pan_number) AS with_pan,
       COUNT(uan_number) AS with_uan
FROM public.staff
WHERE employee_id LIKE 'EDL%';
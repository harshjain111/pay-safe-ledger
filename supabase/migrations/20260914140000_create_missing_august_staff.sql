-- ---------------------------------------------------------------------------
-- The people on the August payroll sheet who had no staff record.
--
-- 21 of them: the 19 that matched nothing, plus DANISH RASHID and SUVODIP
-- MONDAL, whose only near-matches (MD DANISH KHAN, SUJIT MONDAL) were rejected
-- as too weak to assert. Without these the salary register is short by about
-- Rs 30,000 of PF a month, and four head-office salaries of 75,000 and up are
-- missing from it entirely.
--
-- Outlet and department are not guessed. They are derived from how the 188
-- already-matched people map: every "SY -", "RY -", "HEAD OFFICE" and "OTHERS"
-- row belongs to Reality, every "KK -" and "MIROSH CAFE" row to Mirosh, and
-- the department follows the sheet's own suffix -- KITCHEN STAFF to KITCHEN,
-- SERVICE STAFF to SERVICE, HEAD OFFICE and the ADMIN designation to ADMIN.
-- The mapping is unanimous in the data except for two rows out of 188.
--
-- Employee codes continue at K2H901, which is free through K2H999. Emails
-- follow the existing synthetic convention so employee-code login works if an
-- account is later created for them; user_id is left null, so none of these
-- people can sign in until someone creates one from the Users page.
--
-- date_of_joining is set to the start of the August period rather than today.
-- They were on the August payroll, so a joining date in September would make
-- the engine pro-rate a month they worked in full. It is a placeholder and
-- should be corrected to the real date when HR has it.
-- ---------------------------------------------------------------------------

WITH incoming(employee_id, full_name, email, designation, department, outlet_name,
              monthly_salary, pf_enrolled, esi_enrolled) AS (
  VALUES
    ('K2H901', 'ADARSH GUPTA', 'k2h901@hr-buddy-nine.vercel.app', 'VJ', 'SERVICE', 'Reality', 32000, false, false),
    ('K2H902', 'AKIL AHMED', 'k2h902@hr-buddy-nine.vercel.app', 'HOOKAH', 'SERVICE', 'Mirosh', 13000, true, true),
    ('K2H903', 'ANKIT KEJRIWAL', 'k2h903@hr-buddy-nine.vercel.app', 'MAINTENANCE', 'SERVICE', 'Reality', 35000, false, false),
    ('K2H904', 'AYUSH TEBREWAL', 'k2h904@hr-buddy-nine.vercel.app', 'ADMIN', 'ADMIN', 'Reality', 33000, false, false),
    ('K2H905', 'BELAL ALI', 'k2h905@hr-buddy-nine.vercel.app', 'COMMI I', 'KITCHEN', 'Reality', 19000, true, true),
    ('K2H906', 'BIKASH PAUL', 'k2h906@hr-buddy-nine.vercel.app', 'STOREMAN', 'SERVICE', 'Reality', 16300, true, true),
    ('K2H907', 'DANISH RASHID', 'k2h907@hr-buddy-nine.vercel.app', 'TR.STEWARD', 'SERVICE', 'Reality', 11000, true, true),
    ('K2H908', 'DEBDUTTA DAS', 'k2h908@hr-buddy-nine.vercel.app', 'COMMI I', 'KITCHEN', 'Reality', 19000, true, true),
    ('K2H909', 'MUNSHI NASHIM UDDIN', 'k2h909@hr-buddy-nine.vercel.app', 'STEWARD', 'SERVICE', 'Mirosh', 11000, true, true),
    ('K2H910', 'NEHA CHOWDHURY', 'k2h910@hr-buddy-nine.vercel.app', 'ADMIN', 'ADMIN', 'Reality', 75000, false, false),
    ('K2H911', 'NIMAI GHOSH', 'k2h911@hr-buddy-nine.vercel.app', 'CDP', 'KITCHEN', 'Reality', 23000, true, false),
    ('K2H912', 'POULAMI DUTTA', 'k2h912@hr-buddy-nine.vercel.app', 'BAR', 'SERVICE', 'Reality', 19500, true, true),
    ('K2H913', 'PREM SHAW', 'k2h913@hr-buddy-nine.vercel.app', 'DJ', 'SERVICE', 'Reality', 20000, false, true),
    ('K2H914', 'PRITAM DUTTA', 'k2h914@hr-buddy-nine.vercel.app', 'SOUND ENG', 'SERVICE', 'Reality', 20000, true, true),
    ('K2H915', 'SK SAJID', 'k2h915@hr-buddy-nine.vercel.app', 'HOOKAH', 'SERVICE', 'Mirosh', 19000, true, true),
    ('K2H916', 'SMITA CHOWDHURY', 'k2h916@hr-buddy-nine.vercel.app', 'ADMIN', 'ADMIN', 'Reality', 75000, false, false),
    ('K2H917', 'SNEHA MADHOGARIA', 'k2h917@hr-buddy-nine.vercel.app', 'ADMIN', 'ADMIN', 'Reality', 75000, false, false),
    ('K2H918', 'SOMNATH GURIA', 'k2h918@hr-buddy-nine.vercel.app', 'COMMI II', 'KITCHEN', 'Reality', 16000, true, true),
    ('K2H919', 'SOMNATH SHARMA', 'k2h919@hr-buddy-nine.vercel.app', 'GD', 'ADMIN', 'Reality', 21500, true, false),
    ('K2H920', 'SUVODIP  MONDAL', 'k2h920@hr-buddy-nine.vercel.app', 'ASS BARTENDER', 'SERVICE', 'Reality', 16300, true, true),
    ('K2H921', 'ZESHAN ASLAM', 'k2h921@hr-buddy-nine.vercel.app', 'DJ', 'SERVICE', 'Reality', 100000, false, false)
)
INSERT INTO public.staff (
  employee_id, full_name, email, designation, department, outlet_id,
  date_of_joining, monthly_salary, basic_salary, hra, other_allowances,
  pf_enrolled, esi_enrolled, esi_employee_rate, is_active, status
)
SELECT i.employee_id, i.full_name, i.email, i.designation, i.department, o.id,
       DATE '2026-08-01', i.monthly_salary,
       ROUND(i.monthly_salary * 0.5),
       ROUND(i.monthly_salary * 0.25),
       i.monthly_salary - ROUND(i.monthly_salary * 0.5) - ROUND(i.monthly_salary * 0.25),
       i.pf_enrolled, i.esi_enrolled, 0.75, true, 'active'
  FROM incoming i
  LEFT JOIN public.outlets o ON o.name = i.outlet_name
 WHERE NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.employee_id = i.employee_id);

-- ---------------------------------------------------------------------------
-- Employee ESI was coming out as zero for everybody, enrolled or not.
--
-- The engine reads the employee's ESI rate from staff.esi_employee_rate, and
-- payroll_statutory_settings has only an EMPLOYER rate to fall back on -- so
-- with the column null on all 214 rows, esiRateEmployee resolved to 0 and the
-- ESI column of the payroll grid was zero the whole way down. The August sheet
-- deducts 0.75%% of gross, and that rate reproduced its ESI figures exactly
-- across all 209 rows, so that is what is set here.
-- ---------------------------------------------------------------------------
UPDATE public.staff
   SET esi_employee_rate = 0.75
 WHERE esi_employee_rate IS NULL;

-- ---------------------------------------------------------------------------
-- Link the rest of the August sheet, and fill the salaries it can supply.
--
-- The first bootstrap matched 165 of the sheet's 209 names. The remaining 44
-- were not missing people so much as differently spelled ones: once both
-- residual sets were down to about 45 rows each, the pairs were obvious, and
-- the contracted salary confirms them independently of the spelling.
--
-- 23 links, of which 19 have a salary identical on both sides -- SWARAJIT
-- HALDER / SARAJIT HALDAR, KABIRUDDIN SEIKH / SK KABIRUDDIN, MD NAUSAD KHAN /
-- MD NAUSHAD, DULAR CHAND / DULARCHAND KUMAR. Three of the sheet's own
-- bracketed aliases did the work: AVI DAS (MIKHEL DAS), JANE ALAM SK(ALAM
-- SEKH), CHOTU DAS(CHHATTU).
--
-- Three link on name alone, where the sheet's salary is higher than ours:
-- AMITABHA SARKAR / AMITAVA SARKAR, SONATON MONDAL / SONATAN MANDAL,
-- MD AZHARUDDIN / MD AZHAR UDDIN. That gap is the same one 31 already-matched
-- people show, so it reads as our salaries being behind rather than as a bad
-- link. Their salaries are NOT changed here -- an increment is a decision.
--
-- Two candidates were rejected as too weak to act on: SUVODIP MONDAL against
-- SUJIT MONDAL, and DANISH RASHID against MD DANISH KHAN. Close enough to
-- surface, too different to assert -- the given name and the surname disagree
-- in both, and the salaries differ as well.
--
-- 19 names on the sheet still have no staff record at all, several of them
-- head-office people on 75,000 and up. They need employee records created,
-- which is not something a data migration should invent.
-- ---------------------------------------------------------------------------

-- 1. PF / ESI enrolment for the newly linked staff, evidence only, on the same
--    rule as the first pass: true where that person's PF or ESI was non-zero.
WITH enrolment(staff_id, pf, esi) AS (
  VALUES
    ('659ef0ef-f1c7-473d-9004-7741a6144f98'::uuid, true, true),  -- DANISH ANSARI = MD DANISH ANSARI
    ('f0270730-1d8c-46f5-9fbe-be5b030ac4a9'::uuid, true, true),  -- TARUN SARKAR = TARUN SARKAR
    ('b2c27f81-4653-4ffb-8065-ac8a4e905dba'::uuid, true, true),  -- AVI DAS (MIKHEL DAS) = MIKHEL DAS
    ('ccb5c87b-a6da-4072-8ad3-27cafd27b496'::uuid, true, true),  -- MITHUN YADAV = MITHUN KUMAR YADAV
    ('504f15ed-cfd9-4fe0-a132-30d975adb798'::uuid, true, true),  -- ABID ALI KHAN = ABID ALI
    ('b0751eb6-c9af-48ab-a569-ce741acab7aa'::uuid, true, true),  -- TARUN SARKAR = TARUN SARKAR
    ('54cb2905-53d6-4a4d-8738-6f7f89e6f6af'::uuid, true, true),  -- SWARAJIT HALDER = SARAJIT HALDAR
    ('2410e354-c47c-4725-99eb-0efe67c44e24'::uuid, true, true),  -- SAHINUR MONDAL = SAHINOOR MONDAL
    ('97af707f-92a0-4157-a993-a9ed19b8de12'::uuid, true, true),  -- KABIRUDDIN SEIKH = SK KABIRUDDIN
    ('ab07c219-8604-4d37-a17f-69349bd0cb01'::uuid, true, true),  -- SUSHANTA BASAK = SUSANTO BASAK
    ('57b87387-b531-40ce-9e2e-c2e15a1664a5'::uuid, true, false),  -- SUJOY BOR = SUJAY BOR
    ('f60cccff-52da-4303-b839-d51cac33222c'::uuid, false, false),  -- ARUP BHATTACHARYA = ARUP BHATTACHARJEE
    ('ef9f3183-ae38-4b08-bbb6-285af1655eb3'::uuid, true, true),  -- ANTHONI MALIK = ANTONY MALICK
    ('b7f09b9b-d609-40e5-80f9-0fd010854319'::uuid, true, false),  -- PRABHAT KUMAR GUPTA = PRAVAT KR GUPTA
    ('c8cdc348-48ad-4de8-aac4-c5fc90061983'::uuid, true, true),  -- DHARAMVEER LAL = DHARAMBIR LAL
    ('b4f03c6e-9145-4031-8a41-c55d6c51b9bc'::uuid, true, true),  -- CHOTU DAS(CHHATTU) = CHHATTUU DAS
    ('df2f0d8d-1e24-4290-adcc-789e7f36823b'::uuid, true, true),  -- JANE ALAM SK(ALAM SEKH) = ALAM SEKH
    ('82452d95-e9ee-4b6c-9a33-af2bfb5cfad3'::uuid, true, false),  -- MD NAUSAD KHAN = MD NAUSHAD
    ('c35c162b-71ea-4da4-89c2-fd83b01e3b42'::uuid, true, true),  -- DULAR CHAND = DULARCHAND KUMAR
    ('b7c6840a-510a-4787-815e-590e62a326d0'::uuid, true, false),  -- AMITABHA SARKAR = AMITAVA SARKAR
    ('2a159e70-2cad-45fe-a727-940206ae4f5f'::uuid, true, false),  -- RAM PRAWESH SADAY = RAM PARVESH
    ('c51c8a62-5c42-4d94-af15-83a1a8fe550f'::uuid, true, true),  -- SONATON MONDAL = SONATAN MANDAL
    ('ac2e23a7-bae6-4e44-b3ea-ca7d69b57781'::uuid, false, false)  -- MD AZHARUDDIN = MD AZHAR UDDIN
)
UPDATE public.staff s
   SET pf_enrolled  = e.pf,
       esi_enrolled = e.esi
  FROM enrolment e
 WHERE s.id = e.staff_id;

-- 2. Salaries for staff who had none on file and appear on the sheet. Twelve of
--    the eighteen; the other six are on no payroll sheet we have, so they are
--    left at zero rather than guessed at. The structure is split on the same
--    50 / 25 / 25 as everyone else, with Other taking the remainder so the
--    three sum back exactly.
WITH filled(staff_id, salary) AS (
  VALUES
    ('df2f0d8d-1e24-4290-adcc-789e7f36823b'::uuid, 13000),  -- ALAM SEKH
    ('0da5a9ff-2eeb-4be8-a41d-b92bd23bbe0e'::uuid, 11000),  -- ARGHA MONDOL
    ('d232336a-60d7-4a37-8e87-682cfbc8d1f0'::uuid, 11500),  -- ASISH MANDAL
    ('e3862130-1564-4fca-b30c-8ab666a53c3e'::uuid, 16000),  -- IBRAHIM SHEK
    ('24f9a141-b9af-4b47-af79-1965eecce1c9'::uuid, 15000),  -- MANORANJAN KARMAKAR
    ('5c51a260-9d4e-4db7-b8c2-049d808c4d82'::uuid, 15000),  -- MARIAN ROZARIO
    ('fa1c1089-e4c4-4133-974b-58e62b318715'::uuid, 11500),  -- NARAYAN GHORAI
    ('0a055ac7-0162-455e-959a-8c9cf082b3ea'::uuid, 15000),  -- NAZIR ALI
    ('397eb759-f363-4927-b4d6-52e8be73b44d'::uuid, 21000),  -- RAJU MONDAL
    ('8b0cc71b-5b3b-47db-b3d7-6d38983351c8'::uuid, 12000),  -- Samiran Biswas
    ('c10c820f-3ba8-4fc8-bcf9-e17db883cf38'::uuid, 18000),  -- SAMRAT MONDOL
    ('cac8aa8f-a8a6-40d6-9c1f-fc7f2aecaac6'::uuid, 11000)  -- SANJAY MONDAL
)
UPDATE public.staff s
   SET monthly_salary   = f.salary,
       basic_salary     = ROUND(f.salary * 0.5),
       hra              = ROUND(f.salary * 0.25),
       other_allowances = f.salary - ROUND(f.salary * 0.5) - ROUND(f.salary * 0.25)
  FROM filled f
 WHERE s.id = f.staff_id
   AND COALESCE(s.monthly_salary, 0) = 0;

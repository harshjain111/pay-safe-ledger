-- ---------------------------------------------------------------------------
-- Bootstrap the salary structure and statutory enrolment.
--
-- Two problems, both of which made the salary register wrong rather than
-- merely empty.
--
-- 1. Every one of the 214 staff had basic_salary, hra and other_allowances
--    unset. getStaffStructure() then falls back to treating the WHOLE monthly
--    salary as Basic. PF is charged on Basic, so the engine was about to
--    compute PF on double the correct wage: Rs 323,244 a month against the
--    Rs 166,471 the accountant actually paid for August. The sheet uses a flat
--    50 / 25 / 25 split -- verified against all 209 of its rows, where Basic is
--    50% of gross and Other is exactly gross minus basic minus HRA. Applied
--    here from each staff member's own monthly_salary. Other takes the
--    remainder rather than a second rounding, so the three always sum back to
--    the salary exactly.
--
-- 2. pf_enrolled and esi_enrolled were false for all 214, so nobody would have
--    been deducted at all. The August sheet is the only record of who is
--    actually enrolled: 183 of its 209 rows pay PF, 162 pay ESI. Those flags
--    are set below for the 165 people matched to it by name.
--
--    Evidence only. pf_enrolled is set true where that person's PF was
--    non-zero, esi_enrolled where their ESI was non-zero, and false otherwise.
--    Nobody is marked enrolled on inference -- someone earning over the
--    Rs 21,000 ESI ceiling shows zero ESI whether or not they are registered,
--    and guessing there would mean deducting from an employee we have no
--    evidence is covered. They are left false, to be set when HR registers
--    them.
--
--    44 names on the sheet matched nothing in staff and are untouched.
--
-- Professional tax needs nothing: every zero in the sheet is explained by the
-- slab table already configured (gross up to Rs 10,000 pays nil), so pt_exempt
-- stays false for everyone.
-- ---------------------------------------------------------------------------

-- 1. The 50 / 25 / 25 structure, for everyone with a salary on file.
UPDATE public.staff
   SET basic_salary     = ROUND(COALESCE(monthly_salary, 0) * 0.5),
       hra              = ROUND(COALESCE(monthly_salary, 0) * 0.25),
       other_allowances = COALESCE(monthly_salary, 0)
                          - ROUND(COALESCE(monthly_salary, 0) * 0.5)
                          - ROUND(COALESCE(monthly_salary, 0) * 0.25)
 WHERE COALESCE(monthly_salary, 0) > 0;

-- 2. PF / ESI enrolment, from the August register.
WITH enrolment(staff_id, pf, esi) AS (
  VALUES
    ('e457d737-59ae-42d5-80c7-7d29791da3d4'::uuid, true, true),
    ('4e4781d1-82d3-40e9-b96f-da149f726938'::uuid, true, false),
    ('bc8b0735-7aed-4168-bfa2-0ff431c19f59'::uuid, true, false),
    ('0697a97d-81e8-437c-aa49-14ea3aab8228'::uuid, true, true),
    ('0a8e2f41-0026-46bb-81b3-7f81929f0376'::uuid, true, true),
    ('c15c2f1b-4037-4845-b33e-a6e8f25797e9'::uuid, true, true),
    ('e56b5b5e-dc9a-4a08-8524-ebee78faf561'::uuid, true, true),
    ('592de25a-17e7-415f-90bf-be73c6b567a5'::uuid, true, true),
    ('bb917bc9-0e31-491d-b0c5-d58733b54535'::uuid, true, false),
    ('26c91721-5e95-4271-a37e-7607c06d3f0c'::uuid, true, true),
    ('e54f0251-8858-467a-8383-0a98d549e5b5'::uuid, true, true),
    ('e04d31b8-dba5-4793-8bb1-e391b0a89954'::uuid, true, false),
    ('13f0cf9b-b44c-4664-afcc-3adadd9f5569'::uuid, true, true),
    ('7eb730fb-766d-48b1-a49c-940905ca9b71'::uuid, false, false),
    ('4a2b8014-5672-43d9-b9e6-105eecb4383c'::uuid, true, false),
    ('47441223-66d2-4251-a32d-99d581ae4be5'::uuid, false, false),
    ('509fdc98-8215-4563-869d-fd64c6d7674c'::uuid, true, true),
    ('81071a24-e71d-4173-84c1-140d2cddab1b'::uuid, true, true),
    ('77375392-d7fd-42ba-8dba-28b37c3ed464'::uuid, true, true),
    ('2e0bf1c3-99bc-44db-9051-8c42d8fdd869'::uuid, false, false),
    ('dce10ec8-9074-4959-9a6b-19533f29adc9'::uuid, true, true),
    ('4d2810e8-4adf-43b4-be28-f373d593617e'::uuid, false, false),
    ('b81f6caa-a808-48d2-9564-ab0fc1ed2af7'::uuid, true, true),
    ('bc4ff0d2-4719-4344-aa37-67fcc12193e9'::uuid, true, true),
    ('2271e918-18ed-4ab2-af0e-ed61af7e7035'::uuid, true, true),
    ('85d6bfb2-9855-4ed5-9640-c8a3b3944b6d'::uuid, true, true),
    ('c7618f8f-2caf-427c-a4a7-7d2950e30bbf'::uuid, true, true),
    ('c04073f2-8944-4ebb-b24d-3326cc3f4993'::uuid, true, true),
    ('62904598-d129-4f80-81a6-6d606dd9d27c'::uuid, true, true),
    ('7050a86b-e08e-4529-b07d-8cf2a0b59a25'::uuid, true, true),
    ('d5c6f9fe-3159-4f24-9915-1d832233eecd'::uuid, true, true),
    ('551cd2dd-69dc-4cb0-a38c-534092b3a4c8'::uuid, true, true),
    ('66d82d8c-83a9-483f-a02f-4a69efdf82ff'::uuid, true, true),
    ('548c90ff-3163-47e9-a060-e16a502fed83'::uuid, true, false),
    ('425139af-d41d-446e-add4-200c39243fef'::uuid, true, true),
    ('dc571f1c-3f46-44d1-bba0-3a9af0cf6329'::uuid, true, true),
    ('9b869874-e3f8-45d7-a44c-58f051b3488b'::uuid, true, true),
    ('28915175-8bd1-4b63-90b3-bee8e583cab1'::uuid, true, true),
    ('2b3f0f1f-31c8-4b21-a546-bd981bf301fb'::uuid, true, true),
    ('d725f06c-5f0f-4931-8c09-18b96c35bee8'::uuid, true, true),
    ('40077859-209d-4feb-ac0e-072f6354bd58'::uuid, true, true),
    ('3a6f35ed-8dd4-44f6-b622-3e249fb1b6ca'::uuid, true, true),
    ('fd8fc671-be0f-4803-b80e-cf60bd798343'::uuid, true, true),
    ('2f99cab4-292b-4513-8794-b4a3c3d03807'::uuid, true, true),
    ('c5a37c55-9475-4f4e-b6c3-a67c6b520ea3'::uuid, true, true),
    ('0d7b4318-c3ab-40e0-8642-fd7e7451ee07'::uuid, true, true),
    ('f59a8ba6-b7cb-44a7-95b9-7792820c2a7e'::uuid, true, true),
    ('e283e615-a7dc-494e-b849-1b3ff1b6cbeb'::uuid, true, true),
    ('691f6ae5-c0e0-467a-afce-5034ae17d15c'::uuid, true, false),
    ('87e4ca37-3c7b-4b12-8cdc-040356f50810'::uuid, true, true),
    ('a71e5651-a715-407d-bf49-7949595c3578'::uuid, true, true),
    ('5369731f-3326-4588-93d8-0bb7e3108cff'::uuid, true, true),
    ('d35e7253-48da-4e8d-b7e8-59f5aac37348'::uuid, true, false),
    ('6a652d7c-6ce3-4f30-9ae7-7fc67123ba4b'::uuid, true, true),
    ('58f8ae5b-2c78-43ae-ab26-8f6e3f4e08cb'::uuid, true, true),
    ('587b4488-bebf-405c-a8ac-0512e34233fc'::uuid, true, true),
    ('798f4bf6-c579-44ce-ad05-268c01f743da'::uuid, true, true),
    ('45eadb65-26bb-473b-96b9-8e8188923e6b'::uuid, true, true),
    ('3b768181-9860-459f-8f42-da92e383029f'::uuid, false, true),
    ('66b65765-66c2-4633-86ae-dd9f43071830'::uuid, true, true),
    ('adfc3df4-65d7-4741-8d0d-47853b910144'::uuid, true, true),
    ('fc4d62d8-7119-40ae-8e8d-b8c300366ce0'::uuid, true, true),
    ('37476a83-a8a3-433c-ad1a-47ab90b166f7'::uuid, true, true),
    ('703876e0-4624-41de-a357-52a77e28a341'::uuid, true, true),
    ('bf1989e5-563d-4b34-939f-3ad1f710509d'::uuid, true, false),
    ('f7e19b09-b35b-4ce3-94b9-d0ee65d304ef'::uuid, true, true),
    ('0f62fc1e-f8f0-44e4-a2f6-7c3a69ff6dbf'::uuid, true, true),
    ('67dfd91c-d28d-4cab-b365-7cad32958d3a'::uuid, true, true),
    ('8f26f244-4a0b-4cf4-ae46-0222b764c60e'::uuid, true, true),
    ('818d047c-dfca-4bc5-8310-88d858e682db'::uuid, true, true),
    ('d85215a0-a118-4cb3-a0b6-7461d96e06d1'::uuid, true, true),
    ('2d0203fc-fad7-45d2-80fd-a565c5fe73bd'::uuid, true, true),
    ('fc6a8f41-7b02-482f-a7d7-4ab332e283ec'::uuid, true, true),
    ('069f8e27-d40b-4c2c-ab34-d1eb4b2df0e5'::uuid, true, false),
    ('b76f0cde-4b3d-4263-8dcd-054c55d4c189'::uuid, true, false),
    ('45f61e54-09a8-4db8-b72a-1c2928bdfc43'::uuid, true, true),
    ('2babebe6-e7bb-433b-a435-92d5541d3b3f'::uuid, true, true),
    ('5a37adbc-0832-4c65-a1b9-f4258895c43e'::uuid, true, true),
    ('64a927ed-65ed-4dce-881e-18f6cb7fd7d6'::uuid, true, true),
    ('b2a5f0ee-6b2b-408a-b6b0-578061675c3d'::uuid, true, true),
    ('260dfec9-670d-426b-9ea4-423c86cf406e'::uuid, true, true),
    ('1773a3e9-516a-4d52-b273-d86dca482e13'::uuid, true, true),
    ('1d97224d-90ba-4120-82ef-d4ac77fd588a'::uuid, true, true),
    ('83f4362b-ad23-407c-93c3-68f35c462086'::uuid, false, true),
    ('5155e019-bded-45c7-bbfa-3715e7601d2d'::uuid, false, false),
    ('9a390c78-27e5-4b75-bd07-8ccf9d866b85'::uuid, true, true),
    ('35e2ea25-eeba-4e2f-8169-78778e8cbe08'::uuid, true, true),
    ('9c8dbf51-ad8d-4f6b-a3c7-e0b93c278c30'::uuid, true, true),
    ('06429400-07b2-4385-a481-3dfff1f346a3'::uuid, false, false),
    ('9044122c-4e8e-43b7-be8c-a6b37790d822'::uuid, true, true),
    ('4ac61e11-464f-4365-8c3d-5e1ef43792b6'::uuid, false, false),
    ('a6a304d2-f70a-4443-851d-573641214c2d'::uuid, false, false),
    ('87ca7c61-d909-4d1d-841a-2b5ebbbdf8e2'::uuid, true, true),
    ('f23845d8-7477-4a7f-9f1b-f4ec5068f7a3'::uuid, true, true),
    ('eebe8265-081e-401e-8bdb-c65ef1131ebc'::uuid, true, true),
    ('3c26d95c-73c3-4804-a149-ab302688b237'::uuid, true, false),
    ('8e286420-d63a-42a0-8a57-e2cf1549b38d'::uuid, true, false),
    ('4b8c9db5-8972-4f9d-9488-3142897c03b2'::uuid, true, true),
    ('5d1f75c1-81e1-44d9-af0a-76a393befe3c'::uuid, false, false),
    ('fe0e7478-2235-429c-a897-558ed76a9de9'::uuid, true, true),
    ('dd51cb83-7d09-4eff-8fdc-464182366dbb'::uuid, true, true),
    ('a5596406-249b-4bef-9ebf-64a700b2fb74'::uuid, true, true),
    ('14235ee0-8d8b-4fb3-8758-083b5e6f0eda'::uuid, true, true),
    ('45fe4ef4-0a47-4526-b60a-6fbf7d90fab4'::uuid, true, true),
    ('e5584a4f-4568-44cb-9505-80ab206a3b82'::uuid, false, false),
    ('ee9c0c88-0dea-4a82-8a3d-f604ae2e687b'::uuid, true, true),
    ('7022cf04-a0bb-499d-aff0-c735703551a9'::uuid, true, true),
    ('6e8d07ea-af2a-400e-b6d0-abb85de4bf3f'::uuid, false, false),
    ('33c6bdea-dd53-4aa3-aa34-4bf26ba30190'::uuid, false, false),
    ('e1c24e45-7cc6-429e-b6d3-c2d60714e825'::uuid, true, true),
    ('2db13826-a2cb-4349-89a4-51c4a14e24e5'::uuid, true, true),
    ('e40ddccc-6c73-4125-852b-ec5f22fa3b71'::uuid, true, true),
    ('770be765-3c45-47c6-8c0a-f68772c6f7f6'::uuid, true, false),
    ('0b0e4a57-07bd-4b90-a38d-dc942e6950af'::uuid, true, true),
    ('b7ec42a3-6158-4107-bb4a-7294fb5a74f6'::uuid, true, true),
    ('9b8b7c0d-c203-44ec-a13b-7db17ab31b08'::uuid, true, false),
    ('769a778f-14ec-4d01-9089-e9cde6d11f69'::uuid, true, true),
    ('7b4e4488-bf5d-4206-ba63-5a8b631aa8d9'::uuid, true, true),
    ('9061df09-bb66-4c1e-882c-3424dcb9b5e4'::uuid, true, true),
    ('832543f1-cf63-4076-a762-baf56eaad13e'::uuid, true, true),
    ('fbf7beef-1262-444c-be89-a38b6927fe93'::uuid, true, true),
    ('9745619f-47ee-4743-9661-02128447c3b7'::uuid, true, true),
    ('2ce9c3b5-aae3-4d51-80a5-10e7bf912027'::uuid, true, true),
    ('0deaf6a7-a2bc-4f5b-847b-2c5510f2e576'::uuid, true, true),
    ('c2b7c7ca-d6b2-4cfd-b87c-0d074a057bca'::uuid, true, true),
    ('b0e2b105-b82e-4428-95d6-b068f6596972'::uuid, true, true),
    ('8ddd42f9-6a33-45e4-acb1-8d531af98d00'::uuid, true, true),
    ('cac8aa8f-a8a6-40d6-9c1f-fc7f2aecaac6'::uuid, true, true),
    ('fa1c1089-e4c4-4133-974b-58e62b318715'::uuid, true, true),
    ('0a055ac7-0162-455e-959a-8c9cf082b3ea'::uuid, true, true),
    ('5c51a260-9d4e-4db7-b8c2-049d808c4d82'::uuid, true, true),
    ('1c1bf4ac-f4d0-4040-9739-835f1ac026a6'::uuid, true, true),
    ('9eee79a5-ef0d-41b1-98b7-deb9838fad8a'::uuid, true, true),
    ('edda5a56-e88a-46d2-9b4a-06bc82e434be'::uuid, true, true),
    ('7c8ea8a1-635a-449f-a2f3-2329d2cd1570'::uuid, true, true),
    ('eb7cf477-9b30-4222-a6fc-eea454a11268'::uuid, true, false),
    ('e7d281f5-a0b0-48b9-a661-6624f6a35e3c'::uuid, true, true),
    ('27bb1b1b-f3c4-4540-903a-9ab640df6c0d'::uuid, true, true),
    ('2b145e18-bb37-4791-adb4-5b71c1e95f28'::uuid, true, true),
    ('2617982a-86f5-498a-9663-a842b8844193'::uuid, true, false),
    ('00241a15-615d-4ffb-811a-dea6ef59915b'::uuid, true, true),
    ('87063e47-6099-48d6-bba4-3049fe47cba5'::uuid, true, true),
    ('8dd75d2c-daf3-409c-aa3d-0afe6c21ee69'::uuid, true, true),
    ('ea96dc7c-c64e-47ed-9656-b931e3aec659'::uuid, true, true),
    ('599f95bd-41f9-4b38-9d32-1d8df2cec4a8'::uuid, true, true),
    ('882f6a18-2639-4b14-bc1c-d45e37c8bbe6'::uuid, true, true),
    ('ac458ba0-def6-40b8-8553-d4847475ae87'::uuid, true, true),
    ('3bbeeff4-5413-497a-b010-586ef4d5b3af'::uuid, true, true),
    ('c10c820f-3ba8-4fc8-bcf9-e17db883cf38'::uuid, true, true),
    ('2421453d-1782-4274-95fd-a89b83b2043b'::uuid, true, true),
    ('1296a634-5ca6-4dd1-8e48-04c4d9f1004e'::uuid, true, true),
    ('f9846aad-9346-41fd-8ee6-eafffde97cfa'::uuid, true, true),
    ('4b1049c5-dac3-435c-aff1-e8080108801a'::uuid, true, true),
    ('65ddb035-a94e-4159-8189-48a6dacdb3f8'::uuid, true, true),
    ('0153d44c-5bef-419f-a94a-af549cd9bd7d'::uuid, true, true),
    ('8b0cc71b-5b3b-47db-b3d7-6d38983351c8'::uuid, true, true),
    ('70361716-5e68-4fa9-ae7a-f7f349fdc818'::uuid, true, true),
    ('24f9a141-b9af-4b47-af79-1965eecce1c9'::uuid, true, true),
    ('d232336a-60d7-4a37-8e87-682cfbc8d1f0'::uuid, true, true),
    ('48d9a243-6d91-45c2-9bf7-ec81e144896d'::uuid, false, false),
    ('a8419ba4-84c0-40d6-b93a-f58ece519f3f'::uuid, false, false),
    ('397eb759-f363-4927-b4d6-52e8be73b44d'::uuid, true, true),
    ('e3862130-1564-4fca-b30c-8ab666a53c3e'::uuid, true, true),
    ('0da5a9ff-2eeb-4be8-a41d-b92bd23bbe0e'::uuid, true, true),
    ('4abaafb5-0892-4008-8dc5-ff4e626caa70'::uuid, true, true)
)
UPDATE public.staff s
   SET pf_enrolled  = e.pf,
       esi_enrolled = e.esi
  FROM enrolment e
 WHERE s.id = e.staff_id;

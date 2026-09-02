-- ============================================================================
-- PHASE 5 (Attendo rebuild): payslip support.
--
-- 1. organization_profile.brand_code — printed as "Brand" on the payslip
--    identity block. Seeded "K2H" (matches the employee-code prefix K2H###;
--    an explicit column was chosen over deriving it). Editable under
--    Settings → Organisation.
-- 2. The Administrator template gains payslips.download — the client wants
--    both HR and Admin able to download all payslips.
-- ============================================================================

ALTER TABLE public.organization_profile
  ADD COLUMN IF NOT EXISTS brand_code text;

UPDATE public.organization_profile SET brand_code = 'K2H' WHERE brand_code IS NULL;

UPDATE public.rights_templates
   SET permissions = permissions || '{payslips.download}'::text[]
 WHERE role_key = 'admin'
   AND is_builtin
   AND NOT (permissions @> '{payslips.download}'::text[]);

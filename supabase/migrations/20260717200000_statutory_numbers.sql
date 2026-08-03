-- ============================================================================
-- Statutory identifiers for payslips.
--   * organization_profile.epf_number / esi_number — the employer's EPFO &
--     ESIC establishment (registration) numbers.
--   * staff.uan_number / esic_number — the employee's own EPFO (UAN) and ESIC
--     (IP) numbers. PAN already exists on staff (pan_number).
-- All shown to the employee and printed on their salary slip.
-- ============================================================================

alter table public.organization_profile
  add column if not exists epf_number text,
  add column if not exists esi_number text;

alter table public.staff
  add column if not exists uan_number text,
  add column if not exists esic_number text;

-- ============================================================================
-- Configurable calculation base for statutory deductions.
--
-- PF and ESI can be computed on the BASIC component or the GROSS (full) salary.
-- Default 'gross' preserves existing behaviour (both were computed on the
-- pro-rata gross salary; PF additionally capped at pf_base_cap).
-- ============================================================================

alter table public.payroll_statutory_settings
  add column if not exists pf_calc_base  text not null default 'gross',
  add column if not exists esi_calc_base text not null default 'gross';

alter table public.payroll_statutory_settings
  drop constraint if exists payroll_statutory_calc_base_chk;
alter table public.payroll_statutory_settings
  add constraint payroll_statutory_calc_base_chk
  check (pf_calc_base in ('basic', 'gross') and esi_calc_base in ('basic', 'gross'));

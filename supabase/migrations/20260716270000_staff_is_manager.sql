-- ============================================================================
-- Manager designation. reporting_manager_id (added earlier) links a staff member
-- to their manager; is_manager marks who may BE a manager. The "Reporting
-- Manager" picker shows only is_manager = true staff (by name).
-- ============================================================================

alter table public.staff
  add column if not exists is_manager boolean not null default false;

-- Partial index: fast lookup of the (small) set of managers for the picker.
create index if not exists staff_is_manager_idx
  on public.staff (is_manager) where is_manager;

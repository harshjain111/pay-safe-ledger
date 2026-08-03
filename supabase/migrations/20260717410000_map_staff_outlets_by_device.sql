-- ============================================================================
-- Map every staff member to an outlet via the biometric device they punch on.
--
-- Staff records carry no outlet field, so the physical device is the only
-- signal for location. Steps:
--   1. Ensure every biometric device is tied to an outlet — create one named
--      after the device label where missing (these are the "device-named"
--      outlets the admin then renames to real outlet names; staff & devices stay
--      linked by id so the rename propagates).
--   2. Map each staff to their primary (enrolled) device's outlet.
-- Departments & designations were already seeded + linked in 20260717400000.
-- ============================================================================

-- 1. Outlet per device ---------------------------------------------------------
insert into public.outlets (name)
select distinct btrim(d.label)
from public.biometric_devices d
where d.outlet_id is null
  and coalesce(btrim(d.label), '') <> ''
on conflict (name) do nothing;

update public.biometric_devices d
set outlet_id = o.id
from public.outlets o
where d.outlet_id is null
  and btrim(d.label) = o.name;

-- 2. Staff → their device's outlet --------------------------------------------
update public.staff s
set outlet_id = d.outlet_id
from public.biometric_enrolments e
join public.biometric_devices d on d.id = e.device_id
where e.staff_id = s.id
  and d.outlet_id is not null;

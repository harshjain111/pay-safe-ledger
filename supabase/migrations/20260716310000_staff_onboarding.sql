-- ============================================================================
-- First-login onboarding support.
--
-- New staff (added by phone) go through a welcome + profile + set-password +
-- language flow on their first login. onboarding_completed gates that. Already-
-- provisioned users (anyone with a linked login now — owner, Parakh) are marked
-- done so they are never sent through onboarding.
-- ============================================================================

alter table public.staff
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists preferred_language   text,
  add column if not exists pan_number           text,
  add column if not exists aadhaar_number        text;

-- Everyone already linked to a login has effectively onboarded.
update public.staff set onboarding_completed = true where user_id is not null;

-- A staff member completes their OWN onboarding (updates only their row). Bypasses
-- the staff-table RLS via SECURITY DEFINER but is scoped to auth.uid()'s row.
create or replace function public.complete_staff_onboarding(
  _email text, _pan text, _aadhaar text, _lang text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.staff
  set email                = coalesce(nullif(btrim(_email), ''), email),
      pan_number           = nullif(btrim(_pan), ''),
      aadhaar_number       = nullif(btrim(_aadhaar), ''),
      preferred_language   = nullif(btrim(_lang), ''),
      onboarding_completed = true
  where user_id = auth.uid();
end;
$$;

revoke all on function public.complete_staff_onboarding(text, text, text, text) from public, anon;
grant execute on function public.complete_staff_onboarding(text, text, text, text) to authenticated;

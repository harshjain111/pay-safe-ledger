-- ============================================================================
-- First-time login detection (pre-auth, granted to anon).
--
-- The login screen calls this with the typed identifier (employee code, phone,
-- or email). It returns TRUE only when that identifier resolves to a linked
-- staff account that has NOT completed onboarding yet — so the UI can offer a
-- "set your password" step instead of asking for a password the user has never
-- created. Returns FALSE for unknown identifiers and already-onboarded users.
-- ============================================================================

create or replace function public.is_first_time_login(_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new    boolean;
  v_id     text := btrim(coalesce(_id, ''));
  v_digits text := regexp_replace(btrim(coalesce(_id, '')), '[^0-9]', '', 'g');
begin
  if v_id = '' then return false; end if;
  select (coalesce(onboarding_completed, false) = false) into v_new
  from public.staff
  where user_id is not null
    and (
      lower(employee_id) = lower(v_id)
      or (length(v_digits) >= 10 and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_digits)
      or (v_id like '%@%' and lower(coalesce(email, '')) = lower(v_id))
    )
  limit 1;
  return coalesce(v_new, false);
end;
$$;

revoke all on function public.is_first_time_login(text) from public;
grant execute on function public.is_first_time_login(text) to anon, authenticated;

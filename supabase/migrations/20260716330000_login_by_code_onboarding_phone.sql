-- ============================================================================
-- Log in with employee CODE, phone, or email — all resolve to the same account.
--
-- resolve_login_email() maps any of those identifiers to the linked auth user's
-- login email (pre-auth, so granted to anon). Returns null if no match; the
-- client then falls back to its phone/email heuristics.
-- ============================================================================

create or replace function public.resolve_login_email(_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid;
  v_email  text;
  v_id     text := btrim(coalesce(_id, ''));
  v_digits text := regexp_replace(btrim(coalesce(_id, '')), '[^0-9]', '', 'g');
begin
  if v_id = '' then return null; end if;
  select user_id into v_uid
  from public.staff
  where user_id is not null
    and (
      lower(employee_id) = lower(v_id)
      or (length(v_digits) >= 10 and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = v_digits)
      or (v_id like '%@%' and lower(coalesce(email, '')) = lower(v_id))
    )
  limit 1;
  if v_uid is null then return null; end if;
  select email into v_email from auth.users where id = v_uid;
  return v_email;
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- Onboarding now also captures phone. Recreate complete_staff_onboarding with a
-- _phone parameter (drop the old 4-arg signature first).
drop function if exists public.complete_staff_onboarding(text, text, text, text);

create or replace function public.complete_staff_onboarding(
  _email text, _phone text, _pan text, _aadhaar text, _lang text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.staff
  set email                = coalesce(nullif(btrim(_email), ''), email),
      phone                = coalesce(nullif(regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g'), ''), phone),
      pan_number           = nullif(btrim(_pan), ''),
      aadhaar_number       = nullif(regexp_replace(coalesce(_aadhaar, ''), '[^0-9]', '', 'g'), ''),
      preferred_language   = nullif(btrim(_lang), ''),
      onboarding_completed = true
  where user_id = auth.uid();
end;
$$;

revoke all on function public.complete_staff_onboarding(text, text, text, text, text) from public, anon;
grant execute on function public.complete_staff_onboarding(text, text, text, text, text) to authenticated;

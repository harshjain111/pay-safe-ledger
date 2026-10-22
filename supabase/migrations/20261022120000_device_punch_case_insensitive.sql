-- Terminals keep User IDs as typed on the device ("edl026") while the roster
-- holds "EDL026". api/device-push.ts matches them case-insensitively, so the
-- replay of set-aside punches must too, or a mapped person's waiting punches
-- would never be found.
create or replace function public.replay_unmatched_punches(_staff_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code  text;
  v_org   uuid;
  v_emp   text;
  r       record;
  n       int := 0;
begin
  if not (has_role(auth.uid(), 'owner'::app_role)
          or has_role(auth.uid(), 'admin'::app_role)
          or has_role(auth.uid(), 'hr'::app_role)) then
    raise exception 'not allowed';
  end if;

  select device_user_id, employee_id, organization_id into v_code, v_emp, v_org
    from public.staff where id = _staff_id;
  if not found then return 0; end if;
  if v_org is not null and v_org not in (select public.my_org_ids()) then
    raise exception 'not allowed';
  end if;

  for r in
    select u.id, u.device_id, u.ts, u.verify_mode
      from public.device_unmatched_punches u
      join public.biometric_devices d on d.id = u.device_id
     where u.resolved_at is null
       and upper(u.device_user_id) in (upper(v_code), upper(v_emp))
       and (v_org is null or d.organization_id = v_org)
     order by u.ts
  loop
    perform public.apply_device_punch(
      _staff_id, r.device_id, r.ts,
      case when lower(coalesce(r.verify_mode, '')) = 'face' then 'face' else 'biometric' end,
      'replay:' || r.id::text);
    update public.device_unmatched_punches
       set resolved_staff_id = _staff_id, resolved_at = now()
     where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$function$;

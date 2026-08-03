-- ============================================================================
-- Gap sessionization — night-org fix.
--
-- Konnect 2 Hospitality has virtually NO shifts starting between ~02:00 and
-- 10:00 IST. So a biometric punch in that early-morning window is the trailing
-- CHECK-OUT of the previous (overnight) shift, never the check-in of a new day.
--
-- The plain "split on any gap > 12h" rule mis-handled this: a long overnight
-- (e.g. 6pm→8am = 14h) or a lone early-morning checkout got split off into a
-- brand-new session whose check-in landed at 6–9am — i.e. a check-out was being
-- read as the next day's check-in. Fix: when the LATER punch falls before
-- v_morning_end (10:00 IST) and is within v_late_merge (20h) of the previous
-- punch, keep it in the SAME session (it's the shift's checkout). And a lone
-- early-morning punch (no evening check-in at all) is attributed to the PREVIOUS
-- calendar day, where its shift actually started.
--
-- Day workers are unaffected: they start at/after 10:00 (hour >= 10), so their
-- check-ins never fall in the early-morning window.
-- ============================================================================

create or replace function public.rebuild_sessions_by_gap(_max_gap_min int default 720)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '300s'
as $$
declare
  v_before int; v_after int; v_today date;
  v_morning_end int := 10;    -- IST hour before which no shift starts here
  v_late_merge  int := 1200;  -- minutes (20h): attach a trailing early-morning
                              -- checkout up to this far back; < 24h so two
                              -- consecutive daily punches never merge.
begin
  v_today := (now() at time zone 'Asia/Kolkata')::date;
  select count(*) into v_before from public.attendance_sessions where source = 'biometric';

  -- Distinct punch instants per staff (a ts can be an old check-out AND the next
  -- old check-in — dedupe so it isn't double counted).
  create temp table _inst on commit drop as
    select staff_id, max(user_id::text)::uuid as user_id, ts
    from (
      select s.staff_id, s.user_id, v.ts
      from public.attendance_sessions s
      cross join lateral (values (s.check_in_at), (s.check_out_at)) as v(ts)
      where s.source = 'biometric' and v.ts is not null
    ) x
    group by staff_id, ts;

  create temp table _canon on commit drop as
  with ordered as (
    select staff_id, user_id, ts,
      lag(ts) over (partition by staff_id order by ts) as prev_ts
    from _inst
  ),
  marked as (
    select staff_id, user_id, ts,
      case
        when prev_ts is null then 1
        when extract(epoch from (ts - prev_ts)) / 60 > _max_gap_min
             -- ...but an early-morning punch close behind the previous one is a
             -- trailing checkout of the same overnight shift, not a new shift.
             and not (
               extract(hour from (ts at time zone 'Asia/Kolkata')) < v_morning_end
               and extract(epoch from (ts - prev_ts)) / 60 <= v_late_merge
             )
        then 1
        else 0
      end as new_sess
    from ordered
  ),
  grouped as (
    select staff_id, user_id, ts,
      sum(new_sess) over (partition by staff_id order by ts) as grp
    from marked
  ),
  sess as (
    select staff_id, grp, max(user_id::text)::uuid as user_id,
      min(ts) as new_in, max(ts) as new_last
    from grouped
    group by staff_id, grp
  )
  select staff_id, grp, user_id, new_in, new_last,
    -- Attribute to the check-in's IST date; but a LONE early-morning punch is a
    -- trailing checkout with no check-in, so its shift began the previous day.
    case
      when new_last = new_in
           and extract(hour from (new_in at time zone 'Asia/Kolkata')) < v_morning_end
      then ((new_in at time zone 'Asia/Kolkata')::date - 1)
      else (new_in at time zone 'Asia/Kolkata')::date
    end as work_date
  from sess;

  delete from public.attendance_sessions where source = 'biometric';

  insert into public.attendance_sessions
    (staff_id, user_id, work_date, check_in_at, check_out_at, worked_minutes, status, source, check_in_photo_url)
  select staff_id, user_id, work_date, new_in,
    case when new_last > new_in then new_last else null end,
    case when new_last > new_in then greatest(0, round(extract(epoch from (new_last - new_in)) / 60))::int else null end,
    -- Only each staff's LATEST still-open session today may be 'active'
    -- (the one-open-per-user index forbids more than one).
    case when new_last > new_in then 'completed'
         when work_date < v_today then 'completed'
         when row_number() over (partition by staff_id order by new_in desc) = 1 then 'active'
         else 'completed' end,
    'biometric', 'biometric'
  from _canon;

  select count(*) into v_after from public.attendance_sessions where source = 'biometric';
  return jsonb_build_object('before', v_before, 'after', v_after, 'removed', v_before - v_after,
    'max_gap_min', _max_gap_min, 'morning_end_hour', v_morning_end, 'late_merge_min', v_late_merge, 'today', v_today);
end;
$$;

revoke all on function public.rebuild_sessions_by_gap(int) from public, anon, authenticated;
grant execute on function public.rebuild_sessions_by_gap(int) to service_role;

-- Rebuild all historical sessions right now with the corrected rule.
select public.rebuild_sessions_by_gap(720);

-- Diagnostic: per-staff shift pattern from biometric history (IST). Used to
-- recommend shift timings. Median check-in/out hour, spread, cross-midnight rate,
-- single-punch rate. service_role-only (invoked by the connector).
create or replace function public.shift_pattern_analysis()
returns table(
  employee_id text, full_name text, department text,
  sessions int,
  median_in_hour numeric, p25_in_hour numeric, p75_in_hour numeric,
  median_out_hour numeric,
  cross_midnight_pct numeric, single_punch_pct numeric,
  avg_worked_min numeric
)
language sql
stable
security definer
set search_path = public
set statement_timeout = '120s'
as $$
  with s as (
    select a.staff_id, st.employee_id, st.full_name, st.department,
      extract(epoch from ((a.check_in_at at time zone 'Asia/Kolkata')::time)) / 3600.0 as in_h,
      case when a.check_out_at is not null
           then extract(epoch from ((a.check_out_at at time zone 'Asia/Kolkata')::time)) / 3600.0 end as out_h,
      case when a.check_out_at is not null
            and (a.check_out_at at time zone 'Asia/Kolkata')::date > (a.check_in_at at time zone 'Asia/Kolkata')::date
           then 1 else 0 end as xmid,
      case when a.check_out_at is null or a.worked_minutes is null or a.worked_minutes < 5 then 1 else 0 end as single,
      a.worked_minutes
    from public.attendance_sessions a
    join public.staff st on st.id = a.staff_id
    where a.source = 'biometric'
  )
  select employee_id, full_name, department,
    count(*)::int,
    round(percentile_cont(0.5) within group (order by in_h)::numeric, 2),
    round(percentile_cont(0.25) within group (order by in_h)::numeric, 2),
    round(percentile_cont(0.75) within group (order by in_h)::numeric, 2),
    round(percentile_cont(0.5) within group (order by out_h) filter (where out_h is not null)::numeric, 2),
    round(100.0 * sum(xmid) / nullif(count(*), 0), 1),
    round(100.0 * sum(single) / nullif(count(*), 0), 1),
    round(avg(worked_minutes) filter (where single = 0)::numeric, 0)
  from s
  group by employee_id, full_name, department
  order by employee_id;
$$;

revoke all on function public.shift_pattern_analysis() from public, anon, authenticated;
grant execute on function public.shift_pattern_analysis() to service_role;

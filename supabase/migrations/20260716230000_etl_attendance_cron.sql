-- ============================================================================
-- Schedule the eTimeTrackLite attendance sync every 15 minutes (pg_cron).
--
-- pg_cron POSTs to the pull-etimetracklite edge function, which pulls the last
-- few days of biometric punches and rebuilds attendance_sessions (idempotent
-- upsert on staff_id + check_in_at). The connector is guarded by x-cron-secret;
-- that secret is read from Vault at RUNTIME so it never lands in git.
--
-- One-time out-of-band step (NOT committed): load the secret with
--   select public.set_etl_cron_secret('<CRON_SECRET>');   -- service_role only
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net    with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- Service-role-only setter: lets the x-cron-secret be (re)loaded into Vault
-- without ever committing the plaintext to a migration.
create or replace function public.set_etl_cron_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
begin
  delete from vault.secrets where name = 'etl_cron_secret';
  perform vault.create_secret(p_secret, 'etl_cron_secret', 'x-cron-secret for the pull-etimetracklite connector');
end;
$$;

revoke all on function public.set_etl_cron_secret(text) from public;
grant execute on function public.set_etl_cron_secret(text) to service_role;

-- Read-only status helper (schedule + last run) for verification and UI.
create or replace function public.etl_cron_status()
returns table(jobname text, schedule text, active boolean, last_status text, last_start timestamptz, last_end timestamptz, last_message text)
language sql
security definer
set search_path = public, cron, extensions
as $$
  select j.jobname, j.schedule, j.active,
         d.status, d.start_time, d.end_time, d.return_message
  from cron.job j
  left join lateral (
    select status, start_time, end_time, return_message
    from cron.job_run_details r
    where r.jobid = j.jobid
    order by r.start_time desc
    limit 1
  ) d on true
  where j.jobname = 'etl-attendance-sync';
$$;

revoke all on function public.etl_cron_status() from public;
grant execute on function public.etl_cron_status() to service_role;

-- (Re)schedule idempotently: drop any prior job of this name, then create it.
select cron.unschedule('etl-attendance-sync')
where exists (select 1 from cron.job where jobname = 'etl-attendance-sync');

select cron.schedule('etl-attendance-sync', '*/15 * * * *', $job$
  select net.http_post(
    url     := 'https://lwjcunzlxwziokhfmyds.supabase.co/functions/v1/pull-etimetracklite',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'etl_cron_secret')
    ),
    body    := jsonb_build_object('backfill', true, 'days', 3),
    timeout_milliseconds := 30000
  );
$job$);

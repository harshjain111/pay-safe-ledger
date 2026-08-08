-- ============================================================================
-- Make set_etl_cron_secret idempotent.
--
-- The connector now self-heals the scheduled sync: on any user-initiated pull
-- (login / refresh / Hard resync) it calls set_etl_cron_secret with its own env
-- secret so the 15-min pg_cron job keeps authenticating even after a DB reset
-- wipes vault.secrets. That means this runs frequently — so skip the
-- delete+recreate (and the row-churn / concurrent-write race it causes) whenever
-- the stored secret already matches. Only rewrite when it's actually missing or
-- different.
-- ============================================================================

create or replace function public.set_etl_cron_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
begin
  -- Already current → nothing to do (cheap SELECT, no write, no race).
  if exists (
    select 1 from vault.decrypted_secrets
    where name = 'etl_cron_secret' and decrypted_secret = p_secret
  ) then
    return;
  end if;

  delete from vault.secrets where name = 'etl_cron_secret';
  perform vault.create_secret(p_secret, 'etl_cron_secret', 'x-cron-secret for the pull-etimetracklite connector');
end;
$$;

revoke all on function public.set_etl_cron_secret(text) from public, anon;
grant execute on function public.set_etl_cron_secret(text) to service_role;

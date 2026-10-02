-- 005: the database wakes the worker. Vercel's free cron runs once a day, which
-- is useless for retries with 20 s–10 min backoff. pg_cron ticks every minute and
-- pg_net makes the HTTP call, but only when a runnable job exists, so an idle
-- system makes zero requests. The URL is set after deploy:
--   node scripts/schedule-worker.mjs https://<your-app>.vercel.app
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function kick_worker(app_url text) returns void
language plpgsql security definer as $$
begin
  if exists (select 1 from jobs where status = 'queued' and run_after <= now())
     or exists (select 1 from jobs where status = 'running' and locked_at < now() - interval '6 minutes') then
    perform net.http_post(
      url := app_url || '/api/jobs/run',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  end if;
end $$;

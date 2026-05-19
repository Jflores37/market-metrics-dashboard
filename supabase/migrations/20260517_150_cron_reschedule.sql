-- Reschedule crons to user-specified ET windows. Times are fixed-UTC for
-- current EDT (UTC-4); per the DST decision the 18:00 ET FRED run is the
-- authoritative daily catch so morning DST drift never loses data.

-- FRED: was 06:00/22:00 UTC daily. Now 3 weekday runs aligned to releases:
-- 08:35 ET (12:35 UTC, 8:30 prints), 10:05 ET (14:05 UTC, 10:00 prints),
-- 18:00 ET (22:00 UTC, revisions/safety net). Weekday-only: no econ
-- releases on weekends, so the old 2 AM / weekend pulls fetched nothing.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'fetch-fred-twice-daily') then
    perform cron.unschedule('fetch-fred-twice-daily');
  end if;
end $$;

select cron.schedule('fetch-fred-0835', '35 12 * * 1-5', $cmd$
  select net.http_post(
    url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-fred',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$cmd$);
select cron.schedule('fetch-fred-1005', '5 14 * * 1-5', $cmd$
  select net.http_post(
    url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-fred',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$cmd$);
select cron.schedule('fetch-fred-1800', '0 22 * * 1-5', $cmd$
  select net.http_post(
    url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-fred',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$cmd$);

-- CNBC pre-market: was 09:30 ET only. Now 08:45 / 09:15 / 09:30 ET
-- (12:45 / 13:15 / 13:30 UTC), weekday.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'fetch-cnbc-premarket-daily') then
    perform cron.unschedule('fetch-cnbc-premarket-daily');
  end if;
end $$;

select cron.schedule('fetch-cnbc-premarket-0845', '45 12 * * 1-5', $cmd$
  select net.http_post(
    url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-cnbc-premarket',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cmd$);
select cron.schedule('fetch-cnbc-premarket-0915', '15 13 * * 1-5', $cmd$
  select net.http_post(
    url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-cnbc-premarket',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cmd$);
select cron.schedule('fetch-cnbc-premarket-0930', '30 13 * * 1-5', $cmd$
  select net.http_post(
    url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-cnbc-premarket',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$cmd$);

-- Should-I-Trade intraday: start an hour earlier (09:15 ET / 13:15 UTC)
-- through 17:15 ET; :15 past the hour. Schedule-only change.
-- FinViz scanners: move the 4 groups out of the intraday+breadth FinViz
-- contention window to 18:35/18:42/18:49/18:56 ET (22:35/42/49/56 UTC),
-- 7-min stagger, after breadth (~22:20) and before the 23:30 watchdog.
do $$
begin
  perform cron.alter_job((select jobid from cron.job where jobname = 'compute-should-i-trade-intraday'), schedule := '15 13-21 * * 1-5');
  perform cron.alter_job((select jobid from cron.job where jobname = 'finviz-scanners-trend'),   schedule := '35 22 * * 1-5');
  perform cron.alter_job((select jobid from cron.job where jobname = 'finviz-scanners-perf'),    schedule := '42 22 * * 1-5');
  perform cron.alter_job((select jobid from cron.job where jobname = 'finviz-scanners-perf2'),   schedule := '49 22 * * 1-5');
  perform cron.alter_job((select jobid from cron.job where jobname = 'finviz-scanners-special'), schedule := '56 22 * * 1-5');
end $$;

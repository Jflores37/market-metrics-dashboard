-- Daily auto-refresh of the FinViz scanners via pg_cron + pg_net.
-- Weekdays, staggered ~3 min apart starting 21:45 UTC (after US market
-- close + settle). Each job POSTs one group to the fetch-finviz-scanners
-- edge function. The Authorization bearer is the project's public anon
-- key (read-only; safe to embed — the function itself uses the service
-- role internally).
--
-- Requires extensions pg_cron and pg_net (both preinstalled on Supabase).

SELECT cron.unschedule(jobname) FROM cron.job
 WHERE jobname IN ('finviz-scanners-trend','finviz-scanners-perf','finviz-scanners-perf2','finviz-scanners-special');

SELECT cron.schedule(
  'finviz-scanners-trend', '45 21 * * 1-5',
  $$SELECT net.http_post(
      url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-finviz-scanners?group=trend',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.anon_key', true)),
      body := '{}'::jsonb, timeout_milliseconds := 150000);$$
);
SELECT cron.schedule(
  'finviz-scanners-perf', '48 21 * * 1-5',
  $$SELECT net.http_post(
      url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-finviz-scanners?group=perf',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.anon_key', true)),
      body := '{}'::jsonb, timeout_milliseconds := 150000);$$
);
SELECT cron.schedule(
  'finviz-scanners-perf2', '51 21 * * 1-5',
  $$SELECT net.http_post(
      url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-finviz-scanners?group=perf2',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.anon_key', true)),
      body := '{}'::jsonb, timeout_milliseconds := 150000);$$
);
SELECT cron.schedule(
  'finviz-scanners-special', '54 21 * * 1-5',
  $$SELECT net.http_post(
      url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-finviz-scanners?group=special',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.anon_key', true)),
      body := '{}'::jsonb, timeout_milliseconds := 150000);$$
);

-- NOTE: the live jobs deployed via MCP embed the literal anon key rather
-- than current_setting('app.anon_key'). If re-applying this migration to a
-- fresh project, either set the GUC:
--   ALTER DATABASE postgres SET app.anon_key = '<anon key>';
-- or replace the current_setting(...) calls with the literal bearer token.

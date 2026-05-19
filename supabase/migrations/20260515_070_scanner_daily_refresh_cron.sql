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
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ampyeGRzZWdha3NocHh6ZmhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTk4MDksImV4cCI6MjA5MjA5NTgwOX0.DOfK83qIZA69X4p7DBtTCB5XLpngZsBaH6PvUsj475U'),
      body := '{}'::jsonb, timeout_milliseconds := 150000);$$
);
SELECT cron.schedule(
  'finviz-scanners-perf', '48 21 * * 1-5',
  $$SELECT net.http_post(
      url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-finviz-scanners?group=perf',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ampyeGRzZWdha3NocHh6ZmhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTk4MDksImV4cCI6MjA5MjA5NTgwOX0.DOfK83qIZA69X4p7DBtTCB5XLpngZsBaH6PvUsj475U'),
      body := '{}'::jsonb, timeout_milliseconds := 150000);$$
);
SELECT cron.schedule(
  'finviz-scanners-perf2', '51 21 * * 1-5',
  $$SELECT net.http_post(
      url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-finviz-scanners?group=perf2',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ampyeGRzZWdha3NocHh6ZmhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTk4MDksImV4cCI6MjA5MjA5NTgwOX0.DOfK83qIZA69X4p7DBtTCB5XLpngZsBaH6PvUsj475U'),
      body := '{}'::jsonb, timeout_milliseconds := 150000);$$
);
SELECT cron.schedule(
  'finviz-scanners-special', '54 21 * * 1-5',
  $$SELECT net.http_post(
      url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-finviz-scanners?group=special',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3ampyeGRzZWdha3NocHh6ZmhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MTk4MDksImV4cCI6MjA5MjA5NTgwOX0.DOfK83qIZA69X4p7DBtTCB5XLpngZsBaH6PvUsj475U'),
      body := '{}'::jsonb, timeout_milliseconds := 150000);$$
);

-- NOTE: the bearer is the project's public anon key, embedded literally so
-- this migration matches the live cron jobs and re-applies cleanly to a
-- fresh project. It is the same read-only key shipped in the browser bundle
-- (safe to commit). If the anon key is ever rotated, update it here too.

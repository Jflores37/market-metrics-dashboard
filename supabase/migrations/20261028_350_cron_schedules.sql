-- 20261028_350_cron_schedules.sql
-- Findings: edge-b-04 (release-timed FRED/CNBC crons drift an hour at DST),
-- db-logic-13 + ops-security-live-9 (fetch-fred used pg_net's 5 s default
-- timeout), edge-b-06 + ops-security-live-10 (no StockBee catch-up),
-- pages-scan-intraday-sit-06 (intraday SIT cron re-stamped EOD inputs as today).
-- =============================================================================
-- Every HTTP cron job now calls public.invoke_edge(fn, query, timeout_ms)
-- (migration 340), which sends Bearer <Vault anon_key> + x-cron-secret
-- <Vault cron_secret>. No key appears in any cron command any more.
--
-- DST: pg_cron runs in UTC. ET-anchored jobs are scheduled at BOTH candidate
-- UTC hours with a guard on the ET hour, so exactly one of them fires in each
-- season. EOD jobs at 21:30-22:59 UTC are after the 4:00 PM ET close in both
-- seasons and stay single-UTC.
--   fetch-fred-0835  8:35 AM ET (after 8:30 AM CPI/NFP/PPI prints)
--   fetch-fred-1005  10:05 AM ET (after 10:00 AM releases)
--   cnbc premarket   8:45 / 9:15 / 9:30 AM ET
--   movers           every 10 min, ET hours 8 AM - 4:59 PM
--   catch-ups        7:30 / 7:32 / 7:45 AM ET (EDT) = 6:30 / 6:32 / 6:45 AM ET (EST), Tue-Sat
-- compute-should-i-trade-intraday is UNSCHEDULED: every input is EOD-only.
-- Watchdog jobs are scheduled in 450 and db-retention in 460, next to the
-- functions they call. Jobs are matched by jobname, never by jobid.
-- cron.schedule(name, ...) replaces an existing job of the same name.
-- =============================================================================

DO $$
DECLARE
  j record;
BEGIN
  -- Guard: invoke_edge must exist (340) or every job would fail.
  IF to_regprocedure('public.invoke_edge(text,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'public.invoke_edge is missing; apply 20261028_340 first';
  END IF;

  FOR j IN
    SELECT * FROM (VALUES
      ('fetch-finviz-sectors-eod',          '32 21 * * 1-5',     $c$select public.invoke_edge('fetch-finviz-sectors', null, 30000);$c$),
      ('fetch-stockbee-breadth-eod',        '0 22 * * 1-5',      $c$select public.invoke_edge('fetch-stockbee-breadth', null, 30000);$c$),
      ('fetch-stockbee-momentum50-eod',     '2 22 * * 1-5',      $c$select public.invoke_edge('fetch-stockbee-momentum50', null, 30000);$c$),
      ('fetch-stockbee-breadth-catchup',    '30 11 * * 2-6',     $c$select public.invoke_edge('fetch-stockbee-breadth', null, 30000);$c$),
      ('fetch-stockbee-momentum50-catchup', '32 11 * * 2-6',     $c$select public.invoke_edge('fetch-stockbee-momentum50', null, 30000);$c$),
      ('fetch-vix-yfinance-eod',            '4 22 * * 1-5',      $c$select public.invoke_edge('fetch-vix-yfinance', null, 30000);$c$),
      ('fetch-index-etf-quotes-eod',        '6 22 * * 1-5',      $c$select public.invoke_edge('fetch-index-etf-quotes', null, 30000);$c$),
      ('fetch-finviz-breadth-eod',          '15 22 * * 1-5',     $c$select public.invoke_edge('fetch-finviz-breadth', null, 120000);$c$),
      ('fetch-intraday-quotes-movers-10min','*/10 12-21 * * 1-5',$c$select public.invoke_edge('fetch-intraday-quotes-movers', null, 30000) where extract(hour from public.et_now()) between 8 and 16;$c$),
      ('compute-should-i-trade-eod',        '30 22 * * 1-5',     $c$select public.invoke_edge('compute-should-i-trade', null, 30000);$c$),
      ('compute-should-i-trade-catchup',    '45 11 * * 2-6',     $c$select public.invoke_edge('compute-should-i-trade', null, 30000);$c$),
      ('finviz-scanners-trend',             '35 22 * * 1-5',     $c$select public.invoke_edge('fetch-finviz-scanners', 'group=trend', 150000);$c$),
      ('finviz-scanners-perf',              '42 22 * * 1-5',     $c$select public.invoke_edge('fetch-finviz-scanners', 'group=perf', 150000);$c$),
      ('finviz-scanners-perf2',             '49 22 * * 1-5',     $c$select public.invoke_edge('fetch-finviz-scanners', 'group=perf2', 150000);$c$),
      ('finviz-scanners-special',           '56 22 * * 1-5',     $c$select public.invoke_edge('fetch-finviz-scanners', 'group=special', 150000);$c$),
      ('fetch-fred-0835',                   '35 12,13 * * 1-5',  $c$select public.invoke_edge('fetch-fred', null, 120000) where extract(hour from public.et_now()) = 8;$c$),
      ('fetch-fred-1005',                   '5 14,15 * * 1-5',   $c$select public.invoke_edge('fetch-fred', null, 120000) where extract(hour from public.et_now()) = 10;$c$),
      ('fetch-fred-1800',                   '0 22 * * 1-5',      $c$select public.invoke_edge('fetch-fred', null, 120000);$c$),
      ('fetch-cnbc-premarket-0845',         '45 12,13 * * 1-5',  $c$select public.invoke_edge('fetch-cnbc-premarket', null, 30000) where extract(hour from public.et_now()) = 8;$c$),
      ('fetch-cnbc-premarket-0915',         '15 13,14 * * 1-5',  $c$select public.invoke_edge('fetch-cnbc-premarket', null, 30000) where extract(hour from public.et_now()) = 9;$c$),
      ('fetch-cnbc-premarket-0930',         '30 13,14 * * 1-5',  $c$select public.invoke_edge('fetch-cnbc-premarket', null, 30000) where extract(hour from public.et_now()) = 9;$c$)
    ) AS t(jobname, sched, cmd)
  LOOP
    PERFORM cron.schedule(j.jobname, j.sched, j.cmd);
  END LOOP;

  -- Every input is EOD-only, so the hourly recompute only re-stamped old data as today.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compute-should-i-trade-intraday') THEN
    PERFORM cron.unschedule('compute-should-i-trade-intraday');
  END IF;
END $$;

-- Rollback:
--   Re-create the previous commands (they embedded the anon key, so restore them
--   from cron history / migration 220 technique rather than from this file), or
--   point the jobs back at plain net.http_post without x-cron-secret, e.g.:
--     select cron.schedule('fetch-fred-0835', '35 12 * * 1-5', $c$select net.http_post(
--       url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-fred',
--       headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);$c$);
--   Previous UTC schedules: movers '*/10 13-21 * * 1-5', fred-0835 '35 12', fred-1005 '5 14',
--   cnbc '45 12' / '15 13' / '30 13', breadth timeout 90000, SIT intraday '15 13-21 * * 1-5'.
--   Remove the new jobs:
--     select cron.unschedule(n) from unnest(array['fetch-stockbee-breadth-catchup',
--       'fetch-stockbee-momentum50-catchup','compute-should-i-trade-catchup']) n
--     where exists (select 1 from cron.job where jobname = n);

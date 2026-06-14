-- 20260613_220_fix_compute_should_i_trade_cron_auth.sql
-- =============================================================================
-- The compute-should-i-trade cron jobs (eod + intraday) POSTed to the edge
-- function with only a Content-Type header and NO Authorization. That function
-- has verify_jwt enabled, so every cron invocation was rejected with HTTP 401
-- (confirmed: 36x 401 in net._http_response at the cron times). pg_cron/pg_net
-- reports the job "succeeded" the instant the request is queued, so the failure
-- was silent and the engine stopped writing rows after 2026-06-04 while
-- should_i_trade_latest_v kept serving that frozen verdict as if current.
--
-- Fix: re-point both jobs to send the same Bearer token the working
-- finviz-scanners jobs already use. Self-contained + idempotent: reads the
-- token from an existing scanner job at apply time (no key hardcoded here),
-- and is a no-op on a DB where the token already matches.
-- =============================================================================
DO $$
DECLARE
  tok    text;
  newcmd text;
  rec    record;
BEGIN
  SELECT substring(command from 'Bearer ([A-Za-z0-9._-]+)')
    INTO tok
  FROM cron.job
  WHERE command ILIKE '%functions/v1/fetch-finviz-scanners%'
    AND command ILIKE '%Authorization%'
  LIMIT 1;

  IF tok IS NULL OR length(tok) < 100 THEN
    RAISE NOTICE 'No reference Bearer token found on a finviz-scanners job; skipping cron auth fix.';
    RETURN;
  END IF;

  newcmd := format($c$
  select net.http_post(
    url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/compute-should-i-trade',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$c$, tok);

  FOR rec IN
    SELECT jobid FROM cron.job
    WHERE jobname IN ('compute-should-i-trade-eod','compute-should-i-trade-intraday')
  LOOP
    PERFORM cron.alter_job(job_id := rec.jobid, command := newcmd);
  END LOOP;
END $$;

-- 20260614_270_fix_intraday_cron_auth.sql
-- =============================================================================
-- Same silent failure as the compute-should-i-trade cron (see 220): the
-- fetch-intraday-quotes-movers cron POSTed with no Authorization header, but the
-- function has verify_jwt enabled, so every call was rejected 401 and the
-- intraday quotes/movers feed froze at 2026-06-03 while the dashboard kept
-- showing it. Re-point the job to send the same Bearer token the working
-- finviz-scanners jobs use. Self-contained + idempotent.
-- =============================================================================
DO $$
DECLARE
  tok    text;
  newcmd text;
  jid    bigint;
BEGIN
  SELECT substring(command from 'Bearer ([A-Za-z0-9._-]+)')
    INTO tok
  FROM cron.job
  WHERE command ILIKE '%functions/v1/fetch-finviz-scanners%'
    AND command ILIKE '%Authorization%'
  LIMIT 1;

  IF tok IS NULL OR length(tok) < 100 THEN
    RAISE NOTICE 'No reference Bearer token found; skipping intraday cron auth fix.';
    RETURN;
  END IF;

  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'fetch-intraday-quotes-movers-10min';
  IF jid IS NULL THEN
    RAISE NOTICE 'fetch-intraday-quotes-movers-10min job not found; skipping.';
    RETURN;
  END IF;

  newcmd := format($c$
  select net.http_post(
    url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-intraday-quotes-movers',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$c$, tok);

  PERFORM cron.alter_job(job_id := jid, command := newcmd);
END $$;

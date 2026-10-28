-- 20261028_450_watchdog.sql
-- Findings: db-logic-04 + ops-security-live-5 (watchdog alerts went nowhere:
-- webhook unset and only read from app_config), ops-security-live-6 (blind
-- spots: intraday, CNBC, FRED, earnings, per-scanner failures, stuck 'running'
-- rows, 2-day detection lag, fixed-UTC timing). Requires 330, 340, 360, 410, 440.
-- =============================================================================
-- check_pipeline_health()   7:30 PM ET on trading days (DST-safe cron below)
--   (a) critical stale rows in data_freshness_v                    severity error
--   (b) latest run per job in the last 30 h: 'error' -> error, 'partial' -> warn
--       (every job name: fetch-fred, fetch-cnbc-premarket, momentum50 included)
--   (c) reaps job_runs 'running' > 15 min -> 'error', error='reaped: stuck running'
--   (d) scanner_runs with status 'error' on the global scanner date
--   (e) Should-I-Trade built on inputs older than last_eod_date()
--   (f) expected nightly jobs with NO job_runs row today ET (catches cron calls
--       rejected before the function starts, e.g. a 401)            severity warn
-- check_intraday_health()   every 15 min, active 9:45 AM - 4:00 PM ET on trading days
--   movers (gainer/loser/in_play) or the SPY quote older than 25 min; at the
--   first run after 9:45 AM ET, no premarket batch fetched today ET.
-- Dedupe: an issue (kind, target) already recorded within 6 h (intraday: 2 h)
-- is not recorded or posted again.
-- Webhook: Vault 'alert_webhook_url' via get_secret(), falling back to
-- app_config.alert_webhook_url. Both are unreadable by anon. Setting it is a
-- user action:  select vault.create_secret('<discord webhook url>', 'alert_webhook_url');
-- Payload carries 'content' (Discord) and 'text' (Slack-style) with a short
-- summary; no secrets or error text from job_runs beyond 200 chars.
-- All functions here: EXECUTE revoked from PUBLIC/anon/authenticated.
-- =============================================================================

-- Records an issue unless the same (kind, target) was recorded within p_dedupe.
-- Returns true when a NEW row was written.
CREATE OR REPLACE FUNCTION public._record_health_issue(
  p_kind text, p_target text, p_severity text, p_detail text, p_dedupe interval)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pipeline_health
             WHERE kind = p_kind AND target = p_target AND checked_at > now() - p_dedupe) THEN
    RETURN false;
  END IF;
  INSERT INTO public.pipeline_health(kind, target, severity, detail)
  VALUES (p_kind, p_target, p_severity, left(p_detail, 500));
  RETURN true;
END;
$$;

-- Posts the rows recorded since p_since to the alert webhook (if configured).
CREATE OR REPLACE FUNCTION public._post_health_alert(p_source text, p_since timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_webhook text;
  v_lines   text;
  v_msg     text;
BEGIN
  v_webhook := public.get_secret('alert_webhook_url');
  IF v_webhook IS NULL OR v_webhook = '' THEN
    SELECT value INTO v_webhook FROM public.app_config WHERE key = 'alert_webhook_url';
  END IF;
  IF v_webhook IS NULL OR v_webhook = '' THEN
    RETURN;
  END IF;

  SELECT string_agg(format('- [%s] %s: %s', severity, target, detail), E'\n' ORDER BY id)
    INTO v_lines
  FROM public.pipeline_health
  WHERE checked_at >= p_since;
  IF v_lines IS NULL THEN
    RETURN;
  END IF;

  v_msg := left(format('Market Metrics %s (%s ET)%s%s', p_source,
                       to_char(public.et_now(), 'FMHH12:MI AM'), E'\n', v_lines), 1900);
  PERFORM net.http_post(
    url     := v_webhook,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := jsonb_build_object('content', v_msg, 'text', v_msg));
EXCEPTION WHEN others THEN
  RAISE LOG '_post_health_alert: webhook post failed: %', sqlerrm;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_pipeline_health()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_issues  int := 0;
  v_since   timestamptz := now();   -- rows inserted below carry checked_at = now()
  v_dedupe  interval := interval '6 hours';
  v_today0  timestamptz := (public.et_today()::timestamp AT TIME ZONE 'America/New_York');
  v_gdate   date;
  r record;
BEGIN
  -- (c) reap stuck 'running' rows first, so (b) sees them as errors
  UPDATE public.job_runs
     SET status = 'error',
         finished_at = coalesce(finished_at, now()),
         error = 'reaped: stuck running'
   WHERE status = 'running'
     AND started_at < now() - interval '15 minutes';

  -- (a) critical stale data
  FOR r IN
    SELECT dataset, label, latest_date, trading_days_behind
    FROM public.data_freshness_v
    WHERE is_critical AND is_stale
  LOOP
    IF public._record_health_issue('stale_data', r.dataset, 'error',
         format('%s stale: latest %s, %s trading day(s) behind',
                r.label, coalesce(r.latest_date::text, '(none)'), r.trading_days_behind), v_dedupe) THEN
      v_issues := v_issues + 1;
    END IF;
  END LOOP;

  -- (b) latest run per job: error / partial
  FOR r IN
    WITH last_run AS (
      SELECT DISTINCT ON (job_name) job_name, status, started_at, error
      FROM public.job_runs
      WHERE started_at > now() - interval '30 hours'
      ORDER BY job_name, started_at DESC
    )
    SELECT * FROM last_run WHERE status IN ('error', 'partial')
  LOOP
    IF public._record_health_issue(
         CASE r.status WHEN 'error' THEN 'job_failure' ELSE 'job_partial' END,
         r.job_name,
         CASE r.status WHEN 'error' THEN 'error' ELSE 'warn' END,
         format('last run %s ET was %s: %s',
                to_char(r.started_at AT TIME ZONE 'America/New_York', 'Mon DD FMHH12:MI AM'),
                r.status, left(coalesce(r.error, ''), 200)), v_dedupe) THEN
      v_issues := v_issues + 1;
    END IF;
  END LOOP;

  -- (d) scanners that failed on the latest scanner date
  SELECT max(snapshot_date) INTO v_gdate FROM public.scanner_runs;
  FOR r IN
    SELECT scanner_id FROM public.scanner_runs
    WHERE snapshot_date = v_gdate AND status = 'error'
  LOOP
    IF public._record_health_issue('scanner_failure', r.scanner_id, 'warn',
         format('scan failed on %s', v_gdate), v_dedupe) THEN
      v_issues := v_issues + 1;
    END IF;
  END LOOP;

  -- (e) Should-I-Trade verdict built on old inputs
  FOR r IN
    SELECT DISTINCT ON (mode) mode, snapshot_date, inputs_as_of
    FROM public.should_i_trade_history
    ORDER BY mode, snapshot_date DESC, computed_at DESC
  LOOP
    IF coalesce(r.inputs_as_of, r.snapshot_date) < public.last_eod_date() THEN
      IF public._record_health_issue('sit_inputs_stale', 'should_i_trade:' || r.mode, 'error',
           format('Should-I-Trade (%s) inputs as of %s, expected %s',
                  r.mode, coalesce(r.inputs_as_of, r.snapshot_date), public.last_eod_date()), v_dedupe) THEN
        v_issues := v_issues + 1;
      END IF;
    END IF;
  END LOOP;

  -- (f) nightly jobs that never started today (e.g. cron call rejected with 401)
  IF public.is_trading_day(public.et_today()) THEN
    FOR r IN
      SELECT j.job_name
      FROM unnest(ARRAY[
        'fetch-finviz-sectors', 'fetch-stockbee-breadth', 'fetch-stockbee-momentum50',
        'fetch-vix-yfinance', 'fetch-index-etf-quotes', 'fetch-finviz-breadth',
        'compute-should-i-trade', 'fetch-fred', 'fetch-cnbc-premarket',
        'fetch-intraday-quotes-movers',
        'fetch-finviz-scanners:trend', 'fetch-finviz-scanners:perf',
        'fetch-finviz-scanners:perf2', 'fetch-finviz-scanners:special']) AS j(job_name)
      WHERE NOT EXISTS (SELECT 1 FROM public.job_runs jr
                        WHERE jr.job_name = j.job_name AND jr.started_at >= v_today0)
    LOOP
      IF public._record_health_issue('job_missing', r.job_name, 'warn',
           'no run recorded today (cron call rejected or not scheduled?)', v_dedupe) THEN
        v_issues := v_issues + 1;
      END IF;
    END LOOP;
  END IF;

  IF v_issues > 0 THEN
    PERFORM public._post_health_alert('pipeline watchdog', v_since);
  END IF;
  RETURN v_issues;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_intraday_health()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_issues int := 0;
  v_since  timestamptz := now();
  v_dedupe interval := interval '2 hours';
  v_et     timestamp := public.et_now();
  v_last   timestamptz;
BEGIN
  IF NOT public.is_trading_day(v_et::date)
     OR v_et::time < time '09:45' OR v_et::time > time '16:00' THEN
    RETURN 0;
  END IF;

  SELECT max(fetched_at) INTO v_last FROM public.intraday_movers
  WHERE mover_type IN ('gainer', 'loser', 'in_play');
  IF v_last IS NULL OR v_last < now() - interval '25 minutes' THEN
    IF public._record_health_issue('intraday_stale', 'intraday_movers', 'error',
         format('movers last fetched %s ET',
                coalesce(to_char(v_last AT TIME ZONE 'America/New_York', 'Mon DD FMHH12:MI AM'), 'never')), v_dedupe) THEN
      v_issues := v_issues + 1;
    END IF;
  END IF;

  SELECT max(fetched_at) INTO v_last FROM public.intraday_quotes WHERE ticker = 'SPY';
  IF v_last IS NULL OR v_last < now() - interval '25 minutes' THEN
    IF public._record_health_issue('intraday_stale', 'intraday_quotes', 'error',
         format('SPY quote last fetched %s ET',
                coalesce(to_char(v_last AT TIME ZONE 'America/New_York', 'Mon DD FMHH12:MI AM'), 'never')), v_dedupe) THEN
      v_issues := v_issues + 1;
    END IF;
  END IF;

  -- First run after 9:45 AM ET: was there a premarket batch today?
  IF v_et::time < time '10:00' AND NOT EXISTS (
       SELECT 1 FROM public.intraday_movers
       WHERE mover_type = 'premarket_up'
         AND (fetched_at AT TIME ZONE 'America/New_York')::date = v_et::date) THEN
    IF public._record_health_issue('premarket_missing', 'intraday_movers:premarket', 'warn',
         'no premarket batch fetched today', v_dedupe) THEN
      v_issues := v_issues + 1;
    END IF;
  END IF;

  IF v_issues > 0 THEN
    PERFORM public._post_health_alert('intraday watchdog', v_since);
  END IF;
  RETURN v_issues;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._record_health_issue(text, text, text, text, interval) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._post_health_alert(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_pipeline_health() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_intraday_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_pipeline_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_intraday_health() TO service_role;

-- Cron (DST-safe). 23:30 UTC = 7:30 PM EDT, 00:30 UTC = 7:30 PM EST; the guard
-- keeps exactly one of them, and only on trading days (ET date).
SELECT cron.schedule('pipeline-health-watchdog', '30 23,0 * * *',
  $c$select public.check_pipeline_health() where public.is_trading_day(public.et_today()) and extract(hour from public.et_now()) = 19;$c$);
-- 13:00-21:45 UTC covers 9:45 AM - 4:00 PM ET in both seasons; the function gates itself.
SELECT cron.schedule('intraday-health-watchdog', '*/15 13-21 * * 1-5',
  $c$select public.check_intraday_health();$c$);

-- Rollback:
--   select cron.schedule('pipeline-health-watchdog', '30 23 * * 1-5', 'select public.check_pipeline_health();');
--   select cron.unschedule('intraday-health-watchdog');
--   Re-run the check_pipeline_health block from 20261028_320_live_schema_baseline.sql;
--   DROP FUNCTION IF EXISTS public.check_intraday_health(), public._post_health_alert(text, timestamptz),
--     public._record_health_issue(text, text, text, text, interval);

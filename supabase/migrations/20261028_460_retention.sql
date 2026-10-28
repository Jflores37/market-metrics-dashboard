-- 20261028_460_retention.sql
-- Findings: ops-security-live-3 (DB at ~392 MB of the 500 MB free-tier cap,
-- growing ~2.9 MB per trading day, with no retention job).
-- =============================================================================
-- public.run_retention(): nightly purge, logged to job_runs as 'db-retention'
-- with per-table deleted counts. Cutoffs are anchored to each table's OWN max
-- date (per scanner / per mover type / per ticker where a view reads "latest
-- per X"), never to today, so a dead feed can never empty a table and nothing
-- a view or the UI reads inside its lookback is deleted.
--
--   table               keep                         longest reader
--   equities_snapshot   60 d before its max date     equity_ma10_latest_v (21 d); others read latest date
--   scanner_results     30 d before EACH scanner's   scanner views read each scanner's current date
--                       own max date
--   scanner_runs        90 d before its max date     watchdog / summary read the latest date
--   job_runs            30 d (user decision)         pipeline_failures_v 36 h, watchdog 30 h
--   pipeline_health     90 d                         dedupe reads 6 h
--   intraday_movers     3 d before each mover_type's max   latest batch per type
--   intraday_quotes     3 d before each ticker's max       latest quote per ticker
--   cnbc_premarket_raw  14 d before its max fetched_at     view reads today ET
--   earnings_calendar   earnings_date < today ET - 30      views read prev session .. +7 d
--   cron.job_run_details 14 d                        diagnostics only
--   net._http_response  2 d                          diagnostics only
-- NEVER purged: sector_etf_snapshot (RRG), vix_history (SIT reads 252 rows),
-- index_etf_quotes, breadth_daily_history, stockbee_*, macro_observations,
-- should_i_trade_history, watchlists, market_holidays, industry_aggregates.
--
-- Rollout: run once by hand after applying (first purge is the big one), then
-- reclaim space for reuse (VACUUM can't run inside a function):
--   select public.run_retention();
--   VACUUM (ANALYZE) public.equities_snapshot, public.scanner_results, public.job_runs;
-- Cron 'db-retention' then runs daily at 09:15 UTC (4:15/5:15 AM ET).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id  bigint;
  v_t0      timestamptz := clock_timestamp();
  v_counts  jsonb := '{}'::jsonb;
  v_errors  jsonb := '{}'::jsonb;
  v_n       bigint;
  v_total   bigint := 0;
  v_batch   bigint;
  v_max     date;
  v_maxts   timestamptz;
BEGIN
  INSERT INTO public.job_runs(job_name, status) VALUES ('db-retention', 'running')
  RETURNING id INTO v_run_id;

  -- equities_snapshot: 60 days before its own max date, in batches
  BEGIN
    SELECT max(snapshot_date) INTO v_max FROM public.equities_snapshot;
    v_n := 0;
    IF v_max IS NOT NULL THEN
      LOOP
        DELETE FROM public.equities_snapshot
        WHERE ctid IN (SELECT ctid FROM public.equities_snapshot
                       WHERE snapshot_date < v_max - 60 LIMIT 50000);
        GET DIAGNOSTICS v_batch = ROW_COUNT;
        v_n := v_n + v_batch;
        EXIT WHEN v_batch = 0;
      END LOOP;
    END IF;
    v_counts := v_counts || jsonb_build_object('equities_snapshot', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('equities_snapshot', left(sqlerrm, 200));
  END;

  -- scanner_results: 30 days before each scanner's own max date
  BEGIN
    DELETE FROM public.scanner_results r
    USING (SELECT scanner_id, max(snapshot_date) AS d FROM public.scanner_results GROUP BY scanner_id) m
    WHERE r.scanner_id = m.scanner_id AND r.snapshot_date < m.d - 30;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('scanner_results', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('scanner_results', left(sqlerrm, 200));
  END;

  -- scanner_runs: 90 days before its max date
  BEGIN
    SELECT max(snapshot_date) INTO v_max FROM public.scanner_runs;
    DELETE FROM public.scanner_runs WHERE snapshot_date < v_max - 90;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('scanner_runs', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('scanner_runs', left(sqlerrm, 200));
  END;

  -- job_runs: 30 days (never this run's own row)
  BEGIN
    SELECT max(started_at) INTO v_maxts FROM public.job_runs;
    DELETE FROM public.job_runs WHERE started_at < v_maxts - interval '30 days' AND id <> v_run_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('job_runs', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('job_runs', left(sqlerrm, 200));
  END;

  -- pipeline_health: 90 days
  BEGIN
    SELECT max(checked_at) INTO v_maxts FROM public.pipeline_health;
    DELETE FROM public.pipeline_health WHERE checked_at < v_maxts - interval '90 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('pipeline_health', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('pipeline_health', left(sqlerrm, 200));
  END;

  -- intraday_movers: 3 days before each mover_type's latest batch
  BEGIN
    DELETE FROM public.intraday_movers r
    USING (SELECT mover_type, max(fetched_at) AS f FROM public.intraday_movers GROUP BY mover_type) m
    WHERE r.mover_type = m.mover_type AND r.fetched_at < m.f - interval '3 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('intraday_movers', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('intraday_movers', left(sqlerrm, 200));
  END;

  -- intraday_quotes: 3 days before each ticker's latest quote
  BEGIN
    DELETE FROM public.intraday_quotes r
    USING (SELECT ticker, max(fetched_at) AS f FROM public.intraday_quotes GROUP BY ticker) m
    WHERE r.ticker = m.ticker AND r.fetched_at < m.f - interval '3 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('intraday_quotes', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('intraday_quotes', left(sqlerrm, 200));
  END;

  -- cnbc_premarket_raw: 14 days before its latest fetch
  BEGIN
    SELECT max(fetched_at) INTO v_maxts FROM public.cnbc_premarket_raw;
    DELETE FROM public.cnbc_premarket_raw WHERE fetched_at < v_maxts - interval '14 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('cnbc_premarket_raw', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('cnbc_premarket_raw', left(sqlerrm, 200));
  END;

  -- earnings_calendar: reports more than 30 days in the past
  BEGIN
    DELETE FROM public.earnings_calendar WHERE earnings_date < public.et_today() - 30;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('earnings_calendar', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('earnings_calendar', left(sqlerrm, 200));
  END;

  -- cron.job_run_details: 14 days
  BEGIN
    DELETE FROM cron.job_run_details WHERE start_time < now() - interval '14 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('cron.job_run_details', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('cron.job_run_details', left(sqlerrm, 200));
  END;

  -- net._http_response: 2 days
  BEGIN
    DELETE FROM net._http_response WHERE created < now() - interval '2 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('net._http_response', v_n);
    v_total := v_total + v_n;
  EXCEPTION WHEN others THEN
    v_errors := v_errors || jsonb_build_object('net._http_response', left(sqlerrm, 200));
  END;

  UPDATE public.job_runs
     SET status      = CASE WHEN v_errors = '{}'::jsonb THEN 'ok' ELSE 'error' END,
         finished_at = clock_timestamp(),
         elapsed_ms  = (extract(epoch FROM clock_timestamp() - v_t0) * 1000)::int,
         summary     = jsonb_build_object('rows_written', 0, 'rows_deleted', v_total,
                                          'deleted', v_counts, 'failed_tables', v_errors),
         error       = CASE WHEN v_errors = '{}'::jsonb THEN NULL
                            ELSE 'retention failed for: ' || (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_errors) k) END
   WHERE id = v_run_id;

  RETURN jsonb_build_object('deleted', v_counts, 'failed_tables', v_errors);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_retention() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('db-retention', '15 9 * * *', $c$select public.run_retention();$c$);

-- Rollback:
--   select cron.unschedule('db-retention');
--   DROP FUNCTION IF EXISTS public.run_retention();
--   (Deleted rows are not recoverable except from a backup / PITR.)

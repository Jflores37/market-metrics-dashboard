-- 20261028_440_freshness_and_failures_coverage.sql
-- Findings: db-logic-03 (CNBC premarket never inserted a row yet every run was
-- 'ok', and nothing tracked the table), ops-security-live-6 (part: freshness
-- detected a failed EOD feed only after a 2nd failed day; pipeline_failures_v
-- whitelisted job names and missed CNBC / Momentum50 / FRED; 'running' rows
-- were never treated as stuck until 2 h). Requires 330 + 340 + 410.
-- =============================================================================
-- data_freshness_v (same columns):
--   expected_date = last_eod_date(): yesterday's EOD counts as fresh during the
--   session; after 7:00 PM ET on a trading day a missing today flips to stale
--   the same evening (the 7:30 PM ET watchdog then alerts).
--   tol: EOD feeds 0; StockBee breadth + Momentum50 1 (sheet lags); macro 5.
--   Should-I-Trade row uses max(coalesce(inputs_as_of, snapshot_date)).
--   New non-critical rows: earnings_calendar (ET date of last fetch) and
--   cnbc_premarket_raw (latest article_date).
-- pipeline_failures_v (columns job_name, status, started_at; no error text;
--   security_invoker stays OFF because 310 closed job_runs to anon):
--   ALL job names; latest run per job in the last 36 h whose status is
--   'error' or 'partial', or 'running' for more than 15 min.
-- =============================================================================

CREATE OR REPLACE VIEW public.data_freshness_v WITH (security_invoker = on) AS
 WITH expected AS (
         SELECT public.last_eod_date() AS ed
        ), ds AS (
         SELECT 'equities_snapshot'::text AS dataset,
            'Universe / breadth (FinViz)'::text AS label,
            ( SELECT max(equities_snapshot.snapshot_date) AS max
                   FROM equities_snapshot) AS latest_date,
            0 AS tol,
            true AS crit
        UNION ALL
         SELECT 'scanner_results'::text,
            'Super Scanners'::text,
            ( SELECT max(scanner_results.snapshot_date) AS max
                   FROM scanner_results) AS max,
            0,
            true
        UNION ALL
         SELECT 'sector_etf_snapshot'::text,
            'Sector SPDRs'::text,
            ( SELECT max(sector_etf_snapshot.snapshot_date) AS max
                   FROM sector_etf_snapshot) AS max,
            0,
            true
        UNION ALL
         SELECT 'breadth_daily_history'::text,
            'Breadth history'::text,
            ( SELECT max(breadth_daily_history.snapshot_date) AS max
                   FROM breadth_daily_history) AS max,
            0,
            true
        UNION ALL
         SELECT 'should_i_trade_history'::text,
            'Should-I-Trade'::text,
            ( SELECT max(COALESCE(should_i_trade_history.inputs_as_of, should_i_trade_history.snapshot_date)) AS max
                   FROM should_i_trade_history) AS max,
            0,
            true
        UNION ALL
         SELECT 'stockbee_breadth_raw'::text,
            'StockBee breadth'::text,
            ( SELECT max(stockbee_breadth_raw.observation_date) AS max
                   FROM stockbee_breadth_raw) AS max,
            1,
            true
        UNION ALL
         SELECT 'stockbee_momentum50'::text,
            'StockBee Momentum50'::text,
            ( SELECT max(stockbee_momentum50.observation_date) AS max
                   FROM stockbee_momentum50) AS max,
            1,
            false
        UNION ALL
         SELECT 'vix_history'::text,
            'VIX / VVIX'::text,
            ( SELECT max(vix_history.observation_date) AS max
                   FROM vix_history) AS max,
            0,
            true
        UNION ALL
         SELECT 'index_etf_quotes'::text,
            'SPY/QQQ trend'::text,
            ( SELECT max(index_etf_quotes.observation_date) AS max
                   FROM index_etf_quotes) AS max,
            0,
            true
        UNION ALL
         SELECT 'macro_observations'::text,
            'Macro (FRED)'::text,
            ( SELECT max(macro_observations.observation_date) AS max
                   FROM macro_observations) AS max,
            5,
            false
        UNION ALL
         SELECT 'earnings_calendar'::text,
            'Earnings calendar'::text,
            ( SELECT max((earnings_calendar.fetched_at AT TIME ZONE 'America/New_York'::text)::date) AS max
                   FROM earnings_calendar) AS max,
            0,
            false
        UNION ALL
         SELECT 'cnbc_premarket_raw'::text,
            'CNBC premarket movers'::text,
            ( SELECT max(cnbc_premarket_raw.article_date) AS max
                   FROM cnbc_premarket_raw) AS max,
            0,
            false
        )
 SELECT ds.dataset,
    ds.label,
    ds.latest_date,
    e.ed AS expected_date,
    public.trading_days_between(ds.latest_date, e.ed) AS trading_days_behind,
    ds.latest_date IS NULL OR public.trading_days_between(ds.latest_date, e.ed) > ds.tol AS is_stale,
    ds.crit AS is_critical
   FROM ds
     CROSS JOIN expected e;
GRANT SELECT ON public.data_freshness_v TO anon, authenticated;

CREATE OR REPLACE VIEW public.pipeline_failures_v WITH (security_invoker = off) AS
 WITH latest AS (
         SELECT DISTINCT ON (job_runs.job_name) job_runs.job_name,
            job_runs.status,
            job_runs.started_at,
            job_runs.finished_at
           FROM job_runs
          WHERE job_runs.started_at > (now() - '36:00:00'::interval)
          ORDER BY job_runs.job_name, job_runs.started_at DESC
        )
 SELECT job_name,
    status,
    started_at
   FROM latest
  WHERE status = ANY (ARRAY['error'::text, 'partial'::text])
     OR (status = 'running'::text AND started_at < (now() - '00:15:00'::interval));
GRANT SELECT ON public.pipeline_failures_v TO anon, authenticated;

-- Rollback:
--   Re-run the data_freshness_v and pipeline_failures_v blocks from
--   20261028_320_live_schema_baseline.sql (same columns; keep the WITH options,
--   pipeline_failures_v must stay security_invoker = off while job_runs is closed to anon).

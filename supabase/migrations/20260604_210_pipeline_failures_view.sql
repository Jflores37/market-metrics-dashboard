-- 20260604_210_pipeline_failures_view.sql
-- Loud-failure surface. data_freshness_v only catches *staleness* (the data date
-- falling behind), so a failed/stuck cron job stays invisible until the data
-- itself ages out (up to a full trading day). This view surfaces a CRITICAL job
-- that errored or is stuck RIGHT NOW -- scoped to the last 36h so ancient orphaned
-- 'running' rows don't cry wolf, and to critical feeds so a non-critical feed
-- (CNBC headlines, momentum50, FRED) can't perpetually red-alert the UI. The
-- FreshnessBanner reads it and shows a red alert immediately.
CREATE OR REPLACE VIEW pipeline_failures_v AS
WITH latest AS (
  SELECT DISTINCT ON (job_name) job_name, status, started_at, finished_at
  FROM job_runs
  WHERE started_at > now() - interval '36 hours'
  ORDER BY job_name, started_at DESC
)
SELECT job_name, status, started_at
FROM latest
WHERE (status = 'error' OR (status = 'running' AND started_at < now() - interval '2 hours'))
  AND (   job_name LIKE 'fetch-finviz-breadth%'
       OR job_name LIKE 'fetch-finviz-scanners%'
       OR job_name LIKE 'fetch-finviz-sectors%'
       OR job_name LIKE 'fetch-stockbee-breadth%'
       OR job_name LIKE 'fetch-vix-yfinance%'
       OR job_name LIKE 'fetch-index-etf-quotes%'
       OR job_name LIKE 'fetch-intraday-quotes-movers%'
       OR job_name LIKE 'compute-should-i-trade%');

GRANT SELECT ON pipeline_failures_v TO anon, authenticated;

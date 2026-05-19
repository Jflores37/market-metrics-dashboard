-- Reconcile FinViz cron jobs (applied live to the project on 2026-05-17).
--
-- Problem: `fetch-finviz-breadth` was failing on FinViz 429 for days, leaving
-- equities_snapshot (Key Metrics, Leading Industries, Thematics, Stage, S&P
-- Landscape, Watchlist, SIT $1B+ breadth) stale. Two causes addressed here:
--
--  1. Duplicate scanner crons: trend/perf/special each ran TWICE per evening
--     (a legacy `-eod` set at 21:34-21:40 AND the canonical
--     finviz-scanners-{trend,perf,perf2,special} set from migration 070 at
--     21:45-21:54), roughly doubling daily FinViz load. The legacy `-eod`
--     duplicates are removed; migration 070's set is canonical.
--
--  2. Collision: fetch-finviz-breadth-eod ran at 21:30, inside the FinViz
--     burst window. It is moved to an isolated 22:15 UTC slot (after the last
--     scanner at 21:54; stockbee-breadth at 22:00 hits a different host).
--
-- Paired with the fetch-finviz-breadth v7 deploy (adds 429 retry/backoff and
-- serializes the previously-concurrent index-membership pulls).
--
-- Idempotent: re-applying is a no-op once the duplicates are gone and the
-- schedule is already 22:15.

DO $$
BEGIN
  PERFORM cron.unschedule(jobname)
  FROM cron.job
  WHERE jobname IN (
    'fetch-finviz-scanners-trend-eod',
    'fetch-finviz-scanners-perf-eod',
    'fetch-finviz-scanners-special-eod'
  );

  PERFORM cron.alter_job(jobid, schedule := '15 22 * * 1-5')
  FROM cron.job
  WHERE jobname = 'fetch-finviz-breadth-eod';
END $$;

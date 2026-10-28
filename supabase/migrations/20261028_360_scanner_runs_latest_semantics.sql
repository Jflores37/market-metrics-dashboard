-- 20261028_360_scanner_runs_latest_semantics.sql
-- Findings: pages-scan-intraday-sit-03 (0-row scans keep showing last week's
-- tickers as current), db-logic-14 (scanner_summary_v.row_count counted all
-- history).
-- =============================================================================
-- public.scanner_runs records one row per scanner per run date, INCLUDING
-- validated 0-match runs (fetched = 0) and failed runs (status 'error').
-- fetch-finviz-scanners upserts it via the service role. No error text here;
-- error text lives only in job_runs (not anon-readable).
--
-- A scanner's CURRENT date = greatest(latest ok run date, latest results date).
-- The results fallback keeps today's behavior until the new edge function is
-- deployed. Per-scanner max() is computed with correlated index lookups over
-- scanner_catalog + scanner_runs ids (2 ms on live vs 1.5 s for a GROUP BY over
-- ~417k scanner_results rows, which was close to anon's 3 s timeout); every
-- scanner_id in scanner_results is in scanner_catalog and in the backfill. A 0-row ok run moves the current date to today, so the card shows
-- "No matches today" instead of an old list.
--
-- scanner_results_latest_v / scanner_latest_v: same columns, current-date rows.
-- scanner_summary_v: same columns (row_count = current-date rows only,
-- snapshot_date = current date) + appended global_snapshot_date, is_stale,
-- last_run_status, last_run_fetched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.scanner_runs (
  scanner_id    text NOT NULL,
  snapshot_date date NOT NULL,
  status        text NOT NULL CHECK (status IN ('ok', 'error')),
  fetched       integer,
  inserted      integer,
  finished_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scanner_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS idx_scanner_runs_date ON public.scanner_runs (snapshot_date DESC);

ALTER TABLE public.scanner_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read scanner runs" ON public.scanner_runs;
CREATE POLICY "public read scanner runs" ON public.scanner_runs
  FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.scanner_runs FROM anon, authenticated;
GRANT SELECT ON public.scanner_runs TO anon, authenticated;
GRANT ALL ON public.scanner_runs TO service_role;

-- Backfill from history (every stored date was an ok run).
INSERT INTO public.scanner_runs (scanner_id, snapshot_date, status, fetched, inserted, finished_at)
SELECT scanner_id, snapshot_date, 'ok', count(*)::int, count(*)::int, max(fetched_at)
FROM public.scanner_results
GROUP BY scanner_id, snapshot_date
ON CONFLICT (scanner_id, snapshot_date) DO NOTHING;

-- scanner_results_latest_v (columns unchanged)
CREATE OR REPLACE VIEW public.scanner_results_latest_v WITH (security_invoker = on) AS
 WITH cur AS (
         SELECT x.scanner_id,
            x.d AS snapshot_date
           FROM ( SELECT ids.scanner_id,
                    GREATEST(( SELECT max(sr.snapshot_date) AS max
                           FROM scanner_results sr
                          WHERE sr.scanner_id = ids.scanner_id), ( SELECT max(ru.snapshot_date) AS max
                           FROM scanner_runs ru
                          WHERE ru.scanner_id = ids.scanner_id AND ru.status = 'ok'::text)) AS d
                   FROM ( SELECT scanner_catalog.scanner_id
                           FROM scanner_catalog
                        UNION
                         SELECT scanner_runs.scanner_id
                           FROM scanner_runs) ids) x
        )
 SELECT s.scanner_id,
    c.label AS scanner_label,
    c.group_tab,
    c.display_order,
    c.source,
    c.default_sort_column,
    c.default_sort_direction,
    c.max_rows,
    c.finviz_url,
    s.snapshot_date,
    s.rank,
    s.ticker,
    s.company,
    s.sector,
    s.industry,
    s.price,
    s.market_cap_millions,
    s.volume,
    s.avg_volume,
    s.rel_volume,
    s.perf_day,
    s.perf_week,
    s.perf_month,
    s.perf_quarter,
    s.perf_half,
    s.perf_year,
    s.perf_ytd,
    s.rsi14,
    s.atr,
    s.atr_pct,
    s.stage_tag,
    s.dist_52w_high_pct,
    s.roe,
    s.net_margin,
    s.short_float_pct,
    s.extras,
    s.fetched_at
   FROM scanner_results s
     JOIN cur l ON l.scanner_id = s.scanner_id AND l.snapshot_date = s.snapshot_date
     LEFT JOIN scanner_catalog c ON c.scanner_id = s.scanner_id
  ORDER BY c.display_order, s.scanner_id, s.rank;
GRANT SELECT ON public.scanner_results_latest_v TO anon, authenticated;

-- scanner_latest_v (columns unchanged)
CREATE OR REPLACE VIEW public.scanner_latest_v WITH (security_invoker = on) AS
 WITH latest_dates AS (
         SELECT x.scanner_id,
            x.d
           FROM ( SELECT ids.scanner_id,
                    GREATEST(( SELECT max(sr.snapshot_date) AS max
                           FROM scanner_results sr
                          WHERE sr.scanner_id = ids.scanner_id), ( SELECT max(ru.snapshot_date) AS max
                           FROM scanner_runs ru
                          WHERE ru.scanner_id = ids.scanner_id AND ru.status = 'ok'::text)) AS d
                   FROM ( SELECT scanner_catalog.scanner_id
                           FROM scanner_catalog
                        UNION
                         SELECT scanner_runs.scanner_id
                           FROM scanner_runs) ids) x
        )
 SELECT s.scanner_id,
    s.ticker,
    s.snapshot_date,
    s.rank,
    s.company,
    s.sector,
    s.industry,
    s.price,
    s.market_cap_millions,
    s.volume,
    s.avg_volume,
    s.rel_volume,
    s.perf_day,
    s.perf_week,
    s.perf_month,
    s.perf_quarter,
    s.perf_year,
    s.rsi14,
    s.extras,
    s.fetched_at
   FROM scanner_results s
     JOIN latest_dates l ON l.scanner_id = s.scanner_id AND l.d = s.snapshot_date;
GRANT SELECT ON public.scanner_latest_v TO anon, authenticated;

-- scanner_summary_v (existing columns + 4 appended)
CREATE OR REPLACE VIEW public.scanner_summary_v WITH (security_invoker = on) AS
 WITH cur AS (
         SELECT x.scanner_id,
            x.d AS snapshot_date
           FROM ( SELECT ids.scanner_id,
                    GREATEST(( SELECT max(sr.snapshot_date) AS max
                           FROM scanner_results sr
                          WHERE sr.scanner_id = ids.scanner_id), ( SELECT max(ru.snapshot_date) AS max
                           FROM scanner_runs ru
                          WHERE ru.scanner_id = ids.scanner_id AND ru.status = 'ok'::text)) AS d
                   FROM ( SELECT scanner_catalog.scanner_id
                           FROM scanner_catalog
                        UNION
                         SELECT scanner_runs.scanner_id
                           FROM scanner_runs) ids) x
        ), latest AS (
         SELECT cur.scanner_id,
            cur.snapshot_date,
            ( SELECT max(s.fetched_at) AS max
                   FROM scanner_results s
                  WHERE s.scanner_id = cur.scanner_id AND s.snapshot_date = cur.snapshot_date) AS res_fetched_at,
            ( SELECT count(*) AS count
                   FROM scanner_results s
                  WHERE s.scanner_id = cur.scanner_id AND s.snapshot_date = cur.snapshot_date) AS row_count
           FROM cur
        ), g AS (
         SELECT max(latest.snapshot_date) AS global_snapshot_date
           FROM latest
        )
 SELECT c.scanner_id,
    c.label,
    c.description,
    c.group_tab,
    c.display_order,
    c.source,
    c.doc_url,
    c.default_sort_column,
    c.default_sort_direction,
    c.max_rows,
    c.finviz_url,
    l.snapshot_date,
    COALESCE(l.row_count, 0::bigint) AS row_count,
    COALESCE(l.res_fetched_at, cr.finished_at) AS fetched_at,
    g.global_snapshot_date,
    l.snapshot_date < g.global_snapshot_date AS is_stale,
    gr.status AS last_run_status,
    gr.fetched AS last_run_fetched
   FROM scanner_catalog c
     LEFT JOIN latest l ON l.scanner_id = c.scanner_id
     CROSS JOIN g
     LEFT JOIN scanner_runs cr ON cr.scanner_id = c.scanner_id AND cr.snapshot_date = l.snapshot_date
     LEFT JOIN scanner_runs gr ON gr.scanner_id = c.scanner_id AND gr.snapshot_date = g.global_snapshot_date
  ORDER BY c.display_order;
GRANT SELECT ON public.scanner_summary_v TO anon, authenticated;

-- Rollback:
--   Restore the three views from 20261028_320_live_schema_baseline.sql
--   (scanner_summary_v must be DROPPED and recreated there, since this file
--   appended columns:  DROP VIEW public.scanner_summary_v; then the 320 body + GRANT).
--   Then: DROP TABLE IF EXISTS public.scanner_runs;
--   (Only after the edge function that upserts scanner_runs is rolled back.)

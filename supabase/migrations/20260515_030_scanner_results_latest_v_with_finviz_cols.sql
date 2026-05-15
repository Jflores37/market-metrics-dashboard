-- Drop + recreate (CREATE OR REPLACE won't allow column-order changes).

DROP VIEW IF EXISTS public.scanner_results_latest_v;

CREATE VIEW public.scanner_results_latest_v AS
WITH latest AS (
  SELECT scanner_id, max(snapshot_date) AS snapshot_date
  FROM public.scanner_results
  GROUP BY scanner_id
)
SELECT
  s.scanner_id,
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
  s.extras,
  s.fetched_at
FROM public.scanner_results s
JOIN latest l
  ON l.scanner_id = s.scanner_id AND l.snapshot_date = s.snapshot_date
LEFT JOIN public.scanner_catalog c
  ON c.scanner_id = s.scanner_id
ORDER BY c.display_order, s.scanner_id, s.rank;

DROP VIEW IF EXISTS public.scanner_summary_v;

CREATE VIEW public.scanner_summary_v AS
WITH latest AS (
  SELECT
    scanner_id,
    max(snapshot_date) AS snapshot_date,
    max(fetched_at) AS fetched_at,
    count(*) AS row_count
  FROM public.scanner_results
  GROUP BY scanner_id
)
SELECT
  c.scanner_id,
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
  l.fetched_at
FROM public.scanner_catalog c
LEFT JOIN latest l ON l.scanner_id = c.scanner_id
ORDER BY c.display_order;

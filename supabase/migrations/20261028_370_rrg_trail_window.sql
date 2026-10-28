-- 20261028_370_rrg_trail_window.sql
-- Findings: pages-mm-macro-1 + db-logic-01 (PostgREST's 1000-row cap cut the
-- newest month off the RRG tails), db-logic-02 (correlated momentum subquery
-- made the RRG views O(n^2) and headed for anon's 3 s statement_timeout).
-- =============================================================================
-- rrg_sectors_trail_v keeps its columns. Changes:
--   * rs CTE limited to the last 60 calendar days of sector_etf_snapshot;
--   * momentum = rs_raw minus the rs_raw at the latest date <= d - 7 days,
--     via a RANGE window (no correlated subquery), so cost is linear;
--   * output limited to the last 35 calendar days (~25 sessions x 11 ETFs,
--     about 275 rows), far under the 1000-row cap.
-- rrg_sectors_v is unchanged and gets the speedup through the trail view.
-- =============================================================================

CREATE OR REPLACE VIEW public.rrg_sectors_trail_v WITH (security_invoker = on) AS
 WITH mx AS (
         SELECT max(sector_etf_snapshot.snapshot_date) AS d
           FROM sector_etf_snapshot
        ), vti AS (
         SELECT sector_etf_snapshot.snapshot_date,
            sector_etf_snapshot.perf_quarter AS vti_qtr
           FROM sector_etf_snapshot
          WHERE sector_etf_snapshot.ticker = 'VTI'::text
            AND sector_etf_snapshot.snapshot_date >= (( SELECT mx.d - 60 FROM mx))
        ), rs AS (
         SELECT s.ticker,
            s.sector_label,
            s.snapshot_date,
            s.perf_quarter - v.vti_qtr AS rs_raw
           FROM sector_etf_snapshot s
             JOIN vti v ON v.snapshot_date = s.snapshot_date
          WHERE s.ticker = ANY (ARRAY['XLK'::text, 'XLV'::text, 'XLC'::text, 'XLY'::text, 'XLU'::text, 'XLI'::text, 'XLE'::text, 'XLRE'::text, 'XLF'::text, 'XLB'::text, 'XLP'::text])
            AND s.snapshot_date >= (( SELECT mx.d - 60 FROM mx))
        ), mom AS (
         SELECT rs.ticker,
            rs.sector_label,
            rs.snapshot_date,
            rs.rs_raw,
            rs.rs_raw - last_value(rs.rs_raw) OVER (PARTITION BY rs.ticker ORDER BY rs.snapshot_date
                RANGE BETWEEN UNBOUNDED PRECEDING AND '7 days'::interval PRECEDING) AS mom_raw
           FROM rs
        )
 SELECT ticker,
    sector_label,
    snapshot_date,
    round(rs_raw, 2) AS rs_ratio_raw,
    round(mom_raw, 2) AS rs_momentum_raw,
    round(100::numeric + 0.5 * rs_raw, 2) AS rs_ratio,
    round(100::numeric + 2.0 * mom_raw, 2) AS rs_momentum
   FROM mom
  WHERE mom_raw IS NOT NULL
    AND snapshot_date >= (( SELECT mx.d - 35 FROM mx))
  ORDER BY ticker, snapshot_date;
GRANT SELECT ON public.rrg_sectors_trail_v TO anon, authenticated;

-- Rollback:
--   Re-run the rrg_sectors_trail_v block from 20261028_320_live_schema_baseline.sql
--   (same columns, so CREATE OR REPLACE works; keep WITH (security_invoker = on)).

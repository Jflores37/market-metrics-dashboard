-- 20260614_240_rrg_rebuild.sql
-- =============================================================================
-- The RRG was not a Relative Rotation Graph:
--   1. rs_ratio_raw used perf_year-vs-VTI while rs_momentum_raw used
--      perf_quarter-vs-VTI -> the Y axis was a different-horizon relative return,
--      NOT the rate-of-change of the X axis (canonical JdK RRG requires
--      RS-Momentum = momentum of RS-Ratio).
--   2. Both axes were z-scored cross-sectionally across the 11 sectors per day,
--      so "100" was the daily peer average (a moving target), not a fixed anchor.
--      A sector crossed 100 when *peers* moved, not when it moved.
--
-- Rebuild (data: ~23 daily Finviz perf snapshots, no raw price history):
--   RS (relative strength) = sector perf_quarter - VTI perf_quarter.
--   X = rs_ratio    = 100 + 0.5 * RS                 (100 = in line with VTI; stable anchor)
--   Y = rs_momentum = 100 + 2.0 * (RS - RS 5 sessions ago)   (true rate-of-change of RS-Ratio)
-- Scale factors (0.5, 2.0) chosen so the live cloud sits inside the chart's
-- fixed [90,115] box; the 5-session lag is a positional offset over a daily
-- (no-gap) trading series, which is the intended "~1 week" momentum window.
-- Quadrant is derived from the rounded displayed coords so the dot's side of the
-- 100/100 crosshair always matches its label.
-- =============================================================================
CREATE OR REPLACE VIEW public.rrg_sectors_trail_v AS
WITH vti AS (
  SELECT snapshot_date, perf_quarter AS vti_qtr
  FROM sector_etf_snapshot WHERE ticker = 'VTI'
),
rs AS (
  SELECT s.ticker, s.sector_label, s.snapshot_date,
         (s.perf_quarter - v.vti_qtr) AS rs_raw
  FROM sector_etf_snapshot s
  JOIN vti v ON v.snapshot_date = s.snapshot_date
  WHERE s.ticker = ANY (ARRAY['XLK','XLV','XLC','XLY','XLU','XLI','XLE','XLRE','XLF','XLB','XLP'])
),
mom AS (
  SELECT ticker, sector_label, snapshot_date, rs_raw,
         rs_raw - lag(rs_raw, 5) OVER (PARTITION BY ticker ORDER BY snapshot_date) AS mom_raw
  FROM rs
)
SELECT ticker, sector_label, snapshot_date,
       round(rs_raw, 2)  AS rs_ratio_raw,
       round(mom_raw, 2) AS rs_momentum_raw,
       round(100 + 0.5 * rs_raw, 2)  AS rs_ratio,
       round(100 + 2.0 * mom_raw, 2) AS rs_momentum
FROM mom
WHERE mom_raw IS NOT NULL
ORDER BY ticker, snapshot_date;

CREATE OR REPLACE VIEW public.rrg_sectors_v AS
WITH t AS (
  SELECT * FROM rrg_sectors_trail_v
  WHERE snapshot_date = (SELECT max(snapshot_date) FROM rrg_sectors_trail_v)
)
SELECT ticker, sector_label, snapshot_date,
       rs_ratio_raw, rs_momentum_raw, rs_ratio, rs_momentum,
       CASE
         WHEN rs_ratio >= 100 AND rs_momentum >= 100 THEN 'leading'
         WHEN rs_ratio >= 100 AND rs_momentum <  100 THEN 'weakening'
         WHEN rs_ratio <  100 AND rs_momentum <  100 THEN 'lagging'
         ELSE 'improving'
       END AS quadrant
FROM t
ORDER BY ticker;

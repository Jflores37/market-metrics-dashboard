-- 20260614_290_audit_followups_db.sql
-- =============================================================================
-- Low-priority audit follow-ups (DB only).
--  #10 (macro-6): macro_series_meta labeled the PPIACO and PCEPILFE index levels
--      as 'Percent' and DGS10 as 'pct'. Correct to 'Index' / 'Percent'.
--  #11 (macro-5): macro_kpi_v daily prev_5d used a positional lag(5) over a
--      business-day series, so the "5-day" change silently stretched to 7-9
--      calendar days around holidays. Date-anchor to the latest obs <= 7 days
--      prior (surgical pg_get_viewdef edit, same approach as migration 200).
--  #12: rrg_sectors_trail_v momentum used positional lag(5); date-anchor it so a
--      missing trading day can't silently shift the ~1-week momentum window.
-- =============================================================================

-- #10
UPDATE macro_series_meta SET units = 'Percent' WHERE series_id = 'DGS10' AND units <> 'Percent';
UPDATE macro_series_meta SET units = 'Index'   WHERE series_id IN ('PPIACO','PCEPILFE') AND units <> 'Index';

-- #11
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.macro_kpi_v'::regclass, true) INTO v;
  v := replace(v,
    'lag(macro_observations.value, 5) OVER (PARTITION BY macro_observations.series_id ORDER BY macro_observations.observation_date) AS prev_5d',
    '( SELECT mo3.value FROM macro_observations mo3 WHERE mo3.series_id = macro_observations.series_id AND mo3.observation_date <= (macro_observations.observation_date - 7) ORDER BY mo3.observation_date DESC LIMIT 1) AS prev_5d');
  EXECUTE 'CREATE OR REPLACE VIEW public.macro_kpi_v AS ' || v;
END $$;

-- #12
CREATE OR REPLACE VIEW public.rrg_sectors_trail_v AS
WITH vti AS (
  SELECT snapshot_date, perf_quarter AS vti_qtr
  FROM sector_etf_snapshot WHERE ticker = 'VTI'
),
rs AS (
  SELECT s.ticker, s.sector_label, s.snapshot_date, (s.perf_quarter - v.vti_qtr) AS rs_raw
  FROM sector_etf_snapshot s
  JOIN vti v ON v.snapshot_date = s.snapshot_date
  WHERE s.ticker = ANY (ARRAY['XLK','XLV','XLC','XLY','XLU','XLI','XLE','XLRE','XLF','XLB','XLP'])
),
mom AS (
  SELECT r.ticker, r.sector_label, r.snapshot_date, r.rs_raw,
         r.rs_raw - (
           SELECT r2.rs_raw FROM rs r2
           WHERE r2.ticker = r.ticker AND r2.snapshot_date <= (r.snapshot_date - 7)
           ORDER BY r2.snapshot_date DESC LIMIT 1
         ) AS mom_raw
  FROM rs r
)
SELECT ticker, sector_label, snapshot_date,
       round(rs_raw, 2)  AS rs_ratio_raw,
       round(mom_raw, 2) AS rs_momentum_raw,
       round(100 + 0.5 * rs_raw, 2)  AS rs_ratio,
       round(100 + 2.0 * mom_raw, 2) AS rs_momentum
FROM mom
WHERE mom_raw IS NOT NULL
ORDER BY ticker, snapshot_date;

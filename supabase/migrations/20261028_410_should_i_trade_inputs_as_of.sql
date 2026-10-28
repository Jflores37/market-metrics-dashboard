-- 20261028_410_should_i_trade_inputs_as_of.sql
-- Findings: pages-scan-intraday-sit-06 (the SIT stale warning could never fire:
-- the hourly recompute stamped today's date on yesterday's EOD inputs).
-- Requires 330 (last_eod_date). The intraday cron is unscheduled in 350.
-- =============================================================================
-- should_i_trade_history appends inputs_as_of date (nullable): the OLDEST of the
-- critical input dates (vix, index_etf, breadth, sectors), written by
-- compute-should-i-trade (edge_a). Old rows stay NULL.
-- should_i_trade_latest_v (existing columns + inputs_as_of):
--   is_stale = coalesce(inputs_as_of, snapshot_date) < last_eod_date()
--   i.e. during the session yesterday's close is fresh; after 7:00 PM ET on a
--   trading day a verdict built on older inputs is stale. market_date unchanged.
-- =============================================================================

ALTER TABLE public.should_i_trade_history ADD COLUMN IF NOT EXISTS inputs_as_of date;

CREATE OR REPLACE VIEW public.should_i_trade_latest_v WITH (security_invoker = on) AS
 SELECT DISTINCT ON (mode) snapshot_date,
    mode,
    computed_at,
    decision,
    market_quality_score,
    execution_window_score,
    vol_score,
    vol_weight,
    vol_interpretation,
    trend_score,
    trend_weight,
    trend_interpretation,
    breadth_score,
    breadth_weight,
    breadth_interpretation,
    momentum_score,
    momentum_weight,
    momentum_interpretation,
    macro_score,
    macro_weight,
    macro_interpretation,
    exec_breakouts_status,
    exec_breakouts_detail,
    exec_leaders_status,
    exec_leaders_detail,
    exec_pullbacks_status,
    exec_pullbacks_detail,
    exec_followthrough_status,
    exec_followthrough_detail,
    narrative_text,
    suggested_action,
    raw_inputs,
    COALESCE(inputs_as_of, snapshot_date) < public.last_eod_date() AS is_stale,
    ( SELECT max(equities_snapshot.snapshot_date) AS max
           FROM equities_snapshot) AS market_date,
    inputs_as_of
   FROM should_i_trade_history
  ORDER BY mode, snapshot_date DESC, computed_at DESC;
GRANT SELECT ON public.should_i_trade_latest_v TO anon, authenticated;

-- Rollback:
--   DROP VIEW public.should_i_trade_latest_v;  (a column was appended)
--   then re-run its block from 20261028_320_live_schema_baseline.sql + GRANT SELECT ... TO anon, authenticated;
--   ALTER TABLE public.should_i_trade_history DROP COLUMN IF EXISTS inputs_as_of;
--   (only after compute-should-i-trade stops writing it)

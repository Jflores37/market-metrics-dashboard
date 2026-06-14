-- 20260614_260_staleness_guards.sql
-- =============================================================================
-- Defense-in-depth after the compute-should-i-trade cron silently died for 9
-- days (fixed in 220) and served a frozen verdict as if live, and the Intraday
-- page stamped 'updated {now}' over a stale batch. Expose real staleness so the
-- UI can flag old data instead of presenting it as current.
--
--  1. should_i_trade_latest_v gains is_stale (snapshot_date behind the latest
--     equities snapshot) + market_date (the trading day the rest of the
--     dashboard is on). Columns appended; existing columns unchanged.
--  2. intraday_freshness_v exposes the real age of the movers batch
--     (max fetched_at) -- intraday_dashboard_v.generated_at is just now() and
--     can't reveal a stale fetch.
-- =============================================================================
CREATE OR REPLACE VIEW public.should_i_trade_latest_v AS
SELECT DISTINCT ON (mode)
  snapshot_date, mode, computed_at, decision, market_quality_score, execution_window_score,
  vol_score, vol_weight, vol_interpretation,
  trend_score, trend_weight, trend_interpretation,
  breadth_score, breadth_weight, breadth_interpretation,
  momentum_score, momentum_weight, momentum_interpretation,
  macro_score, macro_weight, macro_interpretation,
  exec_breakouts_status, exec_breakouts_detail,
  exec_leaders_status, exec_leaders_detail,
  exec_pullbacks_status, exec_pullbacks_detail,
  exec_followthrough_status, exec_followthrough_detail,
  narrative_text, suggested_action, raw_inputs,
  (snapshot_date < (SELECT max(snapshot_date) FROM equities_snapshot)) AS is_stale,
  (SELECT max(snapshot_date) FROM equities_snapshot) AS market_date
FROM should_i_trade_history
ORDER BY mode, snapshot_date DESC, computed_at DESC;

CREATE OR REPLACE VIEW public.intraday_freshness_v AS
SELECT max(fetched_at) AS data_as_of,
       (max(fetched_at) < (now() - interval '30 minutes')) AS is_stale
FROM intraday_movers;

GRANT SELECT ON public.intraday_freshness_v TO anon, authenticated;

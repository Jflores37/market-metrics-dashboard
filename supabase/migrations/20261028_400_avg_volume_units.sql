-- 20261028_400_avg_volume_units.sql
-- Findings: edge-a-6, ops-security-live-7 (equities_snapshot.avg_volume is
-- stored in THOUSANDS, so views passing it through showed Avg Vol 1000x small).
-- =============================================================================
-- Storage stays in thousands: _phase5b_liquid_universe (avg_volume >= 100) and
-- stage_analysis_v (avg_volume >= 1) filter on that unit and are NOT changed.
-- Every public view whose OUTPUT column avg_volume comes from equities_snapshot
-- now outputs shares (x1000). Verified against live pg_get_viewdef:
--   earnings_this_week_v, earnings_yesterday_today_v   (done in 390)
--   watchlist_v, sp500_landscape_v, thematics_top_movers_v   (this file)
-- Not affected: scanner_results.avg_volume is already in shares (scanner views),
-- key_metrics_v / breadth_metrics_v / _phase5b_* don't output avg_volume to the UI
-- (_phase5b_liquid_universe is an internal helper, kept in thousands).
-- Only the avg_volume expression changes; columns, types and order are the same.
-- =============================================================================

CREATE OR REPLACE VIEW public.watchlist_v WITH (security_invoker = on) AS
 WITH eq AS (
         SELECT equities_snapshot.ticker,
            equities_snapshot.snapshot_date,
            equities_snapshot.index_str,
            equities_snapshot.in_sp500,
            equities_snapshot.in_nq100,
            equities_snapshot.in_djia,
            equities_snapshot.sector,
            equities_snapshot.industry,
            equities_snapshot.price,
            equities_snapshot.market_cap_millions,
            equities_snapshot.volume,
            equities_snapshot.avg_volume,
            equities_snapshot.perf_day,
            equities_snapshot.perf_week,
            equities_snapshot.perf_month,
            equities_snapshot.perf_quarter,
            equities_snapshot.perf_year,
            equities_snapshot.sma20_pct,
            equities_snapshot.sma50_pct,
            equities_snapshot.sma200_pct,
            equities_snapshot.high52w_pct,
            equities_snapshot.low52w_pct,
            equities_snapshot.fetched_at,
            equities_snapshot.in_rut,
            equities_snapshot.cap_1b_plus,
            equities_snapshot.perf_open,
            equities_snapshot.perf_half,
            equities_snapshot.perf_ytd,
            equities_snapshot.sma10_pct,
            equities_snapshot.ema10_pct,
            equities_snapshot.new_20day_high,
            equities_snapshot.new_20day_low,
            equities_snapshot.up_4pct,
            equities_snapshot.down_4pct,
            equities_snapshot.atr_value,
            equities_snapshot.atr_pct,
            equities_snapshot.rsi14,
            equities_snapshot.volatility_w,
            equities_snapshot.volatility_m
           FROM equities_snapshot
          WHERE equities_snapshot.snapshot_date = (( SELECT max(equities_snapshot_1.snapshot_date) AS max
                   FROM equities_snapshot equities_snapshot_1))
        )
 SELECT w.id,
    w.ticker,
    w."position",
    w.notes,
    w.added_at,
    e.snapshot_date,
    e.sector,
    e.industry,
    e.price,
    e.market_cap_millions,
    e.perf_day,
    e.perf_week,
    e.perf_month,
    e.perf_quarter,
    e.perf_year,
    e.perf_ytd,
    e.perf_open,
    e.perf_half,
    e.sma10_pct,
    e.sma20_pct,
    e.sma50_pct,
    e.sma200_pct,
    e.ema10_pct,
    e.rsi14,
    e.atr_pct,
    e.atr_value,
    e.volatility_w,
    e.volatility_m,
    e.high52w_pct,
    e.low52w_pct,
    e.volume,
    e.avg_volume * 1000 AS avg_volume,
    e.in_sp500,
    e.in_nq100,
    e.in_djia,
    e.in_rut,
    e.cap_1b_plus
   FROM watchlists w
     LEFT JOIN eq e ON e.ticker = w.ticker
  ORDER BY w."position", w.added_at;
GRANT SELECT ON public.watchlist_v TO anon, authenticated;

CREATE OR REPLACE VIEW public.sp500_landscape_v WITH (security_invoker = on) AS
 SELECT ticker,
    sector,
    industry,
    price,
    market_cap_millions,
    perf_day,
    perf_week,
    perf_month,
    perf_quarter,
    perf_year,
    perf_ytd,
    sma20_pct,
    sma50_pct,
    sma200_pct,
    high52w_pct,
    low52w_pct,
    rsi14,
    atr_pct,
    volume,
    avg_volume * 1000 AS avg_volume,
    snapshot_date
   FROM equities_snapshot
  WHERE snapshot_date = (( SELECT max(equities_snapshot_1.snapshot_date) AS max
           FROM equities_snapshot equities_snapshot_1)) AND in_sp500 AND market_cap_millions IS NOT NULL AND perf_day IS NOT NULL
  ORDER BY market_cap_millions DESC;
GRANT SELECT ON public.sp500_landscape_v TO anon, authenticated;

CREATE OR REPLACE VIEW public.thematics_top_movers_v WITH (security_invoker = off) AS
( SELECT 'gainer'::text AS mover_side,
    _phase5b_liquid_universe.ticker,
    _phase5b_liquid_universe.sector,
    _phase5b_liquid_universe.industry,
    _phase5b_liquid_universe.perf_day,
    _phase5b_liquid_universe.perf_week,
    _phase5b_liquid_universe.perf_month,
    _phase5b_liquid_universe.price,
    _phase5b_liquid_universe.avg_volume * 1000 AS avg_volume,
    _phase5b_liquid_universe.volume,
    _phase5b_liquid_universe.atr_pct,
    _phase5b_liquid_universe.rsi14,
    row_number() OVER (ORDER BY _phase5b_liquid_universe.perf_day DESC NULLS LAST) AS rank
   FROM _phase5b_liquid_universe
  WHERE _phase5b_liquid_universe.perf_day IS NOT NULL
  ORDER BY _phase5b_liquid_universe.perf_day DESC NULLS LAST
 LIMIT 12)
UNION ALL
( SELECT 'loser'::text AS mover_side,
    _phase5b_liquid_universe.ticker,
    _phase5b_liquid_universe.sector,
    _phase5b_liquid_universe.industry,
    _phase5b_liquid_universe.perf_day,
    _phase5b_liquid_universe.perf_week,
    _phase5b_liquid_universe.perf_month,
    _phase5b_liquid_universe.price,
    _phase5b_liquid_universe.avg_volume * 1000 AS avg_volume,
    _phase5b_liquid_universe.volume,
    _phase5b_liquid_universe.atr_pct,
    _phase5b_liquid_universe.rsi14,
    row_number() OVER (ORDER BY _phase5b_liquid_universe.perf_day) AS rank
   FROM _phase5b_liquid_universe
  WHERE _phase5b_liquid_universe.perf_day IS NOT NULL
  ORDER BY _phase5b_liquid_universe.perf_day
 LIMIT 12);
GRANT SELECT ON public.thematics_top_movers_v TO anon, authenticated;

-- Rollback:
--   Re-run the watchlist_v, sp500_landscape_v and thematics_top_movers_v blocks
--   from 20261028_320_live_schema_baseline.sql (same columns; keep the WITH options).

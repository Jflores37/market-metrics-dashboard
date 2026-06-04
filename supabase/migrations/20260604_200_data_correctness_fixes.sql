-- 20260604_200_data_correctness_fixes.sql
-- =============================================================================
-- Captures the data-correctness fixes applied during the 2026-06-03 audit.
-- These were first applied directly to the production DB via SQL; this migration
-- makes the repo the source of truth again.
--
-- Re-runnable: each surgical DO-block reads the *current* view definition and
-- applies a targeted edit, so on a FRESH database (original views) it applies the
-- fix, and on the ALREADY-FIXED production DB the target strings are gone and the
-- edits are no-ops -> CREATE OR REPLACE with the same body (idempotent).
-- =============================================================================

-- 1. Key Metrics: SMA-cross labels read "<" but the computation measures ">"
--    (sma20_pct < sma50_pct  <=>  SMA20 > SMA50). Relabel to match the bullish
--    condition actually being counted.
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.key_metrics_v'::regclass, true) INTO v;
  v := replace(v, '''SMA20<SMA50<SMA200''::text', '''SMA20>SMA50>SMA200''::text');
  v := replace(v, '''SMA50<SMA200''::text',        '''SMA50>SMA200''::text');
  v := replace(v, '''SMA20<SMA50''::text',         '''SMA20>SMA50''::text');
  EXECUTE 'CREATE OR REPLACE VIEW public.key_metrics_v AS ' || v;
END $$;

-- 2. macro_kpi_v: YoY used a positional lag(12) over a gapped monthly series
--    (missing 2025-10 shifted the base month, overstating CPI 3.95 vs true 3.78).
--    Switch to a date-anchored 1-year lookup. Also fix the NFP card so delta/trend
--    measure acceleration (this month's MoM change vs last) like every other KPI,
--    instead of the raw MoM value (was +115/up while jobs decelerated 185k->115k).
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.macro_kpi_v'::regclass, true) INTO v;
  v := replace(v,
    'lag(macro_observations.value, 12) OVER (PARTITION BY macro_observations.series_id ORDER BY macro_observations.observation_date)',
    '( SELECT mo2.value FROM macro_observations mo2 WHERE mo2.series_id = macro_observations.series_id AND mo2.observation_date = (macro_observations.observation_date - ''1 year''::interval))'
  );
  v := regexp_replace(v,
    'round\(payems_latest\.prev_mom_delta_k, 0\) AS round,\s+round\(payems_latest\.mom_delta_k, 0\) AS round,',
    'round(payems_latest.prev_mom_delta_k, 0) AS round, round(payems_latest.mom_delta_k - payems_latest.prev_mom_delta_k, 0) AS round,'
  );
  v := replace(v, 'WHEN payems_latest.mom_delta_k > 0::numeric THEN ''up''::text',
                  'WHEN payems_latest.mom_delta_k > payems_latest.prev_mom_delta_k THEN ''up''::text');
  v := replace(v, 'WHEN payems_latest.mom_delta_k < 0::numeric THEN ''down''::text',
                  'WHEN payems_latest.mom_delta_k < payems_latest.prev_mom_delta_k THEN ''down''::text');
  EXECUTE 'CREATE OR REPLACE VIEW public.macro_kpi_v AS ' || v;
END $$;

-- 3. leading_industries_v: industries are ranked by week_avg, but the top tickers
--    were ordered by perf_day (hid the actual weekly leaders). Use perf_week.
--    (perf_day appears only in the top4_tickers CTE.)
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.leading_industries_v'::regclass, true) INTO v;
  v := replace(v, 'perf_day', 'perf_week');
  EXECUTE 'CREATE OR REPLACE VIEW public.leading_industries_v AS ' || v;
END $$;

-- 4. breadth_metrics_v: 52-week high/low counts used loose/incorrect bands
--    (>= -1 for highs, 0..1 for lows). high52w_pct >= 0 = at/above the high;
--    low52w_pct <= 0 = at/below the low (the true new-high / new-low definition).
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.breadth_metrics_v'::regclass, true) INTO v;
  v := replace(v, 'high52w_pct >= ''-1''::integer::numeric', 'high52w_pct >= 0::numeric');
  v := replace(v, 'low52w_pct >= 0::numeric AND low52w_pct <= 1::numeric', 'low52w_pct <= 0::numeric');
  EXECUTE 'CREATE OR REPLACE VIEW public.breadth_metrics_v AS ' || v;
END $$;

-- 5. _phase5b_industry_ranks: single-stock "industries" qualified as leaders
--    (percentile rank of n=1 is meaningless). Require >= 3 stocks before ranking.
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public._phase5b_industry_ranks'::regclass, true) INTO v;
  v := replace(v, 'HAVING count(*) >= 1', 'HAVING count(*) >= 3');
  EXECUTE 'CREATE OR REPLACE VIEW public._phase5b_industry_ranks AS ' || v;
END $$;

-- 6. thematics_by_sector_v: equal-weighted avg was wrecked by extreme single-stock
--    outliers (one +6960% name dragged Tech's "avg" year to 139%). Use the median
--    (typical stock) for every horizon -- robust and outlier-proof.
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.thematics_by_sector_v'::regclass, true) INTO v;
  v := regexp_replace(v,
        'avg\(_phase5b_liquid_universe\.(perf_\w+)\)',
        '(percentile_cont(0.5) WITHIN GROUP (ORDER BY _phase5b_liquid_universe.\1))::numeric',
        'g');
  EXECUTE 'CREATE OR REPLACE VIEW public.thematics_by_sector_v AS ' || v;
END $$;

-- 7. NEW: equity_ma10_latest_v -- Finviz exports no 10-day SMA and no EMA, so
--    compute SMA10 + a 10-period exponentially-weighted MA (and "% above" each)
--    directly from the stored daily price history. Self-maintaining; needs >=10
--    clean days per ticker.
CREATE OR REPLACE VIEW equity_ma10_latest_v AS
WITH hist AS (
  SELECT ticker, snapshot_date, price,
         row_number() OVER (PARTITION BY ticker ORDER BY snapshot_date DESC) AS rn
  FROM equities_snapshot
  WHERE price IS NOT NULL
),
agg AS (
  SELECT ticker,
         max(price) FILTER (WHERE rn = 1)            AS price,
         avg(price) FILTER (WHERE rn <= 10)          AS sma10,
         sum(price * power(1 - 2.0/11.0, rn - 1)) FILTER (WHERE rn <= 10)
           / NULLIF(sum(power(1 - 2.0/11.0, rn - 1)) FILTER (WHERE rn <= 10), 0) AS ema10,
         count(*) FILTER (WHERE rn <= 10)            AS n10
  FROM hist
  GROUP BY ticker
)
SELECT ticker, price,
       round(sma10, 4)                                                  AS sma10,
       round(ema10::numeric, 4)                                         AS ema10,
       round(((price - sma10) / NULLIF(sma10, 0) * 100)::numeric, 2)    AS sma10_pct,
       round(((price - ema10) / NULLIF(ema10, 0) * 100)::numeric, 2)    AS ema10_pct
FROM agg
WHERE n10 >= 10;

-- 8. key_metrics_v: feed the real computed SMA10/EMA10 (% above) into the eq CTE
--    so "Price to SMA10" and "EMA10>SMA20" stop showing fake 0% (source columns
--    sma10_pct/ema10_pct in equities_snapshot are 100% NULL -- Finviz can't supply them).
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.key_metrics_v'::regclass, true) INTO v;
  v := regexp_replace(v,
    'FROM equities_snapshot\s+WHERE equities_snapshot\.snapshot_date',
    'FROM equities_snapshot LEFT JOIN equity_ma10_latest_v m10 ON m10.ticker = equities_snapshot.ticker WHERE equities_snapshot.snapshot_date');
  v := replace(v, 'equities_snapshot.sma10_pct,', 'm10.sma10_pct,');
  v := replace(v, 'equities_snapshot.ema10_pct,', 'm10.ema10_pct,');
  EXECUTE 'CREATE OR REPLACE VIEW public.key_metrics_v AS ' || v;
END $$;

-- 9. stage_analysis_v: the Weinstein substage classifier was fed the 100%-NULL
--    ema10_pct, which classify_stage coalesces to sma20_pct -> the EMA10 axis was
--    a literal duplicate of SMA20. Feed the real computed ema10_pct.
CREATE OR REPLACE VIEW stage_analysis_v AS
SELECT e.ticker, e.sector, e.industry, e.price, e.market_cap_millions,
       e.sma20_pct, e.sma50_pct, e.sma200_pct,
       m10.ema10_pct,
       classify_stage(e.sma20_pct, e.sma50_pct, m10.ema10_pct) AS stage,
       e.snapshot_date
FROM equities_snapshot e
LEFT JOIN equity_ma10_latest_v m10 ON m10.ticker = e.ticker
WHERE e.snapshot_date = (SELECT max(snapshot_date) FROM equities_snapshot)
  AND e.avg_volume >= 1 AND e.price >= 1::numeric AND e.sma50_pct IS NOT NULL;

-- 10. key_metrics_v: "New 20-Day Highs/Lows" can't be sourced (Finviz exports no
--     20-day high/low column, and we only keep ~14 days of closes). Re-point those
--     two rows at the real, populated 52-week data and relabel.
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.key_metrics_v'::regclass, true) INTO v;
  v := replace(v, 'count(*) FILTER (WHERE unioned.new_20day_high) AS nh20_above',
                  'count(*) FILTER (WHERE unioned.high52w_pct >= 0::numeric) AS nh20_above');
  v := replace(v, 'count(*) FILTER (WHERE unioned.new_20day_low) AS nl20_above',
                  'count(*) FILTER (WHERE unioned.low52w_pct <= 0::numeric) AS nl20_above');
  v := replace(v, '''New 20-Day Highs''::text', '''New 52-Week Highs''::text');
  v := replace(v, '''New 20-Day Lows''::text',  '''New 52-Week Lows''::text');
  EXECUTE 'CREATE OR REPLACE VIEW public.key_metrics_v AS ' || v;
END $$;

-- 11. intraday_premarket_v: premarket movers were a byte-for-byte copy of the
--     regular movers all day (Finviz exports no premarket-change column). The
--     fetcher is now time-gated to 04:00-09:30 ET; surface the latest *premarket*
--     batch (this morning's) rather than the global latest fetch.
CREATE OR REPLACE VIEW intraday_premarket_v AS
 SELECT 'cnbc'::text AS source, NULL::integer AS rank, ticker, company,
        NULL::numeric AS change_pct, NULL::numeric AS price, NULL::bigint AS volume, NULL::numeric AS rel_volume,
        article_url, news, article_date AS as_of_date, fetched_at
   FROM cnbc_premarket_raw
  WHERE article_date >= (CURRENT_DATE - '1 day'::interval)
UNION ALL
 SELECT 'finviz_up'::text, rank, ticker, company, change_pct, price, volume, rel_volume,
        NULL::text, NULL::text, fetched_at::date, fetched_at
   FROM intraday_movers
  WHERE mover_type = 'premarket_up'::text
    AND fetched_at = (SELECT max(fetched_at) FROM intraday_movers WHERE mover_type IN ('premarket_up','premarket_down'))
UNION ALL
 SELECT 'finviz_down'::text, rank, ticker, company, change_pct, price, volume, rel_volume,
        NULL::text, NULL::text, fetched_at::date, fetched_at
   FROM intraday_movers
  WHERE mover_type = 'premarket_down'::text
    AND fetched_at = (SELECT max(fetched_at) FROM intraday_movers WHERE mover_type IN ('premarket_up','premarket_down'));

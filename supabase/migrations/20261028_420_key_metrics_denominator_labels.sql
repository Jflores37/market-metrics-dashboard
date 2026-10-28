-- 20261028_420_key_metrics_denominator_labels.sql
-- Findings: db-logic-11 (Key Metrics % divided by the whole universe, including
-- rows where the metric is NULL), db-logic-10 ('New 52-Week Highs' only counts
-- names that CLOSED at the high).
-- =============================================================================
-- key_metrics_v, same columns/types/order (breadth_bars_v depends on it):
--   * pct = above / (above + below) for every metric that has a below_count
--     (NULL inputs and, for day change, unchanged names are in neither count);
--   * nh20 / nl20 keep below_count NULL; their denominator is the number of
--     names with a non-null high52w_pct / low52w_pct;
--   * relabel (no tolerance band): 'Closed at 52-Wk High' / 'Closed at 52-Wk Low';
--   * 'stocks' unchanged (count, pct NULL); empty denominator -> 0 as before.
-- The universe fan-out is written with a LATERAL VALUES list instead of five
-- copied CTEs; membership rules are identical (in_nq100, in_sp500, in_djia,
-- in_rut, cap_1b_plus). security_invoker stays off (live setting).
-- =============================================================================

CREATE OR REPLACE VIEW public.key_metrics_v WITH (security_invoker = off) AS
 WITH eq AS (
         SELECT e.in_sp500,
            e.in_nq100,
            e.in_djia,
            e.in_rut,
            e.cap_1b_plus,
            e.perf_day,
            e.perf_open,
            e.perf_week,
            e.perf_month,
            e.perf_quarter,
            e.perf_half,
            e.perf_year,
            m10.sma10_pct,
            m10.ema10_pct,
            e.sma20_pct,
            e.sma50_pct,
            e.sma200_pct,
            e.up_4pct,
            e.down_4pct,
            e.high52w_pct,
            e.low52w_pct
           FROM equities_snapshot e
             LEFT JOIN equity_ma10_latest_v m10 ON m10.ticker = e.ticker
          WHERE e.snapshot_date = (( SELECT max(equities_snapshot_1.snapshot_date) AS max
                   FROM equities_snapshot equities_snapshot_1))
        ), unioned AS (
         SELECT u.universe_id,
            u.universe_order,
            eq.in_sp500, eq.in_nq100, eq.in_djia, eq.in_rut, eq.cap_1b_plus,
            eq.perf_day, eq.perf_open, eq.perf_week, eq.perf_month, eq.perf_quarter, eq.perf_half, eq.perf_year,
            eq.sma10_pct, eq.ema10_pct, eq.sma20_pct, eq.sma50_pct, eq.sma200_pct,
            eq.up_4pct, eq.down_4pct, eq.high52w_pct, eq.low52w_pct
           FROM eq
             CROSS JOIN LATERAL ( VALUES ('NQ100'::text, 1, eq.in_nq100), ('SPY500'::text, 2, eq.in_sp500), ('DJIA'::text, 3, eq.in_djia), ('RUS2000'::text, 4, eq.in_rut), ('$1B+'::text, 5, eq.cap_1b_plus)) u(universe_id, universe_order, is_member)
          WHERE u.is_member
        ), agg AS (
         SELECT unioned.universe_id,
            unioned.universe_order,
            count(*) AS total,
            count(*) FILTER (WHERE unioned.perf_day > 0::numeric) AS day_chg_above,
            count(*) FILTER (WHERE unioned.perf_day < 0::numeric) AS day_chg_below,
            count(*) FILTER (WHERE unioned.perf_open > 0::numeric) AS open_chg_above,
            count(*) FILTER (WHERE unioned.perf_open <= 0::numeric) AS open_chg_below,
            count(*) FILTER (WHERE unioned.perf_week IS NOT NULL AND unioned.perf_week > 0::numeric) AS week_above,
            count(*) FILTER (WHERE unioned.perf_week IS NOT NULL AND unioned.perf_week <= 0::numeric) AS week_below,
            count(*) FILTER (WHERE unioned.perf_month IS NOT NULL AND unioned.perf_month > 0::numeric) AS month_above,
            count(*) FILTER (WHERE unioned.perf_month IS NOT NULL AND unioned.perf_month <= 0::numeric) AS month_below,
            count(*) FILTER (WHERE unioned.perf_quarter IS NOT NULL AND unioned.perf_quarter > 0::numeric) AS qtr_above,
            count(*) FILTER (WHERE unioned.perf_quarter IS NOT NULL AND unioned.perf_quarter <= 0::numeric) AS qtr_below,
            count(*) FILTER (WHERE unioned.perf_half IS NOT NULL AND unioned.perf_half > 0::numeric) AS half_above,
            count(*) FILTER (WHERE unioned.perf_half IS NOT NULL AND unioned.perf_half <= 0::numeric) AS half_below,
            count(*) FILTER (WHERE unioned.perf_year IS NOT NULL AND unioned.perf_year > 0::numeric) AS year_above,
            count(*) FILTER (WHERE unioned.perf_year IS NOT NULL AND unioned.perf_year <= 0::numeric) AS year_below,
            count(*) FILTER (WHERE unioned.sma10_pct IS NOT NULL AND unioned.sma10_pct > 0::numeric) AS sma10_above,
            count(*) FILTER (WHERE unioned.sma10_pct IS NOT NULL AND unioned.sma10_pct <= 0::numeric) AS sma10_below,
            count(*) FILTER (WHERE unioned.sma20_pct IS NOT NULL AND unioned.sma20_pct > 0::numeric) AS sma20_above,
            count(*) FILTER (WHERE unioned.sma20_pct IS NOT NULL AND unioned.sma20_pct <= 0::numeric) AS sma20_below,
            count(*) FILTER (WHERE unioned.sma50_pct IS NOT NULL AND unioned.sma50_pct > 0::numeric) AS sma50_above,
            count(*) FILTER (WHERE unioned.sma50_pct IS NOT NULL AND unioned.sma50_pct <= 0::numeric) AS sma50_below,
            count(*) FILTER (WHERE unioned.sma200_pct IS NOT NULL AND unioned.sma200_pct > 0::numeric) AS sma200_above,
            count(*) FILTER (WHERE unioned.sma200_pct IS NOT NULL AND unioned.sma200_pct <= 0::numeric) AS sma200_below,
            count(*) FILTER (WHERE unioned.ema10_pct IS NOT NULL AND unioned.sma20_pct IS NOT NULL AND unioned.ema10_pct < unioned.sma20_pct) AS ema10_sma20_above,
            count(*) FILTER (WHERE unioned.ema10_pct IS NOT NULL AND unioned.sma20_pct IS NOT NULL AND unioned.ema10_pct >= unioned.sma20_pct) AS ema10_sma20_below,
            count(*) FILTER (WHERE unioned.sma20_pct IS NOT NULL AND unioned.sma50_pct IS NOT NULL AND unioned.sma20_pct < unioned.sma50_pct) AS sma20_50_above,
            count(*) FILTER (WHERE unioned.sma20_pct IS NOT NULL AND unioned.sma50_pct IS NOT NULL AND unioned.sma20_pct >= unioned.sma50_pct) AS sma20_50_below,
            count(*) FILTER (WHERE unioned.sma50_pct IS NOT NULL AND unioned.sma200_pct IS NOT NULL AND unioned.sma50_pct < unioned.sma200_pct) AS sma50_200_above,
            count(*) FILTER (WHERE unioned.sma50_pct IS NOT NULL AND unioned.sma200_pct IS NOT NULL AND unioned.sma50_pct >= unioned.sma200_pct) AS sma50_200_below,
            count(*) FILTER (WHERE unioned.sma20_pct IS NOT NULL AND unioned.sma50_pct IS NOT NULL AND unioned.sma200_pct IS NOT NULL AND unioned.sma20_pct < unioned.sma50_pct AND unioned.sma50_pct < unioned.sma200_pct) AS sma_stack_above,
            count(*) FILTER (WHERE unioned.sma20_pct IS NOT NULL AND unioned.sma50_pct IS NOT NULL AND unioned.sma200_pct IS NOT NULL AND NOT (unioned.sma20_pct < unioned.sma50_pct AND unioned.sma50_pct < unioned.sma200_pct)) AS sma_stack_below,
            count(*) FILTER (WHERE unioned.up_4pct) AS up4_above,
            count(*) FILTER (WHERE unioned.down_4pct) AS up4_below,
            count(*) FILTER (WHERE unioned.high52w_pct >= 0::numeric) AS nh20_above,
            count(*) FILTER (WHERE unioned.low52w_pct <= 0::numeric) AS nl20_above,
            count(*) FILTER (WHERE unioned.high52w_pct IS NOT NULL) AS nh20_den,
            count(*) FILTER (WHERE unioned.low52w_pct IS NOT NULL) AS nl20_den
           FROM unioned
          GROUP BY unioned.universe_id, unioned.universe_order
        ), metric_defs(metric_id, metric_label, display_order) AS (
         VALUES ('day_chg'::text,'Day Chg'::text,1), ('open_chg'::text,'Open Chg'::text,2), ('week'::text,'Week'::text,3), ('month'::text,'Month'::text,4), ('qtr'::text,'Qtr'::text,5), ('half'::text,'Half Year'::text,6), ('year'::text,'Year'::text,7), ('sma10'::text,'Price to SMA10'::text,8), ('sma20'::text,'Price to SMA20'::text,9), ('sma50'::text,'Price to SMA50'::text,10), ('sma200'::text,'Price to SMA200'::text,11), ('ema10_sma20'::text,'EMA10>SMA20'::text,12), ('sma20_50'::text,'SMA20>SMA50'::text,13), ('sma50_200'::text,'SMA50>SMA200'::text,14), ('sma_stack'::text,'SMA20>SMA50>SMA200'::text,15), ('up4'::text,'4% Up vs 4% Down'::text,16), ('nh20'::text,'Closed at 52-Wk High'::text,17), ('nl20'::text,'Closed at 52-Wk Low'::text,18), ('stocks'::text,'Stocks'::text,19)
        ), vals AS (
         SELECT a.universe_id,
            a.universe_order,
            m.metric_id,
            m.metric_label,
            m.display_order,
                CASE m.metric_id
                    WHEN 'day_chg'::text THEN a.day_chg_above
                    WHEN 'open_chg'::text THEN a.open_chg_above
                    WHEN 'week'::text THEN a.week_above
                    WHEN 'month'::text THEN a.month_above
                    WHEN 'qtr'::text THEN a.qtr_above
                    WHEN 'half'::text THEN a.half_above
                    WHEN 'year'::text THEN a.year_above
                    WHEN 'sma10'::text THEN a.sma10_above
                    WHEN 'sma20'::text THEN a.sma20_above
                    WHEN 'sma50'::text THEN a.sma50_above
                    WHEN 'sma200'::text THEN a.sma200_above
                    WHEN 'ema10_sma20'::text THEN a.ema10_sma20_above
                    WHEN 'sma20_50'::text THEN a.sma20_50_above
                    WHEN 'sma50_200'::text THEN a.sma50_200_above
                    WHEN 'sma_stack'::text THEN a.sma_stack_above
                    WHEN 'up4'::text THEN a.up4_above
                    WHEN 'nh20'::text THEN a.nh20_above
                    WHEN 'nl20'::text THEN a.nl20_above
                    WHEN 'stocks'::text THEN a.total
                    ELSE NULL::bigint
                END AS above_count,
                CASE m.metric_id
                    WHEN 'day_chg'::text THEN a.day_chg_below
                    WHEN 'open_chg'::text THEN a.open_chg_below
                    WHEN 'week'::text THEN a.week_below
                    WHEN 'month'::text THEN a.month_below
                    WHEN 'qtr'::text THEN a.qtr_below
                    WHEN 'half'::text THEN a.half_below
                    WHEN 'year'::text THEN a.year_below
                    WHEN 'sma10'::text THEN a.sma10_below
                    WHEN 'sma20'::text THEN a.sma20_below
                    WHEN 'sma50'::text THEN a.sma50_below
                    WHEN 'sma200'::text THEN a.sma200_below
                    WHEN 'ema10_sma20'::text THEN a.ema10_sma20_below
                    WHEN 'sma20_50'::text THEN a.sma20_50_below
                    WHEN 'sma50_200'::text THEN a.sma50_200_below
                    WHEN 'sma_stack'::text THEN a.sma_stack_below
                    WHEN 'up4'::text THEN a.up4_below
                    ELSE NULL::bigint
                END AS below_count,
                CASE m.metric_id
                    WHEN 'nh20'::text THEN a.nh20_den
                    WHEN 'nl20'::text THEN a.nl20_den
                    ELSE NULL::bigint
                END AS hl_den
           FROM agg a
             CROSS JOIN metric_defs m
        )
 SELECT universe_id,
    universe_order,
    metric_id,
    metric_label,
    display_order,
    above_count,
    below_count,
        CASE
            WHEN metric_id = 'stocks'::text THEN NULL::numeric
            WHEN COALESCE(above_count + below_count, hl_den, 0::bigint) = 0 THEN 0::numeric
            ELSE round(100.0 * above_count::numeric / COALESCE(above_count + below_count, hl_den)::numeric, 1)
        END AS pct
   FROM vals
  ORDER BY universe_order, display_order;
GRANT SELECT ON public.key_metrics_v TO anon, authenticated;

-- Rollback:
--   Re-run the key_metrics_v block from 20261028_320_live_schema_baseline.sql
--   (same columns; keep WITH (security_invoker = off)).

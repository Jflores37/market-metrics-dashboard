-- 20261028_430_macro_ppi_final_demand.sql
-- Findings: pages-mm-macro-5 (the 'PPI' KPI used PPI All Commodities, PPIACO,
-- instead of headline Final Demand PPI); also adds data_fetched_at for
-- pages-mm-macro-6 (frontend shows "Updated h:mm AM ET").
-- =============================================================================
-- User decision: switch the KPI to FRED series PPIFIS (Final Demand). FRED is free.
--   * macro_series_meta: insert PPIFIS (active); PPIACO set inactive (rows kept).
--     fetch-fred reads active meta rows, so no edge change is needed. Run
--     fetch-fred once after this so the KPI isn't null until the next cron.
--   * macro_kpi_v: ppi_yoy reads PPIFIS; label 'PPI (Final Demand)', short 'PPI';
--     sparkline source PPIFIS. Columns unchanged.
--   * macro_monitor_dashboard_v: appends top-level key data_fetched_at =
--     max(macro_observations.fetched_at). generated_at stays.
-- =============================================================================

INSERT INTO public.macro_series_meta (series_id, display_name, category, units, frequency, transform, display_order, is_active)
VALUES ('PPIFIS', 'PPI Final Demand', 'inflation', 'Index', 'monthly', 'yoy_pct', 20, true)
ON CONFLICT (series_id) DO UPDATE
  SET display_name = EXCLUDED.display_name, category = EXCLUDED.category, units = EXCLUDED.units,
      frequency = EXCLUDED.frequency, transform = EXCLUDED.transform,
      display_order = EXCLUDED.display_order, is_active = true;

UPDATE public.macro_series_meta SET is_active = false WHERE series_id = 'PPIACO' AND is_active;

CREATE OR REPLACE VIEW public.macro_kpi_v WITH (security_invoker = on) AS
 WITH monthly_yoy AS (
         SELECT macro_observations.series_id,
            macro_observations.observation_date,
            macro_observations.value,
            ( SELECT mo2.value
                   FROM macro_observations mo2
                  WHERE mo2.series_id = macro_observations.series_id AND mo2.observation_date = (macro_observations.observation_date - '1 year'::interval)) AS value_12mo_ago,
                CASE
                    WHEN (( SELECT mo2.value
                       FROM macro_observations mo2
                      WHERE mo2.series_id = macro_observations.series_id AND mo2.observation_date = (macro_observations.observation_date - '1 year'::interval))) IS NOT NULL AND (( SELECT mo2.value
                       FROM macro_observations mo2
                      WHERE mo2.series_id = macro_observations.series_id AND mo2.observation_date = (macro_observations.observation_date - '1 year'::interval))) <> 0::numeric THEN (macro_observations.value / (( SELECT mo2.value
                       FROM macro_observations mo2
                      WHERE mo2.series_id = macro_observations.series_id AND mo2.observation_date = (macro_observations.observation_date - '1 year'::interval))) - 1::numeric) * 100::numeric
                    ELSE NULL::numeric
                END AS yoy_pct
           FROM macro_observations
          WHERE macro_observations.series_id = ANY (ARRAY['CPIAUCSL'::text, 'CPILFESL'::text, 'PPIFIS'::text, 'PCEPI'::text, 'PCEPILFE'::text])
        ), monthly_yoy_latest AS (
         SELECT DISTINCT ON (monthly_yoy.series_id) monthly_yoy.series_id,
            monthly_yoy.observation_date,
            monthly_yoy.value,
            monthly_yoy.value_12mo_ago,
            monthly_yoy.yoy_pct,
            lag(monthly_yoy.yoy_pct, 1) OVER (PARTITION BY monthly_yoy.series_id ORDER BY monthly_yoy.observation_date) AS prev_yoy_pct
           FROM monthly_yoy
          WHERE monthly_yoy.yoy_pct IS NOT NULL
          ORDER BY monthly_yoy.series_id, monthly_yoy.observation_date DESC
        ), daily_latest AS (
         SELECT macro_observations.series_id,
            macro_observations.observation_date,
            macro_observations.value,
            lag(macro_observations.value, 1) OVER (PARTITION BY macro_observations.series_id ORDER BY macro_observations.observation_date) AS prev_day,
            ( SELECT mo3.value
                   FROM macro_observations mo3
                  WHERE mo3.series_id = macro_observations.series_id AND mo3.observation_date <= (macro_observations.observation_date - 7)
                  ORDER BY mo3.observation_date DESC
                 LIMIT 1) AS prev_5d
           FROM macro_observations
          WHERE macro_observations.series_id = ANY (ARRAY['DFF'::text, 'DFEDTARU'::text, 'DCOILBRENTEU'::text, 'SP500'::text, 'DGS10'::text])
        ), daily_latest_only AS (
         SELECT DISTINCT ON (daily_latest.series_id) daily_latest.series_id,
            daily_latest.observation_date,
            daily_latest.value,
            daily_latest.prev_day,
            daily_latest.prev_5d
           FROM daily_latest
          ORDER BY daily_latest.series_id, daily_latest.observation_date DESC
        ), payems_mom AS (
         SELECT macro_observations.observation_date,
            macro_observations.value,
            macro_observations.value - lag(macro_observations.value, 1) OVER (ORDER BY macro_observations.observation_date) AS mom_delta_k
           FROM macro_observations
          WHERE macro_observations.series_id = 'PAYEMS'::text
        ), payems_latest AS (
         SELECT payems_mom.observation_date,
            payems_mom.value,
            payems_mom.mom_delta_k,
            lag(payems_mom.mom_delta_k, 1) OVER (ORDER BY payems_mom.observation_date) AS prev_mom_delta_k
           FROM payems_mom
          ORDER BY payems_mom.observation_date DESC
         LIMIT 1
        ), monthly_level AS (
         SELECT macro_observations.series_id,
            macro_observations.observation_date,
            macro_observations.value,
            lag(macro_observations.value, 1) OVER (PARTITION BY macro_observations.series_id ORDER BY macro_observations.observation_date) AS prev_month
           FROM macro_observations
          WHERE macro_observations.series_id = ANY (ARRAY['UNRATE'::text, 'UMCSENT'::text])
        ), monthly_level_latest AS (
         SELECT DISTINCT ON (monthly_level.series_id) monthly_level.series_id,
            monthly_level.observation_date,
            monthly_level.value,
            monthly_level.prev_month
           FROM monthly_level
          ORDER BY monthly_level.series_id, monthly_level.observation_date DESC
        ), sparklines_yoy AS (
         SELECT ranked.series_id,
            jsonb_agg(jsonb_build_object('d', ranked.observation_date, 'v', round(ranked.yoy_pct, 2)) ORDER BY ranked.observation_date) AS sparkline
           FROM ( SELECT monthly_yoy.series_id,
                    monthly_yoy.observation_date,
                    monthly_yoy.yoy_pct,
                    row_number() OVER (PARTITION BY monthly_yoy.series_id ORDER BY monthly_yoy.observation_date DESC) AS rn
                   FROM monthly_yoy
                  WHERE monthly_yoy.yoy_pct IS NOT NULL) ranked
          WHERE ranked.rn <= 24
          GROUP BY ranked.series_id
        ), sparklines_daily AS (
         SELECT ranked.series_id,
            jsonb_agg(jsonb_build_object('d', ranked.observation_date, 'v', round(ranked.value, 2)) ORDER BY ranked.observation_date) AS sparkline
           FROM ( SELECT macro_observations.series_id,
                    macro_observations.observation_date,
                    macro_observations.value,
                    row_number() OVER (PARTITION BY macro_observations.series_id ORDER BY macro_observations.observation_date DESC) AS rn
                   FROM macro_observations
                  WHERE macro_observations.series_id = ANY (ARRAY['DFF'::text, 'DCOILBRENTEU'::text, 'SP500'::text, 'DGS10'::text])) ranked
          WHERE ranked.rn <= 60
          GROUP BY ranked.series_id
        ), sparklines_monthly_level AS (
         SELECT ranked.series_id,
            jsonb_agg(jsonb_build_object('d', ranked.observation_date, 'v', round(ranked.value, 2)) ORDER BY ranked.observation_date) AS sparkline
           FROM ( SELECT macro_observations.series_id,
                    macro_observations.observation_date,
                    macro_observations.value,
                    row_number() OVER (PARTITION BY macro_observations.series_id ORDER BY macro_observations.observation_date DESC) AS rn
                   FROM macro_observations
                  WHERE macro_observations.series_id = ANY (ARRAY['UNRATE'::text, 'UMCSENT'::text])) ranked
          WHERE ranked.rn <= 24
          GROUP BY ranked.series_id
        ), sparkline_nfp AS (
         SELECT jsonb_agg(jsonb_build_object('d', ranked.observation_date, 'v', round(ranked.mom_delta_k, 0)) ORDER BY ranked.observation_date) AS sparkline
           FROM ( SELECT payems_mom.observation_date,
                    payems_mom.mom_delta_k,
                    row_number() OVER (ORDER BY payems_mom.observation_date DESC) AS rn
                   FROM payems_mom
                  WHERE payems_mom.mom_delta_k IS NOT NULL) ranked
          WHERE ranked.rn <= 24
        ), kpis AS (
         SELECT 'cpi_yoy'::text AS metric_id,
            'CPI'::text AS label,
            'CPI'::text AS short,
            monthly_yoy_latest.observation_date,
            round(monthly_yoy_latest.yoy_pct, 2) AS value_num,
            format('%s%% YoY'::text, round(monthly_yoy_latest.yoy_pct, 2)) AS display,
            round(monthly_yoy_latest.prev_yoy_pct, 2) AS prev_value,
            round(monthly_yoy_latest.yoy_pct - monthly_yoy_latest.prev_yoy_pct, 2) AS delta,
                CASE
                    WHEN monthly_yoy_latest.yoy_pct > (monthly_yoy_latest.prev_yoy_pct * 1.001) THEN 'up'::text
                    WHEN monthly_yoy_latest.yoy_pct < (monthly_yoy_latest.prev_yoy_pct * 0.999) THEN 'down'::text
                    ELSE 'flat'::text
                END AS trend,
            'BLS via FRED'::text AS source,
            1 AS display_order
           FROM monthly_yoy_latest
          WHERE monthly_yoy_latest.series_id = 'CPIAUCSL'::text
        UNION ALL
         SELECT 'core_cpi_yoy'::text AS text,
            'Core CPI'::text AS text,
            'Core CPI'::text AS text,
            monthly_yoy_latest.observation_date,
            round(monthly_yoy_latest.yoy_pct, 2) AS round,
            format('%s%% YoY'::text, round(monthly_yoy_latest.yoy_pct, 2)) AS format,
            round(monthly_yoy_latest.prev_yoy_pct, 2) AS round,
            round(monthly_yoy_latest.yoy_pct - monthly_yoy_latest.prev_yoy_pct, 2) AS round,
                CASE
                    WHEN monthly_yoy_latest.yoy_pct > (monthly_yoy_latest.prev_yoy_pct * 1.001) THEN 'up'::text
                    WHEN monthly_yoy_latest.yoy_pct < (monthly_yoy_latest.prev_yoy_pct * 0.999) THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'BLS via FRED'::text AS text,
            2
           FROM monthly_yoy_latest
          WHERE monthly_yoy_latest.series_id = 'CPILFESL'::text
        UNION ALL
         SELECT 'ppi_yoy'::text AS text,
            'PPI (Final Demand)'::text AS text,
            'PPI'::text AS text,
            monthly_yoy_latest.observation_date,
            round(monthly_yoy_latest.yoy_pct, 2) AS round,
            format('%s%% YoY'::text, round(monthly_yoy_latest.yoy_pct, 2)) AS format,
            round(monthly_yoy_latest.prev_yoy_pct, 2) AS round,
            round(monthly_yoy_latest.yoy_pct - monthly_yoy_latest.prev_yoy_pct, 2) AS round,
                CASE
                    WHEN monthly_yoy_latest.yoy_pct > (monthly_yoy_latest.prev_yoy_pct * 1.001) THEN 'up'::text
                    WHEN monthly_yoy_latest.yoy_pct < (monthly_yoy_latest.prev_yoy_pct * 0.999) THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'BLS via FRED'::text AS text,
            3
           FROM monthly_yoy_latest
          WHERE monthly_yoy_latest.series_id = 'PPIFIS'::text
        UNION ALL
         SELECT 'pce_yoy'::text AS text,
            'PCE'::text AS text,
            'PCE'::text AS text,
            monthly_yoy_latest.observation_date,
            round(monthly_yoy_latest.yoy_pct, 2) AS round,
            format('%s%% YoY'::text, round(monthly_yoy_latest.yoy_pct, 2)) AS format,
            round(monthly_yoy_latest.prev_yoy_pct, 2) AS round,
            round(monthly_yoy_latest.yoy_pct - monthly_yoy_latest.prev_yoy_pct, 2) AS round,
                CASE
                    WHEN monthly_yoy_latest.yoy_pct > (monthly_yoy_latest.prev_yoy_pct * 1.001) THEN 'up'::text
                    WHEN monthly_yoy_latest.yoy_pct < (monthly_yoy_latest.prev_yoy_pct * 0.999) THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'BEA via FRED'::text AS text,
            4
           FROM monthly_yoy_latest
          WHERE monthly_yoy_latest.series_id = 'PCEPI'::text
        UNION ALL
         SELECT 'core_pce_yoy'::text AS text,
            'Core PCE'::text AS text,
            'Core PCE'::text AS text,
            monthly_yoy_latest.observation_date,
            round(monthly_yoy_latest.yoy_pct, 2) AS round,
            format('%s%% YoY'::text, round(monthly_yoy_latest.yoy_pct, 2)) AS format,
            round(monthly_yoy_latest.prev_yoy_pct, 2) AS round,
            round(monthly_yoy_latest.yoy_pct - monthly_yoy_latest.prev_yoy_pct, 2) AS round,
                CASE
                    WHEN monthly_yoy_latest.yoy_pct > (monthly_yoy_latest.prev_yoy_pct * 1.001) THEN 'up'::text
                    WHEN monthly_yoy_latest.yoy_pct < (monthly_yoy_latest.prev_yoy_pct * 0.999) THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'BEA via FRED'::text AS text,
            5
           FROM monthly_yoy_latest
          WHERE monthly_yoy_latest.series_id = 'PCEPILFE'::text
        UNION ALL
         SELECT 'unemployment'::text AS text,
            'Unemployment'::text AS text,
            'Unemp.'::text AS text,
            monthly_level_latest.observation_date,
            round(monthly_level_latest.value, 2) AS round,
            format('%s%%'::text, round(monthly_level_latest.value, 2)) AS format,
            round(monthly_level_latest.prev_month, 2) AS round,
            round(monthly_level_latest.value - monthly_level_latest.prev_month, 2) AS round,
                CASE
                    WHEN monthly_level_latest.value > monthly_level_latest.prev_month THEN 'up'::text
                    WHEN monthly_level_latest.value < monthly_level_latest.prev_month THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'BLS via FRED'::text AS text,
            6
           FROM monthly_level_latest
          WHERE monthly_level_latest.series_id = 'UNRATE'::text
        UNION ALL
         SELECT 'nfp'::text AS text,
            'NFP (m/m)'::text AS text,
            'NFP'::text AS text,
            payems_latest.observation_date,
            round(payems_latest.mom_delta_k, 0) AS round,
            format('%s%sK'::text,
                CASE
                    WHEN payems_latest.mom_delta_k >= 0::numeric THEN '+'::text
                    ELSE ''::text
                END, round(payems_latest.mom_delta_k, 0)) AS format,
            round(payems_latest.prev_mom_delta_k, 0) AS round,
            round(payems_latest.mom_delta_k - payems_latest.prev_mom_delta_k, 0) AS round,
                CASE
                    WHEN payems_latest.mom_delta_k > payems_latest.prev_mom_delta_k THEN 'up'::text
                    WHEN payems_latest.mom_delta_k < payems_latest.prev_mom_delta_k THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'BLS via FRED'::text AS text,
            7
           FROM payems_latest
        UNION ALL
         SELECT 'brent'::text AS text,
            'Brent Crude'::text AS text,
            'Brent'::text AS text,
            daily_latest_only.observation_date,
            round(daily_latest_only.value, 2) AS round,
            format('$%s'::text, round(daily_latest_only.value, 2)) AS format,
            round(daily_latest_only.prev_5d, 2) AS round,
            round(daily_latest_only.value - daily_latest_only.prev_5d, 2) AS round,
                CASE
                    WHEN daily_latest_only.value > daily_latest_only.prev_5d THEN 'up'::text
                    WHEN daily_latest_only.value < daily_latest_only.prev_5d THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'EIA via FRED'::text AS text,
            8
           FROM daily_latest_only
          WHERE daily_latest_only.series_id = 'DCOILBRENTEU'::text
        UNION ALL
         SELECT 'sp500'::text AS text,
            'S&P 500'::text AS text,
            'S&P 500'::text AS text,
            daily_latest_only.observation_date,
            round(daily_latest_only.value, 2) AS round,
            to_char(daily_latest_only.value, 'FM999,990.99'::text) AS to_char,
            round(daily_latest_only.prev_5d, 2) AS round,
            round(daily_latest_only.value - daily_latest_only.prev_5d, 2) AS round,
                CASE
                    WHEN daily_latest_only.value > (daily_latest_only.prev_5d * 1.001) THEN 'up'::text
                    WHEN daily_latest_only.value < (daily_latest_only.prev_5d * 0.999) THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'FRED'::text AS text,
            9
           FROM daily_latest_only
          WHERE daily_latest_only.series_id = 'SP500'::text
        UNION ALL
         SELECT 'sentiment'::text AS text,
            'Sentiment'::text AS text,
            'Sent.'::text AS text,
            monthly_level_latest.observation_date,
            round(monthly_level_latest.value, 1) AS round,
            round(monthly_level_latest.value, 1)::text AS round,
            round(monthly_level_latest.prev_month, 1) AS round,
            round(monthly_level_latest.value - monthly_level_latest.prev_month, 1) AS round,
                CASE
                    WHEN monthly_level_latest.value > monthly_level_latest.prev_month THEN 'up'::text
                    WHEN monthly_level_latest.value < monthly_level_latest.prev_month THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'Univ. of Mich. via FRED'::text AS text,
            10
           FROM monthly_level_latest
          WHERE monthly_level_latest.series_id = 'UMCSENT'::text
        UNION ALL
         SELECT 'fed_funds'::text AS text,
            'Fed Funds'::text AS text,
            'Fed'::text AS text,
            daily_latest_only.observation_date,
            round(daily_latest_only.value, 2) AS round,
            format('%s%%'::text, round(daily_latest_only.value, 2)) AS format,
            round(daily_latest_only.prev_5d, 2) AS round,
            round(daily_latest_only.value - daily_latest_only.prev_5d, 2) AS round,
                CASE
                    WHEN daily_latest_only.value > daily_latest_only.prev_5d THEN 'up'::text
                    WHEN daily_latest_only.value < daily_latest_only.prev_5d THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'FRED'::text AS text,
            0
           FROM daily_latest_only
          WHERE daily_latest_only.series_id = 'DFF'::text
        UNION ALL
         SELECT 'dgs10'::text AS text,
            '10Y Treasury'::text AS text,
            '10Y'::text AS text,
            daily_latest_only.observation_date,
            round(daily_latest_only.value, 2) AS round,
            format('%s%%'::text, round(daily_latest_only.value, 2)) AS format,
            round(daily_latest_only.prev_5d, 2) AS round,
            round(daily_latest_only.value - daily_latest_only.prev_5d, 2) AS round,
                CASE
                    WHEN daily_latest_only.value > (daily_latest_only.prev_5d * 1.001) THEN 'up'::text
                    WHEN daily_latest_only.value < (daily_latest_only.prev_5d * 0.999) THEN 'down'::text
                    ELSE 'flat'::text
                END AS "case",
            'Fed via FRED'::text AS text,
            12
           FROM daily_latest_only
          WHERE daily_latest_only.series_id = 'DGS10'::text
        UNION ALL
         SELECT 'deficit'::text AS text,
            'Deficit (FY)'::text AS text,
            'Deficit'::text AS text,
            z.observation_date,
            round(z.value, 0) AS round,
                CASE
                    WHEN z.value < 0::numeric THEN format('-$%sB'::text, round(abs(z.value) / 1000.0, 0))
                    ELSE format('$%sB'::text, round(z.value / 1000.0, 0))
                END AS format,
            NULL::numeric AS "numeric",
            NULL::numeric AS "numeric",
            'flat'::text AS text,
            'Treasury via FRED'::text AS text,
            11
           FROM ( SELECT macro_observations.observation_date,
                    macro_observations.value
                   FROM macro_observations
                  WHERE macro_observations.series_id = 'FYFSD'::text
                  ORDER BY macro_observations.observation_date DESC
                 LIMIT 1) z
        )
 SELECT k.metric_id,
    k.label,
    k.short,
    k.observation_date,
    k.value_num,
    k.display,
    k.prev_value,
    k.delta,
    k.trend,
    k.source,
    k.display_order,
        CASE
            WHEN k.metric_id = 'nfp'::text THEN ( SELECT sparkline_nfp.sparkline
               FROM sparkline_nfp)
            ELSE COALESCE(s1.sparkline, s2.sparkline, s3.sparkline)
        END AS sparkline,
    macro_classify_signal(k.metric_id, k.value_num, k.trend) AS signal
   FROM kpis k
     LEFT JOIN sparklines_yoy s1 ON s1.series_id =
        CASE k.metric_id
            WHEN 'cpi_yoy'::text THEN 'CPIAUCSL'::text
            WHEN 'core_cpi_yoy'::text THEN 'CPILFESL'::text
            WHEN 'ppi_yoy'::text THEN 'PPIFIS'::text
            WHEN 'pce_yoy'::text THEN 'PCEPI'::text
            WHEN 'core_pce_yoy'::text THEN 'PCEPILFE'::text
            ELSE NULL::text
        END
     LEFT JOIN sparklines_daily s2 ON s2.series_id =
        CASE k.metric_id
            WHEN 'fed_funds'::text THEN 'DFF'::text
            WHEN 'brent'::text THEN 'DCOILBRENTEU'::text
            WHEN 'sp500'::text THEN 'SP500'::text
            WHEN 'dgs10'::text THEN 'DGS10'::text
            ELSE NULL::text
        END
     LEFT JOIN sparklines_monthly_level s3 ON s3.series_id =
        CASE k.metric_id
            WHEN 'unemployment'::text THEN 'UNRATE'::text
            WHEN 'sentiment'::text THEN 'UMCSENT'::text
            ELSE NULL::text
        END
  ORDER BY k.display_order;
GRANT SELECT ON public.macro_kpi_v TO anon, authenticated;

CREATE OR REPLACE VIEW public.macro_monitor_dashboard_v WITH (security_invoker = on) AS
 SELECT jsonb_build_object('kpis', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('metric_id', macro_kpi_v.metric_id, 'label', macro_kpi_v.label, 'short', macro_kpi_v.short, 'observation_date', macro_kpi_v.observation_date, 'value_num', macro_kpi_v.value_num, 'display', macro_kpi_v.display, 'prev_value', macro_kpi_v.prev_value, 'delta', macro_kpi_v.delta, 'trend', macro_kpi_v.trend, 'signal', macro_kpi_v.signal, 'source', macro_kpi_v.source, 'display_order', macro_kpi_v.display_order, 'sparkline', macro_kpi_v.sparkline) ORDER BY macro_kpi_v.display_order), '[]'::jsonb) AS "coalesce"
           FROM macro_kpi_v), 'fiscal', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('row_id', macro_fiscal_v.row_id, 'label', macro_fiscal_v.label, 'fred_id', macro_fiscal_v.fred_id, 'observation_date', macro_fiscal_v.observation_date, 'value', macro_fiscal_v.value, 'prev_value', macro_fiscal_v.prev_value, 'display', macro_fiscal_v.display, 'trend', macro_fiscal_v.trend, 'usd_unit', macro_fiscal_v.usd_unit) ORDER BY macro_fiscal_v.row_id), '[]'::jsonb) AS "coalesce"
           FROM macro_fiscal_v), 'signal_balance', ( SELECT jsonb_build_object('counts', macro_signal_balance_v.counts_json, 'dominant_label', macro_signal_balance_v.dominant_label, 'narrative', macro_signal_balance_v.narrative_text, 'hawkish', macro_signal_balance_v.hawkish, 'dovish', macro_signal_balance_v.dovish, 'neutral', macro_signal_balance_v.neutral, 'tightening', macro_signal_balance_v.tightening, 'total', macro_signal_balance_v.total) AS jsonb_build_object
           FROM macro_signal_balance_v), 'generated_at', now(), 'data_fetched_at', ( SELECT max(macro_observations.fetched_at) AS max
           FROM macro_observations)) AS dashboard;
GRANT SELECT ON public.macro_monitor_dashboard_v TO anon, authenticated;

-- Rollback:
--   UPDATE public.macro_series_meta SET is_active = true  WHERE series_id = 'PPIACO';
--   UPDATE public.macro_series_meta SET is_active = false WHERE series_id = 'PPIFIS';
--   Re-run the macro_kpi_v and macro_monitor_dashboard_v blocks from
--   20261028_320_live_schema_baseline.sql (same columns).
--   (PPIFIS observations can stay; or DELETE FROM public.macro_series_meta WHERE series_id = 'PPIFIS'
--    which cascades to its macro_observations.)

-- 20261028_390_intraday_dashboard_and_earnings.sql
-- Findings: pages-scan-intraday-sit-01 + ops-security-live-2 (unordered LIMIT 40
-- over a UNION left the premarket Down column empty), db-logic-15 (premarket
-- view used the UTC date, no ordering, and showed days-old batches as current),
-- pages-scan-intraday-sit-05 ('yesterday' earnings = calendar day before, so
-- Monday lost Friday's reporters), pages-scan-intraday-sit-11 (earnings list cut
-- to 30 across both days with no total), db-logic-12 (rescheduled earnings
-- showed twice), and the earnings half of edge-a-6 / ops-security-live-7
-- (avg_volume shown 1000x too small; see 400 for the other views).
-- Requires 330 (market calendar).
-- =============================================================================
-- intraday_premarket_v (same columns):
--   cnbc rows only for article_date = today ET;
--   finviz rows = the latest premarket batch, and only if it was fetched today
--   ET (a stale batch is never shown as today's); as_of_date is the ET date.
-- intraday_freshness_v: data_as_of/is_stale from gainer/loser/in_play only
--   (premarket batches no longer mask a dead intraday feed); appends
--   premarket_as_of.
-- earnings_yesterday_today_v: 'yesterday' = public.prev_trading_day(today ET) in both
--   the WHERE and the bucket; DISTINCT ON (ticker) keeps the latest fetched_at
--   among rows from the window start to +30 days (so a report moved OUT of the
--   window doesn't leave its old row behind), then the window is applied;
--   avg_volume x1000 (equities_snapshot stores thousands).
-- earnings_this_week_v: same dedupe (today .. +30 d, then < +7 d) + avg_volume x1000.
-- intraday_dashboard_v.dashboard (existing keys keep their shape):
--   premarket: per-source row_number (finviz_up <= 20, finviz_down <= 20,
--     cnbc <= 10), items add fetched_at + as_of_date, ordered by source, rank;
--   earnings_yest_today: <= 25 per bucket by market cap, today first;
--   new keys premarket_fetched_at, movers_fetched_at,
--     earnings_counts {today, yesterday} (before truncation), prices_as_of
--     (max equities_snapshot.snapshot_date = the date behind price/perf_day).
-- =============================================================================

-- intraday_premarket_v
CREATE OR REPLACE VIEW public.intraday_premarket_v WITH (security_invoker = on) AS
 WITH pm_batch AS (
         SELECT max(intraday_movers.fetched_at) AS fetched_at
           FROM intraday_movers
          WHERE intraday_movers.mover_type = ANY (ARRAY['premarket_up'::text, 'premarket_down'::text])
        ), pm_today AS (
         SELECT pm_batch.fetched_at
           FROM pm_batch
          WHERE (pm_batch.fetched_at AT TIME ZONE 'America/New_York'::text)::date = public.et_today()
        )
 SELECT 'cnbc'::text AS source,
    NULL::integer AS rank,
    cnbc_premarket_raw.ticker,
    cnbc_premarket_raw.company,
    NULL::numeric AS change_pct,
    NULL::numeric AS price,
    NULL::bigint AS volume,
    NULL::numeric AS rel_volume,
    cnbc_premarket_raw.article_url,
    cnbc_premarket_raw.news,
    cnbc_premarket_raw.article_date AS as_of_date,
    cnbc_premarket_raw.fetched_at
   FROM cnbc_premarket_raw
  WHERE cnbc_premarket_raw.article_date = public.et_today()
UNION ALL
 SELECT 'finviz_up'::text AS source,
    m.rank,
    m.ticker,
    m.company,
    m.change_pct,
    m.price,
    m.volume,
    m.rel_volume,
    NULL::text AS article_url,
    NULL::text AS news,
    (m.fetched_at AT TIME ZONE 'America/New_York'::text)::date AS as_of_date,
    m.fetched_at
   FROM intraday_movers m
     JOIN pm_today p ON p.fetched_at = m.fetched_at
  WHERE m.mover_type = 'premarket_up'::text
UNION ALL
 SELECT 'finviz_down'::text AS source,
    m.rank,
    m.ticker,
    m.company,
    m.change_pct,
    m.price,
    m.volume,
    m.rel_volume,
    NULL::text AS article_url,
    NULL::text AS news,
    (m.fetched_at AT TIME ZONE 'America/New_York'::text)::date AS as_of_date,
    m.fetched_at
   FROM intraday_movers m
     JOIN pm_today p ON p.fetched_at = m.fetched_at
  WHERE m.mover_type = 'premarket_down'::text;
GRANT SELECT ON public.intraday_premarket_v TO anon, authenticated;

-- intraday_freshness_v (existing columns + premarket_as_of)
CREATE OR REPLACE VIEW public.intraday_freshness_v WITH (security_invoker = on) AS
 SELECT max(fetched_at) FILTER (WHERE mover_type = ANY (ARRAY['gainer'::text, 'loser'::text, 'in_play'::text])) AS data_as_of,
    max(fetched_at) FILTER (WHERE mover_type = ANY (ARRAY['gainer'::text, 'loser'::text, 'in_play'::text])) < (now() - '00:30:00'::interval) AS is_stale,
    max(fetched_at) FILTER (WHERE mover_type = ANY (ARRAY['premarket_up'::text, 'premarket_down'::text])) AS premarket_as_of
   FROM intraday_movers;
GRANT SELECT ON public.intraday_freshness_v TO anon, authenticated;

-- earnings_yesterday_today_v (same columns)
CREATE OR REPLACE VIEW public.earnings_yesterday_today_v WITH (security_invoker = on) AS
 WITH d AS (
         SELECT public.et_today() AS today,
            public.prev_trading_day(public.et_today()) AS prev
        ), e AS (
         SELECT DISTINCT ON (ec.ticker) ec.ticker,
            ec.earnings_date,
            ec.earnings_time,
            ec.company,
            ec.sector,
            ec.industry,
            ec.market_cap_millions,
            ec.fetched_at
           FROM earnings_calendar ec
             CROSS JOIN d
          WHERE ec.earnings_date >= d.prev AND ec.earnings_date <= (d.today + 30)
          ORDER BY ec.ticker, ec.fetched_at DESC, ec.earnings_date DESC
        ), eq AS (
         SELECT equities_snapshot.ticker,
            equities_snapshot.sector,
            equities_snapshot.industry,
            equities_snapshot.price,
            equities_snapshot.market_cap_millions,
            equities_snapshot.volume,
            equities_snapshot.avg_volume,
            equities_snapshot.perf_day,
            equities_snapshot.perf_week,
            equities_snapshot.perf_month,
            equities_snapshot.perf_year,
            equities_snapshot.perf_ytd,
            equities_snapshot.sma20_pct,
            equities_snapshot.sma50_pct,
            equities_snapshot.sma200_pct,
            equities_snapshot.rsi14,
            equities_snapshot.atr_pct,
            equities_snapshot.high52w_pct,
            equities_snapshot.low52w_pct
           FROM equities_snapshot
          WHERE equities_snapshot.snapshot_date = (( SELECT max(equities_snapshot_1.snapshot_date) AS max
                   FROM equities_snapshot equities_snapshot_1))
        )
 SELECT e.ticker,
    e.earnings_date,
    e.earnings_time,
    e.company,
    COALESCE(e.sector, q.sector) AS sector,
    COALESCE(e.industry, q.industry) AS industry,
    COALESCE(e.market_cap_millions, q.market_cap_millions) AS market_cap_millions,
    q.price,
    q.volume,
    q.avg_volume * 1000 AS avg_volume,
    q.perf_day,
    q.perf_week,
    q.perf_month,
    q.perf_year,
    q.perf_ytd,
    q.sma20_pct,
    q.sma50_pct,
    q.sma200_pct,
    q.rsi14,
    q.atr_pct,
    q.high52w_pct,
    q.low52w_pct,
    e.fetched_at,
        CASE
            WHEN e.earnings_date = d.today THEN 'today'::text
            WHEN e.earnings_date = d.prev THEN 'yesterday'::text
            ELSE 'other'::text
        END AS bucket
   FROM e
     CROSS JOIN d
     LEFT JOIN eq q ON q.ticker = e.ticker
  WHERE e.earnings_date = ANY (ARRAY[d.prev, d.today])
  ORDER BY e.earnings_date DESC, (COALESCE(e.market_cap_millions, q.market_cap_millions)) DESC NULLS LAST;
GRANT SELECT ON public.earnings_yesterday_today_v TO anon, authenticated;

-- earnings_this_week_v (same columns)
CREATE OR REPLACE VIEW public.earnings_this_week_v WITH (security_invoker = on) AS
 WITH e AS (
         SELECT DISTINCT ON (ec.ticker) ec.ticker,
            ec.earnings_date,
            ec.earnings_time,
            ec.company,
            ec.sector,
            ec.industry,
            ec.market_cap_millions,
            ec.fetched_at
           FROM earnings_calendar ec
          WHERE ec.earnings_date >= public.et_today() AND ec.earnings_date <= (public.et_today() + 30)
          ORDER BY ec.ticker, ec.fetched_at DESC, ec.earnings_date DESC
        ), eq AS (
         SELECT equities_snapshot.ticker,
            equities_snapshot.sector,
            equities_snapshot.industry,
            equities_snapshot.price,
            equities_snapshot.market_cap_millions,
            equities_snapshot.volume,
            equities_snapshot.avg_volume,
            equities_snapshot.perf_day,
            equities_snapshot.perf_week,
            equities_snapshot.perf_month,
            equities_snapshot.perf_year,
            equities_snapshot.perf_ytd,
            equities_snapshot.sma20_pct,
            equities_snapshot.sma50_pct,
            equities_snapshot.sma200_pct,
            equities_snapshot.rsi14,
            equities_snapshot.atr_pct,
            equities_snapshot.high52w_pct,
            equities_snapshot.low52w_pct
           FROM equities_snapshot
          WHERE equities_snapshot.snapshot_date = (( SELECT max(equities_snapshot_1.snapshot_date) AS max
                   FROM equities_snapshot equities_snapshot_1))
        )
 SELECT e.ticker,
    e.earnings_date,
    e.earnings_time,
    e.company,
    COALESCE(e.sector, q.sector) AS sector,
    COALESCE(e.industry, q.industry) AS industry,
    COALESCE(e.market_cap_millions, q.market_cap_millions) AS market_cap_millions,
    q.price,
    q.volume,
    q.avg_volume * 1000 AS avg_volume,
    q.perf_day,
    q.perf_week,
    q.perf_month,
    q.perf_year,
    q.perf_ytd,
    q.sma20_pct,
    q.sma50_pct,
    q.sma200_pct,
    q.rsi14,
    q.atr_pct,
    q.high52w_pct,
    q.low52w_pct,
    e.fetched_at
   FROM e
     LEFT JOIN eq q ON q.ticker = e.ticker
  WHERE e.earnings_date < (public.et_today() + 7)
  ORDER BY e.earnings_date, (COALESCE(e.market_cap_millions, q.market_cap_millions)) DESC NULLS LAST;
GRANT SELECT ON public.earnings_this_week_v TO anon, authenticated;

-- intraday_dashboard_v (single jsonb column; existing keys keep their shape)
CREATE OR REPLACE VIEW public.intraday_dashboard_v WITH (security_invoker = on) AS
 SELECT jsonb_build_object(
    'ticker_tape', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('ticker', intraday_quotes_latest_v.ticker, 'display_label', intraday_quotes_latest_v.display_label, 'price', intraday_quotes_latest_v.price, 'change_pct', intraday_quotes_latest_v.change_pct, 'change_abs', intraday_quotes_latest_v.change_abs, 'fetched_at', intraday_quotes_latest_v.fetched_at) ORDER BY intraday_quotes_latest_v.display_order), '[]'::jsonb) AS "coalesce"
           FROM intraday_quotes_latest_v),
    'top_gainers', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', t.rank, 'ticker', t.ticker, 'company', t.company, 'sector', t.sector, 'price', t.price, 'change_pct', t.change_pct, 'volume', t.volume, 'rel_volume', t.rel_volume) ORDER BY t.rank), '[]'::jsonb) AS "coalesce"
           FROM ( SELECT intraday_top_gainers_v.rank,
                    intraday_top_gainers_v.ticker,
                    intraday_top_gainers_v.company,
                    intraday_top_gainers_v.sector,
                    intraday_top_gainers_v.price,
                    intraday_top_gainers_v.change_pct,
                    intraday_top_gainers_v.volume,
                    intraday_top_gainers_v.rel_volume
                   FROM intraday_top_gainers_v
                 LIMIT 30) t),
    'top_losers', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', t.rank, 'ticker', t.ticker, 'company', t.company, 'sector', t.sector, 'price', t.price, 'change_pct', t.change_pct, 'volume', t.volume, 'rel_volume', t.rel_volume) ORDER BY t.rank), '[]'::jsonb) AS "coalesce"
           FROM ( SELECT intraday_top_losers_v.rank,
                    intraday_top_losers_v.ticker,
                    intraday_top_losers_v.company,
                    intraday_top_losers_v.sector,
                    intraday_top_losers_v.price,
                    intraday_top_losers_v.change_pct,
                    intraday_top_losers_v.volume,
                    intraday_top_losers_v.rel_volume
                   FROM intraday_top_losers_v
                 LIMIT 30) t),
    'in_play', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', t.rank, 'ticker', t.ticker, 'company', t.company, 'sector', t.sector, 'price', t.price, 'change_pct', t.change_pct, 'volume', t.volume, 'rel_volume', t.rel_volume) ORDER BY t.rank), '[]'::jsonb) AS "coalesce"
           FROM ( SELECT intraday_in_play_v.rank,
                    intraday_in_play_v.ticker,
                    intraday_in_play_v.company,
                    intraday_in_play_v.sector,
                    intraday_in_play_v.price,
                    intraday_in_play_v.change_pct,
                    intraday_in_play_v.volume,
                    intraday_in_play_v.rel_volume
                   FROM intraday_in_play_v
                 LIMIT 30) t),
    'premarket', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('source', t.source, 'rank', t.rank, 'ticker', t.ticker, 'company', t.company, 'price', t.price, 'change_pct', t.change_pct, 'volume', t.volume, 'rel_volume', t.rel_volume, 'article_url', t.article_url, 'news', t.news, 'fetched_at', t.fetched_at, 'as_of_date', t.as_of_date) ORDER BY t.source, t.rank NULLS LAST, t.ticker), '[]'::jsonb) AS "coalesce"
           FROM ( SELECT p.source,
                    p.rank,
                    p.ticker,
                    p.company,
                    p.change_pct,
                    p.price,
                    p.volume,
                    p.rel_volume,
                    p.article_url,
                    p.news,
                    p.as_of_date,
                    p.fetched_at,
                    row_number() OVER (PARTITION BY p.source ORDER BY p.rank NULLS LAST, p.ticker) AS rn
                   FROM intraday_premarket_v p) t
          WHERE t.rn <= CASE t.source WHEN 'cnbc'::text THEN 10 ELSE 20 END),
    'premarket_fetched_at', ( SELECT max(intraday_premarket_v.fetched_at) AS max
           FROM intraday_premarket_v
          WHERE intraday_premarket_v.source = ANY (ARRAY['finviz_up'::text, 'finviz_down'::text])),
    'movers_fetched_at', ( SELECT max(intraday_movers.fetched_at) AS max
           FROM intraday_movers
          WHERE intraday_movers.mover_type = ANY (ARRAY['gainer'::text, 'loser'::text, 'in_play'::text])),
    'earnings_yest_today', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('ticker', t.ticker, 'company', t.company, 'earnings_date', t.earnings_date, 'earnings_time', t.earnings_time, 'bucket', t.bucket, 'sector', t.sector, 'market_cap_millions', t.market_cap_millions, 'price', t.price, 'perf_day', t.perf_day, 'perf_week', t.perf_week, 'rsi14', t.rsi14, 'atr_pct', t.atr_pct) ORDER BY (t.bucket = 'today'::text) DESC, t.market_cap_millions DESC NULLS LAST, t.ticker), '[]'::jsonb) AS "coalesce"
           FROM ( SELECT ey.ticker,
                    ey.earnings_date,
                    ey.earnings_time,
                    ey.company,
                    ey.sector,
                    ey.market_cap_millions,
                    ey.price,
                    ey.perf_day,
                    ey.perf_week,
                    ey.rsi14,
                    ey.atr_pct,
                    ey.bucket,
                    row_number() OVER (PARTITION BY ey.bucket ORDER BY ey.market_cap_millions DESC NULLS LAST, ey.ticker) AS rn
                   FROM earnings_yesterday_today_v ey
                  WHERE ey.market_cap_millions IS NOT NULL) t
          WHERE t.rn <= 25),
    'earnings_counts', ( SELECT jsonb_build_object(
                    'today', count(*) FILTER (WHERE earnings_yesterday_today_v.bucket = 'today'::text),
                    'yesterday', count(*) FILTER (WHERE earnings_yesterday_today_v.bucket = 'yesterday'::text)) AS jsonb_build_object
           FROM earnings_yesterday_today_v),
    'prices_as_of', ( SELECT max(equities_snapshot.snapshot_date) AS max
           FROM equities_snapshot),
    'generated_at', now()) AS dashboard;
GRANT SELECT ON public.intraday_dashboard_v TO anon, authenticated;

-- Rollback:
--   Re-run the intraday_premarket_v, earnings_yesterday_today_v,
--   earnings_this_week_v and intraday_dashboard_v blocks from
--   20261028_320_live_schema_baseline.sql (same columns, CREATE OR REPLACE works).
--   intraday_freshness_v gained a column, so: DROP VIEW public.intraday_freshness_v;
--   then its 320 block + GRANT SELECT ... TO anon, authenticated.

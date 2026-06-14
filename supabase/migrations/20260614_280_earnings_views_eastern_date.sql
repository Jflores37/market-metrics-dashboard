-- 20260614_280_earnings_views_eastern_date.sql
-- =============================================================================
-- earnings_yesterday_today_v and earnings_this_week_v computed today/yesterday/
-- this-week with UTC CURRENT_DATE (the DB timezone is UTC) while the rest of the
-- schema anchors on US/Eastern. From ~20:00 ET until midnight ET, UTC has
-- already rolled to the next day, so "today's earnings" jumped to tomorrow and
-- "yesterday" became today -- mislabeling/dropping rows during exactly the
-- evening earnings-reaction window. Switch both to the Eastern calendar date.
-- =============================================================================
CREATE OR REPLACE VIEW public.earnings_yesterday_today_v AS
WITH eq AS (
  SELECT ticker, sector, industry, price, market_cap_millions, volume, avg_volume,
         perf_day, perf_week, perf_month, perf_year, perf_ytd,
         sma20_pct, sma50_pct, sma200_pct, rsi14, atr_pct, high52w_pct, low52w_pct
  FROM equities_snapshot
  WHERE snapshot_date = (SELECT max(snapshot_date) FROM equities_snapshot)
)
SELECT e.ticker, e.earnings_date, e.earnings_time, e.company,
  COALESCE(e.sector, q.sector) AS sector,
  COALESCE(e.industry, q.industry) AS industry,
  COALESCE(e.market_cap_millions, q.market_cap_millions) AS market_cap_millions,
  q.price, q.volume, q.avg_volume, q.perf_day, q.perf_week, q.perf_month, q.perf_year, q.perf_ytd,
  q.sma20_pct, q.sma50_pct, q.sma200_pct, q.rsi14, q.atr_pct, q.high52w_pct, q.low52w_pct,
  e.fetched_at,
  CASE
    WHEN e.earnings_date = (now() AT TIME ZONE 'America/New_York')::date THEN 'today'::text
    WHEN e.earnings_date = ((now() AT TIME ZONE 'America/New_York')::date - 1) THEN 'yesterday'::text
    ELSE 'other'::text
  END AS bucket
FROM earnings_calendar e
LEFT JOIN eq q ON q.ticker = e.ticker
WHERE e.earnings_date = ANY (ARRAY[(now() AT TIME ZONE 'America/New_York')::date - 1, (now() AT TIME ZONE 'America/New_York')::date])
ORDER BY e.earnings_date DESC, COALESCE(e.market_cap_millions, q.market_cap_millions) DESC NULLS LAST;

CREATE OR REPLACE VIEW public.earnings_this_week_v AS
WITH eq AS (
  SELECT ticker, sector, industry, price, market_cap_millions, volume, avg_volume,
         perf_day, perf_week, perf_month, perf_year, perf_ytd,
         sma20_pct, sma50_pct, sma200_pct, rsi14, atr_pct, high52w_pct, low52w_pct
  FROM equities_snapshot
  WHERE snapshot_date = (SELECT max(snapshot_date) FROM equities_snapshot)
)
SELECT e.ticker, e.earnings_date, e.earnings_time, e.company,
  COALESCE(e.sector, q.sector) AS sector,
  COALESCE(e.industry, q.industry) AS industry,
  COALESCE(e.market_cap_millions, q.market_cap_millions) AS market_cap_millions,
  q.price, q.volume, q.avg_volume, q.perf_day, q.perf_week, q.perf_month, q.perf_year, q.perf_ytd,
  q.sma20_pct, q.sma50_pct, q.sma200_pct, q.rsi14, q.atr_pct, q.high52w_pct, q.low52w_pct,
  e.fetched_at
FROM earnings_calendar e
LEFT JOIN eq q ON q.ticker = e.ticker
WHERE e.earnings_date >= (now() AT TIME ZONE 'America/New_York')::date
  AND e.earnings_date < ((now() AT TIME ZONE 'America/New_York')::date + 7)
ORDER BY e.earnings_date, COALESCE(e.market_cap_millions, q.market_cap_millions) DESC NULLS LAST;

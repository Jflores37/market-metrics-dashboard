-- P2: add the 3 Super Scanners that existed in the reference
-- (pakkiraju/Market-Metrics-, finviz-elite constants.py:269-273 /
-- layout.py:98-101) but were never wired in our pipeline:
--   * 97 Club              (club_97)       -- catalog row already existed,
--                                             but no REF_URLS/RUNNER fed it
--   * StockBee 9M Movers   (nine_m_movers) -- entirely missing
--   * StockBee 20% Weekly  (weekly_20pct)  -- entirely missing; merges the
--                                             reference's up + down screens
--
-- The edge function (REF_URLS/RUNNERS/GROUPS + perf_week parsing) and
-- scannerConfig.ts (BASIC / WEEKLY layouts) are updated alongside this.
-- Placed right after Julian Komar (display_order 50) to mirror the
-- reference's contiguous ordering. Idempotent via ON CONFLICT.

INSERT INTO public.scanner_catalog
  (scanner_id, label, description, group_tab, display_order, source,
   default_sort_column, default_sort_direction, max_rows, finviz_url)
VALUES
  ('club_97',
   '97 Club',
   '$1B+ cap, avg vol > 1M, price > $1. Broad liquid large-cap universe.',
   'trend', 60, 'StockBee',
   'perf_day', 'desc', NULL,
   'https://elite.finviz.com/screener.ashx?v=111&f=cap_1to,sh_avgvol_o1000,sh_price_o1'),
  ('nine_m_movers',
   'StockBee 9 Million Movers',
   '$1B+ cap, current volume >= 9M, price > $1, rel vol >= 1.25x.',
   'trend', 70, 'StockBee',
   'perf_day', 'desc', NULL,
   'https://elite.finviz.com/screener.ashx?v=111&f=cap_1to,sh_curvol_9000tox,sh_price_o1,sh_relvol_1.25to'),
  ('weekly_20pct',
   'StockBee 20% Weekly Movers',
   'Avg vol > 1M, price > $1, weekly performance +/-20% (up and down screens merged). Sorted by Week %.',
   'trend', 80, 'StockBee',
   'perf_week', 'desc', NULL,
   'composite: 20pct_weekly_up + 20pct_weekly_down (ta_perf_1w20o / ta_perf_1w20u)')
ON CONFLICT (scanner_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  group_tab = EXCLUDED.group_tab,
  display_order = EXCLUDED.display_order,
  source = EXCLUDED.source,
  default_sort_column = EXCLUDED.default_sort_column,
  default_sort_direction = EXCLUDED.default_sort_direction,
  max_rows = EXCLUDED.max_rows,
  finviz_url = EXCLUDED.finviz_url;

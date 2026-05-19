-- Reference (pakkiraju/Market-Metrics-/finviz-elite, src/layout.py:2773):
-- almost every scanner is sorted client-side by Change (= perf_day) DESC,
-- regardless of the FinViz URL's &o= parameter. Override that here so the
-- catalog matches reference behavior; the page reads these defaults via
-- scanner_summary_v.

UPDATE public.scanner_catalog SET
  default_sort_column = 'perf_day',
  default_sort_direction = 'desc'
WHERE scanner_id NOT IN ('perf_1w20', 'earnings_thisweek');

-- StockBee 20% weekly mover: sorts by Performance (Week) DESC.
UPDATE public.scanner_catalog SET
  default_sort_column = 'perf_week',
  default_sort_direction = 'desc'
WHERE scanner_id = 'perf_1w20';

-- Earnings This Week renders a separate component with its own sort.

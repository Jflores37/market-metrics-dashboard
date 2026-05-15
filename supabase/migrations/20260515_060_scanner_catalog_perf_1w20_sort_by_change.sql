-- jeff_sun_1w20's reference export URL uses c=1,47,61,62,63,64,65 (no
-- PerfWeek column), so perf_1w20 cannot sort by perf_week. Reference
-- layout.py sorts it by Change DESC like the other Jeff Sun movers.
UPDATE public.scanner_catalog SET
  default_sort_column = 'perf_day',
  default_sort_direction = 'desc'
WHERE scanner_id = 'perf_1w20';

-- 20260615_300_key_metrics_unchanged_convention.sql
-- =============================================================================
-- bsm-2 / fe-6: key_metrics_v counted exactly-flat names (perf_day = 0) as
-- decliners in the Day-change "below" count (perf_day <= 0), diverging from
-- breadth_metrics_v which excludes unchanged (perf_day < 0). On a flat-close day
-- the same universe then showed different decliner counts in different panels.
-- Align on the standard A/D convention: advancers > 0, decliners < 0, unchanged
-- counted as neither. Only the single perf_day filter is touched -- migration
-- 200's new-low band (low52w_pct <= 0) is intentionally left as-is.
-- =============================================================================
DO $$
DECLARE v text;
BEGIN
  SELECT pg_get_viewdef('public.key_metrics_v'::regclass, true) INTO v;
  v := replace(v, 'perf_day <= 0', 'perf_day < 0');
  EXECUTE 'CREATE OR REPLACE VIEW public.key_metrics_v AS ' || v;
END $$;

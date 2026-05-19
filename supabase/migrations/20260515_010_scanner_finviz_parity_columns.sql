-- Phase 4: FinViz-parity column additions for Super Scanners rebuild.
-- All ADDs are nullable; existing rows remain valid.

ALTER TABLE public.scanner_results
  ADD COLUMN IF NOT EXISTS atr numeric,
  ADD COLUMN IF NOT EXISTS atr_pct numeric,
  ADD COLUMN IF NOT EXISTS perf_half numeric,
  ADD COLUMN IF NOT EXISTS perf_ytd numeric,
  ADD COLUMN IF NOT EXISTS stage_tag text,
  ADD COLUMN IF NOT EXISTS dist_52w_high_pct numeric;

ALTER TABLE public.scanner_catalog
  ADD COLUMN IF NOT EXISTS default_sort_column text,
  ADD COLUMN IF NOT EXISTS default_sort_direction text DEFAULT 'desc',
  ADD COLUMN IF NOT EXISTS max_rows integer,
  ADD COLUMN IF NOT EXISTS finviz_url text;

ALTER TABLE public.scanner_catalog
  ADD CONSTRAINT scanner_catalog_sort_dir_chk
  CHECK (default_sort_direction IN ('asc','desc')) NOT VALID;

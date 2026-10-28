-- 20261028_320_live_schema_baseline.sql
-- Findings: db-logic-06 (schema drift: the repo could not rebuild the live DB).
-- =============================================================================
-- Snapshot of the LIVE public schema as of 2026-10-28 (taken read-only from
-- pg_catalog), written so it is a NO-OP on the live project and makes a fresh
-- environment rebuildable from the repo. It runs before 330-480, which then
-- change things on top of it.
--   * tables: CREATE TABLE IF NOT EXISTS with live columns, PKs, CHECKs, FK,
--     sequences and indexes (all IF NOT EXISTS). Constraints are inline, so on
--     an existing table nothing is touched. TODO: tables that predate this
--     file and later gain constraints must get explicit ALTERs in new files.
--   * RLS enabled + the live read policies (DROP POLICY IF EXISTS / CREATE),
--     except job_runs' public-read policy, which 310 removed on purpose.
--   * functions: CREATE OR REPLACE of every public function, verbatim.
--   * views: CREATE OR REPLACE of all 44 public views, verbatim from
--     pg_get_viewdef, in dependency order, with the live security_invoker
--     setting spelled out (CREATE OR REPLACE VIEW without WITH(...) would reset
--     reloptions). pipeline_failures_v is security_invoker=off as set by 310.
--   * grants: SELECT to anon/authenticated exactly where live has it.
--
-- MIGRATION HISTORY (user action, not done here):
--   The files 20260604_200 ... 20261028_310 were applied by hand/SQL editor and
--   are not in supabase_migrations.schema_migrations. Do NOT insert rows there
--   directly. Mark them applied with the CLI instead, e.g.
--     supabase migration repair --status applied <version> [<version> ...]
--   Note: the repo's YYYYMMDD_NNN_name.sql naming makes the CLI read the
--   version as the 8-digit date only (several files share one version), so
--   `supabase db push` cannot track these files one by one. Until the files are
--   renamed to 14-digit timestamps, apply 320+ with the Supabase MCP
--   apply_migration / SQL editor, in filename order, and record them with
--   `supabase migration repair --status applied` per version.
--
-- Secrets: none. This file contains no keys or tokens.
-- =============================================================================

-- ---------------------------------------------------------------- tables

CREATE SEQUENCE IF NOT EXISTS public.cnbc_premarket_raw_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.job_runs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.watchlists_id_seq;

CREATE TABLE IF NOT EXISTS public.app_config (
  key text NOT NULL PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.breadth_daily_history (
  snapshot_date date NOT NULL,
  universe_id text NOT NULL,
  total_count integer,
  pct_above_sma20 numeric,
  pct_above_sma50 numeric,
  pct_above_sma200 numeric,
  pct_aligned_bullish numeric,
  new_52w_highs integer,
  new_52w_lows integer,
  new_20day_highs integer,
  new_20day_lows integer,
  up_4pct integer,
  down_4pct integer,
  advancers integer,
  decliners integer,
  t2108 numeric,
  PRIMARY KEY (snapshot_date, universe_id)
);

CREATE TABLE IF NOT EXISTS public.cnbc_premarket_raw (
  id bigint NOT NULL DEFAULT nextval('public.cnbc_premarket_raw_id_seq'::regclass) PRIMARY KEY,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  article_url text,
  article_date date,
  ticker text,
  company text,
  news text
);
ALTER SEQUENCE public.cnbc_premarket_raw_id_seq OWNED BY public.cnbc_premarket_raw.id;

CREATE TABLE IF NOT EXISTS public.earnings_calendar (
  ticker text NOT NULL,
  earnings_date date NOT NULL,
  earnings_time text,
  company text,
  sector text,
  industry text,
  market_cap_millions numeric,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, earnings_date)
);

CREATE TABLE IF NOT EXISTS public.equities_snapshot (
  ticker text NOT NULL,
  snapshot_date date NOT NULL,
  index_str text,
  in_sp500 boolean NOT NULL DEFAULT false,
  in_nq100 boolean NOT NULL DEFAULT false,
  in_djia boolean NOT NULL DEFAULT false,
  sector text,
  industry text,
  price numeric,
  market_cap_millions numeric,
  volume bigint,
  avg_volume bigint,            -- FinViz "Average Volume" in THOUSANDS (see migration 400)
  perf_day numeric,
  perf_week numeric,
  perf_month numeric,
  perf_quarter numeric,
  perf_year numeric,
  sma20_pct numeric,
  sma50_pct numeric,
  sma200_pct numeric,
  high52w_pct numeric,
  low52w_pct numeric,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  in_rut boolean DEFAULT false,
  cap_1b_plus boolean DEFAULT false,
  perf_open numeric,
  perf_half numeric,
  perf_ytd numeric,
  sma10_pct numeric,
  ema10_pct numeric,
  new_20day_high boolean,
  new_20day_low boolean,
  up_4pct boolean,
  down_4pct boolean,
  atr_value numeric,
  atr_pct numeric,
  rsi14 numeric,
  volatility_w numeric,
  volatility_m numeric,
  PRIMARY KEY (ticker, snapshot_date)
);

CREATE TABLE IF NOT EXISTS public.index_etf_quotes (
  ticker text NOT NULL,
  observation_date date NOT NULL,
  close numeric NOT NULL,
  sma20 numeric,
  sma50 numeric,
  sma200 numeric,
  rsi14 numeric,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, observation_date)
);

CREATE TABLE IF NOT EXISTS public.industry_aggregates (
  snapshot_date date NOT NULL,
  industry text NOT NULL,
  sector text,
  stock_count integer,
  avg_perf_day numeric,
  avg_perf_week numeric,
  avg_perf_month numeric,
  avg_perf_quarter numeric,
  avg_perf_half numeric,
  avg_perf_year numeric,
  avg_perf_ytd numeric,
  top_tickers text[],
  PRIMARY KEY (snapshot_date, industry)
);

CREATE TABLE IF NOT EXISTS public.intraday_movers (
  mover_type text NOT NULL CONSTRAINT intraday_movers_mover_type_check
    CHECK (mover_type = ANY (ARRAY['gainer'::text, 'loser'::text, 'in_play'::text, 'premarket_up'::text, 'premarket_down'::text])),
  ticker text NOT NULL,
  fetched_at timestamp with time zone NOT NULL,
  rank integer,
  company text,
  sector text,
  price numeric,
  change_pct numeric,
  volume bigint,
  rel_volume numeric,
  extras jsonb,
  PRIMARY KEY (mover_type, ticker, fetched_at)
);

CREATE TABLE IF NOT EXISTS public.intraday_quotes (
  ticker text NOT NULL,
  fetched_at timestamp with time zone NOT NULL,
  display_label text,
  price numeric,
  change_pct numeric,
  change_abs numeric,
  prev_close numeric,
  PRIMARY KEY (ticker, fetched_at)
);

CREATE TABLE IF NOT EXISTS public.job_runs (
  id bigint NOT NULL DEFAULT nextval('public.job_runs_id_seq'::regclass) PRIMARY KEY,
  job_name text NOT NULL,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  status text NOT NULL CONSTRAINT job_runs_status_check
    CHECK (status = ANY (ARRAY['running'::text, 'ok'::text, 'error'::text])),   -- 340 adds 'partial'
  elapsed_ms integer,
  summary jsonb,
  error text
);
ALTER SEQUENCE public.job_runs_id_seq OWNED BY public.job_runs.id;

CREATE TABLE IF NOT EXISTS public.macro_series_meta (
  series_id text NOT NULL PRIMARY KEY,
  display_name text NOT NULL,
  category text NOT NULL,
  units text,
  frequency text,
  transform text NOT NULL DEFAULT 'level'::text CONSTRAINT macro_series_meta_transform_check
    CHECK (transform = ANY (ARRAY['level'::text, 'yoy_pct'::text, 'mom_delta'::text])),
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.macro_observations (
  series_id text NOT NULL REFERENCES public.macro_series_meta(series_id) ON DELETE CASCADE,
  observation_date date NOT NULL,
  value numeric,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (series_id, observation_date)
);

CREATE TABLE IF NOT EXISTS public.pipeline_health (
  id bigint NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checked_at timestamp with time zone NOT NULL DEFAULT now(),
  kind text NOT NULL,
  target text NOT NULL,
  severity text NOT NULL DEFAULT 'error'::text,
  detail text
);

CREATE TABLE IF NOT EXISTS public.scanner_catalog (
  scanner_id text NOT NULL PRIMARY KEY,
  label text NOT NULL,
  description text,
  group_tab text NOT NULL CONSTRAINT scanner_catalog_group_tab_check
    CHECK (group_tab = ANY (ARRAY['trend'::text, 'perf'::text, 'special'::text])),
  display_order integer NOT NULL,
  source text,
  doc_url text,
  default_sort_column text,
  default_sort_direction text DEFAULT 'desc'::text CONSTRAINT scanner_catalog_sort_dir_chk
    CHECK (default_sort_direction = ANY (ARRAY['asc'::text, 'desc'::text])),
  max_rows integer,
  finviz_url text
);

CREATE TABLE IF NOT EXISTS public.scanner_results (
  scanner_id text NOT NULL,
  ticker text NOT NULL,
  snapshot_date date NOT NULL,
  rank integer,
  company text,
  sector text,
  industry text,
  price numeric,
  market_cap_millions numeric,
  volume bigint,
  avg_volume bigint,            -- shares (x1000 applied at ingest)
  rel_volume numeric,
  perf_day numeric,
  perf_week numeric,
  perf_month numeric,
  perf_quarter numeric,
  perf_year numeric,
  rsi14 numeric,
  extras jsonb,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  atr numeric,
  atr_pct numeric,
  perf_half numeric,
  perf_ytd numeric,
  stage_tag text,
  dist_52w_high_pct numeric,
  roe numeric,
  net_margin numeric,
  short_float_pct numeric,
  PRIMARY KEY (scanner_id, ticker, snapshot_date)
);

CREATE TABLE IF NOT EXISTS public.sector_etf_snapshot (
  ticker text NOT NULL,
  snapshot_date date NOT NULL,
  sector_label text NOT NULL,
  is_benchmark boolean NOT NULL DEFAULT false,
  price numeric,
  perf_day numeric,
  perf_week numeric,
  perf_month numeric,
  perf_quarter numeric,
  perf_year numeric,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  perf_open numeric,
  perf_half numeric,
  perf_ytd numeric,
  gap_pct numeric,
  ema10_value numeric,
  sma20_value numeric,
  sma50_value numeric,
  sma200_value numeric,
  atr_value numeric,
  atr_pct numeric,
  high_52w numeric,
  low_52w numeric,
  range_52w_pct numeric,
  PRIMARY KEY (ticker, snapshot_date)
);

CREATE TABLE IF NOT EXISTS public.should_i_trade_history (
  snapshot_date date NOT NULL,
  mode text NOT NULL CONSTRAINT should_i_trade_history_mode_check CHECK (mode = ANY (ARRAY['swing'::text, 'day'::text])),
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  decision text NOT NULL CONSTRAINT should_i_trade_history_decision_check CHECK (decision = ANY (ARRAY['YES'::text, 'CAUTION'::text, 'NO'::text])),
  market_quality_score numeric NOT NULL,
  execution_window_score numeric,
  vol_score numeric,
  vol_weight numeric,
  vol_interpretation text,
  trend_score numeric,
  trend_weight numeric,
  trend_interpretation text,
  breadth_score numeric,
  breadth_weight numeric,
  breadth_interpretation text,
  momentum_score numeric,
  momentum_weight numeric,
  momentum_interpretation text,
  macro_score numeric,
  macro_weight numeric,
  macro_interpretation text,
  exec_breakouts_status text,
  exec_breakouts_detail text,
  exec_leaders_status text,
  exec_leaders_detail text,
  exec_pullbacks_status text,
  exec_pullbacks_detail text,
  exec_followthrough_status text,
  exec_followthrough_detail text,
  narrative_text text,
  suggested_action text,
  raw_inputs jsonb,
  PRIMARY KEY (snapshot_date, mode)
);

CREATE TABLE IF NOT EXISTS public.stockbee_breadth_raw (
  observation_date date NOT NULL PRIMARY KEY,
  up_4pct integer,
  down_4pct integer,
  ratio5 numeric,
  ratio10 numeric,
  up_25pct_qtr integer,
  down_25pct_qtr integer,
  universe_size integer,
  t2108 numeric,
  sp500_level numeric,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stockbee_momentum50 (
  observation_date date NOT NULL PRIMARY KEY,
  tickers text[] NOT NULL,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vix_history (
  observation_date date NOT NULL PRIMARY KEY,
  vix_close numeric,
  vvix_close numeric,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.watchlists (
  id bigint NOT NULL DEFAULT nextval('public.watchlists_id_seq'::regclass) PRIMARY KEY,
  ticker text NOT NULL UNIQUE,
  "position" integer NOT NULL DEFAULT 0,
  added_at timestamp with time zone NOT NULL DEFAULT now(),
  notes text
);
ALTER SEQUENCE public.watchlists_id_seq OWNED BY public.watchlists.id;

CREATE INDEX IF NOT EXISTS idx_breadth_history_date ON public.breadth_daily_history USING btree (snapshot_date DESC, universe_id);
CREATE INDEX IF NOT EXISTS idx_cnbc_premarket_date ON public.cnbc_premarket_raw USING btree (article_date DESC);
CREATE INDEX IF NOT EXISTS idx_earnings_date ON public.earnings_calendar USING btree (earnings_date DESC);
CREATE INDEX IF NOT EXISTS idx_equities_snapshot_date ON public.equities_snapshot USING btree (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_equities_snapshot_marketcap ON public.equities_snapshot USING btree (snapshot_date, market_cap_millions);
CREATE INDEX IF NOT EXISTS idx_equities_snapshot_sp500 ON public.equities_snapshot USING btree (snapshot_date, in_sp500) WHERE in_sp500;
CREATE INDEX IF NOT EXISTS idx_equities_snapshot_universes ON public.equities_snapshot USING btree (snapshot_date, in_sp500, in_nq100, in_djia, in_rut, cap_1b_plus);
CREATE INDEX IF NOT EXISTS idx_index_etf_date ON public.index_etf_quotes USING btree (ticker, observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_industry_sector ON public.industry_aggregates USING btree (snapshot_date DESC, sector);
CREATE INDEX IF NOT EXISTS idx_intraday_movers_latest ON public.intraday_movers USING btree (mover_type, fetched_at DESC, rank);
CREATE INDEX IF NOT EXISTS idx_intraday_quotes_latest ON public.intraday_quotes USING btree (ticker, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_name_started ON public.job_runs USING btree (job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_status_started ON public.job_runs USING btree (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_macro_obs_series_date ON public.macro_observations USING btree (series_id, observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_health_checked ON public.pipeline_health USING btree (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_scanner_results_latest ON public.scanner_results USING btree (scanner_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_sit_history_date_mode ON public.should_i_trade_history USING btree (mode, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_stockbee_breadth_date ON public.stockbee_breadth_raw USING btree (observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_watchlists_position ON public.watchlists USING btree ("position");

-- ---------------------------------------------------------------- RLS + policies
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breadth_daily_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cnbc_premarket_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equities_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.index_etf_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industry_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intraday_movers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intraday_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macro_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macro_series_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanner_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scanner_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_etf_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.should_i_trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stockbee_breadth_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stockbee_momentum50 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vix_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read breadth history" ON public.breadth_daily_history;
CREATE POLICY "public read breadth history" ON public.breadth_daily_history FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read cnbc premarket" ON public.cnbc_premarket_raw;
CREATE POLICY "public read cnbc premarket" ON public.cnbc_premarket_raw FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read earnings" ON public.earnings_calendar;
CREATE POLICY "public read earnings" ON public.earnings_calendar FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read equities snapshot" ON public.equities_snapshot;
CREATE POLICY "public read equities snapshot" ON public.equities_snapshot FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read index quotes" ON public.index_etf_quotes;
CREATE POLICY "public read index quotes" ON public.index_etf_quotes FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read industry agg" ON public.industry_aggregates;
CREATE POLICY "public read industry agg" ON public.industry_aggregates FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read intraday movers" ON public.intraday_movers;
CREATE POLICY "public read intraday movers" ON public.intraday_movers FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read intraday quotes" ON public.intraday_quotes;
CREATE POLICY "public read intraday quotes" ON public.intraday_quotes FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read observations" ON public.macro_observations;
CREATE POLICY "public read observations" ON public.macro_observations FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read meta" ON public.macro_series_meta;
CREATE POLICY "public read meta" ON public.macro_series_meta FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "anon can read scanner_catalog" ON public.scanner_catalog;
CREATE POLICY "anon can read scanner_catalog" ON public.scanner_catalog FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read scanner results" ON public.scanner_results;
CREATE POLICY "public read scanner results" ON public.scanner_results FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read sector etfs" ON public.sector_etf_snapshot;
CREATE POLICY "public read sector etfs" ON public.sector_etf_snapshot FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "anon can read should_i_trade_history" ON public.should_i_trade_history;
CREATE POLICY "anon can read should_i_trade_history" ON public.should_i_trade_history FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "public read stockbee breadth" ON public.stockbee_breadth_raw;
CREATE POLICY "public read stockbee breadth" ON public.stockbee_breadth_raw FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read stockbee mom50" ON public.stockbee_momentum50;
CREATE POLICY "public read stockbee mom50" ON public.stockbee_momentum50 FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read vix" ON public.vix_history;
CREATE POLICY "public read vix" ON public.vix_history FOR SELECT TO anon,authenticated USING (true);
DROP POLICY IF EXISTS "public read watchlists" ON public.watchlists;
CREATE POLICY "public read watchlists" ON public.watchlists FOR SELECT TO anon,authenticated USING (true);

-- ---------------------------------------------------------------- table read grants
-- (live grants; job_runs excluded because 310 closed it to the API)
GRANT SELECT ON public.breadth_daily_history TO anon, authenticated;
GRANT SELECT ON public.cnbc_premarket_raw TO anon, authenticated;
GRANT SELECT ON public.earnings_calendar TO anon, authenticated;
GRANT SELECT ON public.equities_snapshot TO anon, authenticated;
GRANT SELECT ON public.index_etf_quotes TO anon, authenticated;
GRANT SELECT ON public.industry_aggregates TO anon, authenticated;
GRANT SELECT ON public.intraday_movers TO anon, authenticated;
GRANT SELECT ON public.intraday_quotes TO anon, authenticated;
GRANT SELECT ON public.macro_observations TO anon, authenticated;
GRANT SELECT ON public.macro_series_meta TO anon, authenticated;
GRANT SELECT ON public.scanner_catalog TO anon, authenticated;
GRANT SELECT ON public.scanner_results TO anon, authenticated;
GRANT SELECT ON public.sector_etf_snapshot TO anon, authenticated;
GRANT SELECT ON public.should_i_trade_history TO anon, authenticated;
GRANT SELECT ON public.stockbee_breadth_raw TO anon, authenticated;
GRANT SELECT ON public.stockbee_momentum50 TO anon, authenticated;
GRANT SELECT ON public.vix_history TO anon, authenticated;
GRANT SELECT ON public.watchlists TO anon, authenticated;

-- ---------------------------------------------------------------- functions
-- public.check_pipeline_health
CREATE OR REPLACE FUNCTION public.check_pipeline_health()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_issues int := 0;
  r record;
  v_webhook text;
  v_payload jsonb;
begin
  for r in
    select dataset, label, latest_date, trading_days_behind
    from public.data_freshness_v
    where is_critical and is_stale
  loop
    insert into public.pipeline_health(kind, target, severity, detail)
    values ('stale_data', r.dataset, 'error',
            format('%s stale: latest %s, %s trading day(s) behind',
                   r.label, coalesce(r.latest_date::text, '(none)'), r.trading_days_behind));
    v_issues := v_issues + 1;
  end loop;

  for r in
    with last_run as (
      select distinct on (job_name) job_name, status, started_at, error
      from public.job_runs
      where started_at > now() - interval '30 hours'
      order by job_name, started_at desc
    )
    select * from last_run where status = 'error'
  loop
    insert into public.pipeline_health(kind, target, severity, detail)
    values ('job_failure', r.job_name, 'error',
            format('last run %s errored: %s', r.started_at, left(coalesce(r.error, ''), 200)));
    v_issues := v_issues + 1;
  end loop;

  if v_issues > 0 then
    begin
      select value into v_webhook from public.app_config where key = 'alert_webhook_url';
      if v_webhook is not null and v_webhook <> '' then
        v_payload := jsonb_build_object(
          'source', 'market-metrics pipeline watchdog',
          'checked_at', now(),
          'issues', v_issues,
          'details', (select jsonb_agg(jsonb_build_object('kind', kind, 'target', target, 'detail', detail))
                      from public.pipeline_health
                      where checked_at > now() - interval '5 minutes'));
        perform net.http_post(
          url := v_webhook,
          headers := '{"Content-Type":"application/json"}'::jsonb,
          body := v_payload);
      end if;
    exception when others then
      raise log 'check_pipeline_health: webhook post failed: %', sqlerrm;
    end;
  end if;

  return v_issues;
end $function$;

-- public.classify_stage
CREATE OR REPLACE FUNCTION public.classify_stage(sma20_pct numeric, sma50_pct numeric, ema10_pct numeric DEFAULT NULL::numeric)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  e10 numeric := coalesce(ema10_pct, sma20_pct);
  s20 numeric := coalesce(sma20_pct, ema10_pct);
begin
  if sma50_pct is null then return '1A'; end if;
  if e10 is null or s20 is null then return '1A'; end if;

  -- Stage 2 -- price ABOVE all moving averages = advancing uptrend (never "basing")
  if e10 > 0 and s20 > 0 and sma50_pct > 0 then
    if sma50_pct >= 7 then return '2C';
    elsif sma50_pct >= 6 then return '2B';
    else return '2A';            -- early advance (0-6% over SMA50); was wrongly '1B'
    end if;
  end if;

  -- Stage 4 -- price BELOW all moving averages = decline (never "topping")
  if e10 < 0 and s20 < 0 and sma50_pct < 0 then
    if sma50_pct <= -7 then return '4C';
    elsif sma50_pct <= -6 then return '4B';
    else return '4A';            -- early decline (0 to -6% under SMA50); was wrongly '3B'
    end if;
  end if;

  -- Stage 3 -- topping: still above SMA50 but momentum rolling over
  if sma50_pct > 0 and e10 < 0 then
    if s20 < 0 then return '3B'; else return '3A'; end if;
  end if;

  -- Stage 1 -- basing: below SMA50
  if sma50_pct < 0 then
    if e10 > 0 and s20 > 0 then return '1B'; else return '1A'; end if;
  end if;

  return '1A';
end;
$function$;

-- public.get_secret
CREATE OR REPLACE FUNCTION public.get_secret(p_name text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select decrypted_secret from vault.decrypted_secrets where name = p_name
$function$;

-- public.last_expected_trading_date
CREATE OR REPLACE FUNCTION public.last_expected_trading_date()
 RETURNS date
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with d as (select (now() at time zone 'America/New_York')::date as today)
  select case extract(isodow from today)
           when 6 then today - 1
           when 7 then today - 2
           else today
         end
  from d
$function$;

-- public.macro_classify_signal
CREATE OR REPLACE FUNCTION public.macro_classify_signal(metric_id text, val numeric, trend text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
  if val is null then return 'neutral'; end if;
  if metric_id = 'fed_funds' then
    return case when val > 4.0 then 'tightening' else 'neutral' end;
  end if;
  if metric_id = 'dgs10' then
    return case when val > 4.5 then 'hawkish' when val < 3.5 then 'dovish' else 'neutral' end;
  end if;
  if metric_id in ('cpi_yoy', 'core_cpi_yoy', 'ppi_yoy', 'pce_yoy', 'core_pce_yoy') then
    return case when val > 3.0 then 'hawkish' when val < 2.0 then 'dovish' else 'neutral' end;
  end if;
  if metric_id = 'unemployment' then
    return case when val > 5.0 then 'dovish' when val < 4.0 then 'hawkish' else 'neutral' end;
  end if;
  if metric_id = 'nfp' then
    return case when val < 0 then 'dovish' when val > 200 then 'hawkish' else 'neutral' end;
  end if;
  if metric_id = 'brent' then
    return case when val > 90 then 'hawkish' else 'neutral' end;
  end if;
  if metric_id = 'sp500' then
    return case when trend = 'down' then 'dovish' when trend = 'up' then 'hawkish' else 'neutral' end;
  end if;
  if metric_id = 'sentiment' then
    return case when val < 70 then 'dovish' when val > 95 then 'hawkish' else 'neutral' end;
  end if;
  -- 'deficit' is a fiscal level, not a monetary stance. Classifying it as
  -- 'tightening' was backwards (a federal deficit is fiscal expansion). Neutral.
  if metric_id = 'deficit' then
    return 'neutral';
  end if;
  return 'neutral';
end;
$function$;

-- public.rls_auto_enable
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- public.trading_days_between
CREATE OR REPLACE FUNCTION public.trading_days_between(d_from date, d_to date)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select coalesce(count(*), 0)::int
  from generate_series(d_from + 1, d_to, interval '1 day') g
  where extract(isodow from g) < 6
$function$;

REVOKE EXECUTE ON FUNCTION public.check_pipeline_health() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_pipeline_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.classify_stage(numeric, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.last_expected_trading_date() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.macro_classify_signal(text, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trading_days_between(date, date) TO anon, authenticated;

-- ---------------------------------------------------------------- views (dependency order)
-- _phase5b_liquid_universe
CREATE OR REPLACE VIEW public._phase5b_liquid_universe WITH (security_invoker = off) AS
 SELECT ticker,
    snapshot_date,
    index_str,
    in_sp500,
    in_nq100,
    in_djia,
    sector,
    industry,
    price,
    market_cap_millions,
    volume,
    avg_volume,
    perf_day,
    perf_week,
    perf_month,
    perf_quarter,
    perf_year,
    sma20_pct,
    sma50_pct,
    sma200_pct,
    high52w_pct,
    low52w_pct,
    fetched_at,
    in_rut,
    cap_1b_plus,
    perf_open,
    perf_half,
    perf_ytd,
    sma10_pct,
    ema10_pct,
    new_20day_high,
    new_20day_low,
    up_4pct,
    down_4pct,
    atr_value,
    atr_pct,
    rsi14,
    volatility_w,
    volatility_m
   FROM equities_snapshot
  WHERE snapshot_date = (( SELECT max(equities_snapshot_1.snapshot_date) AS max
           FROM equities_snapshot equities_snapshot_1)) AND cap_1b_plus AND avg_volume >= 100 AND price >= 1::numeric AND industry IS NOT NULL AND TRIM(BOTH FROM industry) <> ''::text;

-- _phase5b_industry_ranks
CREATE OR REPLACE VIEW public._phase5b_industry_ranks WITH (security_invoker = off) AS
 WITH grp AS (
         SELECT _phase5b_liquid_universe.industry,
            _phase5b_liquid_universe.sector,
            avg(_phase5b_liquid_universe.perf_week) FILTER (WHERE _phase5b_liquid_universe.perf_week IS NOT NULL) AS week_avg,
            avg(_phase5b_liquid_universe.perf_month) FILTER (WHERE _phase5b_liquid_universe.perf_month IS NOT NULL) AS month_avg,
            count(*) AS stock_count
           FROM _phase5b_liquid_universe
          GROUP BY _phase5b_liquid_universe.industry, _phase5b_liquid_universe.sector
         HAVING count(*) >= 3
        ), ranked AS (
         SELECT grp.industry,
            grp.sector,
            grp.week_avg,
            grp.month_avg,
            grp.stock_count,
            percent_rank() OVER (ORDER BY grp.week_avg NULLS FIRST) AS week_pct,
            percent_rank() OVER (ORDER BY grp.month_avg NULLS FIRST) AS month_pct
           FROM grp
        )
 SELECT industry,
    sector,
    week_avg,
    month_avg,
    stock_count,
    week_pct,
    month_pct,
    week_pct >= 0.80::double precision AS in_top_week,
    month_pct >= 0.80::double precision AS in_top_month,
    week_pct >= 0.80::double precision AND month_pct >= 0.80::double precision AS top_both
   FROM ranked;

-- equity_ma10_latest_v
CREATE OR REPLACE VIEW public.equity_ma10_latest_v AS
 WITH hist AS (
         SELECT equities_snapshot.ticker,
            equities_snapshot.snapshot_date,
            equities_snapshot.price,
            row_number() OVER (PARTITION BY equities_snapshot.ticker ORDER BY equities_snapshot.snapshot_date DESC) AS rn
           FROM equities_snapshot
          WHERE equities_snapshot.price IS NOT NULL AND equities_snapshot.snapshot_date >= ((( SELECT max(equities_snapshot_1.snapshot_date) AS max
                   FROM equities_snapshot equities_snapshot_1)) - 21)
        ), agg AS (
         SELECT hist.ticker,
            max(hist.price) FILTER (WHERE hist.rn = 1) AS price,
            avg(hist.price) FILTER (WHERE hist.rn <= 10) AS sma10,
            sum(hist.price * power(1::numeric - 2.0 / 11.0, (hist.rn - 1)::numeric)) FILTER (WHERE hist.rn <= 10) / NULLIF(sum(power(1::numeric - 2.0 / 11.0, (hist.rn - 1)::numeric)) FILTER (WHERE hist.rn <= 10), 0::numeric) AS ema10,
            count(*) FILTER (WHERE hist.rn <= 10) AS n10
           FROM hist
          GROUP BY hist.ticker
        )
 SELECT ticker,
    price,
    round(sma10, 4) AS sma10,
    round(ema10, 4) AS ema10,
    round((price - sma10) / NULLIF(sma10, 0::numeric) * 100::numeric, 2) AS sma10_pct,
    round((price - ema10) / NULLIF(ema10, 0::numeric) * 100::numeric, 2) AS ema10_pct
   FROM agg
  WHERE n10 >= 10;
GRANT SELECT ON public.equity_ma10_latest_v TO anon, authenticated;

-- key_metrics_v
CREATE OR REPLACE VIEW public.key_metrics_v WITH (security_invoker = off) AS
 WITH eq AS (
         SELECT equities_snapshot.ticker,
            equities_snapshot.snapshot_date,
            equities_snapshot.index_str,
            equities_snapshot.in_sp500,
            equities_snapshot.in_nq100,
            equities_snapshot.in_djia,
            equities_snapshot.sector,
            equities_snapshot.industry,
            equities_snapshot.price,
            equities_snapshot.market_cap_millions,
            equities_snapshot.volume,
            equities_snapshot.avg_volume,
            equities_snapshot.perf_day,
            equities_snapshot.perf_week,
            equities_snapshot.perf_month,
            equities_snapshot.perf_quarter,
            equities_snapshot.perf_year,
            equities_snapshot.sma20_pct,
            equities_snapshot.sma50_pct,
            equities_snapshot.sma200_pct,
            equities_snapshot.high52w_pct,
            equities_snapshot.low52w_pct,
            equities_snapshot.fetched_at,
            equities_snapshot.in_rut,
            equities_snapshot.cap_1b_plus,
            equities_snapshot.perf_open,
            equities_snapshot.perf_half,
            equities_snapshot.perf_ytd,
            m10.sma10_pct,
            m10.ema10_pct,
            equities_snapshot.new_20day_high,
            equities_snapshot.new_20day_low,
            equities_snapshot.up_4pct,
            equities_snapshot.down_4pct,
            equities_snapshot.atr_value,
            equities_snapshot.atr_pct,
            equities_snapshot.rsi14,
            equities_snapshot.volatility_w,
            equities_snapshot.volatility_m
           FROM equities_snapshot
             LEFT JOIN equity_ma10_latest_v m10 ON m10.ticker = equities_snapshot.ticker
          WHERE equities_snapshot.snapshot_date = (( SELECT max(equities_snapshot_1.snapshot_date) AS max
                   FROM equities_snapshot equities_snapshot_1))
        ), u_nq100 AS (
         SELECT eq.ticker,
            eq.snapshot_date,
            eq.index_str,
            eq.in_sp500,
            eq.in_nq100,
            eq.in_djia,
            eq.sector,
            eq.industry,
            eq.price,
            eq.market_cap_millions,
            eq.volume,
            eq.avg_volume,
            eq.perf_day,
            eq.perf_week,
            eq.perf_month,
            eq.perf_quarter,
            eq.perf_year,
            eq.sma20_pct,
            eq.sma50_pct,
            eq.sma200_pct,
            eq.high52w_pct,
            eq.low52w_pct,
            eq.fetched_at,
            eq.in_rut,
            eq.cap_1b_plus,
            eq.perf_open,
            eq.perf_half,
            eq.perf_ytd,
            eq.sma10_pct,
            eq.ema10_pct,
            eq.new_20day_high,
            eq.new_20day_low,
            eq.up_4pct,
            eq.down_4pct,
            eq.atr_value,
            eq.atr_pct,
            eq.rsi14,
            eq.volatility_w,
            eq.volatility_m
           FROM eq
          WHERE eq.in_nq100
        ), u_sp500 AS (
         SELECT eq.ticker,
            eq.snapshot_date,
            eq.index_str,
            eq.in_sp500,
            eq.in_nq100,
            eq.in_djia,
            eq.sector,
            eq.industry,
            eq.price,
            eq.market_cap_millions,
            eq.volume,
            eq.avg_volume,
            eq.perf_day,
            eq.perf_week,
            eq.perf_month,
            eq.perf_quarter,
            eq.perf_year,
            eq.sma20_pct,
            eq.sma50_pct,
            eq.sma200_pct,
            eq.high52w_pct,
            eq.low52w_pct,
            eq.fetched_at,
            eq.in_rut,
            eq.cap_1b_plus,
            eq.perf_open,
            eq.perf_half,
            eq.perf_ytd,
            eq.sma10_pct,
            eq.ema10_pct,
            eq.new_20day_high,
            eq.new_20day_low,
            eq.up_4pct,
            eq.down_4pct,
            eq.atr_value,
            eq.atr_pct,
            eq.rsi14,
            eq.volatility_w,
            eq.volatility_m
           FROM eq
          WHERE eq.in_sp500
        ), u_djia AS (
         SELECT eq.ticker,
            eq.snapshot_date,
            eq.index_str,
            eq.in_sp500,
            eq.in_nq100,
            eq.in_djia,
            eq.sector,
            eq.industry,
            eq.price,
            eq.market_cap_millions,
            eq.volume,
            eq.avg_volume,
            eq.perf_day,
            eq.perf_week,
            eq.perf_month,
            eq.perf_quarter,
            eq.perf_year,
            eq.sma20_pct,
            eq.sma50_pct,
            eq.sma200_pct,
            eq.high52w_pct,
            eq.low52w_pct,
            eq.fetched_at,
            eq.in_rut,
            eq.cap_1b_plus,
            eq.perf_open,
            eq.perf_half,
            eq.perf_ytd,
            eq.sma10_pct,
            eq.ema10_pct,
            eq.new_20day_high,
            eq.new_20day_low,
            eq.up_4pct,
            eq.down_4pct,
            eq.atr_value,
            eq.atr_pct,
            eq.rsi14,
            eq.volatility_w,
            eq.volatility_m
           FROM eq
          WHERE eq.in_djia
        ), u_rut AS (
         SELECT eq.ticker,
            eq.snapshot_date,
            eq.index_str,
            eq.in_sp500,
            eq.in_nq100,
            eq.in_djia,
            eq.sector,
            eq.industry,
            eq.price,
            eq.market_cap_millions,
            eq.volume,
            eq.avg_volume,
            eq.perf_day,
            eq.perf_week,
            eq.perf_month,
            eq.perf_quarter,
            eq.perf_year,
            eq.sma20_pct,
            eq.sma50_pct,
            eq.sma200_pct,
            eq.high52w_pct,
            eq.low52w_pct,
            eq.fetched_at,
            eq.in_rut,
            eq.cap_1b_plus,
            eq.perf_open,
            eq.perf_half,
            eq.perf_ytd,
            eq.sma10_pct,
            eq.ema10_pct,
            eq.new_20day_high,
            eq.new_20day_low,
            eq.up_4pct,
            eq.down_4pct,
            eq.atr_value,
            eq.atr_pct,
            eq.rsi14,
            eq.volatility_w,
            eq.volatility_m
           FROM eq
          WHERE eq.in_rut
        ), u_cap1b AS (
         SELECT eq.ticker,
            eq.snapshot_date,
            eq.index_str,
            eq.in_sp500,
            eq.in_nq100,
            eq.in_djia,
            eq.sector,
            eq.industry,
            eq.price,
            eq.market_cap_millions,
            eq.volume,
            eq.avg_volume,
            eq.perf_day,
            eq.perf_week,
            eq.perf_month,
            eq.perf_quarter,
            eq.perf_year,
            eq.sma20_pct,
            eq.sma50_pct,
            eq.sma200_pct,
            eq.high52w_pct,
            eq.low52w_pct,
            eq.fetched_at,
            eq.in_rut,
            eq.cap_1b_plus,
            eq.perf_open,
            eq.perf_half,
            eq.perf_ytd,
            eq.sma10_pct,
            eq.ema10_pct,
            eq.new_20day_high,
            eq.new_20day_low,
            eq.up_4pct,
            eq.down_4pct,
            eq.atr_value,
            eq.atr_pct,
            eq.rsi14,
            eq.volatility_w,
            eq.volatility_m
           FROM eq
          WHERE eq.cap_1b_plus
        ), unioned AS (
         SELECT 'NQ100'::text AS universe_id,
            1 AS universe_order,
            u_nq100.ticker,
            u_nq100.snapshot_date,
            u_nq100.index_str,
            u_nq100.in_sp500,
            u_nq100.in_nq100,
            u_nq100.in_djia,
            u_nq100.sector,
            u_nq100.industry,
            u_nq100.price,
            u_nq100.market_cap_millions,
            u_nq100.volume,
            u_nq100.avg_volume,
            u_nq100.perf_day,
            u_nq100.perf_week,
            u_nq100.perf_month,
            u_nq100.perf_quarter,
            u_nq100.perf_year,
            u_nq100.sma20_pct,
            u_nq100.sma50_pct,
            u_nq100.sma200_pct,
            u_nq100.high52w_pct,
            u_nq100.low52w_pct,
            u_nq100.fetched_at,
            u_nq100.in_rut,
            u_nq100.cap_1b_plus,
            u_nq100.perf_open,
            u_nq100.perf_half,
            u_nq100.perf_ytd,
            u_nq100.sma10_pct,
            u_nq100.ema10_pct,
            u_nq100.new_20day_high,
            u_nq100.new_20day_low,
            u_nq100.up_4pct,
            u_nq100.down_4pct,
            u_nq100.atr_value,
            u_nq100.atr_pct,
            u_nq100.rsi14,
            u_nq100.volatility_w,
            u_nq100.volatility_m
           FROM u_nq100
        UNION ALL
         SELECT 'SPY500'::text AS text,
            2,
            u_sp500.ticker,
            u_sp500.snapshot_date,
            u_sp500.index_str,
            u_sp500.in_sp500,
            u_sp500.in_nq100,
            u_sp500.in_djia,
            u_sp500.sector,
            u_sp500.industry,
            u_sp500.price,
            u_sp500.market_cap_millions,
            u_sp500.volume,
            u_sp500.avg_volume,
            u_sp500.perf_day,
            u_sp500.perf_week,
            u_sp500.perf_month,
            u_sp500.perf_quarter,
            u_sp500.perf_year,
            u_sp500.sma20_pct,
            u_sp500.sma50_pct,
            u_sp500.sma200_pct,
            u_sp500.high52w_pct,
            u_sp500.low52w_pct,
            u_sp500.fetched_at,
            u_sp500.in_rut,
            u_sp500.cap_1b_plus,
            u_sp500.perf_open,
            u_sp500.perf_half,
            u_sp500.perf_ytd,
            u_sp500.sma10_pct,
            u_sp500.ema10_pct,
            u_sp500.new_20day_high,
            u_sp500.new_20day_low,
            u_sp500.up_4pct,
            u_sp500.down_4pct,
            u_sp500.atr_value,
            u_sp500.atr_pct,
            u_sp500.rsi14,
            u_sp500.volatility_w,
            u_sp500.volatility_m
           FROM u_sp500
        UNION ALL
         SELECT 'DJIA'::text AS text,
            3,
            u_djia.ticker,
            u_djia.snapshot_date,
            u_djia.index_str,
            u_djia.in_sp500,
            u_djia.in_nq100,
            u_djia.in_djia,
            u_djia.sector,
            u_djia.industry,
            u_djia.price,
            u_djia.market_cap_millions,
            u_djia.volume,
            u_djia.avg_volume,
            u_djia.perf_day,
            u_djia.perf_week,
            u_djia.perf_month,
            u_djia.perf_quarter,
            u_djia.perf_year,
            u_djia.sma20_pct,
            u_djia.sma50_pct,
            u_djia.sma200_pct,
            u_djia.high52w_pct,
            u_djia.low52w_pct,
            u_djia.fetched_at,
            u_djia.in_rut,
            u_djia.cap_1b_plus,
            u_djia.perf_open,
            u_djia.perf_half,
            u_djia.perf_ytd,
            u_djia.sma10_pct,
            u_djia.ema10_pct,
            u_djia.new_20day_high,
            u_djia.new_20day_low,
            u_djia.up_4pct,
            u_djia.down_4pct,
            u_djia.atr_value,
            u_djia.atr_pct,
            u_djia.rsi14,
            u_djia.volatility_w,
            u_djia.volatility_m
           FROM u_djia
        UNION ALL
         SELECT 'RUS2000'::text AS text,
            4,
            u_rut.ticker,
            u_rut.snapshot_date,
            u_rut.index_str,
            u_rut.in_sp500,
            u_rut.in_nq100,
            u_rut.in_djia,
            u_rut.sector,
            u_rut.industry,
            u_rut.price,
            u_rut.market_cap_millions,
            u_rut.volume,
            u_rut.avg_volume,
            u_rut.perf_day,
            u_rut.perf_week,
            u_rut.perf_month,
            u_rut.perf_quarter,
            u_rut.perf_year,
            u_rut.sma20_pct,
            u_rut.sma50_pct,
            u_rut.sma200_pct,
            u_rut.high52w_pct,
            u_rut.low52w_pct,
            u_rut.fetched_at,
            u_rut.in_rut,
            u_rut.cap_1b_plus,
            u_rut.perf_open,
            u_rut.perf_half,
            u_rut.perf_ytd,
            u_rut.sma10_pct,
            u_rut.ema10_pct,
            u_rut.new_20day_high,
            u_rut.new_20day_low,
            u_rut.up_4pct,
            u_rut.down_4pct,
            u_rut.atr_value,
            u_rut.atr_pct,
            u_rut.rsi14,
            u_rut.volatility_w,
            u_rut.volatility_m
           FROM u_rut
        UNION ALL
         SELECT '$1B+'::text AS text,
            5,
            u_cap1b.ticker,
            u_cap1b.snapshot_date,
            u_cap1b.index_str,
            u_cap1b.in_sp500,
            u_cap1b.in_nq100,
            u_cap1b.in_djia,
            u_cap1b.sector,
            u_cap1b.industry,
            u_cap1b.price,
            u_cap1b.market_cap_millions,
            u_cap1b.volume,
            u_cap1b.avg_volume,
            u_cap1b.perf_day,
            u_cap1b.perf_week,
            u_cap1b.perf_month,
            u_cap1b.perf_quarter,
            u_cap1b.perf_year,
            u_cap1b.sma20_pct,
            u_cap1b.sma50_pct,
            u_cap1b.sma200_pct,
            u_cap1b.high52w_pct,
            u_cap1b.low52w_pct,
            u_cap1b.fetched_at,
            u_cap1b.in_rut,
            u_cap1b.cap_1b_plus,
            u_cap1b.perf_open,
            u_cap1b.perf_half,
            u_cap1b.perf_ytd,
            u_cap1b.sma10_pct,
            u_cap1b.ema10_pct,
            u_cap1b.new_20day_high,
            u_cap1b.new_20day_low,
            u_cap1b.up_4pct,
            u_cap1b.down_4pct,
            u_cap1b.atr_value,
            u_cap1b.atr_pct,
            u_cap1b.rsi14,
            u_cap1b.volatility_w,
            u_cap1b.volatility_m
           FROM u_cap1b
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
            count(*) FILTER (WHERE unioned.low52w_pct <= 0::numeric) AS nl20_above
           FROM unioned
          GROUP BY unioned.universe_id, unioned.universe_order
        ), metric_defs(metric_id, metric_label, display_order) AS (
         VALUES ('day_chg'::text,'Day Chg'::text,1), ('open_chg'::text,'Open Chg'::text,2), ('week'::text,'Week'::text,3), ('month'::text,'Month'::text,4), ('qtr'::text,'Qtr'::text,5), ('half'::text,'Half Year'::text,6), ('year'::text,'Year'::text,7), ('sma10'::text,'Price to SMA10'::text,8), ('sma20'::text,'Price to SMA20'::text,9), ('sma50'::text,'Price to SMA50'::text,10), ('sma200'::text,'Price to SMA200'::text,11), ('ema10_sma20'::text,'EMA10>SMA20'::text,12), ('sma20_50'::text,'SMA20>SMA50'::text,13), ('sma50_200'::text,'SMA50>SMA200'::text,14), ('sma_stack'::text,'SMA20>SMA50>SMA200'::text,15), ('up4'::text,'4% Up vs 4% Down'::text,16), ('nh20'::text,'New 52-Week Highs'::text,17), ('nl20'::text,'New 52-Week Lows'::text,18), ('stocks'::text,'Stocks'::text,19)
        )
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
            WHEN 'nh20'::text THEN NULL::bigint
            WHEN 'nl20'::text THEN NULL::bigint
            WHEN 'stocks'::text THEN NULL::bigint
            ELSE NULL::bigint
        END AS below_count,
        CASE m.metric_id
            WHEN 'stocks'::text THEN NULL::numeric
            ELSE
            CASE
                WHEN a.total = 0 THEN 0::numeric
                ELSE round(100.0 *
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
                    ELSE NULL::bigint
                END::numeric / a.total::numeric, 1)
            END
        END AS pct
   FROM agg a
     CROSS JOIN metric_defs m
  ORDER BY a.universe_order, m.display_order;
GRANT SELECT ON public.key_metrics_v TO anon, authenticated;

-- breadth_bars_v
CREATE OR REPLACE VIEW public.breadth_bars_v WITH (security_invoker = off) AS
 SELECT universe_id,
    universe_order,
    metric_id,
    metric_label,
    display_order,
    above_count,
    below_count,
    pct
   FROM key_metrics_v
  WHERE metric_id = ANY (ARRAY['day_chg'::text, 'week'::text, 'month'::text, 'sma20'::text, 'sma50'::text, 'sma200'::text])
  ORDER BY universe_order, display_order;
GRANT SELECT ON public.breadth_bars_v TO anon, authenticated;

-- breadth_metrics_v
CREATE OR REPLACE VIEW public.breadth_metrics_v WITH (security_invoker = on) AS
 WITH latest AS (
         SELECT max(equities_snapshot.snapshot_date) AS d
           FROM equities_snapshot
        ), sp500 AS (
         SELECT 'sp500'::text AS universe_id,
            'SPY 500'::text AS universe_label,
            e.ticker,
            e.snapshot_date,
            e.index_str,
            e.in_sp500,
            e.in_nq100,
            e.in_djia,
            e.sector,
            e.industry,
            e.price,
            e.market_cap_millions,
            e.volume,
            e.avg_volume,
            e.perf_day,
            e.perf_week,
            e.perf_month,
            e.perf_quarter,
            e.perf_year,
            e.sma20_pct,
            e.sma50_pct,
            e.sma200_pct,
            e.high52w_pct,
            e.low52w_pct,
            e.fetched_at
           FROM equities_snapshot e,
            latest
          WHERE e.snapshot_date = latest.d AND e.in_sp500
        ), cap1b AS (
         SELECT 'cap1b_plus'::text AS universe_id,
            '$1B+'::text AS universe_label,
            e.ticker,
            e.snapshot_date,
            e.index_str,
            e.in_sp500,
            e.in_nq100,
            e.in_djia,
            e.sector,
            e.industry,
            e.price,
            e.market_cap_millions,
            e.volume,
            e.avg_volume,
            e.perf_day,
            e.perf_week,
            e.perf_month,
            e.perf_quarter,
            e.perf_year,
            e.sma20_pct,
            e.sma50_pct,
            e.sma200_pct,
            e.high52w_pct,
            e.low52w_pct,
            e.fetched_at
           FROM equities_snapshot e,
            latest
          WHERE e.snapshot_date = latest.d AND e.market_cap_millions >= 1000::numeric
        ), combined AS (
         SELECT sp500.universe_id,
            sp500.universe_label,
            sp500.ticker,
            sp500.snapshot_date,
            sp500.index_str,
            sp500.in_sp500,
            sp500.in_nq100,
            sp500.in_djia,
            sp500.sector,
            sp500.industry,
            sp500.price,
            sp500.market_cap_millions,
            sp500.volume,
            sp500.avg_volume,
            sp500.perf_day,
            sp500.perf_week,
            sp500.perf_month,
            sp500.perf_quarter,
            sp500.perf_year,
            sp500.sma20_pct,
            sp500.sma50_pct,
            sp500.sma200_pct,
            sp500.high52w_pct,
            sp500.low52w_pct,
            sp500.fetched_at
           FROM sp500
        UNION ALL
         SELECT cap1b.universe_id,
            cap1b.universe_label,
            cap1b.ticker,
            cap1b.snapshot_date,
            cap1b.index_str,
            cap1b.in_sp500,
            cap1b.in_nq100,
            cap1b.in_djia,
            cap1b.sector,
            cap1b.industry,
            cap1b.price,
            cap1b.market_cap_millions,
            cap1b.volume,
            cap1b.avg_volume,
            cap1b.perf_day,
            cap1b.perf_week,
            cap1b.perf_month,
            cap1b.perf_quarter,
            cap1b.perf_year,
            cap1b.sma20_pct,
            cap1b.sma50_pct,
            cap1b.sma200_pct,
            cap1b.high52w_pct,
            cap1b.low52w_pct,
            cap1b.fetched_at
           FROM cap1b
        )
 SELECT universe_id,
    universe_label,
    max(snapshot_date) AS snapshot_date,
    count(*) AS total_count,
    round(100.0 * count(*) FILTER (WHERE sma20_pct > 0::numeric)::numeric / NULLIF(count(*) FILTER (WHERE sma20_pct IS NOT NULL), 0)::numeric, 1) AS pct_above_sma20,
    round(100.0 * count(*) FILTER (WHERE sma50_pct > 0::numeric)::numeric / NULLIF(count(*) FILTER (WHERE sma50_pct IS NOT NULL), 0)::numeric, 1) AS pct_above_sma50,
    round(100.0 * count(*) FILTER (WHERE sma200_pct > 0::numeric)::numeric / NULLIF(count(*) FILTER (WHERE sma200_pct IS NOT NULL), 0)::numeric, 1) AS pct_above_sma200,
    round(100.0 * count(*) FILTER (WHERE sma20_pct > 0::numeric AND sma50_pct > 0::numeric AND sma200_pct > 0::numeric)::numeric / NULLIF(count(*) FILTER (WHERE sma20_pct IS NOT NULL AND sma50_pct IS NOT NULL AND sma200_pct IS NOT NULL), 0)::numeric, 1) AS pct_aligned_bullish,
    count(*) FILTER (WHERE high52w_pct >= 0::numeric) AS new_52w_highs,
    count(*) FILTER (WHERE low52w_pct <= 0::numeric) AS new_52w_lows,
    count(*) FILTER (WHERE perf_day >= 4::numeric) AS up_4pct,
    count(*) FILTER (WHERE perf_day <= '-4'::integer::numeric) AS down_4pct,
    count(*) FILTER (WHERE perf_day > 0::numeric) AS advancers,
    count(*) FILTER (WHERE perf_day < 0::numeric) AS decliners,
    count(*) FILTER (WHERE perf_day = 0::numeric) AS unchanged
   FROM combined
  GROUP BY universe_id, universe_label
  ORDER BY universe_id;
GRANT SELECT ON public.breadth_metrics_v TO anon, authenticated;

-- data_freshness_v
CREATE OR REPLACE VIEW public.data_freshness_v WITH (security_invoker = on) AS
 WITH expected AS (
         SELECT last_expected_trading_date() AS ed
        ), ds AS (
         SELECT 'equities_snapshot'::text AS dataset,
            'Universe / breadth (FinViz)'::text AS label,
            ( SELECT max(equities_snapshot.snapshot_date) AS max
                   FROM equities_snapshot) AS latest_date,
            1 AS tol,
            true AS crit
        UNION ALL
         SELECT 'scanner_results'::text,
            'Super Scanners'::text,
            ( SELECT max(scanner_results.snapshot_date) AS max
                   FROM scanner_results) AS max,
            1,
            true
        UNION ALL
         SELECT 'sector_etf_snapshot'::text,
            'Sector SPDRs'::text,
            ( SELECT max(sector_etf_snapshot.snapshot_date) AS max
                   FROM sector_etf_snapshot) AS max,
            1,
            true
        UNION ALL
         SELECT 'breadth_daily_history'::text,
            'Breadth history'::text,
            ( SELECT max(breadth_daily_history.snapshot_date) AS max
                   FROM breadth_daily_history) AS max,
            1,
            true
        UNION ALL
         SELECT 'should_i_trade_history'::text,
            'Should-I-Trade'::text,
            ( SELECT max(should_i_trade_history.snapshot_date) AS max
                   FROM should_i_trade_history) AS max,
            1,
            true
        UNION ALL
         SELECT 'stockbee_breadth_raw'::text,
            'StockBee breadth'::text,
            ( SELECT max(stockbee_breadth_raw.observation_date) AS max
                   FROM stockbee_breadth_raw) AS max,
            2,
            true
        UNION ALL
         SELECT 'stockbee_momentum50'::text,
            'StockBee Momentum50'::text,
            ( SELECT max(stockbee_momentum50.observation_date) AS max
                   FROM stockbee_momentum50) AS max,
            2,
            false
        UNION ALL
         SELECT 'vix_history'::text,
            'VIX / VVIX'::text,
            ( SELECT max(vix_history.observation_date) AS max
                   FROM vix_history) AS max,
            1,
            true
        UNION ALL
         SELECT 'index_etf_quotes'::text,
            'SPY/QQQ trend'::text,
            ( SELECT max(index_etf_quotes.observation_date) AS max
                   FROM index_etf_quotes) AS max,
            1,
            true
        UNION ALL
         SELECT 'macro_observations'::text,
            'Macro (FRED)'::text,
            ( SELECT max(macro_observations.observation_date) AS max
                   FROM macro_observations) AS max,
            5,
            false
        )
 SELECT ds.dataset,
    ds.label,
    ds.latest_date,
    e.ed AS expected_date,
    trading_days_between(ds.latest_date, e.ed) AS trading_days_behind,
    ds.latest_date IS NULL OR trading_days_between(ds.latest_date, e.ed) > ds.tol AS is_stale,
    ds.crit AS is_critical
   FROM ds
     CROSS JOIN expected e;
GRANT SELECT ON public.data_freshness_v TO anon, authenticated;

-- earnings_this_week_v
CREATE OR REPLACE VIEW public.earnings_this_week_v WITH (security_invoker = on) AS
 WITH eq AS (
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
    q.avg_volume,
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
   FROM earnings_calendar e
     LEFT JOIN eq q ON q.ticker = e.ticker
  WHERE e.earnings_date >= (now() AT TIME ZONE 'America/New_York'::text)::date AND e.earnings_date < ((now() AT TIME ZONE 'America/New_York'::text)::date + 7)
  ORDER BY e.earnings_date, (COALESCE(e.market_cap_millions, q.market_cap_millions)) DESC NULLS LAST;
GRANT SELECT ON public.earnings_this_week_v TO anon, authenticated;

-- earnings_yesterday_today_v
CREATE OR REPLACE VIEW public.earnings_yesterday_today_v WITH (security_invoker = on) AS
 WITH eq AS (
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
    q.avg_volume,
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
            WHEN e.earnings_date = (now() AT TIME ZONE 'America/New_York'::text)::date THEN 'today'::text
            WHEN e.earnings_date = ((now() AT TIME ZONE 'America/New_York'::text)::date - 1) THEN 'yesterday'::text
            ELSE 'other'::text
        END AS bucket
   FROM earnings_calendar e
     LEFT JOIN eq q ON q.ticker = e.ticker
  WHERE e.earnings_date = ANY (ARRAY[(now() AT TIME ZONE 'America/New_York'::text)::date - 1, (now() AT TIME ZONE 'America/New_York'::text)::date])
  ORDER BY e.earnings_date DESC, (COALESCE(e.market_cap_millions, q.market_cap_millions)) DESC NULLS LAST;
GRANT SELECT ON public.earnings_yesterday_today_v TO anon, authenticated;

-- intraday_movers_latest_v
CREATE OR REPLACE VIEW public.intraday_movers_latest_v WITH (security_invoker = on) AS
 WITH latest AS (
         SELECT intraday_movers.mover_type,
            max(intraday_movers.fetched_at) AS fetched_at
           FROM intraday_movers
          GROUP BY intraday_movers.mover_type
        )
 SELECT m.mover_type,
    m.rank,
    m.ticker,
    m.company,
    m.sector,
    m.price,
    m.change_pct,
    m.volume,
    m.rel_volume,
    m.extras,
    m.fetched_at
   FROM intraday_movers m
     JOIN latest l ON l.mover_type = m.mover_type AND l.fetched_at = m.fetched_at
  ORDER BY m.mover_type, m.rank;
GRANT SELECT ON public.intraday_movers_latest_v TO anon, authenticated;

-- intraday_in_play_v
CREATE OR REPLACE VIEW public.intraday_in_play_v WITH (security_invoker = on) AS
 SELECT rank,
    ticker,
    company,
    sector,
    price,
    change_pct,
    volume,
    rel_volume,
    extras,
    fetched_at
   FROM intraday_movers_latest_v
  WHERE mover_type = 'in_play'::text
  ORDER BY rank;
GRANT SELECT ON public.intraday_in_play_v TO anon, authenticated;

-- intraday_premarket_v
CREATE OR REPLACE VIEW public.intraday_premarket_v WITH (security_invoker = on) AS
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
  WHERE cnbc_premarket_raw.article_date >= (CURRENT_DATE - '1 day'::interval)
UNION ALL
 SELECT 'finviz_up'::text AS source,
    intraday_movers.rank,
    intraday_movers.ticker,
    intraday_movers.company,
    intraday_movers.change_pct,
    intraday_movers.price,
    intraday_movers.volume,
    intraday_movers.rel_volume,
    NULL::text AS article_url,
    NULL::text AS news,
    intraday_movers.fetched_at::date AS as_of_date,
    intraday_movers.fetched_at
   FROM intraday_movers
  WHERE intraday_movers.mover_type = 'premarket_up'::text AND intraday_movers.fetched_at = (( SELECT max(intraday_movers_1.fetched_at) AS max
           FROM intraday_movers intraday_movers_1
          WHERE intraday_movers_1.mover_type = ANY (ARRAY['premarket_up'::text, 'premarket_down'::text])))
UNION ALL
 SELECT 'finviz_down'::text AS source,
    intraday_movers.rank,
    intraday_movers.ticker,
    intraday_movers.company,
    intraday_movers.change_pct,
    intraday_movers.price,
    intraday_movers.volume,
    intraday_movers.rel_volume,
    NULL::text AS article_url,
    NULL::text AS news,
    intraday_movers.fetched_at::date AS as_of_date,
    intraday_movers.fetched_at
   FROM intraday_movers
  WHERE intraday_movers.mover_type = 'premarket_down'::text AND intraday_movers.fetched_at = (( SELECT max(intraday_movers_1.fetched_at) AS max
           FROM intraday_movers intraday_movers_1
          WHERE intraday_movers_1.mover_type = ANY (ARRAY['premarket_up'::text, 'premarket_down'::text])));
GRANT SELECT ON public.intraday_premarket_v TO anon, authenticated;

-- intraday_quotes_latest_v
CREATE OR REPLACE VIEW public.intraday_quotes_latest_v WITH (security_invoker = on) AS
 WITH latest_per_ticker AS (
         SELECT DISTINCT ON (intraday_quotes.ticker) intraday_quotes.ticker,
            intraday_quotes.display_label,
            intraday_quotes.price,
            intraday_quotes.change_pct,
            intraday_quotes.change_abs,
            intraday_quotes.prev_close,
            intraday_quotes.fetched_at
           FROM intraday_quotes
          ORDER BY intraday_quotes.ticker, intraday_quotes.fetched_at DESC
        )
 SELECT ticker,
    display_label,
    price,
    round(change_pct, 2) AS change_pct,
    round(change_abs, 2) AS change_abs,
    prev_close,
    fetched_at,
        CASE ticker
            WHEN 'SPY'::text THEN 1
            WHEN '^VIX'::text THEN 2
            WHEN 'QQQ'::text THEN 3
            WHEN 'DIA'::text THEN 4
            WHEN 'IWM'::text THEN 5
            WHEN 'GLD'::text THEN 6
            WHEN 'TLT'::text THEN 7
            WHEN 'NVDA'::text THEN 8
            WHEN 'TSLA'::text THEN 9
            WHEN 'MSTR'::text THEN 10
            ELSE 99
        END AS display_order
   FROM latest_per_ticker
  ORDER BY (
        CASE ticker
            WHEN 'SPY'::text THEN 1
            WHEN '^VIX'::text THEN 2
            WHEN 'QQQ'::text THEN 3
            WHEN 'DIA'::text THEN 4
            WHEN 'IWM'::text THEN 5
            WHEN 'GLD'::text THEN 6
            WHEN 'TLT'::text THEN 7
            WHEN 'NVDA'::text THEN 8
            WHEN 'TSLA'::text THEN 9
            WHEN 'MSTR'::text THEN 10
            ELSE 99
        END);
GRANT SELECT ON public.intraday_quotes_latest_v TO anon, authenticated;

-- intraday_top_gainers_v
CREATE OR REPLACE VIEW public.intraday_top_gainers_v WITH (security_invoker = on) AS
 SELECT rank,
    ticker,
    company,
    sector,
    price,
    change_pct,
    volume,
    rel_volume,
    extras,
    fetched_at
   FROM intraday_movers_latest_v
  WHERE mover_type = 'gainer'::text
  ORDER BY rank;
GRANT SELECT ON public.intraday_top_gainers_v TO anon, authenticated;

-- intraday_top_losers_v
CREATE OR REPLACE VIEW public.intraday_top_losers_v WITH (security_invoker = on) AS
 SELECT rank,
    ticker,
    company,
    sector,
    price,
    change_pct,
    volume,
    rel_volume,
    extras,
    fetched_at
   FROM intraday_movers_latest_v
  WHERE mover_type = 'loser'::text
  ORDER BY rank;
GRANT SELECT ON public.intraday_top_losers_v TO anon, authenticated;

-- intraday_dashboard_v
CREATE OR REPLACE VIEW public.intraday_dashboard_v WITH (security_invoker = on) AS
 SELECT jsonb_build_object('ticker_tape', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('ticker', intraday_quotes_latest_v.ticker, 'display_label', intraday_quotes_latest_v.display_label, 'price', intraday_quotes_latest_v.price, 'change_pct', intraday_quotes_latest_v.change_pct, 'change_abs', intraday_quotes_latest_v.change_abs, 'fetched_at', intraday_quotes_latest_v.fetched_at) ORDER BY intraday_quotes_latest_v.display_order), '[]'::jsonb) AS "coalesce"
           FROM intraday_quotes_latest_v), 'top_gainers', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', t.rank, 'ticker', t.ticker, 'company', t.company, 'sector', t.sector, 'price', t.price, 'change_pct', t.change_pct, 'volume', t.volume, 'rel_volume', t.rel_volume) ORDER BY t.rank), '[]'::jsonb) AS "coalesce"
           FROM ( SELECT intraday_top_gainers_v.rank,
                    intraday_top_gainers_v.ticker,
                    intraday_top_gainers_v.company,
                    intraday_top_gainers_v.sector,
                    intraday_top_gainers_v.price,
                    intraday_top_gainers_v.change_pct,
                    intraday_top_gainers_v.volume,
                    intraday_top_gainers_v.rel_volume,
                    intraday_top_gainers_v.extras,
                    intraday_top_gainers_v.fetched_at
                   FROM intraday_top_gainers_v
                 LIMIT 30) t), 'top_losers', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', t.rank, 'ticker', t.ticker, 'company', t.company, 'sector', t.sector, 'price', t.price, 'change_pct', t.change_pct, 'volume', t.volume, 'rel_volume', t.rel_volume) ORDER BY t.rank), '[]'::jsonb) AS "coalesce"
           FROM ( SELECT intraday_top_losers_v.rank,
                    intraday_top_losers_v.ticker,
                    intraday_top_losers_v.company,
                    intraday_top_losers_v.sector,
                    intraday_top_losers_v.price,
                    intraday_top_losers_v.change_pct,
                    intraday_top_losers_v.volume,
                    intraday_top_losers_v.rel_volume,
                    intraday_top_losers_v.extras,
                    intraday_top_losers_v.fetched_at
                   FROM intraday_top_losers_v
                 LIMIT 30) t), 'in_play', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('rank', t.rank, 'ticker', t.ticker, 'company', t.company, 'sector', t.sector, 'price', t.price, 'change_pct', t.change_pct, 'volume', t.volume, 'rel_volume', t.rel_volume) ORDER BY t.rank), '[]'::jsonb) AS "coalesce"
           FROM ( SELECT intraday_in_play_v.rank,
                    intraday_in_play_v.ticker,
                    intraday_in_play_v.company,
                    intraday_in_play_v.sector,
                    intraday_in_play_v.price,
                    intraday_in_play_v.change_pct,
                    intraday_in_play_v.volume,
                    intraday_in_play_v.rel_volume,
                    intraday_in_play_v.extras,
                    intraday_in_play_v.fetched_at
                   FROM intraday_in_play_v
                 LIMIT 30) t), 'premarket', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('source', t.source, 'rank', t.rank, 'ticker', t.ticker, 'company', t.company, 'price', t.price, 'change_pct', t.change_pct, 'volume', t.volume, 'rel_volume', t.rel_volume, 'article_url', t.article_url, 'news', t.news)), '[]'::jsonb) AS "coalesce"
           FROM ( SELECT intraday_premarket_v.source,
                    intraday_premarket_v.rank,
                    intraday_premarket_v.ticker,
                    intraday_premarket_v.company,
                    intraday_premarket_v.change_pct,
                    intraday_premarket_v.price,
                    intraday_premarket_v.volume,
                    intraday_premarket_v.rel_volume,
                    intraday_premarket_v.article_url,
                    intraday_premarket_v.news,
                    intraday_premarket_v.as_of_date,
                    intraday_premarket_v.fetched_at
                   FROM intraday_premarket_v
                 LIMIT 40) t), 'earnings_yest_today', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('ticker', t.ticker, 'company', t.company, 'earnings_date', t.earnings_date, 'earnings_time', t.earnings_time, 'bucket', t.bucket, 'sector', t.sector, 'market_cap_millions', t.market_cap_millions, 'price', t.price, 'perf_day', t.perf_day, 'perf_week', t.perf_week, 'rsi14', t.rsi14, 'atr_pct', t.atr_pct)), '[]'::jsonb) AS "coalesce"
           FROM ( SELECT earnings_yesterday_today_v.ticker,
                    earnings_yesterday_today_v.earnings_date,
                    earnings_yesterday_today_v.earnings_time,
                    earnings_yesterday_today_v.company,
                    earnings_yesterday_today_v.sector,
                    earnings_yesterday_today_v.industry,
                    earnings_yesterday_today_v.market_cap_millions,
                    earnings_yesterday_today_v.price,
                    earnings_yesterday_today_v.volume,
                    earnings_yesterday_today_v.avg_volume,
                    earnings_yesterday_today_v.perf_day,
                    earnings_yesterday_today_v.perf_week,
                    earnings_yesterday_today_v.perf_month,
                    earnings_yesterday_today_v.perf_year,
                    earnings_yesterday_today_v.perf_ytd,
                    earnings_yesterday_today_v.sma20_pct,
                    earnings_yesterday_today_v.sma50_pct,
                    earnings_yesterday_today_v.sma200_pct,
                    earnings_yesterday_today_v.rsi14,
                    earnings_yesterday_today_v.atr_pct,
                    earnings_yesterday_today_v.high52w_pct,
                    earnings_yesterday_today_v.low52w_pct,
                    earnings_yesterday_today_v.fetched_at,
                    earnings_yesterday_today_v.bucket
                   FROM earnings_yesterday_today_v
                  WHERE earnings_yesterday_today_v.market_cap_millions IS NOT NULL
                  ORDER BY earnings_yesterday_today_v.market_cap_millions DESC NULLS LAST
                 LIMIT 30) t), 'generated_at', now()) AS dashboard;
GRANT SELECT ON public.intraday_dashboard_v TO anon, authenticated;

-- intraday_freshness_v
CREATE OR REPLACE VIEW public.intraday_freshness_v WITH (security_invoker = on) AS
 SELECT max(fetched_at) AS data_as_of,
    max(fetched_at) < (now() - '00:30:00'::interval) AS is_stale
   FROM intraday_movers;
GRANT SELECT ON public.intraday_freshness_v TO anon, authenticated;

-- leading_industries_v
CREATE OR REPLACE VIEW public.leading_industries_v WITH (security_invoker = off) AS
 WITH qualifying AS (
         SELECT _phase5b_industry_ranks.industry,
            _phase5b_industry_ranks.sector,
            _phase5b_industry_ranks.week_avg,
            _phase5b_industry_ranks.month_avg,
            _phase5b_industry_ranks.stock_count,
            _phase5b_industry_ranks.week_pct,
            _phase5b_industry_ranks.month_pct,
            _phase5b_industry_ranks.in_top_week,
            _phase5b_industry_ranks.in_top_month,
            _phase5b_industry_ranks.top_both
           FROM _phase5b_industry_ranks
          WHERE _phase5b_industry_ranks.in_top_week OR _phase5b_industry_ranks.in_top_month
        ), top4_tickers AS (
         SELECT ranked.industry,
            array_agg(ranked.ticker ORDER BY ranked.perf_week DESC NULLS LAST) FILTER (WHERE ranked.rn <= 4) AS top4
           FROM ( SELECT e.industry,
                    e.ticker,
                    e.perf_week,
                    row_number() OVER (PARTITION BY e.industry ORDER BY e.perf_week DESC NULLS LAST) AS rn
                   FROM _phase5b_liquid_universe e
                     JOIN qualifying q_1 ON q_1.industry = e.industry) ranked
          GROUP BY ranked.industry
        )
 SELECT q.industry,
    q.sector,
    q.week_avg,
    q.month_avg,
    q.stock_count,
    round(q.week_pct::numeric, 3) AS week_pct,
    round(q.month_pct::numeric, 3) AS month_pct,
    q.top_both,
    COALESCE(t.top4[1], 'â'::text) AS t1,
    COALESCE(t.top4[2], 'â'::text) AS t2,
    COALESCE(t.top4[3], 'â'::text) AS t3,
    COALESCE(t.top4[4], 'â'::text) AS t4
   FROM qualifying q
     LEFT JOIN top4_tickers t ON t.industry = q.industry
  ORDER BY q.week_avg DESC NULLS LAST;
GRANT SELECT ON public.leading_industries_v TO anon, authenticated;

-- macro_fiscal_v
CREATE OR REPLACE VIEW public.macro_fiscal_v WITH (security_invoker = on) AS
 WITH latest AS (
         SELECT DISTINCT ON (macro_observations.series_id) macro_observations.series_id,
            macro_observations.observation_date,
            macro_observations.value,
            lag(macro_observations.value, 1) OVER (PARTITION BY macro_observations.series_id ORDER BY macro_observations.observation_date) AS prev_value
           FROM macro_observations
          WHERE macro_observations.series_id = ANY (ARRAY['GFDEBTN'::text, 'FYFSD'::text, 'GFDEGDQ188S'::text, 'FGRECPT'::text, 'FGEXPND'::text, 'FYOINT'::text])
          ORDER BY macro_observations.series_id, macro_observations.observation_date DESC
        )
 SELECT rows.row_id,
    rows.label,
    rows.fred_id,
    rows.usd_unit,
    l.observation_date,
    l.value,
    l.prev_value,
        CASE
            WHEN rows.usd_unit = 'millions'::text THEN format('$%sB'::text, round(l.value / 1000::numeric, 0))
            WHEN rows.usd_unit = 'billions'::text THEN format('$%sB'::text, round(l.value, 0))
            WHEN rows.usd_unit = 'percent'::text THEN format('%s%%'::text, round(l.value, 1))
            ELSE l.value::text
        END AS display,
        CASE
            WHEN l.value IS NULL OR l.prev_value IS NULL THEN 'flat'::text
            WHEN l.value > l.prev_value THEN 'up'::text
            WHEN l.value < l.prev_value THEN 'down'::text
            ELSE 'flat'::text
        END AS trend
   FROM ( SELECT 1 AS row_id,
            'Total federal debt'::text AS label,
            'GFDEBTN'::text AS fred_id,
            'millions'::text AS usd_unit
        UNION ALL
         SELECT 2,
            'Surplus/deficit (FY)'::text,
            'FYFSD'::text,
            'millions'::text
        UNION ALL
         SELECT 3,
            'Gross debt / GDP'::text,
            'GFDEGDQ188S'::text,
            'percent'::text
        UNION ALL
         SELECT 4,
            'Federal receipts'::text,
            'FGRECPT'::text,
            'billions'::text
        UNION ALL
         SELECT 5,
            'Federal expenditures'::text,
            'FGEXPND'::text,
            'billions'::text
        UNION ALL
         SELECT 6,
            'Net interest (FY)'::text,
            'FYOINT'::text,
            'millions'::text) rows
     LEFT JOIN latest l ON l.series_id = rows.fred_id
  ORDER BY rows.row_id;
GRANT SELECT ON public.macro_fiscal_v TO anon, authenticated;

-- macro_kpi_v
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
          WHERE macro_observations.series_id = ANY (ARRAY['CPIAUCSL'::text, 'CPILFESL'::text, 'PPIACO'::text, 'PCEPI'::text, 'PCEPILFE'::text])
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
            'PPI'::text AS text,
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
          WHERE monthly_yoy_latest.series_id = 'PPIACO'::text
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
            WHEN 'ppi_yoy'::text THEN 'PPIACO'::text
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

-- macro_signal_balance_v
CREATE OR REPLACE VIEW public.macro_signal_balance_v WITH (security_invoker = on) AS
 WITH counts AS (
         SELECT sum(
                CASE
                    WHEN macro_kpi_v.signal = 'hawkish'::text THEN 1
                    ELSE 0
                END) AS hawkish,
            sum(
                CASE
                    WHEN macro_kpi_v.signal = 'dovish'::text THEN 1
                    ELSE 0
                END) AS dovish,
            sum(
                CASE
                    WHEN macro_kpi_v.signal = 'neutral'::text THEN 1
                    ELSE 0
                END) AS neutral,
            sum(
                CASE
                    WHEN macro_kpi_v.signal = 'tightening'::text THEN 1
                    ELSE 0
                END) AS tightening,
            count(*) AS total
           FROM macro_kpi_v
        ), labels AS (
         SELECT counts.hawkish,
            counts.dovish,
            counts.neutral,
            counts.tightening,
            counts.total,
                CASE
                    WHEN counts.total > 0 AND (counts.hawkish::numeric / counts.total::numeric) > 0.35 AND counts.hawkish > counts.dovish THEN 'Leaning Hawkish'::text
                    WHEN counts.total > 0 AND (counts.dovish::numeric / counts.total::numeric) > 0.35 AND counts.dovish > counts.hawkish THEN 'Leaning Dovish'::text
                    WHEN counts.tightening >= 2 THEN 'Fiscal / rate pressure'::text
                    ELSE 'Mixed / data-dependent'::text
                END AS dominant_label
           FROM counts
        ), kpi_displays AS (
         SELECT max(
                CASE
                    WHEN macro_kpi_v.metric_id = 'cpi_yoy'::text THEN macro_kpi_v.display
                    ELSE NULL::text
                END) AS cpi,
            max(
                CASE
                    WHEN macro_kpi_v.metric_id = 'core_cpi_yoy'::text THEN macro_kpi_v.display
                    ELSE NULL::text
                END) AS core,
            max(
                CASE
                    WHEN macro_kpi_v.metric_id = 'unemployment'::text THEN macro_kpi_v.display
                    ELSE NULL::text
                END) AS un,
            max(
                CASE
                    WHEN macro_kpi_v.metric_id = 'nfp'::text THEN macro_kpi_v.display
                    ELSE NULL::text
                END) AS nfp,
            max(
                CASE
                    WHEN macro_kpi_v.metric_id = 'brent'::text THEN macro_kpi_v.display
                    ELSE NULL::text
                END) AS br,
            max(
                CASE
                    WHEN macro_kpi_v.metric_id = 'fed_funds'::text THEN macro_kpi_v.display
                    ELSE NULL::text
                END) AS ff
           FROM macro_kpi_v
        )
 SELECT l.hawkish,
    l.dovish,
    l.neutral,
    l.tightening,
    l.total,
    l.dominant_label,
    (((format('Signal balance: %s.'::text, l.dominant_label) ||
        CASE
            WHEN k.cpi IS NOT NULL AND k.core IS NOT NULL THEN format(' Headline CPI is %s; core CPI %s.'::text, k.cpi, k.core)
            ELSE ''::text
        END) ||
        CASE
            WHEN k.un IS NOT NULL AND k.nfp IS NOT NULL THEN format(' Labor: unemployment %s, payroll change %s.'::text, k.un, k.nfp)
            ELSE ''::text
        END) ||
        CASE
            WHEN k.br IS NOT NULL THEN format(' Energy: Brent %s.'::text, k.br)
            ELSE ''::text
        END) ||
        CASE
            WHEN k.ff IS NOT NULL THEN format(' Policy rate context: %s.'::text, k.ff)
            ELSE ''::text
        END AS narrative_text,
    jsonb_build_object('hawkish', l.hawkish, 'dovish', l.dovish, 'neutral', l.neutral, 'tightening', l.tightening) AS counts_json
   FROM labels l,
    kpi_displays k;
GRANT SELECT ON public.macro_signal_balance_v TO anon, authenticated;

-- macro_monitor_dashboard_v
CREATE OR REPLACE VIEW public.macro_monitor_dashboard_v WITH (security_invoker = on) AS
 SELECT jsonb_build_object('kpis', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('metric_id', macro_kpi_v.metric_id, 'label', macro_kpi_v.label, 'short', macro_kpi_v.short, 'observation_date', macro_kpi_v.observation_date, 'value_num', macro_kpi_v.value_num, 'display', macro_kpi_v.display, 'prev_value', macro_kpi_v.prev_value, 'delta', macro_kpi_v.delta, 'trend', macro_kpi_v.trend, 'signal', macro_kpi_v.signal, 'source', macro_kpi_v.source, 'display_order', macro_kpi_v.display_order, 'sparkline', macro_kpi_v.sparkline) ORDER BY macro_kpi_v.display_order), '[]'::jsonb) AS "coalesce"
           FROM macro_kpi_v), 'fiscal', ( SELECT COALESCE(jsonb_agg(jsonb_build_object('row_id', macro_fiscal_v.row_id, 'label', macro_fiscal_v.label, 'fred_id', macro_fiscal_v.fred_id, 'observation_date', macro_fiscal_v.observation_date, 'value', macro_fiscal_v.value, 'prev_value', macro_fiscal_v.prev_value, 'display', macro_fiscal_v.display, 'trend', macro_fiscal_v.trend, 'usd_unit', macro_fiscal_v.usd_unit) ORDER BY macro_fiscal_v.row_id), '[]'::jsonb) AS "coalesce"
           FROM macro_fiscal_v), 'signal_balance', ( SELECT jsonb_build_object('counts', macro_signal_balance_v.counts_json, 'dominant_label', macro_signal_balance_v.dominant_label, 'narrative', macro_signal_balance_v.narrative_text, 'hawkish', macro_signal_balance_v.hawkish, 'dovish', macro_signal_balance_v.dovish, 'neutral', macro_signal_balance_v.neutral, 'tightening', macro_signal_balance_v.tightening, 'total', macro_signal_balance_v.total) AS jsonb_build_object
           FROM macro_signal_balance_v), 'generated_at', now()) AS dashboard;
GRANT SELECT ON public.macro_monitor_dashboard_v TO anon, authenticated;

-- macro_monitor_v
CREATE OR REPLACE VIEW public.macro_monitor_v WITH (security_invoker = on) AS
 WITH ranked AS (
         SELECT macro_observations.series_id,
            macro_observations.observation_date,
            macro_observations.value,
            row_number() OVER (PARTITION BY macro_observations.series_id ORDER BY macro_observations.observation_date DESC) AS rn
           FROM macro_observations
          WHERE macro_observations.value IS NOT NULL
        ), latest AS (
         SELECT ranked.series_id,
            ranked.observation_date AS latest_date,
            ranked.value AS latest_value
           FROM ranked
          WHERE ranked.rn = 1
        ), prev AS (
         SELECT ranked.series_id,
            ranked.value AS prev_value
           FROM ranked
          WHERE ranked.rn = 2
        ), yoy AS (
         SELECT l_1.series_id,
            ( SELECT o.value
                   FROM macro_observations o
                  WHERE o.series_id = l_1.series_id AND o.observation_date <= (l_1.latest_date - '11 mons'::interval)::date AND o.observation_date >= (l_1.latest_date - '1 year 1 mon'::interval)::date AND o.value IS NOT NULL
                  ORDER BY o.observation_date DESC
                 LIMIT 1) AS yoy_value
           FROM latest l_1
        )
 SELECT m.series_id,
    m.display_name,
    m.category,
    m.units,
    m.frequency,
    m.transform,
    m.display_order,
    l.latest_date,
    l.latest_value,
    p.prev_value,
    y.yoy_value,
        CASE
            WHEN m.transform = 'yoy_pct'::text AND y.yoy_value IS NOT NULL AND y.yoy_value <> 0::numeric THEN (l.latest_value / y.yoy_value - 1::numeric) * 100::numeric
            ELSE NULL::numeric
        END AS yoy_pct,
        CASE
            WHEN m.transform = 'mom_delta'::text AND p.prev_value IS NOT NULL THEN l.latest_value - p.prev_value
            ELSE NULL::numeric
        END AS mom_delta,
        CASE
            WHEN l.latest_value > p.prev_value THEN 'up'::text
            WHEN l.latest_value < p.prev_value THEN 'down'::text
            ELSE 'flat'::text
        END AS direction
   FROM macro_series_meta m
     LEFT JOIN latest l USING (series_id)
     LEFT JOIN prev p USING (series_id)
     LEFT JOIN yoy y USING (series_id)
  WHERE m.is_active = true
  ORDER BY m.display_order;
GRANT SELECT ON public.macro_monitor_v TO anon, authenticated;

-- pipeline_failures_v
CREATE OR REPLACE VIEW public.pipeline_failures_v WITH (security_invoker = off) AS
 WITH latest AS (
         SELECT DISTINCT ON (job_runs.job_name) job_runs.job_name,
            job_runs.status,
            job_runs.started_at,
            job_runs.finished_at
           FROM job_runs
          WHERE job_runs.started_at > (now() - '36:00:00'::interval)
          ORDER BY job_runs.job_name, job_runs.started_at DESC
        )
 SELECT job_name,
    status,
    started_at
   FROM latest
  WHERE (status = 'error'::text OR status = 'running'::text AND started_at < (now() - '02:00:00'::interval)) AND (job_name ~~ 'fetch-finviz-breadth%'::text OR job_name ~~ 'fetch-finviz-scanners%'::text OR job_name ~~ 'fetch-finviz-sectors%'::text OR job_name ~~ 'fetch-stockbee-breadth%'::text OR job_name ~~ 'fetch-vix-yfinance%'::text OR job_name ~~ 'fetch-index-etf-quotes%'::text OR job_name ~~ 'fetch-intraday-quotes-movers%'::text OR job_name ~~ 'compute-should-i-trade%'::text);
GRANT SELECT ON public.pipeline_failures_v TO anon, authenticated;

-- rrg_sectors_trail_v
CREATE OR REPLACE VIEW public.rrg_sectors_trail_v WITH (security_invoker = on) AS
 WITH vti AS (
         SELECT sector_etf_snapshot.snapshot_date,
            sector_etf_snapshot.perf_quarter AS vti_qtr
           FROM sector_etf_snapshot
          WHERE sector_etf_snapshot.ticker = 'VTI'::text
        ), rs AS (
         SELECT s.ticker,
            s.sector_label,
            s.snapshot_date,
            s.perf_quarter - v.vti_qtr AS rs_raw
           FROM sector_etf_snapshot s
             JOIN vti v ON v.snapshot_date = s.snapshot_date
          WHERE s.ticker = ANY (ARRAY['XLK'::text, 'XLV'::text, 'XLC'::text, 'XLY'::text, 'XLU'::text, 'XLI'::text, 'XLE'::text, 'XLRE'::text, 'XLF'::text, 'XLB'::text, 'XLP'::text])
        ), mom AS (
         SELECT r.ticker,
            r.sector_label,
            r.snapshot_date,
            r.rs_raw,
            r.rs_raw - (( SELECT r2.rs_raw
                   FROM rs r2
                  WHERE r2.ticker = r.ticker AND r2.snapshot_date <= (r.snapshot_date - 7)
                  ORDER BY r2.snapshot_date DESC
                 LIMIT 1)) AS mom_raw
           FROM rs r
        )
 SELECT ticker,
    sector_label,
    snapshot_date,
    round(rs_raw, 2) AS rs_ratio_raw,
    round(mom_raw, 2) AS rs_momentum_raw,
    round(100::numeric + 0.5 * rs_raw, 2) AS rs_ratio,
    round(100::numeric + 2.0 * mom_raw, 2) AS rs_momentum
   FROM mom
  WHERE mom_raw IS NOT NULL
  ORDER BY ticker, snapshot_date;
GRANT SELECT ON public.rrg_sectors_trail_v TO anon, authenticated;

-- rrg_sectors_v
CREATE OR REPLACE VIEW public.rrg_sectors_v WITH (security_invoker = on) AS
 WITH t AS (
         SELECT rrg_sectors_trail_v.ticker,
            rrg_sectors_trail_v.sector_label,
            rrg_sectors_trail_v.snapshot_date,
            rrg_sectors_trail_v.rs_ratio_raw,
            rrg_sectors_trail_v.rs_momentum_raw,
            rrg_sectors_trail_v.rs_ratio,
            rrg_sectors_trail_v.rs_momentum
           FROM rrg_sectors_trail_v
          WHERE rrg_sectors_trail_v.snapshot_date = (( SELECT max(rrg_sectors_trail_v_1.snapshot_date) AS max
                   FROM rrg_sectors_trail_v rrg_sectors_trail_v_1))
        )
 SELECT ticker,
    sector_label,
    snapshot_date,
    rs_ratio_raw,
    rs_momentum_raw,
    rs_ratio,
    rs_momentum,
        CASE
            WHEN rs_ratio >= 100::numeric AND rs_momentum >= 100::numeric THEN 'leading'::text
            WHEN rs_ratio >= 100::numeric AND rs_momentum < 100::numeric THEN 'weakening'::text
            WHEN rs_ratio < 100::numeric AND rs_momentum < 100::numeric THEN 'lagging'::text
            ELSE 'improving'::text
        END AS quadrant
   FROM t
  ORDER BY ticker;
GRANT SELECT ON public.rrg_sectors_v TO anon, authenticated;

-- scanner_latest_v
CREATE OR REPLACE VIEW public.scanner_latest_v WITH (security_invoker = on) AS
 WITH latest_dates AS (
         SELECT scanner_results.scanner_id,
            max(scanner_results.snapshot_date) AS d
           FROM scanner_results
          GROUP BY scanner_results.scanner_id
        )
 SELECT s.scanner_id,
    s.ticker,
    s.snapshot_date,
    s.rank,
    s.company,
    s.sector,
    s.industry,
    s.price,
    s.market_cap_millions,
    s.volume,
    s.avg_volume,
    s.rel_volume,
    s.perf_day,
    s.perf_week,
    s.perf_month,
    s.perf_quarter,
    s.perf_year,
    s.rsi14,
    s.extras,
    s.fetched_at
   FROM scanner_results s
     JOIN latest_dates l ON l.scanner_id = s.scanner_id AND l.d = s.snapshot_date;
GRANT SELECT ON public.scanner_latest_v TO anon, authenticated;

-- scanner_results_latest_v
CREATE OR REPLACE VIEW public.scanner_results_latest_v WITH (security_invoker = on) AS
 WITH latest AS (
         SELECT scanner_results.scanner_id,
            max(scanner_results.snapshot_date) AS snapshot_date
           FROM scanner_results
          GROUP BY scanner_results.scanner_id
        )
 SELECT s.scanner_id,
    c.label AS scanner_label,
    c.group_tab,
    c.display_order,
    c.source,
    c.default_sort_column,
    c.default_sort_direction,
    c.max_rows,
    c.finviz_url,
    s.snapshot_date,
    s.rank,
    s.ticker,
    s.company,
    s.sector,
    s.industry,
    s.price,
    s.market_cap_millions,
    s.volume,
    s.avg_volume,
    s.rel_volume,
    s.perf_day,
    s.perf_week,
    s.perf_month,
    s.perf_quarter,
    s.perf_half,
    s.perf_year,
    s.perf_ytd,
    s.rsi14,
    s.atr,
    s.atr_pct,
    s.stage_tag,
    s.dist_52w_high_pct,
    s.roe,
    s.net_margin,
    s.short_float_pct,
    s.extras,
    s.fetched_at
   FROM scanner_results s
     JOIN latest l ON l.scanner_id = s.scanner_id AND l.snapshot_date = s.snapshot_date
     LEFT JOIN scanner_catalog c ON c.scanner_id = s.scanner_id
  ORDER BY c.display_order, s.scanner_id, s.rank;
GRANT SELECT ON public.scanner_results_latest_v TO anon, authenticated;

-- scanner_summary_v
CREATE OR REPLACE VIEW public.scanner_summary_v WITH (security_invoker = on) AS
 WITH latest AS (
         SELECT scanner_results.scanner_id,
            max(scanner_results.snapshot_date) AS snapshot_date,
            max(scanner_results.fetched_at) AS fetched_at,
            count(*) AS row_count
           FROM scanner_results
          GROUP BY scanner_results.scanner_id
        )
 SELECT c.scanner_id,
    c.label,
    c.description,
    c.group_tab,
    c.display_order,
    c.source,
    c.doc_url,
    c.default_sort_column,
    c.default_sort_direction,
    c.max_rows,
    c.finviz_url,
    l.snapshot_date,
    COALESCE(l.row_count, 0::bigint) AS row_count,
    l.fetched_at
   FROM scanner_catalog c
     LEFT JOIN latest l ON l.scanner_id = c.scanner_id
  ORDER BY c.display_order;
GRANT SELECT ON public.scanner_summary_v TO anon, authenticated;

-- sector_etf_latest_v
CREATE OR REPLACE VIEW public.sector_etf_latest_v WITH (security_invoker = on) AS
 WITH latest AS (
         SELECT max(sector_etf_snapshot.snapshot_date) AS d
           FROM sector_etf_snapshot
        )
 SELECT s.ticker,
    s.sector_label,
    s.is_benchmark,
    s.price,
    s.perf_day,
    s.perf_open,
    s.perf_week,
    s.perf_month,
    s.perf_quarter,
    s.perf_half,
    s.perf_year,
    s.perf_ytd,
    s.atr_pct,
    s.range_52w_pct,
    s.gap_pct,
    s.snapshot_date
   FROM sector_etf_snapshot s,
    latest
  WHERE s.snapshot_date = latest.d
  ORDER BY (
        CASE
            WHEN s.is_benchmark THEN 0
            ELSE 1
        END), s.perf_day DESC NULLS LAST;
GRANT SELECT ON public.sector_etf_latest_v TO anon, authenticated;

-- sector_pulse_v
CREATE OR REPLACE VIEW public.sector_pulse_v WITH (security_invoker = on) AS
 WITH latest AS (
         SELECT max(sector_etf_snapshot.snapshot_date) AS d
           FROM sector_etf_snapshot
        ), benchmark AS (
         SELECT s_1.perf_year AS vti_year,
            s_1.perf_quarter AS vti_qtr,
            s_1.perf_month AS vti_month
           FROM sector_etf_snapshot s_1,
            latest
          WHERE s_1.snapshot_date = latest.d AND s_1.is_benchmark = true
         LIMIT 1
        )
 SELECT s.ticker,
    s.sector_label,
    s.price,
    s.perf_day,
    s.perf_week,
    s.perf_month,
    s.perf_quarter,
    s.perf_year,
        CASE
            WHEN s.perf_year IS NOT NULL AND b.vti_year IS NOT NULL THEN 100::numeric + (s.perf_year - b.vti_year)
            ELSE NULL::numeric
        END AS rs_ratio,
        CASE
            WHEN s.perf_quarter IS NOT NULL AND b.vti_qtr IS NOT NULL THEN 100::numeric + (s.perf_quarter - b.vti_qtr)
            ELSE NULL::numeric
        END AS rs_momentum,
        CASE
            WHEN s.perf_year > b.vti_year AND s.perf_quarter > b.vti_qtr THEN 'leading'::text
            WHEN s.perf_year < b.vti_year AND s.perf_quarter > b.vti_qtr THEN 'improving'::text
            WHEN s.perf_year > b.vti_year AND s.perf_quarter < b.vti_qtr THEN 'weakening'::text
            WHEN s.perf_year < b.vti_year AND s.perf_quarter < b.vti_qtr THEN 'lagging'::text
            ELSE NULL::text
        END AS rrg_quadrant,
    s.snapshot_date
   FROM sector_etf_snapshot s
     CROSS JOIN benchmark b
  WHERE s.snapshot_date = (( SELECT latest.d
           FROM latest)) AND s.is_benchmark = false
  ORDER BY s.perf_year DESC NULLS LAST;
GRANT SELECT ON public.sector_pulse_v TO anon, authenticated;

-- should_i_trade_latest_v
CREATE OR REPLACE VIEW public.should_i_trade_latest_v WITH (security_invoker = on) AS
 SELECT DISTINCT ON (mode) snapshot_date,
    mode,
    computed_at,
    decision,
    market_quality_score,
    execution_window_score,
    vol_score,
    vol_weight,
    vol_interpretation,
    trend_score,
    trend_weight,
    trend_interpretation,
    breadth_score,
    breadth_weight,
    breadth_interpretation,
    momentum_score,
    momentum_weight,
    momentum_interpretation,
    macro_score,
    macro_weight,
    macro_interpretation,
    exec_breakouts_status,
    exec_breakouts_detail,
    exec_leaders_status,
    exec_leaders_detail,
    exec_pullbacks_status,
    exec_pullbacks_detail,
    exec_followthrough_status,
    exec_followthrough_detail,
    narrative_text,
    suggested_action,
    raw_inputs,
    snapshot_date < (( SELECT max(equities_snapshot.snapshot_date) AS max
           FROM equities_snapshot)) AS is_stale,
    ( SELECT max(equities_snapshot.snapshot_date) AS max
           FROM equities_snapshot) AS market_date
   FROM should_i_trade_history
  ORDER BY mode, snapshot_date DESC, computed_at DESC;
GRANT SELECT ON public.should_i_trade_latest_v TO anon, authenticated;

-- should_i_trade_v
CREATE OR REPLACE VIEW public.should_i_trade_v WITH (security_invoker = on) AS
 WITH breadth AS (
         SELECT breadth_metrics_v.pct_above_sma20,
            breadth_metrics_v.pct_above_sma50,
            breadth_metrics_v.pct_above_sma200,
            breadth_metrics_v.pct_aligned_bullish,
            breadth_metrics_v.advancers,
            breadth_metrics_v.decliners
           FROM breadth_metrics_v
          WHERE breadth_metrics_v.universe_id = 'cap1b_plus'::text
        ), sectors AS (
         SELECT count(*) FILTER (WHERE sector_pulse_v.rrg_quadrant = 'leading'::text) AS leading_count,
            count(*) FILTER (WHERE sector_pulse_v.rrg_quadrant = 'improving'::text) AS improving_count,
            count(*) AS total_sectors
           FROM sector_pulse_v
        ), scores AS (
         SELECT COALESCE(b.pct_above_sma200, 50::numeric) AS trend_score,
            COALESCE(b.pct_above_sma20, 50::numeric) AS momentum_score,
                CASE
                    WHEN (COALESCE(b.advancers, 0::bigint) + COALESCE(b.decliners, 0::bigint)) > 0 THEN 100.0 * b.advancers::numeric / (b.advancers + b.decliners)::numeric
                    ELSE 50::numeric
                END AS breadth_score,
                CASE
                    WHEN s.total_sectors > 0 THEN 100.0 * (s.leading_count::numeric + s.improving_count::numeric * 0.6) / s.total_sectors::numeric
                    ELSE 50::numeric
                END AS rotation_score
           FROM breadth b,
            sectors s
        )
 SELECT round(trend_score, 1) AS trend_score,
    round(momentum_score, 1) AS momentum_score,
    round(breadth_score, 1) AS breadth_score,
    round(rotation_score, 1) AS rotation_score,
    round(trend_score * 0.35 + breadth_score * 0.25 + momentum_score * 0.25 + rotation_score * 0.15, 1) AS composite_score,
        CASE
            WHEN (trend_score * 0.35 + breadth_score * 0.25 + momentum_score * 0.25 + rotation_score * 0.15) >= 70::numeric THEN 'TRADE'::text
            WHEN (trend_score * 0.35 + breadth_score * 0.25 + momentum_score * 0.25 + rotation_score * 0.15) >= 50::numeric THEN 'CAUTION'::text
            ELSE 'STAND ASIDE'::text
        END AS signal,
        CASE
            WHEN (trend_score * 0.35 + breadth_score * 0.25 + momentum_score * 0.25 + rotation_score * 0.15) >= 80::numeric THEN 'A'::text
            WHEN (trend_score * 0.35 + breadth_score * 0.25 + momentum_score * 0.25 + rotation_score * 0.15) >= 70::numeric THEN 'B'::text
            WHEN (trend_score * 0.35 + breadth_score * 0.25 + momentum_score * 0.25 + rotation_score * 0.15) >= 60::numeric THEN 'C'::text
            WHEN (trend_score * 0.35 + breadth_score * 0.25 + momentum_score * 0.25 + rotation_score * 0.15) >= 50::numeric THEN 'D'::text
            ELSE 'F'::text
        END AS grade
   FROM scores;
GRANT SELECT ON public.should_i_trade_v TO anon, authenticated;

-- sp500_landscape_v
CREATE OR REPLACE VIEW public.sp500_landscape_v WITH (security_invoker = on) AS
 SELECT ticker,
    sector,
    industry,
    price,
    market_cap_millions,
    perf_day,
    perf_week,
    perf_month,
    perf_quarter,
    perf_year,
    perf_ytd,
    sma20_pct,
    sma50_pct,
    sma200_pct,
    high52w_pct,
    low52w_pct,
    rsi14,
    atr_pct,
    volume,
    avg_volume,
    snapshot_date
   FROM equities_snapshot
  WHERE snapshot_date = (( SELECT max(equities_snapshot_1.snapshot_date) AS max
           FROM equities_snapshot equities_snapshot_1)) AND in_sp500 AND market_cap_millions IS NOT NULL AND perf_day IS NOT NULL
  ORDER BY market_cap_millions DESC;
GRANT SELECT ON public.sp500_landscape_v TO anon, authenticated;

-- stage2_leaders_v
CREATE OR REPLACE VIEW public.stage2_leaders_v WITH (security_invoker = on) AS
 WITH latest AS (
         SELECT max(equities_snapshot.snapshot_date) AS d
           FROM equities_snapshot
        )
 SELECT e.ticker,
    e.sector,
    e.industry,
    e.price,
    e.perf_day,
    e.perf_week,
    e.perf_month,
    e.perf_quarter,
    e.perf_year,
    e.sma20_pct,
    e.sma50_pct,
    e.sma200_pct,
    e.high52w_pct,
    e.market_cap_millions,
    e.in_sp500
   FROM equities_snapshot e,
    latest
  WHERE e.snapshot_date = latest.d AND e.market_cap_millions >= 1000::numeric AND e.sma50_pct > 0::numeric AND e.sma200_pct > 0::numeric AND e.sma200_pct > e.sma50_pct
  ORDER BY e.perf_quarter DESC NULLS LAST
 LIMIT 25;
GRANT SELECT ON public.stage2_leaders_v TO anon, authenticated;

-- stage_analysis_v
CREATE OR REPLACE VIEW public.stage_analysis_v WITH (security_invoker = on) AS
 SELECT e.ticker,
    e.sector,
    e.industry,
    e.price,
    e.market_cap_millions,
    e.sma20_pct,
    e.sma50_pct,
    e.sma200_pct,
    m10.ema10_pct,
    classify_stage(e.sma20_pct, e.sma50_pct, m10.ema10_pct) AS stage,
    e.snapshot_date
   FROM equities_snapshot e
     LEFT JOIN equity_ma10_latest_v m10 ON m10.ticker = e.ticker
  WHERE e.snapshot_date = (( SELECT max(equities_snapshot.snapshot_date) AS max
           FROM equities_snapshot)) AND e.avg_volume >= 1 AND e.price >= 1::numeric AND e.sma50_pct IS NOT NULL;
GRANT SELECT ON public.stage_analysis_v TO anon, authenticated;

-- stage_analysis_counts_v
CREATE OR REPLACE VIEW public.stage_analysis_counts_v WITH (security_invoker = off) AS
 WITH stage_labels(stage, sort_order) AS (
         VALUES ('1A'::text,1), ('1B'::text,2), ('2A'::text,3), ('2B'::text,4), ('2C'::text,5), ('3A'::text,6), ('3B'::text,7), ('4A'::text,8), ('4B'::text,9), ('4C'::text,10)
        ), counts AS (
         SELECT stage_analysis_v.stage,
            count(*) AS cnt
           FROM stage_analysis_v
          GROUP BY stage_analysis_v.stage
        ), total AS (
         SELECT count(*) AS t
           FROM stage_analysis_v
        )
 SELECT l.stage,
    l.sort_order,
    COALESCE(c.cnt, 0::bigint) AS count,
        CASE
            WHEN t.t = 0 THEN 0::numeric
            ELSE round(100.0 * COALESCE(c.cnt, 0::bigint)::numeric / t.t::numeric, 2)
        END AS pct,
    t.t AS universe_size
   FROM stage_labels l
     LEFT JOIN counts c ON c.stage = l.stage
     CROSS JOIN total t
  ORDER BY l.sort_order;
GRANT SELECT ON public.stage_analysis_counts_v TO anon, authenticated;

-- stockbee_breadth_history_v
CREATE OR REPLACE VIEW public.stockbee_breadth_history_v WITH (security_invoker = on) AS
 SELECT observation_date,
    up_4pct,
    down_4pct,
    up_25pct_qtr,
    down_25pct_qtr,
    ratio5,
    ratio10,
    t2108,
    sp500_level
   FROM stockbee_breadth_raw
  WHERE observation_date >= ((( SELECT max(stockbee_breadth_raw_1.observation_date) AS max
           FROM stockbee_breadth_raw stockbee_breadth_raw_1)) - '90 days'::interval)
  ORDER BY observation_date;
GRANT SELECT ON public.stockbee_breadth_history_v TO anon, authenticated;

-- stockbee_breadth_latest_v
CREATE OR REPLACE VIEW public.stockbee_breadth_latest_v WITH (security_invoker = on) AS
 SELECT observation_date,
    up_4pct,
    down_4pct,
    ratio5,
    ratio10,
    up_25pct_qtr,
    down_25pct_qtr,
    universe_size,
    t2108,
    sp500_level,
    fetched_at
   FROM stockbee_breadth_raw
  ORDER BY observation_date DESC
 LIMIT 1;
GRANT SELECT ON public.stockbee_breadth_latest_v TO anon, authenticated;

-- stockbee_momentum50_latest_v
CREATE OR REPLACE VIEW public.stockbee_momentum50_latest_v WITH (security_invoker = on) AS
 SELECT observation_date,
    tickers,
    fetched_at
   FROM stockbee_momentum50
  ORDER BY observation_date DESC
 LIMIT 1;
GRANT SELECT ON public.stockbee_momentum50_latest_v TO anon, authenticated;

-- thematics_by_sector_v
CREATE OR REPLACE VIEW public.thematics_by_sector_v WITH (security_invoker = off) AS
 WITH sector_rollup AS (
         SELECT _phase5b_liquid_universe.sector,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (_phase5b_liquid_universe.perf_day::double precision))::numeric AS avg_day,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (_phase5b_liquid_universe.perf_open::double precision))::numeric AS avg_open,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (_phase5b_liquid_universe.perf_week::double precision))::numeric AS avg_week,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (_phase5b_liquid_universe.perf_month::double precision))::numeric AS avg_month,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (_phase5b_liquid_universe.perf_quarter::double precision))::numeric AS avg_qtr,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (_phase5b_liquid_universe.perf_half::double precision))::numeric AS avg_half,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (_phase5b_liquid_universe.perf_year::double precision))::numeric AS avg_year,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (_phase5b_liquid_universe.perf_ytd::double precision))::numeric AS avg_ytd,
            count(*) AS stock_count
           FROM _phase5b_liquid_universe
          GROUP BY _phase5b_liquid_universe.sector
         HAVING count(*) > 0
        )
 SELECT sector,
    round(avg_day, 2) AS perf_day,
    round(avg_open, 2) AS perf_open,
    round(avg_week, 2) AS perf_week,
    round(avg_month, 2) AS perf_month,
    round(avg_qtr, 2) AS perf_quarter,
    round(avg_half, 2) AS perf_half,
    round(avg_year, 2) AS perf_year,
    round(avg_ytd, 2) AS perf_ytd,
    stock_count
   FROM sector_rollup
  ORDER BY avg_day DESC NULLS LAST;
GRANT SELECT ON public.thematics_by_sector_v TO anon, authenticated;

-- thematics_by_theme_v
CREATE OR REPLACE VIEW public.thematics_by_theme_v WITH (security_invoker = off) AS
 SELECT industry AS theme,
    sector,
    week_avg,
    month_avg,
    stock_count,
    week_pct,
    month_pct,
    top_both,
    t1,
    t2,
    t3,
    t4
   FROM leading_industries_v
  ORDER BY week_avg DESC NULLS LAST;
GRANT SELECT ON public.thematics_by_theme_v TO anon, authenticated;

-- thematics_top_movers_v
CREATE OR REPLACE VIEW public.thematics_top_movers_v WITH (security_invoker = off) AS
( SELECT 'gainer'::text AS mover_side,
    _phase5b_liquid_universe.ticker,
    _phase5b_liquid_universe.sector,
    _phase5b_liquid_universe.industry,
    _phase5b_liquid_universe.perf_day,
    _phase5b_liquid_universe.perf_week,
    _phase5b_liquid_universe.perf_month,
    _phase5b_liquid_universe.price,
    _phase5b_liquid_universe.avg_volume,
    _phase5b_liquid_universe.volume,
    _phase5b_liquid_universe.atr_pct,
    _phase5b_liquid_universe.rsi14,
    row_number() OVER (ORDER BY _phase5b_liquid_universe.perf_day DESC NULLS LAST) AS rank
   FROM _phase5b_liquid_universe
  WHERE _phase5b_liquid_universe.perf_day IS NOT NULL
  ORDER BY _phase5b_liquid_universe.perf_day DESC NULLS LAST
 LIMIT 12)
UNION ALL
( SELECT 'loser'::text AS mover_side,
    _phase5b_liquid_universe.ticker,
    _phase5b_liquid_universe.sector,
    _phase5b_liquid_universe.industry,
    _phase5b_liquid_universe.perf_day,
    _phase5b_liquid_universe.perf_week,
    _phase5b_liquid_universe.perf_month,
    _phase5b_liquid_universe.price,
    _phase5b_liquid_universe.avg_volume,
    _phase5b_liquid_universe.volume,
    _phase5b_liquid_universe.atr_pct,
    _phase5b_liquid_universe.rsi14,
    row_number() OVER (ORDER BY _phase5b_liquid_universe.perf_day) AS rank
   FROM _phase5b_liquid_universe
  WHERE _phase5b_liquid_universe.perf_day IS NOT NULL
  ORDER BY _phase5b_liquid_universe.perf_day
 LIMIT 12);
GRANT SELECT ON public.thematics_top_movers_v TO anon, authenticated;

-- watchlist_v
CREATE OR REPLACE VIEW public.watchlist_v WITH (security_invoker = on) AS
 WITH eq AS (
         SELECT equities_snapshot.ticker,
            equities_snapshot.snapshot_date,
            equities_snapshot.index_str,
            equities_snapshot.in_sp500,
            equities_snapshot.in_nq100,
            equities_snapshot.in_djia,
            equities_snapshot.sector,
            equities_snapshot.industry,
            equities_snapshot.price,
            equities_snapshot.market_cap_millions,
            equities_snapshot.volume,
            equities_snapshot.avg_volume,
            equities_snapshot.perf_day,
            equities_snapshot.perf_week,
            equities_snapshot.perf_month,
            equities_snapshot.perf_quarter,
            equities_snapshot.perf_year,
            equities_snapshot.sma20_pct,
            equities_snapshot.sma50_pct,
            equities_snapshot.sma200_pct,
            equities_snapshot.high52w_pct,
            equities_snapshot.low52w_pct,
            equities_snapshot.fetched_at,
            equities_snapshot.in_rut,
            equities_snapshot.cap_1b_plus,
            equities_snapshot.perf_open,
            equities_snapshot.perf_half,
            equities_snapshot.perf_ytd,
            equities_snapshot.sma10_pct,
            equities_snapshot.ema10_pct,
            equities_snapshot.new_20day_high,
            equities_snapshot.new_20day_low,
            equities_snapshot.up_4pct,
            equities_snapshot.down_4pct,
            equities_snapshot.atr_value,
            equities_snapshot.atr_pct,
            equities_snapshot.rsi14,
            equities_snapshot.volatility_w,
            equities_snapshot.volatility_m
           FROM equities_snapshot
          WHERE equities_snapshot.snapshot_date = (( SELECT max(equities_snapshot_1.snapshot_date) AS max
                   FROM equities_snapshot equities_snapshot_1))
        )
 SELECT w.id,
    w.ticker,
    w."position",
    w.notes,
    w.added_at,
    e.snapshot_date,
    e.sector,
    e.industry,
    e.price,
    e.market_cap_millions,
    e.perf_day,
    e.perf_week,
    e.perf_month,
    e.perf_quarter,
    e.perf_year,
    e.perf_ytd,
    e.perf_open,
    e.perf_half,
    e.sma10_pct,
    e.sma20_pct,
    e.sma50_pct,
    e.sma200_pct,
    e.ema10_pct,
    e.rsi14,
    e.atr_pct,
    e.atr_value,
    e.volatility_w,
    e.volatility_m,
    e.high52w_pct,
    e.low52w_pct,
    e.volume,
    e.avg_volume,
    e.in_sp500,
    e.in_nq100,
    e.in_djia,
    e.in_rut,
    e.cap_1b_plus
   FROM watchlists w
     LEFT JOIN eq e ON e.ticker = w.ticker
  ORDER BY w."position", w.added_at;
GRANT SELECT ON public.watchlist_v TO anon, authenticated;

-- Rollback:
--   Nothing to roll back: on the live project every statement above is a no-op
--   (IF NOT EXISTS / CREATE OR REPLACE with the identical live definition).
--   On a fresh database, drop the schema objects created here.

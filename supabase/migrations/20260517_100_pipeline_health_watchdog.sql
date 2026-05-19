-- Pipeline health watchdog + data-freshness surface.
--
-- Closes the systemic gap exposed by the multi-day fetch-finviz-breadth 429
-- outage: EOD jobs failed silently and the dashboard kept presenting stale
-- data with no signal. This adds (a) a trading-day-aware freshness view the
-- UI can read, (b) an append-only pipeline_health log, (c) a watchdog
-- function that records stale datasets / failed jobs and optionally POSTs to
-- a webhook, and (d) a weekday post-EOD cron that runs it.
--
-- v1 limitation: trading-day math is weekday-based and does NOT know US
-- market holidays — expect a benign one-trading-day "behind" reading on the
-- session immediately after a holiday. Acceptable for alerting; a real
-- holiday calendar is tracked separately.

-- Most recent expected US trading date (weekday, US/Eastern).
create or replace function public.last_expected_trading_date()
returns date
language sql
stable
set search_path = ''
as $$
  with d as (select (now() at time zone 'America/New_York')::date as today)
  select case extract(isodow from today)
           when 6 then today - 1   -- Sat -> Fri
           when 7 then today - 2   -- Sun -> Fri
           else today
         end
  from d
$$;

-- Count of weekdays in (d_from, d_to]. Null-safe (returns 0 if either null).
create or replace function public.trading_days_between(d_from date, d_to date)
returns int
language sql
immutable
set search_path = ''
as $$
  select coalesce(count(*), 0)::int
  from generate_series(d_from + 1, d_to, interval '1 day') g
  where extract(isodow from g) < 6
$$;

-- One row per critical dataset with its latest date and a trading-day-aware
-- staleness flag. Tolerance absorbs the normal intraday gap before the EOD
-- run (and StockBee's occasional late sheet update); 2+ trading days behind
-- on a critical feed is a real outage (the breadth incident was 3).
--
-- Plain (definer-owned) view, consistent with the other *_v views the
-- dashboard reads — it must see base rows regardless of RLS.
create or replace view public.data_freshness_v as
with expected as (select public.last_expected_trading_date() as ed),
ds as (
  select 'equities_snapshot'      as dataset, 'Universe / breadth (FinViz)' as label,
         (select max(snapshot_date)    from public.equities_snapshot)      as latest_date, 1 as tol, true  as crit
  union all select 'scanner_results',      'Super Scanners',      (select max(snapshot_date)    from public.scanner_results),      1, true
  union all select 'sector_etf_snapshot',  'Sector SPDRs',        (select max(snapshot_date)    from public.sector_etf_snapshot),  1, true
  union all select 'breadth_daily_history','Breadth history',     (select max(snapshot_date)    from public.breadth_daily_history),1, true
  union all select 'should_i_trade_history','Should-I-Trade',     (select max(snapshot_date)    from public.should_i_trade_history),1, true
  union all select 'stockbee_breadth_raw', 'StockBee breadth',    (select max(observation_date) from public.stockbee_breadth_raw), 2, true
  union all select 'stockbee_momentum50',  'StockBee Momentum50', (select max(observation_date) from public.stockbee_momentum50),  2, false
  union all select 'vix_history',          'VIX / VVIX',          (select max(observation_date) from public.vix_history),          1, true
  union all select 'index_etf_quotes',     'SPY/QQQ trend',       (select max(observation_date) from public.index_etf_quotes),     1, true
  union all select 'macro_observations',   'Macro (FRED)',        (select max(observation_date) from public.macro_observations),   5, false
)
select
  ds.dataset,
  ds.label,
  ds.latest_date,
  e.ed                                                        as expected_date,
  public.trading_days_between(ds.latest_date, e.ed)           as trading_days_behind,
  (ds.latest_date is null
     or public.trading_days_between(ds.latest_date, e.ed) > ds.tol) as is_stale,
  ds.crit                                                     as is_critical
from ds cross join expected e;

grant select on public.data_freshness_v to anon, authenticated;

-- Append-only log of detected pipeline problems (audit trail + UI source).
create table if not exists public.pipeline_health (
  id          bigint generated always as identity primary key,
  checked_at  timestamptz not null default now(),
  kind        text        not null,            -- 'stale_data' | 'job_failure'
  target      text        not null,            -- dataset or job_name
  severity    text        not null default 'error',
  detail      text
);
alter table public.pipeline_health enable row level security;
create index if not exists idx_pipeline_health_checked on public.pipeline_health (checked_at desc);
grant select on public.pipeline_health to anon, authenticated;

-- Watchdog: record stale critical datasets + jobs whose most recent run in
-- the last 30h errored, then (if configured) POST a summary to a webhook.
-- A webhook failure must never fail the check.
create or replace function public.check_pipeline_health()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_issues  int := 0;
  r         record;
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
end $$;

-- Not part of the public API: cron / service_role only.
revoke execute on function public.check_pipeline_health() from public, anon, authenticated;

-- Run after the EOD pipeline settles (breadth 22:15 UTC, then SIT compute).
do $$
begin
  perform cron.unschedule('pipeline-health-watchdog')
  from cron.job where jobname = 'pipeline-health-watchdog';

  perform cron.schedule(
    'pipeline-health-watchdog',
    '30 23 * * 1-5',
    $cron$ select public.check_pipeline_health(); $cron$
  );
end $$;

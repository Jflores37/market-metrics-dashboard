# Market Metrics audit fix: cross-layer contract (2026-10-28)

Every implementer (frontend, edge_a, edge_b, db) must follow this file. If something here conflicts with a finding's `fix` text, **this file wins**. Each item is tagged with its owner. The source of truth for current SQL is the live DB snapshot (`mm_live/*.json`), not the repo migrations, which have drifted.

## 0. Ground rules (all layers)

- Edit local files only. Don't commit, don't deploy, and don't write to the live DB (SELECT via MCP is fine).
- The repo is **public**, so no secret values go in any file. Refer to secrets by name only: `CRON_SECRET` (edge env), Vault `cron_secret`, Vault `anon_key`, Vault `finviz_token`, Vault `fred_api_key`, Vault `alert_webhook_url`.
- Every user-visible time is **12-hour AM/PM US/Eastern with an "ET" suffix**, e.g. `6:30 PM ET`. Machine formats (ISO, cron, SQL) stay as they are.
- Changes are surgical and match the existing style. Free data only.
- Already handled elsewhere, so **don't redo**: migration `20261028_310_lock_down_job_runs.sql` and `_shared/redact.ts`. Any new string written to `job_runs.error`/`summary` or to a Response must still go through `redact(err, <secret>)`.

## 1. Shared definitions

### 1.1 Market calendar (db creates it; everyone uses it)
Table `public.market_holidays(holiday date primary key, name text)` is seeded with NYSE full-day closures for 2026 and 2027:
2026-01-01, 01-19, 02-16, 04-03, 05-25, 06-19, 07-03, 09-07, 11-26, 12-25;
2027-01-01, 01-18, 02-15, 03-26, 05-31, 06-18, 07-05, 09-06, 11-25, 12-24.
Half days are treated as normal trading days. The migration ends with a comment saying "extend every December".

The functions below are all `STABLE`, `SET search_path=''`, and have **EXECUTE granted to anon and authenticated**, because security_invoker views call them. `market_holidays` gets SELECT for anon/authenticated plus an RLS `USING (true)` select policy.
| function | meaning |
|---|---|
| `public.et_now() returns timestamp` | `now() at time zone 'America/New_York'` |
| `public.et_today() returns date` | `et_now()::date` |
| `public.is_trading_day(d date) returns boolean` | Mon–Fri and not in market_holidays |
| `public.prev_trading_day(d date) returns date` | the latest trading day strictly before d |
| `public.market_session_date() returns date` | today ET if it is a trading day and ET time ≥ 16:00, else `prev_trading_day(et_today())` (the most recent *completed* session) |
| `public.last_eod_date() returns date` | today ET if it is a trading day and ET time ≥ 19:00, else the latest trading day < today (the latest date whose EOD data **must** exist by now) |
| `public.last_expected_trading_date()` | keeps its signature; now holiday-aware (latest trading day ≤ today ET) |
| `public.trading_days_between(a date, b date)` | keeps its signature; now skips holidays |

### 1.2 job_runs status semantics (edge_a, edge_b, db)
db adds `'partial'` to `job_runs_status_check`, so the allowed values are `running | ok | partial | error`.
- **ok**: every unit succeeded and row counts are at or above the job's floor.
- **partial**: some data was written, but at least one non-critical unit failed or degraded. Examples: one scanner of a group failed; some movers screens failed; some FRED series failed; VVIX failed while VIX succeeded; breadth reported `headers_missing`; Should-I-Trade wrote a row while a critical input was older than the session date.
- **error**: nothing useful was written, a critical unit failed, or validation rejected the response. The run must **not** leave half-written state (see edge-a-2/edge-a-4).
- Response validation is mandatory. If a FinViz CSV has no `Ticker` header, a body starting with `<`, or a missing required column, the unit **throws** (an error, never "0 rows ok").
- **When 0 rows counts as error:**
  - fetch-finviz-breadth: main universe < 5000 rows, or any index set below its floor (S&P 500 ≥ 480, NDX ≥ 95, DJIA ≥ 28, RUT ≥ 1500). Either one is an **error**, and no breadth row is written.
  - fetch-finviz-sectors < 12 rows, fetch-index-etf-quotes 0 rows, fetch-vix-yfinance with no VIX close: **error**.
  - fetch-stockbee-*: 0 parsed rows is an **error**. A parsed sheet whose latest date is older than `market_session_date()` is **partial**, with a summary `lagging: true`.
  - fetch-fred: every series failed is an **error**; some failed is **partial**.
  - fetch-cnbc-premarket: 0 articles on a trading day is an **error**. On non-trading days it returns ok with `skipped:'non-trading day'`.
  - fetch-intraday-quotes-movers: every attempted screen errored, or quotes failed, is an **error**. Some screens errored is **partial**. A *validated* empty screen (correct header, 0 data rows) is ok.
  - fetch-finviz-scanners: a validated scan with 0 matching rows is **ok** and is recorded in `scanner_runs` with `fetched=0`. A failed scan is an error unit, and the group status is partial (some failed) or error (all failed).
- Every finishJob summary includes a top-level integer `rows_written`.
- A run killed mid-way stays `running`. db's reaper turns `running` rows older than 15 min into `error` with `error='reaped: stuck running'`.

### 1.3 Cron auth: x-cron-secret (edge_a writes the helper; edge_a and edge_b use it; db sends it)
edge_a creates `supabase/functions/_shared/cron_auth.ts` with exactly this export:
```ts
// Fail-closed guard for cron-only endpoints. pg_cron sends header x-cron-secret
// (value from Vault 'cron_secret'); the function compares it to env CRON_SECRET.
export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";
  const json = (status: number, error: string) =>
    new Response(JSON.stringify({ ok: false, error }), { status, headers: { "Content-Type": "application/json" } });
  if (expected.length < 16) return json(500, "server misconfigured");   // missing secret => closed, never open
  if (got.length !== expected.length) return json(401, "unauthorized");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0 ? null : json(401, "unauthorized");
}
```
- **All 11 functions** call it at the very first line of the `Deno.serve` handler, before creating the client or inserting into job_runs: `const denied = requireCronSecret(req); if (denied) return denied;`. A handler declared `async ()` becomes `async (req: Request)`.
- Import path: `import { requireCronSecret } from "../_shared/cron_auth.ts";`
- verify_jwt: **deploy all 11 functions with verify_jwt=true**. The cron helper always sends `Authorization: Bearer <Vault anon_key>`, so this is safe. x-cron-secret is the real guard and verify_jwt is defense in depth. There is no config.toml today. Add `supabase/functions/<name>/` deploy notes in the summary only; don't invent a config file.

### 1.4 SQL cron invocation helper (db)
`public.invoke_edge(p_fn text, p_query text default null, p_timeout_ms int default 30000) returns bigint`, `SECURITY DEFINER`, `search_path=''`. EXECUTE is revoked from public/anon/authenticated.
- It builds the URL `https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/<p_fn>[?<p_query>]` and headers `Content-Type: application/json`, `Authorization: Bearer <get_secret('anon_key')>`, `x-cron-secret: <get_secret('cron_secret')>`.
- **It raises an exception** when either secret is null, so a cron run shows `failed` in `cron.job_run_details` and never fires an unauthenticated call.
- Migration 340 harvests the anon key from an existing cron command (same technique as migration 220) into Vault `anon_key` when it is absent, using `vault.create_secret`. No key is written in the file. If Vault `cron_secret` is missing, migration 340 must **RAISE EXCEPTION** (abort) so cron is never rewritten before the secret exists.

## 2. Migrations (db). Numbering, one concern per file

Naming is `supabase/migrations/20261028_<NNN>_<slug>.sql`, starting at 320. Each file must:
- be idempotent (`CREATE OR REPLACE`, `IF [NOT] EXISTS`, `DROP POLICY IF EXISTS`, cron unschedule-by-name before schedule);
- start with a header comment listing the finding ids it fixes;
- end with a `-- Rollback:` comment block.
- **Preserve live `security_invoker` reloptions and anon/authenticated SELECT grants** on every view it recreates.
- Only append columns with CREATE OR REPLACE VIEW. If a column must change, DROP and recreate the dependents in the same file, then re-grant.

| file | concern | findings |
|---|---|---|
| 320_live_schema_baseline | Live `CREATE OR REPLACE` of **all 44 public views + public functions** as of today, from `mm_live/views.json` and `functions.json`, run before any change. It is a no-op on live and makes the repo rebuildable. Tables go in as `CREATE TABLE IF NOT EXISTS` from `tables.json`, with a TODO comment for constraints. The header documents `supabase migration repair --status applied 20260604_200 … 20261028_310` (user runs it; no direct inserts into schema_migrations). | db-logic-06 |
| 330_market_calendar | §1.1 | db-logic-09, sit-05 (prereq) |
| 340_job_runs_partial_and_invoke_edge | status check + `invoke_edge` + anon_key harvest (§1.2, §1.4) | edge-a-5/edge-b-08 (SQL side) |
| 350_cron_schedules | §5 cron table | edge-b-04, db-logic-13, ops-9, edge-b-06, ops-10 |
| 360_scanner_runs_latest_semantics | §3.3 | sit-03, db-logic-14 |
| 370_rrg_trail_window | §3.1 | macro-1, db-logic-01, db-logic-02 |
| 380_classify_stage_bands | §3.6 | macro-2, macro-3, db-logic-08 |
| 390_intraday_dashboard_and_earnings | §3.2, §3.4 | sit-01, ops-2, db-logic-15, sit-05, sit-11, db-logic-12 |
| 400_avg_volume_units | §3.7 | edge-a-6, ops-7 |
| 410_should_i_trade_inputs_as_of | §3.5 | sit-06 |
| 420_key_metrics_denominator_labels | §3.8 | db-logic-10, db-logic-11 |
| 430_macro_ppi_final_demand | §3.9 | macro-5 (+ data_fetched_at for macro-6) |
| 440_freshness_and_failures_coverage | §4.1 | db-logic-03, ops-6 (part) |
| 450_watchdog | §4.2 | db-logic-04, ops-5, ops-6 |
| 460_retention | §6 | ops-3 |
| 470_revoke_journal_net_anon | revoke anon ALL on `journal.*` tables/sequences, `ALTER DEFAULT PRIVILEGES IN SCHEMA journal REVOKE ALL … FROM anon`, revoke anon EXECUTE on `net.http_post/http_get` and SELECT on `net._http_response`. **Keep authenticated grants.** | ops-13 |
| 480_drop_dead_views | **apply AFTER the frontend deploy**: `DROP VIEW IF EXISTS thematics_by_theme_v, should_i_trade_v, sector_pulse_v` | macro-4 (DB side), db-logic-16 |

## 3. View and column contract (what the frontend reads)

### 3.1 RRG: `rrg_sectors_trail_v` (same columns)
- It keeps the existing columns: `ticker, sector_label, snapshot_date, rs_ratio_raw, rs_momentum_raw, rs_ratio, rs_momentum`.
- The `rs` CTE is restricted to `snapshot_date >= max(snapshot_date) - 60`. Momentum = rs_raw − the rs_raw at the latest date ≤ d−7, computed with a window function and no correlated subquery: `last_value(rs_raw) over (partition by ticker order by snapshot_date range between unbounded preceding and interval '7 days' preceding)`.
- Output is restricted to `snapshot_date >= max - 35` days, which is about 275 rows and well under the 1000-row cap.
- `rrg_sectors_v` is unchanged apart from benefiting from this.
- **Frontend:** keep `.order("snapshot_date")` ascending and `slice(-TAIL_LEN)`. Also add `.gte('snapshot_date', <ET today − 21 days>)` as belt-and-braces.

### 3.2 Intraday dashboard: `intraday_dashboard_v.dashboard` jsonb
Existing keys are unchanged in shape. Changes:
- `premarket`: each item adds `fetched_at` and `as_of_date`. Selection is `row_number() over (partition by source order by rank nulls last)`, with **≤ 20 for finviz_up, ≤ 20 for finviz_down, ≤ 10 for cnbc**. `jsonb_agg(... ORDER BY source, rank)`. The cnbc branch of `intraday_premarket_v` filters `article_date = public.et_today()`. The finviz branches keep only the latest batch, and only when `(fetched_at at time zone 'America/New_York')::date = public.et_today()`; otherwise they return 0 rows, so a stale batch is never shown as today's.
- New top-level keys:
  - `premarket_fetched_at` (timestamptz or null: the max fetched_at of the premarket batch)
  - `movers_fetched_at` (max fetched_at of gainer/loser/in_play)
  - `earnings_counts` `{ "today": int, "yesterday": int }` (totals before truncation)
  - `prices_as_of` (date: max equities_snapshot.snapshot_date, the date behind earnings price/perf_day).
- `earnings_yest_today`: `row_number() over (partition by bucket order by market_cap_millions desc nulls last) <= 25`, ordered by bucket ('today' first), then market cap.
- `intraday_freshness_v` keeps its existing columns `data_as_of, is_stale` and is computed **from gainer/loser/in_play only**. It appends `premarket_as_of timestamptz`.

### 3.3 Scanners: latest-snapshot semantics
- New table `public.scanner_runs(scanner_id text, snapshot_date date, status text check in ('ok','error'), fetched int, inserted int, finished_at timestamptz default now(), primary key (scanner_id, snapshot_date))`. It is written (upserted) by fetch-finviz-scanners via the service role, **once per scanner per run, including 0-row successes**. It has **no error-text column**; error text goes only to job_runs. Anon/authenticated get SELECT with an RLS select-true policy.
  - Backfill: `insert … select distinct scanner_id, snapshot_date, 'ok', count, count from scanner_results … on conflict do nothing`.
- A scanner's **current date** = `greatest(max(snapshot_date) from scanner_runs where status='ok', max(snapshot_date) from scanner_results)`, per scanner. The fallback keeps the old function working until edge deploys.
- `scanner_results_latest_v`: same columns, rows of `scanner_results` on that scanner's current date. **A 0-row ok run makes the current date today with 0 rows**, so the card shows "No matches today" and never last week's list. `scanner_latest_v` follows the same rule.
- `scanner_summary_v`: existing columns, with `row_count` = **rows on the current date only** (db-logic-14) and `snapshot_date` = current date. Appended columns:
  - `global_snapshot_date date` (max current date across all scanners)
  - `is_stale boolean` (`snapshot_date < global_snapshot_date`, or null)
  - `last_run_status text` (the status of the scanner_runs row on global_snapshot_date, or null)
  - `last_run_fetched int`
- **Frontend (sit-02 / db-logic-07):** `useScannerResults` pages with `.range(i, i+999)` until a page returns < 1000 rows (club_97 has ~1,514). The card badge shows the fetched length, and CSV/WL export use the full set.
- **Frontend (sit-03):**
  - `is_stale` → amber badge "Last good scan: <date>".
  - `last_run_status='error'` → red "Scan failed today".
  - `row_count=0` with ok → "No matches today".
  - Fix the false comment at SuperScanners.tsx:109-114 / 209-211.

### 3.4 Earnings
- `earnings_yesterday_today_v`: "yesterday" = `public.prev_trading_day(public.et_today())` (Monday → Friday, skips holidays) in both the WHERE clause and the bucket CASE. Bucket values stay `'today' | 'yesterday'`, where 'yesterday' now means the previous session.
- Both earnings views dedupe rescheduled rows: `DISTINCT ON (ticker)` keeps the latest `fetched_at` within the view's window.
- `avg_volume` ×1000 per §3.7.
- **Frontend (sit-09):** relabel to "Prev Close" / "Prev Day %", show `as of <prices_as_of>`, label the yesterday bucket "Prev session", and render "top N of M" from `earnings_counts`.

### 3.5 Should-I-Trade
- `should_i_trade_history` appends `inputs_as_of date` (nullable).
- `should_i_trade_latest_v` appends `inputs_as_of`. `is_stale` is redefined as `coalesce(inputs_as_of, snapshot_date) < public.last_eod_date()`. `market_date` stays.
- **edge_a (compute-should-i-trade, edge-a-3):**
  - Check `error` on every query and throw.
  - Record each input's latest date in `raw_inputs.input_dates` (`{vix, index_etf, breadth, sectors, stockbee, macro}`).
  - `inputs_as_of = least(vix, index_etf, breadth, sectors)`, which are the critical inputs.
  - `snapshot_date = rpc('market_session_date')`, never the wall clock. That removes holiday and weekend rows; a Saturday catch-up writes Friday's row.
  - Status is partial when `inputs_as_of < snapshot_date`.
  - `buildMomentum`'s sector query gets `.gte('snapshot_date', <14 days back>)`; it is currently unbounded.
- The intraday cron (job 16) is **unscheduled**, because every input is EOD-only.

### 3.6 Stage classification: `classify_stage(sma20_pct, sma50_pct, ema10_pct)` (signature unchanged)
```
e10 := coalesce(ema10_pct, sma20_pct); s20 := coalesce(sma20_pct, ema10_pct)
if sma50_pct is null or e10 is null or s20 is null -> '1A'       (no data; unchanged)
if sma50_pct >= 0:                                                (0 counts as "at/above")
   if e10 >= 0 and s20 > 0  -> sma50<5:'2A' | sma50<15:'2B' | else '2C'
   if e10 >= 0 and s20 <= 0 -> '2A'      -- explicit: pullback to SMA20 inside an advance
   (e10 < 0)                -> s20 < 0 ? '3B' : '3A'
else (sma50_pct < 0):
   if e10 < 0 and s20 < 0   -> sma50>-5:'4A' | sma50>-15:'4B' | else '4C'
   if e10 > 0 and s20 > 0   -> '1B'
   else                     -> '1A'
```
The bands are: 2A 0–5%, 2B 5–15%, 2C >15% above SMA50; 4A 0–5%, 4B 5–15%, 4C >15% below.

**Frontend:** update `STAGE_DESC` (StageAnalysisCard) to show these bands and the pullback rule.

### 3.7 avg_volume units (db only)
`equities_snapshot.avg_volume` **stays in thousands**, because `_phase5b_liquid_universe` and `stage_analysis_v` thresholds depend on it. Every public view whose **output column** `avg_volume` comes from equities_snapshot outputs `avg_volume * 1000`. That covers `earnings_this_week_v`, `earnings_yesterday_today_v`, `watchlist_v`, `sp500_landscape_v` and `thematics_top_movers_v`; db verifies the list against live. Internal filters are unchanged. Neither edge nor frontend changes anything here.

### 3.8 Key metrics
- `key_metrics_v.pct` = `above / nullif(above+below, 0)` for rows that have a below_count. For nh20/nl20 the denominator is `count(*) filter (where high52w_pct is not null)` (or `low52w_pct`).
- The nh/nl `below_count` stays NULL.
- The labels become "Closed at 52-Wk High" / "Closed at 52-Wk Low" (relabel, no tolerance band). Apply the same relabel wherever breadth labels say "New 52-Week Highs".
- **Frontend (macro-9):** print `/below` only when `below_count != null`.

### 3.9 Macro
- `macro_series_meta`: insert `PPIFIS` ('PPI Final Demand', inflation, Index, monthly, yoy_pct, display_order 20, active), and set `PPIACO.is_active=false` (its rows are kept).
- `macro_kpi_v` ppi_yoy reads `PPIFIS`. The label/short is `'PPI (Final Demand)'` / `'PPI'`, and the source mapping is `PPIFIS`.
- fetch-fred reads meta, so no edge code change is needed for the series list. After deploy, run fetch-fred once so the KPI isn't null.
- `macro_monitor_dashboard_v` appends the top-level key `data_fetched_at` (`max(macro_observations.fetched_at)`). `generated_at` stays.
- **Frontend:**
  - macro-6: replace the countdown with `Updated <data_fetched_at as h:mm AM/PM ET>`.
  - macro-8: decide monthly vs daily formatting with `MONTHLY_METRICS = {cpi_yoy, core_cpi_yoy, ppi_yoy, pce_yoy, core_pce_yoy, unemployment, nfp, sentiment}`.
  - sit-10 / ops-11: ShouldITrade "DXY" → **"USD Broad Index"**, with its observation date shown.

### 3.10 Other frontend-only items
- **macro-4:** remove the `ThematicsByThemeTable` component and its usages in MarketMetrics.tsx and IndustryThemeBlocks.tsx.
- **macro-7:** fiscal rows show their observation date or an FY/Q tag.
- **macro-10:** the breadth header total comes from `key_metrics_v` `metric_id='stocks'`.
- **macro-11:** filter out `'—'`.
- **sit-08:** dateLong parses `YYYY-MM-DD` as a local calendar date.
- **sit-12 / ops-12:** use the labels "10m" / "~10 min" (including Layout.tsx footer "intraday ~10 min"), and show the premarket section's own `premarket_fetched_at`.
- **sit-13:**
  - All times use `toLocaleTimeString('en-US', {hour:'numeric', minute:'2-digit', hour12:true, timeZone:'America/New_York'}) + ' ET'`.
  - The TradingView embed uses `timezone=America%2FNew_York` and `encodeURIComponent(ticker)`.
- **TickerTape (pairs with edge_b sit-07):**
  - Prefer the `intraday_quotes_latest_v` row for a sector SPDR when its `fetched_at` is today ET.
  - Otherwise fall back to `sector_etf_latest_v` and mark the item "prev close". Don't render the same ticker twice.
- **FreshnessBanner:**
  - Handle `status='partial'` (amber "degraded") as well as error/stuck.
  - Add JOB_LABEL entries: `fetch-stockbee-momentum50`, `fetch-finviz-scanners:<group>`, `db-retention`, `fetch-fred`, `fetch-cnbc-premarket`.

## 4. Freshness and watchdog (db)

### 4.1 Views
- `data_freshness_v`, same columns:
  - `expected_date = public.last_eod_date()`.
  - The tol values become: EOD feeds (equities, scanners, sectors, breadth history, SIT, vix, index_etf) **0**; StockBee breadth and Momentum50 **1**; macro **5**.
  - The Should-I-Trade row uses `max(coalesce(inputs_as_of, snapshot_date))`.
  - New non-critical rows: `earnings_calendar` (max of `(fetched_at at time zone 'America/New_York')::date`, tol 0) and `cnbc_premarket_raw` (max article_date, tol 0).
  - Result: during the session, yesterday's EOD counts as fresh; after 7 PM ET a missing today flips to stale the same evening.
- `pipeline_failures_v` stays **security_invoker=off** and keeps the columns `job_name, status, started_at` (no error/summary text).
  - It covers **all job names**, not a whitelist.
  - It shows the latest run per job in the last 36h where status is `error` or `partial`, or `running` with started_at < now() − 15 min.

### 4.2 Watchdog
- `check_pipeline_health()` covers:
  - (a) critical stale rows in data_freshness_v;
  - (b) latest run per job in 30h with status error (severity error) or partial (severity warn), for every job, including fetch-fred, fetch-cnbc-premarket and fetch-stockbee-momentum50;
  - (c) it **reaps** running > 15 min to error;
  - (d) `scanner_runs` rows with status error on the global date;
  - (e) Should-I-Trade `inputs_as_of < last_eod_date()`.
- Webhook: it reads Vault `alert_webhook_url` via `get_secret`, falling back to `app_config`. It is never stored anywhere anon can read. Setting it is a **user action**.
- Dedupe: it doesn't re-post the same (kind, target) within 6h.
- Timing (DST-safe): cron `30 23,0 * * *` with the guard `public.is_trading_day(public.et_today()) and extract(hour from public.et_now()) = 19`. That gives exactly one run at 7:30 PM ET on trading days, all year.
- New function `check_intraday_health()`: cron `*/15 13-21 * * 1-5`, which returns immediately unless it is a trading day and ET time is between 9:45 AM and 4:00 PM.
  - It alerts when the max fetched_at of gainer/loser/in_play, or the SPY row in intraday_quotes, is older than 25 min.
  - At the first run after 9:45 AM ET, it alerts if no premarket_up batch exists for today ET.
  - Dedupe is 2h.
- Coverage list: every job in §5, plus the data feeds `equities_snapshot, scanner_results/scanner_runs, sector_etf_snapshot, breadth_daily_history, should_i_trade_history, stockbee_breadth_raw, stockbee_momentum50, vix_history, index_etf_quotes, macro_observations, earnings_calendar, cnbc_premarket_raw, intraday_movers, intraday_quotes`.

## 5. Cron (db, migration 350): DST-safe approach

pg_cron runs in UTC. **ET-anchored jobs are scheduled at both candidate UTC hours with a SQL guard on ET hour**, so exactly one fires in each season. EOD jobs at 21:30–22:59 UTC are after the close in both seasons and stay single-UTC. Every HTTP job becomes `select public.invoke_edge('<fn>', '<query or null>', <timeout>) [where <guard>];`.

| job | schedule (UTC) | guard | timeout |
|---|---|---|---|
| fetch-finviz-sectors-eod | 32 21 * * 1-5 | — | 30000 |
| fetch-stockbee-breadth-eod / -momentum50-eod | 0 22 / 2 22 * * 1-5 | — | 30000 |
| fetch-stockbee-breadth-catchup / -momentum50-catchup (new) | 30 11 / 32 11 * * 2-6 | — | 30000 |
| fetch-vix-yfinance-eod, fetch-index-etf-quotes-eod | 4 22 / 6 22 * * 1-5 | — | 30000 |
| fetch-finviz-breadth-eod | 15 22 * * 1-5 | — | 120000 |
| fetch-intraday-quotes-movers-10min | */10 12-21 * * 1-5 | ET hour between 8 and 16 | 30000 |
| compute-should-i-trade-eod | 30 22 * * 1-5 | — | 30000 |
| compute-should-i-trade-catchup (new) | 45 11 * * 2-6 | — | 30000 |
| compute-should-i-trade-intraday | **unschedule** | | |
| finviz-scanners-trend/perf/perf2/special | 35/42/49/56 22 * * 1-5 (query `group=<g>`) | — | 150000 |
| fetch-fred-0835 | 35 12,13 * * 1-5 | ET hour = 8 | 120000 |
| fetch-fred-1005 | 5 14,15 * * 1-5 | ET hour = 10 | 120000 |
| fetch-fred-1800 | 0 22 * * 1-5 | — | 120000 |
| fetch-cnbc-premarket-0845/0915/0930 | 45 12,13 / 15 13,14 / 30 13,14 * * 1-5 | ET hour = 8 / 9 / 9 | 30000 |
| pipeline-health-watchdog | 30 23,0 * * * | (inside function, §4.2) | — |
| intraday-health-watchdog (new) | */15 13-21 * * 1-5 | (inside function) | — |
| db-retention (new) | 15 9 * * * | — | — |

Jobs are matched by **jobname** (`cron.alter_job` or unschedule + schedule by name), never by jobid.

## 6. Retention (db, migration 460)

`public.run_retention()` is SECURITY DEFINER, deletes in batches, and logs `job_runs` as `db-retention` with per-table counts (ok/error). **Cutoffs are anchored to each table's own max date, not to today**, so a dead feed can never empty a table. Run `VACUUM (ANALYZE) equities_snapshot, scanner_results` once after the first purge; that is a rollout step, because VACUUM can't run inside a function.

| table | keep | justification (max lookback that reads it) |
|---|---|---|
| equities_snapshot | 60 calendar days before its max(snapshot_date) | longest reader is `equity_ma10_latest_v` (21 days); every other view reads the latest date only; about 3× margin. Saves about 170 MB of the 254 MB. |
| scanner_results | 30 days before its max | views read each scanner's current date only |
| scanner_runs | 90 days | tiny; watchdog reads the latest date |
| job_runs | **30 days** (user decision) | pipeline_failures_v 36h, watchdog 30h. This also purges the June rows 1504/1924 that contain the token. |
| pipeline_health | 90 days | dedupe reads 6h |
| intraday_quotes / intraday_movers | 3 days (safety net; the function already prunes 24h) | views read the latest batch |
| cnbc_premarket_raw | 14 days | view reads today ET |
| earnings_calendar | earnings_date < et_today() − 30 | views read prev trading day through next week |
| cron.job_run_details | 14 days | diagnostics only |
| net._http_response | 2 days | diagnostics only (pg_net TTL already short) |
| **never purged** | sector_etf_snapshot, vix_history (SIT reads 252), index_etf_quotes, breadth_daily_history, stockbee_*, macro_observations, should_i_trade_history, watchlists | small, and they hold history the UI or SIT reads |

## 7. Edge function contract summary

- **edge_a** (compute-should-i-trade, fetch-finviz-*, _shared):
  - creates `_shared/cron_auth.ts` (§1.3) and applies it;
  - status semantics (§1.2);
  - breadth fails or cleans up on any index set below its floor, and on error deletes the equities_snapshot rows it wrote for snapshot_date (edge-a-2);
  - `AbortSignal.timeout(20000)` on every FinViz fetch, with a timeout counted as retryable (edge-a-7);
  - validate CSV headers (edge-a-4, edge-a-10);
  - delete+insert per scanner: check the delete error, and if the insert fails, the scanner is an error unit and `scanner_runs` gets status error (edge-a-4);
  - upsert `scanner_runs` for every scanner (§3.3);
  - earnings stale-row delete runs only when both week pulls parsed > 0 rows, and its error is checked (edge-a-10);
  - breadth writes NULL (not 0) for new_20day_* when the header is missing, and headers_missing makes the run partial (ops-8);
  - the SIT fixes in §3.5 (edge-a-3), edge-a-8 (round before comparing) and edge-a-9 (`nh > nl` with both non-null).
- **edge_b** (cnbc, fred, index-etf, movers, stockbee, vix):
  - apply `requireCronSecret`;
  - fetch-fred writes job_runs (`fetch-fred`, ok/partial/error, error and per-series errors via `redact(…, apiKey)`) (edge-b-03, edge-b-09);
  - movers throws on `idx.ticker < 0` and applies status semantics (edge-b-05);
  - add the 11 SPDRs (XLK XLV XLC XLY XLU XLI XLE XLRE XLF XLB XLP) to the movers quote list with `display_label` = ticker (sit-07);
  - vix uses `Promise.allSettled`, fails only on VIX, upserts VIX and VVIX as separate column payloads (never writing null over a stored value), and skips NYSE holidays via `rpc('is_trading_day')` (edge-b-07);
  - cnbc gets a working free source (try CNBC's RSS/franchise "stocks making the biggest moves premarket" articles). In every case, 0 articles on a trading day = error (edge-b-02);
  - stockbee marks the run partial with `lagging:true` when the sheet's latest date < `market_session_date()` (edge-b-06 support).
- **Neither** edits `supabase/migrations`, and **neither** edits the other's functions. edge_b imports `_shared/cron_auth.ts` with the exact signature above, even before edge_a's file lands.

## 8. Rollout order (so nothing 401s mid-rollout)

1. **Secrets (user)**
   - Generate one random value of 32+ chars.
   - Set edge secret `CRON_SECRET` with it.
   - Create Vault `cron_secret` with the same value.
   - Optionally set Vault `alert_webhook_url` (a Discord webhook).
   - Rotate the FinViz Elite token and update Vault `finviz_token`; this belongs to the separately handled 310/redact work.

   Old functions ignore the new header, so nothing breaks yet.
2. **SQL**
   - Run `supabase migration repair` for 200–310 per the 320 header.
   - Apply 320 → 470 in order; 340 aborts if `cron_secret` is missing. After 350, cron sends Bearer + x-cron-secret. The old deployed code ignores x-cron-secret and verify_jwt functions still get Bearer, so there are **no 401s**.
   - Views are backward compatible with the current frontend: append-only columns, same jsonb shapes, scanner fallback.
3. **Functions**: deploy all 11 with verify_jwt=true and `_shared` bundled. Check each one with `get_edge_function`.
   - Smoke test: `select public.invoke_edge('fetch-fred', null, 120000);`, then check `net._http_response` for 200 (not 401) and the `job_runs` row.
   - Check that an unauthenticated curl gets 401.
   - Then run fetch-fred once for PPIFIS.
4. **Frontend**: push to main (Vercel). Then apply **480_drop_dead_views**.
5. **Post-checks**
   - `VACUUM (ANALYZE)` after the first retention run.
   - Over 24h, look for 401s in `net._http_response` and for `partial`/`error` in pipeline_failures_v.
   - Confirm the watchdog fired exactly once at 7:30 PM ET.

Rollback for each file is in its `-- Rollback:` block. For auth, unset nothing; redeploying the previous function versions restores open access, since the old code ignores the header.

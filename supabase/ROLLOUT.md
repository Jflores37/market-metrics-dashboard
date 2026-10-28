# Market Metrics audit fix: rollout (2026-10-28)

Run the steps in order. Each step lists what to do, the check that must pass before you move on, and how to roll back. No secret values appear in this file; secrets are named only.

Project: `xwjjrxdsegakshpxzfhi`. Run SQL in the Supabase SQL editor or MCP `execute_sql` / `apply_migration`.

**Best window:** after 8:00 PM ET on a trading day, or on a weekend. The EOD jobs run from 5:32 PM to 6:56 PM ET, so avoid that window.

**Dry run already done:** migrations 310 through 480 were run on PGlite (Postgres 17.5) with stubbed `cron`, `net`, `vault` and `auth` schemas, in live order: baseline, then 310, then 320, then 330–480, then 330–480 a second time to check idempotency. Every file applied cleanly. After that:
- anon could read all 25 objects the frontend reads.
- anon was denied `job_runs` and `invoke_edge`.
- `invoke_edge` sent Bearer + `x-cron-secret` with a 120000 ms timeout.
- The calendar and `classify_stage` returned the expected values.
- The watchdog and retention functions ran.

**Never re-run 320 after 330+ is applied.** It is a snapshot of today's live state, so re-running it fails with "cannot drop columns from view" and would revert the fixes.

---

## Step 1 — Secrets (you)

1. Generate one random value of 32+ characters (for example `openssl rand -hex 32`).
2. Set it as the **edge secret `CRON_SECRET`**: Dashboard → Edge Functions → Secrets, or `supabase secrets set CRON_SECRET=<value>`.
3. Store the **same value** in **Vault as `cron_secret`**: `select vault.create_secret('<value>', 'cron_secret');`
4. Optional: put a Discord webhook URL in **Vault as `alert_webhook_url`**: `select vault.create_secret('<url>', 'alert_webhook_url');`. Without it, watchdog alerts only land in `pipeline_health`.
5. Separate track: rotate the FinViz Elite token and update **Vault `finviz_token`**.

You don't need to create Vault `anon_key`. Migration 340 copies it from an existing cron job's Bearer header and refuses anything whose role isn't `anon`. A read-only check today confirmed the token there is the anon key.

**Verify:**
```sql
select name from vault.secrets where name in ('cron_secret','alert_webhook_url');   -- cron_secret present
select length(decrypted_secret) >= 16 from vault.decrypted_secrets where name='cron_secret';  -- true
```
Confirm `CRON_SECRET` appears in the dashboard's edge secrets list. Values can't be read back, so make sure you pasted the identical value in both places.

**Rollback:** `delete from vault.secrets where name='cron_secret';` and unset `CRON_SECRET`. This is harmless: the currently deployed functions ignore both.

---

## Step 2 — SQL migrations (in this exact order)

**2a. Migration history.** Files 20260604_200 through 20261028_310 were applied by hand and aren't recorded. If you use the CLI, run `supabase migration repair --status applied <version>` for them (details in the 320 header). Don't insert into `schema_migrations` directly. The `YYYYMMDD_NNN` names collapse to one CLI version per day, so apply the files below one at a time with MCP `apply_migration` or the SQL editor, in this order.

**2b. Apply these files:**

| # | file | check after applying |
|---|---|---|
| 1 | `20261028_310_lock_down_job_runs.sql` (prepared separately; apply it first if it isn't live yet) | `select relname, reloptions from pg_class where relname='pipeline_failures_v';` → `security_invoker=off` |
| 2 | `20261028_320_live_schema_baseline.sql` | No-op on live. `select count(*) from pg_views where schemaname='public';` → unchanged (44) |
| 3 | `20261028_330_market_calendar.sql` | `select public.is_trading_day('2026-11-26'), public.prev_trading_day('2026-11-30'), public.market_session_date(), public.last_eod_date();` → `false, 2026-11-27, …` |
| 4 | `20261028_340_job_runs_partial_and_invoke_edge.sql` (**aborts if Vault `cron_secret` is missing**, which is intended) | `select count(*) from vault.secrets where name in ('anon_key','cron_secret');` → 2. `select pg_get_constraintdef(oid) from pg_constraint where conname='job_runs_status_check';` includes `partial` |
| 5 | `20261028_350_cron_schedules.sql` | `select jobname, schedule, left(command,80) from cron.job order by jobname;` → every HTTP job calls `public.invoke_edge(...)`, there is no `Bearer` in any command, and `compute-should-i-trade-intraday` is gone. See the smoke test below. |
| 6 | `20261028_360_scanner_runs_latest_semantics.sql` | `select count(*) from public.scanner_runs;` > 0 (backfilled). `select scanner_id, snapshot_date, row_count, is_stale, last_run_status from public.scanner_summary_v order by 1;` |
| 7 | `20261028_370_rrg_trail_window.sql` | `select count(*), min(snapshot_date), max(snapshot_date) from public.rrg_sectors_trail_v;` → about 275 rows, about 35 days |
| 8 | `20261028_380_classify_stage_bands.sql` | `select stage, count from public.stage_analysis_counts_v order by sort_order;` → 2B/4B are no longer near-empty |
| 9 | `20261028_390_intraday_dashboard_and_earnings.sql` | `select dashboard ? 'premarket_fetched_at', dashboard->'earnings_counts', dashboard->>'prices_as_of' from public.intraday_dashboard_v;` |
| 10 | `20261028_400_avg_volume_units.sql` | `select ticker, avg_volume from public.earnings_this_week_v where ticker='AAPL';` → millions, not about 44K |
| 11 | `20261028_410_should_i_trade_inputs_as_of.sql` | `select snapshot_date, inputs_as_of, is_stale from public.should_i_trade_latest_v;` |
| 12 | `20261028_420_key_metrics_denominator_labels.sql` | `select universe_id, metric_id, metric_label, pct from public.key_metrics_v where metric_id in ('nh20','nl20') limit 4;` → "Closed at 52-Wk High/Low" |
| 13 | `20261028_430_macro_ppi_final_demand.sql` | `select series_id, is_active from public.macro_series_meta where series_id in ('PPIFIS','PPIACO');` → PPIFIS active, PPIACO inactive. `ppi_yoy` stays null until fetch-fred runs in step 3. |
| 14 | `20261028_440_freshness_and_failures_coverage.sql` | `select dataset, expected_date, latest_date, is_stale from public.data_freshness_v;` → includes `earnings_calendar` and `cnbc_premarket_raw` |
| 15 | `20261028_450_watchdog.sql` | `select jobname, schedule from cron.job where jobname like '%watchdog%';` → `30 23,0 * * *` and `*/15 13-21 * * 1-5` |
| 16 | `20261028_460_retention.sql` | `select jobname, schedule from cron.job where jobname='db-retention';` → `15 9 * * *` (4:15 AM ET in winter, 5:15 AM ET in summer) |
| 17 | `20261028_470_revoke_journal_net_anon.sql` | `select has_table_privilege('anon','net._http_response','select');` → ideally false. supabase_admin owns `net`, so this may stay true; the file documents why that's acceptable (`net` isn't exposed through the API). |

**Do not apply 480 yet.** It comes after the frontend deploy (step 4).

**Smoke test (after 350; old functions still deployed):**
```sql
select public.invoke_edge('fetch-index-etf-quotes', null, 30000);   -- returns a request id
-- wait about 10 s
select id, status_code, left(content,120) from net._http_response order by id desc limit 1;  -- expect 200
```
This proves cron still works with the old code: it ignores `x-cron-secret`, and the verify_jwt=true functions get the Bearer anon key.

**Backward compatibility:** every view change only appends columns or jsonb keys, and the scanner "current date" falls back to `scanner_results` until the new scanner code writes `scanner_runs`. The live frontend keeps rendering throughout.

**Rollback:** run each file's `-- Rollback:` block in **reverse** order (470 → 330). For cron (350), roll back before 340, because the jobs call `invoke_edge`. A view rollback is `DROP VIEW` and then re-running that view's block from 320 plus its GRANT, as each file spells out.

---

## Step 3 — Edge functions (deploy all 11 with verify_jwt = true)

Deploy from the repo root so `_shared/` (`cron_auth.ts`, `redact.ts`) is bundled:

| function | verify_jwt today | deploy with |
|---|---|---|
| fetch-finviz-breadth | false | **true** |
| fetch-finviz-sectors | false | **true** |
| fetch-finviz-scanners | true | **true** |
| compute-should-i-trade | true | **true** |
| fetch-intraday-quotes-movers | true | **true** |
| fetch-fred | false | **true** |
| fetch-cnbc-premarket | false | **true** |
| fetch-stockbee-breadth | false | **true** |
| fetch-stockbee-momentum50 | false | **true** |
| fetch-vix-yfinance | false | **true** |
| fetch-index-etf-quotes | false | **true** |

`supabase functions deploy <name>`. Don't pass `--no-verify-jwt`.

Prerequisites, all from steps 1–2:
- `CRON_SECRET` is set. Without it, every function fails closed with 500 "server misconfigured".
- 330 is applied (`market_session_date`, `is_trading_day`, `market_holidays`).
- 340 is applied (status `partial`).
- 360 is applied (`scanner_runs`).
- 410 is applied (`inputs_as_of`).

**Verify:**
1. In the dashboard or `get_edge_function`, each of the 11 shows a new version with verify_jwt = true.
2. Unauthenticated requests are refused:
   `curl -s -o /dev/null -w "%{http_code}" -X POST https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/fetch-fred` → **401**. Bearer anon alone, without `x-cron-secret`, must also give **401**.
3. The cron path works:
   ```sql
   select public.invoke_edge('fetch-fred', null, 120000);
   -- wait about 60 s
   select status_code from net._http_response order by id desc limit 1;               -- 200
   select job_name, status, summary->>'rows_written' from public.job_runs
    where job_name='fetch-fred' order by id desc limit 1;                              -- ok or partial
   select metric_id, value_num, observation_date from public.macro_kpi_v where metric_id='ppi_yoy';  -- not null (PPIFIS)
   ```
4. Optional: also run `select public.invoke_edge('fetch-cnbc-premarket');`. On a trading morning it should give status `ok` with rows in `cnbc_premarket_raw`. On a non-trading day it gives `ok` with `skipped`.

**Rollback:** redeploy the previous versions (current live versions: breadth v8, sectors v3, scanners v13, SIT v3, movers v4, fred v2, cnbc v1, stockbee-breadth v1, momentum50 v2, vix v1, index-etf v1). Cron keeps working, because old code ignores `x-cron-secret` and `invoke_edge` still sends the Bearer anon key. If you also want verify_jwt back to false on the original eight, redeploy them with `--no-verify-jwt`. Not recommended.

---

## Step 4 — Frontend, then drop the dead views

1. Push to `main`; Vercel deploys it.
2. Check on production at phone width:
   - TopBar clock reads `h:mm AM/PM ET`.
   - Macro Monitor shows `Updated h:mm AM/PM ET` and "PPI (Final Demand)".
   - Should-I-Trade shows "USD Broad Index · <date>".
   - Super Scanners: club_97 shows about 1,500 rows; stale/failed badges appear where relevant.
   - Market Metrics no longer has the "Thematics · by Theme" card.
   - RRG tails reach the latest date.
   - The ticker tape shows live SPDR quotes during market hours and "prev close" otherwise.
3. Apply `20261028_480_drop_dead_views.sql`.
   **Verify:** `select viewname from pg_views where viewname in ('thematics_by_theme_v','should_i_trade_v','sector_pulse_v');` → 0 rows. Reload every page: no 404s from PostgREST in the browser console.

**Rollback:** `git revert` the frontend commit and push. For 480, re-run the three views' blocks from 320 plus their GRANTs, as noted in the file's rollback block. Revert the frontend before restoring the views only if the old frontend is back live.

---

## Step 5 — Post-checks (next 24 hours)

1. After the first retention run (4:15 or 5:15 AM ET), run `VACUUM (ANALYZE) public.equities_snapshot, public.scanner_results;` once. VACUUM can't run inside the function.
   **Verify:** `select job_name, status, summary from public.job_runs where job_name='db-retention' order by id desc limit 1;` → ok. `select pg_size_pretty(pg_database_size(current_database()));` → shrinking.
2. Check for 401s or failures:
   ```sql
   select status_code, count(*) from net._http_response where created > now() - interval '24 hours' group by 1;  -- no 401/500
   select * from public.pipeline_failures_v;                                                                    -- empty, or explained
   select jobname, status, return_message from cron.job_run_details d join cron.job j using (jobid)
    where start_time > now() - interval '24 hours' and status <> 'succeeded';                                   -- empty
   ```
3. The watchdog fires once at 7:30 PM ET on trading days:
   `select checked_at from public.pipeline_health order by checked_at desc limit 5;` → one batch per trading evening.
   The intraday watchdog runs every 15 min from 9:45 AM to 4:00 PM ET.
4. On the next trading day, check that every `job_runs` row ends ok/partial/error and none is left `running` for more than 15 min. The reaper flips stuck rows.

## Known limits (not blocking)

- **`net` grants (ops-security-live-13):** supabase_admin owns `net.*`, so 470's revokes may be no-ops. That's acceptable because `net` isn't an exposed API schema. Fully removing access needs Supabase support.
- **Webhook alerts:** nothing is posted until you create Vault `alert_webhook_url`.
- **Market holidays:** `market_holidays` covers 2026–2027. Add next year's NYSE closures every December.
- **Migration filenames:** the CLI can't track the `YYYYMMDD_NNN` names one by one. Renaming them to 14-digit timestamps is your call.

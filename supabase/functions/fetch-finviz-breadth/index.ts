// fetch-finviz-breadth (v7)
// v6 logic (sh_avgvol_o100 universe) PLUS rate-limit hardening:
//  - finvizCSV retries on FinViz 429 with exponential backoff (was: no retry,
//    a single transient 429 failed the whole run for the day).
//  - the 4 index-membership pulls are now sequential with spacing instead of
//    a concurrent Promise.all burst (the concurrent burst tripped 429s).
// Pair with the cron change moving this job off the scanner FinViz burst.
// v8 (2026-10-28 audit: edge-a-2/4/5/7, ops-security-live-8):
//  - cron-only: requires x-cron-secret (fail-closed).
//  - every FinViz response is validated (HTML body / no Ticker header throws);
//    an index-membership pull failure or a set under its floor fails the run
//    before anything is written (was: swallowed -> in_sp500=false for all).
//  - main universe < 5000 rows is an error.
//  - 20s per-request timeout, retried like a 429.
//  - on error after the equities upsert started, the rows this run wrote for
//    snapshot_date are deleted (only when the date had no rows before the run,
//    so a re-run never destroys an earlier good snapshot).
//  - FinViz exports no SMA10 / 20-day high / 20-day low column, so those are
//    written as NULL (breadth new_20day_* = NULL, not a fake 0). Any OTHER
//    missing optional header makes the run 'partial'.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { redact } from "../_shared/redact.ts";
import { requireCronSecret } from "../_shared/cron_auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const WIDE_COLS = Array.from({ length: 150 }, (_, i) => i + 1).join(",");
// Loosened filter for fuller universe coverage. Russell 2000 has many sub-1M
// vol components that need to be included for accurate breadth counts.
const FILTER = "sh_avgvol_o100";

// Minimum plausible sizes; anything below means a bad/partial FinViz response.
const MAIN_FLOOR = 5000;
const INDEX_FLOORS = { sp500: 480, nq100: 95, djia: 28, rut: 1500 } as const;
const FETCH_TIMEOUT_MS = 20000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getSecret(key: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", { p_name: key });
  if (error || data == null || data === "") {
    throw new Error(`Secret ${key} not available from Vault: ${error?.message ?? "not found"}`);
  }
  return data as string;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { cur.push(field); field = ""; i++; continue; }
    if (c === "\n" || c === "\r") {
      cur.push(field); field = "";
      if (cur.length > 1 || cur[0] !== "") rows.push(cur);
      cur = [];
      if (c === "\r" && text[i + 1] === "\n") i += 2; else i++;
      continue;
    }
    field += c; i++;
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows;
}

function pct(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.trim();
  if (t === "" || t === "-") return null;
  const n = parseFloat(t.replace(/%$/, ""));
  return Number.isFinite(n) ? n : null;
}
function num(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.trim();
  if (t === "" || t === "-") return null;
  const n = parseFloat(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function int(s: string | undefined): number | null {
  const n = num(s);
  return n == null ? null : Math.round(n);
}
function str(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" || t === "-" ? null : t;
}

function findCol(headers: string[], candidates: string[]): number {
  const norm = headers.map((h) => h.trim());
  for (const c of candidates) {
    const i = norm.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

function isTimeout(e: unknown): boolean {
  return e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError");
}

async function finvizCSV(filters: string, cols: string, auth: string): Promise<string> {
  const url = `https://elite.finviz.com/export.ashx?v=152&f=${filters}&c=${cols}&auth=${auth}`;
  const backoff = [0, 3000, 6000, 12000];
  let lastErr: Error | null = null;
  for (let i = 0; i < backoff.length; i++) {
    if (backoff[i] > 0) await sleep(backoff[i]);
    let text: string;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.status === 429) {
        await res.body?.cancel();
        lastErr = new Error(`Finviz 429 (attempt ${i + 1}/${backoff.length})`);
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Finviz ${res.status}: ${body.slice(0, 300)}`);
      }
      text = await res.text();
    } catch (e) {
      if (!isTimeout(e)) throw e;
      lastErr = new Error(`Finviz timeout after ${FETCH_TIMEOUT_MS}ms (attempt ${i + 1}/${backoff.length})`);
      continue;
    }
    // A login/error page comes back as 200 HTML: never treat it as data.
    if (text.trimStart().startsWith("<")) throw new Error("Finviz returned HTML instead of CSV (token expired?)");
    return text;
  }
  throw lastErr ?? new Error("Finviz pull failed after retries");
}

// Throws on any failure or bad response (was: swallowed into an empty Set,
// which silently marked every ticker in_sp500=false). Caller checks the floor.
async function fetchIndexTickers(filter: string, auth: string): Promise<Set<string>> {
  const csv = await finvizCSV(filter, "1", auth);
  const rows = parseCSV(csv);
  const out = new Set<string>();
  const tIdx = rows.length ? rows[0].findIndex((h) => h.trim() === "Ticker") : -1;
  if (tIdx < 0) throw new Error(`Index pull ${filter}: no Ticker header`);
  for (let r = 1; r < rows.length; r++) {
    const t = str(rows[r][tIdx]);
    if (t) out.add(t);
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const denied = requireCronSecret(req); if (denied) return denied;
  const started = Date.now();
  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const { data: jobRow } = await supabase
    .from("job_runs")
    .insert({ job_name: "fetch-finviz-breadth", status: "running" })
    .select("id")
    .single();
  const jobId: number | null = jobRow?.id ?? null;

  const finishJob = async (
    status: "ok" | "partial" | "error",
    summary: Record<string, unknown> | null,
    error?: string,
  ) => {
    if (jobId == null) return;
    await supabase
      .from("job_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        elapsed_ms: Date.now() - started,
        summary,
        error: error ?? null,
      })
      .eq("id", jobId);
  };

  let auth = "";
  // Set once the equities upsert starts; used to undo a half-written snapshot.
  let cleanupDate: string | null = null;
  try {
    auth = await getSecret("finviz_token");

    // Sequential with spacing — a concurrent Promise.all burst tripped 429s.
    const sp500Set = await fetchIndexTickers("idx_sp500", auth);
    await sleep(1200);
    const nq100Set = await fetchIndexTickers("idx_ndx", auth);
    await sleep(1200);
    const djiaSet = await fetchIndexTickers("idx_dji", auth);
    await sleep(1200);
    const rutSet = await fetchIndexTickers("idx_rut", auth);
    await sleep(1200);

    const indexCounts = { sp500: sp500Set.size, nq100: nq100Set.size, djia: djiaSet.size, rut: rutSet.size };
    const underFloor = (Object.keys(INDEX_FLOORS) as (keyof typeof INDEX_FLOORS)[])
      .filter((k) => indexCounts[k] < INDEX_FLOORS[k])
      .map((k) => `${k}=${indexCounts[k]}<${INDEX_FLOORS[k]}`);
    if (underFloor.length) throw new Error(`Index membership under floor: ${underFloor.join(", ")}`);

    const dataCsv = await finvizCSV(FILTER, WIDE_COLS, auth);
    const rows = parseCSV(dataCsv);
    if (rows.length - 1 < MAIN_FLOOR) throw new Error(`Main pull returned only ${rows.length - 1} rows (< ${MAIN_FLOOR})`);
    const headers = rows[0];

    const idx = {
      ticker:      findCol(headers, ["Ticker"]),
      company:     findCol(headers, ["Company"]),
      sector:      findCol(headers, ["Sector"]),
      industry:    findCol(headers, ["Industry"]),
      country:     findCol(headers, ["Country"]),
      marketCap:   findCol(headers, ["Market Cap"]),
      price:       findCol(headers, ["Price"]),
      change:      findCol(headers, ["Change"]),
      volume:      findCol(headers, ["Volume"]),
      avgVolume:   findCol(headers, ["Average Volume", "Avg Volume"]),
      perfOpen:    findCol(headers, ["Change from Open", "Performance (from Open)"]),
      perfWeek:    findCol(headers, ["Performance (Week)"]),
      perfMonth:   findCol(headers, ["Performance (Month)"]),
      perfQuarter: findCol(headers, ["Performance (Quarter)"]),
      perfHalf:    findCol(headers, ["Performance (Half Year)"]),
      perfYear:    findCol(headers, ["Performance (Year)"]),
      perfYTD:     findCol(headers, ["Performance (YTD)"]),
      sma20:       findCol(headers, ["20-Day Simple Moving Average"]),
      sma50:       findCol(headers, ["50-Day Simple Moving Average"]),
      sma200:      findCol(headers, ["200-Day Simple Moving Average"]),
      high52w:     findCol(headers, ["52-Week High"]),
      low52w:      findCol(headers, ["52-Week Low"]),
      atr:         findCol(headers, ["Average True Range"]),
      rsi:         findCol(headers, ["Relative Strength Index (14)"]),
      volatilityW: findCol(headers, ["Volatility (Week)"]),
      volatilityM: findCol(headers, ["Volatility (Month)"]),
    };

    if (debug) {
      await finishJob("ok", { mode: "debug", main_rows: rows.length - 1, rows_written: 0 });
      return new Response(
        JSON.stringify({
          ok: true,
          elapsed_ms: Date.now() - started,
          index_counts: { sp500: sp500Set.size, nq100: nq100Set.size, djia: djiaSet.size, rut: rutSet.size },
          main_rows: rows.length - 1,
          main_header_count: headers.length,
          main_header_index: idx,
        }, null, 2),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const required = ["ticker", "marketCap", "price", "change"] as const;
    const missing = required.filter((k) => idx[k as keyof typeof idx] < 0);
    if (missing.length) {
      throw new Error(`Missing required Finviz columns: ${missing.join(", ")}`);
    }

    // ET calendar date (UTC would stamp tomorrow on a run after 8 PM ET).
    const snapshotDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

    // Did this date already have a snapshot (e.g. an earlier good run)? If so,
    // never delete on failure: an overwrite with newer rows is still valid data.
    const { count: preCount, error: pcErr } = await supabase
      .from("equities_snapshot")
      .select("ticker", { count: "exact", head: true })
      .eq("snapshot_date", snapshotDate);
    if (pcErr) throw pcErr;
    const records: Record<string, unknown>[] = [];
    const seen = new Set<string>();

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const ticker = str(row[idx.ticker]);
      if (!ticker) continue;
      if (seen.has(ticker)) continue;
      seen.add(ticker);

      const mcap = num(row[idx.marketCap]);
      const inSp500 = sp500Set.has(ticker);
      const inNq100 = nq100Set.has(ticker);
      const inDjia = djiaSet.has(ticker);
      const inRut = rutSet.has(ticker);
      const cap1bPlus = mcap != null && mcap >= 1000;
      const perfDay = pct(row[idx.change]);

      // FinViz exports no 20-day high/low column: unknown (NULL), not false.
      const new20dHigh: boolean | null = null;
      const new20dLow: boolean | null = null;

      const up4pct = perfDay != null ? perfDay >= 4 : null;
      const down4pct = perfDay != null ? perfDay <= -4 : null;

      const atrVal = idx.atr >= 0 ? num(row[idx.atr]) : null;
      const priceVal = num(row[idx.price]);
      const atrPct = atrVal != null && priceVal != null && priceVal > 0
        ? (atrVal / priceVal) * 100
        : null;

      const idxParts: string[] = [];
      if (inSp500) idxParts.push("S&P 500");
      if (inNq100) idxParts.push("Nasdaq 100");
      if (inDjia) idxParts.push("DJIA");
      if (inRut) idxParts.push("Russell 2000");
      const idxStr = idxParts.length > 0 ? idxParts.join(", ") : null;

      records.push({
        ticker,
        snapshot_date: snapshotDate,
        index_str: idxStr,
        in_sp500: inSp500,
        in_nq100: inNq100,
        in_djia: inDjia,
        in_rut: inRut,
        cap_1b_plus: cap1bPlus,
        sector: str(row[idx.sector]),
        industry: str(row[idx.industry]),
        price: priceVal,
        market_cap_millions: mcap,
        volume: idx.volume >= 0 ? int(row[idx.volume]) : null,
        avg_volume: idx.avgVolume >= 0 ? int(row[idx.avgVolume]) : null,
        perf_day: perfDay,
        perf_open: idx.perfOpen >= 0 ? pct(row[idx.perfOpen]) : null,
        perf_week: idx.perfWeek >= 0 ? pct(row[idx.perfWeek]) : null,
        perf_month: idx.perfMonth >= 0 ? pct(row[idx.perfMonth]) : null,
        perf_quarter: idx.perfQuarter >= 0 ? pct(row[idx.perfQuarter]) : null,
        perf_half: idx.perfHalf >= 0 ? pct(row[idx.perfHalf]) : null,
        perf_year: idx.perfYear >= 0 ? pct(row[idx.perfYear]) : null,
        perf_ytd: idx.perfYTD >= 0 ? pct(row[idx.perfYTD]) : null,
        sma10_pct: null, // not a FinViz export column; equity_ma10_latest_v computes SMA10
        sma20_pct: idx.sma20 >= 0 ? pct(row[idx.sma20]) : null,
        sma50_pct: idx.sma50 >= 0 ? pct(row[idx.sma50]) : null,
        sma200_pct: idx.sma200 >= 0 ? pct(row[idx.sma200]) : null,
        high52w_pct: idx.high52w >= 0 ? pct(row[idx.high52w]) : null,
        low52w_pct: idx.low52w >= 0 ? pct(row[idx.low52w]) : null,
        new_20day_high: new20dHigh,
        new_20day_low: new20dLow,
        up_4pct: up4pct,
        down_4pct: down4pct,
        atr_value: atrVal,
        atr_pct: atrPct,
        rsi14: idx.rsi >= 0 ? num(row[idx.rsi]) : null,
        volatility_w: idx.volatilityW >= 0 ? pct(row[idx.volatilityW]) : null,
        volatility_m: idx.volatilityM >= 0 ? pct(row[idx.volatilityM]) : null,
      });
    }

    const CHUNK = 500;
    let upserted = 0;
    if ((preCount ?? 0) === 0) cleanupDate = snapshotDate;
    for (let i = 0; i < records.length; i += CHUNK) {
      const slice = records.slice(i, i + CHUNK);
      const { error: uErr } = await supabase
        .from("equities_snapshot")
        .upsert(slice, { onConflict: "ticker,snapshot_date" });
      if (uErr) throw uErr;
      upserted += slice.length;
    }

    const universes = [
      { id: "sp500",      pred: (r: Record<string, unknown>) => r.in_sp500 === true },
      { id: "nq100",      pred: (r: Record<string, unknown>) => r.in_nq100 === true },
      { id: "djia",       pred: (r: Record<string, unknown>) => r.in_djia === true },
      { id: "rus2000",    pred: (r: Record<string, unknown>) => r.in_rut === true },
      { id: "cap1b_plus", pred: (r: Record<string, unknown>) => r.cap_1b_plus === true },
    ];

    const breadthRows: Record<string, unknown>[] = [];
    for (const u of universes) {
      const subset = records.filter(u.pred);
      const total = subset.length;
      if (total === 0) continue;
      const numVal = (r: Record<string, unknown>, k: string): number | null => {
        const v = r[k];
        return typeof v === "number" ? v : null;
      };
      const above = (k: string, t = 0) =>
        subset.filter((r) => { const v = numVal(r, k); return v != null && v > t; }).length;
      const below = (k: string, t = 0) =>
        subset.filter((r) => { const v = numVal(r, k); return v != null && v < t; }).length;
      const aligned = subset.filter((r) =>
        (numVal(r, "sma20_pct") ?? -1) > 0 &&
        (numVal(r, "sma50_pct") ?? -1) > 0 &&
        (numVal(r, "sma200_pct") ?? -1) > 0
      ).length;
      const new52H = subset.filter((r) => (numVal(r, "high52w_pct") ?? -1) >= 0).length;
      const new52L = subset.filter((r) => (numVal(r, "low52w_pct") ?? 1) <= 0).length;
      // NULL when no row carries the flag (column not exported), never a fake 0.
      const has20 = subset.some((r) => r.new_20day_high != null);
      const new20H = has20 ? subset.filter((r) => r.new_20day_high === true).length : null;
      const new20L = has20 ? subset.filter((r) => r.new_20day_low === true).length : null;
      const up4 = subset.filter((r) => r.up_4pct === true).length;
      const down4 = subset.filter((r) => r.down_4pct === true).length;

      breadthRows.push({
        snapshot_date: snapshotDate,
        universe_id: u.id,
        total_count: total,
        pct_above_sma20: total > 0 ? (above("sma20_pct") / total) * 100 : null,
        pct_above_sma50: total > 0 ? (above("sma50_pct") / total) * 100 : null,
        pct_above_sma200: total > 0 ? (above("sma200_pct") / total) * 100 : null,
        pct_aligned_bullish: total > 0 ? (aligned / total) * 100 : null,
        new_52w_highs: new52H,
        new_52w_lows: new52L,
        new_20day_highs: new20H,
        new_20day_lows: new20L,
        up_4pct: up4,
        down_4pct: down4,
        advancers: above("perf_day", 0),
        decliners: below("perf_day", 0),
        t2108: null,
      });
    }

    if (breadthRows.length > 0) {
      const { error: bErr } = await supabase
        .from("breadth_daily_history")
        .upsert(breadthRows, { onConflict: "snapshot_date,universe_id" });
      if (bErr) throw new Error(`Breadth history upsert: ${bErr.message}`);
    }
    cleanupDate = null; // fully written: nothing to undo from here on

    const headersMissing = Object.entries(idx)
      .filter(([, v]) => v < 0)
      .map(([k]) => k);

    const summary = {
      snapshot_date: snapshotDate,
      sp500_pull: sp500Set.size,
      nq100_pull: nq100Set.size,
      djia_pull: djiaSet.size,
      rut_pull: rutSet.size,
      main_pull: rows.length - 1,
      upserted,
      breadth_rows: breadthRows.length,
      universe_totals: breadthRows.reduce<Record<string, unknown>>((m, r) => {
        m[r.universe_id as string] = r.total_count;
        return m;
      }, {}),
      headers_missing: headersMissing,
      rows_written: upserted + breadthRows.length,
    };
    await finishJob(headersMissing.length ? "partial" : "ok", summary);

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    let errMsg = redact(err, auth);
    if (cleanupDate) {
      const { error: dErr } = await supabase.from("equities_snapshot").delete().eq("snapshot_date", cleanupDate);
      errMsg += dErr ? ` | cleanup failed: ${redact(dErr.message, auth)}` : " | partial equities_snapshot rows removed";
    }
    await finishJob("error", null, errMsg);
    return new Response(
      JSON.stringify({ ok: false, error: errMsg, elapsed_ms: Date.now() - started }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

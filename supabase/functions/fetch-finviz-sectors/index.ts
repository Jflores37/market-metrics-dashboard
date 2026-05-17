// fetch-finviz-sectors (v2)
// Pulls 11 SPDR sector ETFs + VTI benchmark by explicit ticker list.
// v2 hardening + correctness:
//  - finvizCSV retries on FinViz 429 with backoff (was: naked fetch, a single
//    429 killed the run — same fragility that took out fetch-finviz-breadth).
//  - now extracts perf_ytd / perf_open / perf_half (the snapshot/view expose
//    these and the Sector SPDRs table renders a YTD column; the old code
//    never read them, so YTD was permanently blank).
//  - records job_runs like the other fetchers (was invisible to monitoring).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 11 SPDR sector ETFs + VTI benchmark
const SECTOR_MAP: Record<string, { label: string; isBenchmark: boolean }> = {
  XLK:  { label: "Technology",             isBenchmark: false },
  XLV:  { label: "Health Care",            isBenchmark: false },
  XLC:  { label: "Communication Services", isBenchmark: false },
  XLY:  { label: "Consumer Discretionary", isBenchmark: false },
  XLP:  { label: "Consumer Staples",       isBenchmark: false },
  XLE:  { label: "Energy",                 isBenchmark: false },
  XLF:  { label: "Financials",             isBenchmark: false },
  XLI:  { label: "Industrials",            isBenchmark: false },
  XLB:  { label: "Materials",              isBenchmark: false },
  XLU:  { label: "Utilities",              isBenchmark: false },
  XLRE: { label: "Real Estate",            isBenchmark: false },
  VTI:  { label: "US Total Market",        isBenchmark: true  },
};

// Wide column pull (same proven range as fetch-finviz-breadth) so every
// performance header is present and matched by name, not by brittle index.
const WIDE_COLS = Array.from({ length: 150 }, (_, i) => i + 1).join(",");

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
function str(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return t === "" || t === "-" ? null : t;
}

function findCol(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = headers.indexOf(c);
    if (i >= 0) return i;
  }
  return -1;
}

async function finvizCSV(params: string, auth: string): Promise<string> {
  const url = `https://elite.finviz.com/export.ashx?v=152&${params}&auth=${auth}`;
  const backoff = [0, 3000, 6000, 12000];
  let lastErr: Error | null = null;
  for (let i = 0; i < backoff.length; i++) {
    if (backoff[i] > 0) await sleep(backoff[i]);
    const res = await fetch(url);
    if (res.status === 429) {
      await res.body?.cancel();
      lastErr = new Error(`Finviz 429 (attempt ${i + 1}/${backoff.length})`);
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Finviz ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.text();
  }
  throw lastErr ?? new Error("Finviz pull failed after retries");
}

Deno.serve(async () => {
  const started = Date.now();

  const { data: jobRow } = await supabase
    .from("job_runs")
    .insert({ job_name: "fetch-finviz-sectors", status: "running" })
    .select("id")
    .single();
  const jobId: number | null = jobRow?.id ?? null;

  const finishJob = async (
    status: "ok" | "error",
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

  try {
    const auth = await getSecret("finviz_token");
    const tickers = Object.keys(SECTOR_MAP).join(",");
    const csv = await finvizCSV(`t=${tickers}&c=${WIDE_COLS}`, auth);
    const rows = parseCSV(csv);
    if (rows.length < 2) throw new Error(`Finviz returned ${rows.length} rows`);

    const headers = rows[0].map((h) => h.trim());
    const idx = {
      ticker:      findCol(headers, ["Ticker"]),
      price:       findCol(headers, ["Price"]),
      change:      findCol(headers, ["Change"]),
      perfOpen:    findCol(headers, ["Change from Open", "Performance (from Open)"]),
      perfWeek:    findCol(headers, ["Performance (Week)"]),
      perfMonth:   findCol(headers, ["Performance (Month)"]),
      perfQuarter: findCol(headers, ["Performance (Quarter)"]),
      perfHalf:    findCol(headers, ["Performance (Half Year)"]),
      perfYear:    findCol(headers, ["Performance (Year)"]),
      perfYTD:     findCol(headers, ["Performance (YTD)"]),
    };
    const required: (keyof typeof idx)[] = ["ticker", "price", "change", "perfWeek", "perfMonth", "perfQuarter", "perfYear"];
    const missing = required.filter((k) => idx[k] < 0);
    if (missing.length) throw new Error(`Missing cols: ${missing.join(",")}. Got: ${headers.join(" | ")}`);

    const snapshotDate = new Date().toISOString().slice(0, 10);
    const records: Record<string, unknown>[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const ticker = str(row[idx.ticker]);
      if (!ticker) continue;
      const meta = SECTOR_MAP[ticker.toUpperCase()];
      if (!meta) continue;  // ignore unexpected tickers
      records.push({
        ticker:        ticker.toUpperCase(),
        snapshot_date: snapshotDate,
        sector_label:  meta.label,
        is_benchmark:  meta.isBenchmark,
        price:         num(row[idx.price]),
        perf_day:      pct(row[idx.change]),
        perf_open:     idx.perfOpen >= 0 ? pct(row[idx.perfOpen]) : null,
        perf_week:     pct(row[idx.perfWeek]),
        perf_month:    pct(row[idx.perfMonth]),
        perf_quarter:  pct(row[idx.perfQuarter]),
        perf_half:     idx.perfHalf >= 0 ? pct(row[idx.perfHalf]) : null,
        perf_year:     pct(row[idx.perfYear]),
        perf_ytd:      idx.perfYTD >= 0 ? pct(row[idx.perfYTD]) : null,
      });
    }

    if (records.length === 0) throw new Error("No matching sector tickers returned");

    const { error: uErr } = await supabase
      .from("sector_etf_snapshot")
      .upsert(records, { onConflict: "ticker,snapshot_date" });
    if (uErr) throw uErr;

    const summary = {
      snapshot_date: snapshotDate,
      upserted: records.length,
      tickers: records.map((r) => r.ticker),
      ytd_present: records.filter((r) => r.perf_ytd != null).length,
    };
    await finishJob("ok", summary);

    return new Response(
      JSON.stringify({ ok: true, elapsed_ms: Date.now() - started, ...summary }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await finishJob("error", null, errMsg);
    return new Response(
      JSON.stringify({ ok: false, error: errMsg, elapsed_ms: Date.now() - started }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

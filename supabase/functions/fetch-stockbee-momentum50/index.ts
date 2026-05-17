// fetch-stockbee-momentum50
// Parses Pradeep Bonde's public Momentum50 Google Sheet → stockbee_momentum50
// Sheet shape: row 0 = dates as column headers (MM/DD/YYYY strings),
// rows 1..N = tickers stacked per column. Each column = one trading day.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1xjbe9SF0HsxwY_Uy3NC2tT92BqK0nhArUaYU16Q0p9M/gviz/tq?gid=1499398020&tqx=out:json";

// Handles three input formats observed across Stockbee sheets:
//   1) gviz "Date(2026,4,13)" (0-indexed month, +1 fix)
//   2) "MM/DD/YYYY" strings (Momentum50)
//   3) "YYYY-MM-DD" ISO strings
function parseDate(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // gviz Date() constructor
  const m1 = /^Date\((\d+),\s*(\d+),\s*(\d+)\)/.exec(s);
  if (m1) {
    const y = parseInt(m1[1], 10);
    const mo = parseInt(m1[2], 10) + 1;
    const d = parseInt(m1[3], 10);
    if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // MM/DD/YYYY or M/D/YYYY
  const m2 = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m2) {
    const mo = parseInt(m2[1], 10);
    const d = parseInt(m2[2], 10);
    const y = parseInt(m2[3], 10);
    if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  return null;
}

function cleanTicker(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase();
  // Ticker rules: 1-6 chars, A-Z plus optional . / -
  if (!/^[A-Z][A-Z0-9.\-]{0,5}$/.test(s)) return null;
  return s;
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: jobRow, error: jobErr } = await supabase
    .from("job_runs")
    .insert({ job_name: "fetch-stockbee-momentum50", status: "running" })
    .select("id")
    .single();

  if (jobErr || !jobRow) {
    return new Response(
      JSON.stringify({ ok: false, error: "job_runs insert failed: " + (jobErr?.message ?? "unknown") }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
  const jobId: number = jobRow.id;

  const finishJob = async (
    status: "ok" | "error",
    summary: Record<string, unknown> | null,
    error?: string,
  ) => {
    await supabase
      .from("job_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        elapsed_ms: Date.now() - startedAt,
        summary,
        error: error ?? null,
      })
      .eq("id", jobId);
  };

  try {
    const resp = await fetch(SHEET_URL, {
      headers: { "User-Agent": "MarketMetrics/1.0 (Supabase Edge)" },
    });
    if (!resp.ok) throw new Error(`Sheet fetch failed: HTTP ${resp.status}`);
    const text = await resp.text();

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;
    if (start < 0 || end <= start) throw new Error("Invalid gviz response shape");
    const data = JSON.parse(text.slice(start, end));
    const rows = data?.table?.rows;
    const cols = data?.table?.cols;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("Empty Momentum50 sheet");
    if (!Array.isArray(cols) || cols.length === 0) throw new Error("Empty Momentum50 cols");

    const numCols = cols.length;
    const dateByCol: Array<string | null> = new Array(numCols).fill(null);

    // Step 1: extract date per column from row 0
    const headerRow = rows[0]?.c ?? [];
    for (let i = 0; i < numCols; i++) {
      const cell = headerRow[i];
      const raw = cell && cell.v != null
        ? cell.v
        : (cell && cell.f != null ? cell.f : null);
      const parsed = parseDate(raw);
      if (parsed) dateByCol[i] = parsed;
    }
    // Fallback: column label
    for (let i = 0; i < numCols; i++) {
      if (dateByCol[i]) continue;
      const parsed = parseDate(cols[i]?.label);
      if (parsed) dateByCol[i] = parsed;
    }

    const datedCols = dateByCol.filter((d) => d != null).length;
    if (datedCols === 0) {
      throw new Error(
        `No date columns identified. cols=${numCols}, rows=${rows.length}, ` +
          `sample_header=${JSON.stringify(headerRow.slice(0, 3))}`,
      );
    }

    // Step 2: collect tickers per column starting at row 1 (skip header)
    const tickersByDate: Map<string, Set<string>> = new Map();
    let totalTickersSeen = 0;

    for (let r = 1; r < rows.length; r++) {
      const cellsR = rows[r]?.c ?? [];
      for (let i = 0; i < numCols; i++) {
        const date = dateByCol[i];
        if (!date) continue;
        const cell = cellsR[i];
        const raw = cell && cell.v != null ? cell.v : null;
        const tk = cleanTicker(raw);
        if (!tk) continue;
        totalTickersSeen++;
        if (!tickersByDate.has(date)) tickersByDate.set(date, new Set());
        tickersByDate.get(date)!.add(tk);
      }
    }

    if (tickersByDate.size === 0) {
      throw new Error(`No tickers collected. dated_cols=${datedCols}, rows=${rows.length}`);
    }

    const payload = Array.from(tickersByDate.entries()).map(([date, set]) => ({
      observation_date: date,
      tickers: Array.from(set).sort(),
      fetched_at: new Date().toISOString(),
    }));

    const { error: upErr } = await supabase
      .from("stockbee_momentum50")
      .upsert(payload, { onConflict: "observation_date" });
    if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);

    const latestDate = payload.map((p) => p.observation_date).sort().reverse()[0];
    const latestEntry = payload.find((p) => p.observation_date === latestDate)!;

    const summary = {
      dates_upserted: payload.length,
      latest_date: latestDate,
      latest_ticker_count: latestEntry.tickers.length,
      latest_sample: latestEntry.tickers.slice(0, 10),
      total_tickers_seen: totalTickersSeen,
      dated_columns: datedCols,
    };
    await finishJob("ok", summary);

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await finishJob("error", null, errMsg);
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

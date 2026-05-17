// fetch-index-etf-quotes
// Pulls 2y of daily closes for SPY and QQQ from Yahoo, computes SMA20/50/200
// and Wilder's RSI14, upserts into index_etf_quotes.
// Used by Should I Trade's Trend component (20% weight).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYMBOLS = ["SPY", "QQQ"] as const;
const RANGE = "2y";
const INTERVAL = "1d";

type DailyBar = { date: string; close: number };

async function fetchYahooDaily(symbol: string): Promise<DailyBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${RANGE}&interval=${INTERVAL}`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!resp.ok) throw new Error(`Yahoo ${symbol} HTTP ${resp.status}`);
  const data = await resp.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo ${symbol}: empty result`);
  const timestamps: number[] | undefined = result.timestamp;
  const closes: Array<number | null> | undefined =
    result.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new Error(`Yahoo ${symbol}: missing series`);
  }
  const bars: DailyBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const c = closes[i];
    if (typeof t !== "number" || typeof c !== "number" || !Number.isFinite(c)) continue;
    const d = new Date(t * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    bars.push({ date: `${yyyy}-${mm}-${dd}`, close: c });
  }
  // Ensure chronological order (oldest first) for indicator math
  bars.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return bars;
}

function sma(values: number[], window: number, atIndex: number): number | null {
  if (atIndex < window - 1) return null;
  let sum = 0;
  for (let i = atIndex - window + 1; i <= atIndex; i++) sum += values[i];
  return sum / window;
}

// Wilder's RSI: seed with simple average of first 14 changes,
// then smooth: avg = ((13 * prev) + current) / 14
function computeRSI14(closes: number[]): Array<number | null> {
  const n = closes.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (n < 15) return out;

  let gainSum = 0;
  let lossSum = 0;
  // Seed with closes[1..14]
  for (let i = 1; i <= 14; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum += -change;
  }
  let avgGain = gainSum / 14;
  let avgLoss = lossSum / 14;
  out[14] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = 15; i < n; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: jobRow, error: jobErr } = await supabase
    .from("job_runs")
    .insert({ job_name: "fetch-index-etf-quotes", status: "running" })
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
    const perTickerSummary: Record<string, unknown> = {};
    const nowIso = new Date().toISOString();
    const allRows: Array<Record<string, unknown>> = [];

    // Fetch all symbols in parallel
    const bundles = await Promise.all(
      SYMBOLS.map(async (sym) => ({ sym, bars: await fetchYahooDaily(sym) })),
    );

    for (const { sym, bars } of bundles) {
      if (bars.length === 0) {
        perTickerSummary[sym] = { error: "no bars" };
        continue;
      }
      const closes = bars.map((b) => b.close);
      const rsi = computeRSI14(closes);
      for (let i = 0; i < bars.length; i++) {
        allRows.push({
          ticker: sym,
          observation_date: bars[i].date,
          close: bars[i].close,
          sma20: sma(closes, 20, i),
          sma50: sma(closes, 50, i),
          sma200: sma(closes, 200, i),
          rsi14: rsi[i],
          fetched_at: nowIso,
        });
      }
      const last = bars[bars.length - 1];
      perTickerSummary[sym] = {
        rows: bars.length,
        latest_date: last.date,
        latest_close: last.close,
        latest_sma20: sma(closes, 20, closes.length - 1),
        latest_sma50: sma(closes, 50, closes.length - 1),
        latest_sma200: sma(closes, 200, closes.length - 1),
        latest_rsi14: rsi[rsi.length - 1],
      };
    }

    if (allRows.length === 0) throw new Error("No rows produced for any ticker");

    // Supabase upsert handles ~1000 rows/call comfortably; we have ~1004 max (502 × 2)
    const { error: upErr } = await supabase
      .from("index_etf_quotes")
      .upsert(allRows, { onConflict: "ticker,observation_date" });
    if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);

    const summary = {
      total_rows_upserted: allRows.length,
      per_ticker: perTickerSummary,
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

// fetch-vix-yfinance
// Pulls daily ^VIX and ^VVIX closes from Yahoo Finance chart API → vix_history.
// Used by Should I Trade's volatility component (25% weight).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 2 years of daily history is plenty for percentile-based volatility regimes
const RANGE = "2y";
const INTERVAL = "1d";

async function fetchYahooDaily(
  symbol: string,
): Promise<Map<string, number>> {
  // URL-encode the ^ in symbols like ^VIX
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${RANGE}&interval=${INTERVAL}`;
  const resp = await fetch(url, {
    headers: {
      // Yahoo blocks default fetch UAs; use a browser-like UA
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    throw new Error(`Yahoo ${symbol} fetch failed: HTTP ${resp.status}`);
  }
  const data = await resp.json();
  const result = data?.chart?.result?.[0];
  const err = data?.chart?.error;
  if (err) throw new Error(`Yahoo ${symbol} returned error: ${JSON.stringify(err)}`);
  if (!result) throw new Error(`Yahoo ${symbol}: empty result`);

  const timestamps: number[] | undefined = result.timestamp;
  const closes: Array<number | null> | undefined =
    result.indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamps) || !Array.isArray(closes)) {
    throw new Error(`Yahoo ${symbol}: missing timestamps or closes`);
  }

  const out = new Map<string, number>();
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const c = closes[i];
    if (typeof t !== "number" || typeof c !== "number" || !Number.isFinite(c)) continue;
    // Yahoo timestamps are seconds since epoch (UTC, market close time)
    const d = new Date(t * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    out.set(`${yyyy}-${mm}-${dd}`, c);
  }
  return out;
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: jobRow, error: jobErr } = await supabase
    .from("job_runs")
    .insert({ job_name: "fetch-vix-yfinance", status: "running" })
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
    // Fetch both in parallel
    const [vix, vvix] = await Promise.all([
      fetchYahooDaily("^VIX"),
      fetchYahooDaily("^VVIX"),
    ]);

    if (vix.size === 0) throw new Error("No VIX rows returned from Yahoo");

    // Union of dates from both series; VVIX may be missing for some recent days
    const allDates = new Set<string>([...vix.keys(), ...vvix.keys()]);
    const payload: Array<{
      observation_date: string;
      vix_close: number | null;
      vvix_close: number | null;
      fetched_at: string;
    }> = [];
    const nowIso = new Date().toISOString();
    for (const date of allDates) {
      payload.push({
        observation_date: date,
        vix_close: vix.get(date) ?? null,
        vvix_close: vvix.get(date) ?? null,
        fetched_at: nowIso,
      });
    }

    const { error: upErr } = await supabase
      .from("vix_history")
      .upsert(payload, { onConflict: "observation_date" });
    if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);

    const sortedDates = payload.map((p) => p.observation_date).sort().reverse();
    const latestDate = sortedDates[0];
    const latestEntry = payload.find((p) => p.observation_date === latestDate)!;

    const summary = {
      rows_upserted: payload.length,
      vix_rows: vix.size,
      vvix_rows: vvix.size,
      latest_date: latestDate,
      latest_vix: latestEntry.vix_close,
      latest_vvix: latestEntry.vvix_close,
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

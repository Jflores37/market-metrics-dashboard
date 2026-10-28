// fetch-vix-yfinance
// Pulls daily ^VIX and ^VVIX closes from Yahoo Finance chart API → vix_history.
// Used by Should I Trade's volatility component (25% weight).
// 2026-10-28 (edge-b-07): VVIX is secondary, so its failure no longer blocks
// the VIX update (status partial). VIX and VVIX are upserted as separate column
// payloads so a missing side never writes NULL over a stored value. Weekend and
// NYSE-holiday bars (Yahoo emits stale ^VIX bars on holidays) are skipped.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { redact } from "../_shared/redact.ts";
import { requireCronSecret } from "../_shared/cron_auth.ts";

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

Deno.serve(async (req: Request) => {
  const denied = requireCronSecret(req); if (denied) return denied;
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
    status: "ok" | "partial" | "error",
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
    // Fetch both in parallel; only VIX is critical.
    const [vixRes, vvixRes] = await Promise.allSettled([
      fetchYahooDaily("^VIX"),
      fetchYahooDaily("^VVIX"),
    ]);
    if (vixRes.status === "rejected") throw vixRes.reason;
    const vix = vixRes.value;
    const vvix = vvixRes.status === "fulfilled" ? vvixRes.value : new Map<string, number>();
    const vvixError = vvixRes.status === "rejected" ? redact(vvixRes.reason) : null;

    if (vix.size === 0) throw new Error("No VIX rows returned from Yahoo");

    // NYSE closures (db market calendar) + weekends are not trading days.
    const { data: hol, error: holErr } = await supabase.from("market_holidays").select("holiday");
    if (holErr) throw new Error(`market_holidays query failed: ${holErr.message}`);
    const holidays = new Set<string>((hol ?? []).map((h: { holiday: string }) => h.holiday));
    const isTradingDate = (d: string) => {
      const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
      return dow !== 0 && dow !== 6 && !holidays.has(d);
    };

    const nowIso = new Date().toISOString();
    const vixPayload = [...vix.entries()]
      .filter(([d]) => isTradingDate(d))
      .map(([d, c]) => ({ observation_date: d, vix_close: c, fetched_at: nowIso }));
    if (vixPayload.length === 0) throw new Error("No VIX rows on trading days");
    const vixDates = new Set(vixPayload.map((p) => p.observation_date));
    // VVIX only on dates that have a VIX row (the VIX upsert creates the row first).
    const vvixPayload = [...vvix.entries()]
      .filter(([d]) => vixDates.has(d))
      .map(([d, c]) => ({ observation_date: d, vvix_close: c }));

    const { error: upErr } = await supabase
      .from("vix_history")
      .upsert(vixPayload, { onConflict: "observation_date" });
    if (upErr) throw new Error(`VIX upsert failed: ${upErr.message}`);

    let vvixUpsertError: string | null = null;
    if (vvixPayload.length > 0) {
      const { error: vvErr } = await supabase
        .from("vix_history")
        .upsert(vvixPayload, { onConflict: "observation_date" });
      if (vvErr) vvixUpsertError = `VVIX upsert failed: ${vvErr.message}`;
    }

    const latestDate = [...vixDates].sort().reverse()[0];
    const vvixProblem = vvixError ?? vvixUpsertError ?? (vvixPayload.length === 0 ? "No VVIX rows returned" : null);

    const summary = {
      rows_written: vixPayload.length,
      rows_upserted: vixPayload.length,
      vix_rows: vix.size,
      vvix_rows: vvixPayload.length,
      skipped_non_trading: vix.size - vixPayload.length,
      latest_date: latestDate,
      latest_vix: vix.get(latestDate) ?? null,
      latest_vvix: vvix.get(latestDate) ?? null,
      vvix_error: vvixProblem,
    };
    const status = vvixProblem ? "partial" : "ok";
    await finishJob(status, summary, vvixProblem ?? undefined);

    return new Response(JSON.stringify({ ok: true, status, ...summary }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const errMsg = redact(err);
    await finishJob("error", { rows_written: 0 }, errMsg);
    return new Response(JSON.stringify({ ok: false, error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

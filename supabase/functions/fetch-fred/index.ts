import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { redact } from "../_shared/redact.ts";
import { requireCronSecret } from "../_shared/cron_auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function getFredKey(): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", { p_name: "fred_api_key" });
  if (error || data == null || data === "") {
    throw new Error(`FRED key not available from Vault: ${error?.message ?? "not found"}`);
  }
  return data as string;
}

async function fetchSeries(seriesId: string, apiKey: string, since: string) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${since}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(redact(`FRED ${res.status} for ${seriesId}: ${text.slice(0, 200)}`, apiKey));
  }
  const json = await res.json();
  return (json.observations ?? []) as Array<{ date: string; value: string }>;
}

Deno.serve(async (req: Request) => {
  const denied = requireCronSecret(req); if (denied) return denied;
  const started = Date.now();

  // job_runs logging (edge-b-03): ok = every series fetched, partial = some
  // failed, error = all failed / setup failed. job_runs is anon-readable, so
  // every error string goes through redact(…, apiKey) (edge-b-09).
  const { data: jobRow, error: jobErr } = await supabase
    .from("job_runs")
    .insert({ job_name: "fetch-fred", status: "running" })
    .select("id")
    .single();
  if (jobErr || !jobRow) {
    return new Response(
      JSON.stringify({ ok: false, error: "job_runs insert failed: " + redact(jobErr?.message ?? "unknown") }),
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
        elapsed_ms: Date.now() - started,
        summary,
        error: error ?? null,
      })
      .eq("id", jobId);
  };

  let apiKey: string | undefined;
  try {
    apiKey = await getFredKey();

    const { data: series, error: sErr } = await supabase
      .from("macro_series_meta")
      .select("series_id")
      .eq("is_active", true);
    if (sErr) throw new Error(`macro_series_meta: ${sErr.message}`);
    if (!series || series.length === 0) throw new Error("No active series in macro_series_meta");

    const sinceDate = new Date();
    sinceDate.setFullYear(sinceDate.getFullYear() - 2);
    const since = sinceDate.toISOString().slice(0, 10);

    const results: Record<string, number> = {};
    const errors: Record<string, string> = {};

    for (const s of series) {
      try {
        const obs = await fetchSeries(s.series_id, apiKey, since);
        const rows = obs
          .filter((o) => o.value !== "." && o.value !== "" && o.value != null)
          .map((o) => ({
            series_id: s.series_id,
            observation_date: o.date,
            value: parseFloat(o.value),
          }));

        if (rows.length > 0) {
          const { error: uErr } = await supabase
            .from("macro_observations")
            .upsert(rows, { onConflict: "series_id,observation_date" });
          if (uErr) throw new Error(`upsert ${s.series_id}: ${uErr.message}`);
        }
        results[s.series_id] = rows.length;
      } catch (err) {
        errors[s.series_id] = redact(err, apiKey);
      }
    }

    const failed = Object.keys(errors).length;
    const rowsWritten = Object.values(results).reduce((a, b) => a + b, 0);
    const status = failed === 0 ? "ok" : failed === series.length ? "error" : "partial";
    const summary = {
      rows_written: rowsWritten,
      series_total: series.length,
      series_failed: failed,
      fetched: results,
      errors,
    };
    await finishJob(
      status,
      summary,
      failed > 0 ? redact(`${failed}/${series.length} series failed: ${Object.keys(errors).join(", ")}`, apiKey) : undefined,
    );

    return new Response(
      JSON.stringify({
        ok: status === "ok",
        status,
        elapsed_ms: Date.now() - started,
        ...summary,
      }),
      { status: status === "error" ? 500 : 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const errMsg = redact(err, apiKey);
    await finishJob("error", { rows_written: 0 }, errMsg);
    return new Response(
      JSON.stringify({ ok: false, error: errMsg, elapsed_ms: Date.now() - started }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

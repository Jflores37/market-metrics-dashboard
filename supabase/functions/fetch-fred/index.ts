import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function getFredKey(): Promise<string> {
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "fred_api_key")
    .single();
  if (error || !data) throw new Error(`FRED key not configured: ${error?.message}`);
  return data.value;
}

async function fetchSeries(seriesId: string, apiKey: string, since: string) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${since}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FRED ${res.status} for ${seriesId}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return (json.observations ?? []) as Array<{ date: string; value: string }>;
}

Deno.serve(async (_req: Request) => {
  const started = Date.now();
  try {
    const apiKey = await getFredKey();

    const { data: series, error: sErr } = await supabase
      .from("macro_series_meta")
      .select("series_id")
      .eq("is_active", true);
    if (sErr) throw sErr;

    const sinceDate = new Date();
    sinceDate.setFullYear(sinceDate.getFullYear() - 2);
    const since = sinceDate.toISOString().slice(0, 10);

    const results: Record<string, number> = {};
    const errors: Record<string, string> = {};

    for (const s of series ?? []) {
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
          if (uErr) throw uErr;
        }
        results[s.series_id] = rows.length;
      } catch (err) {
        errors[s.series_id] = String(err);
      }
    }

    return new Response(
      JSON.stringify({
        ok: Object.keys(errors).length === 0,
        elapsed_ms: Date.now() - started,
        fetched: results,
        errors,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err), elapsed_ms: Date.now() - started }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

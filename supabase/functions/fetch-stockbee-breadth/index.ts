// fetch-stockbee-breadth
// Parses Pradeep Bonde's public Google Sheet → stockbee_breadth_raw
// Sheet columns: 0=Date, 1=Up4pct, 2=Down4pct, 3=ratio5, 4=ratio10, 5=Up25%qtr,
// 6=Down25%qtr, 13=universe, 14=T2108, 15=SP500

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE/gviz/tq?gid=1585697958&tqx=out:json";

const MAX_HISTORY_DAYS = 60;

// gviz Date() format: "Date(2026,4,14)" — months are 0-indexed per spec.
// (The reference Python code in stockbee.py doesn't +1; that's a latent bug there.)
function parseGvizDate(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw);
  const m = /^Date\((\d+),\s*(\d+),\s*(\d+)\)/.exec(s);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) + 1; // 0-indexed → 1-indexed
    const d = parseInt(m[3], 10);
    if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").trim();
  if (!s || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n == null ? null : Math.round(n);
}

Deno.serve(async (_req: Request) => {
  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: jobRow, error: jobErr } = await supabase
    .from("job_runs")
    .insert({ job_name: "fetch-stockbee-breadth", status: "running" })
    .select("id")
    .single();

  if (jobErr || !jobRow) {
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to insert job_runs row: " + (jobErr?.message ?? "unknown") }),
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
    if (start < 0 || end <= start) throw new Error("Invalid gviz response shape (no JSON braces)");
    const data = JSON.parse(text.slice(start, end));
    const rows = data?.table?.rows;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("Empty Stockbee sheet");

    // Newest-first per Stockbee convention; take up to N rows.
    const parsed: Record<string, unknown>[] = [];
    let skipped_no_date = 0;
    let skipped_no_sp500 = 0;
    for (let i = 0; i < Math.min(rows.length, MAX_HISTORY_DAYS); i++) {
      const c = rows[i]?.c ?? [];
      const v = (idx: number) => (c[idx] && c[idx].v != null ? c[idx].v : null);
      const dateStr = parseGvizDate(v(0));
      if (!dateStr) {
        skipped_no_date++;
        continue;
      }
      const sp500 = toNum(v(15));
      if (sp500 == null) {
        skipped_no_sp500++;
        continue;
      }
      parsed.push({
        observation_date: dateStr,
        up_4pct: toInt(v(1)),
        down_4pct: toInt(v(2)),
        ratio5: toNum(v(3)),
        ratio10: toNum(v(4)),
        up_25pct_qtr: toInt(v(5)),
        down_25pct_qtr: toInt(v(6)),
        universe_size: toInt(v(13)),
        t2108: toNum(v(14)),
        sp500_level: sp500,
        fetched_at: new Date().toISOString(),
      });
    }

    if (parsed.length === 0) {
      throw new Error(
        `No parseable rows. Skipped: no_date=${skipped_no_date}, no_sp500=${skipped_no_sp500}`,
      );
    }

    const { error: upErr } = await supabase
      .from("stockbee_breadth_raw")
      .upsert(parsed, { onConflict: "observation_date" });
    if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);

    const summary = {
      rows_upserted: parsed.length,
      latest_date: parsed[0].observation_date,
      latest_t2108: parsed[0].t2108,
      latest_ratio5: parsed[0].ratio5,
      latest_ratio10: parsed[0].ratio10,
      latest_sp500: parsed[0].sp500_level,
      skipped_no_date,
      skipped_no_sp500,
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

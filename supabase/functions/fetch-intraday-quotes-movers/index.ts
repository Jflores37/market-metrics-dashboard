// fetch-intraday-quotes-movers (v9)
// Yahoo intraday quotes + Finviz mover screens (gainer/loser/in_play/premarket).
// v9: Finviz export has NO premarket-change column (confirmed via the v8 header
// dump), so premarket screens read regular Change and only make sense during the
// premarket window. FIX: fetch premarket_up/down ONLY between 04:00-09:30 ET; the
// morning's batch then persists for display through the session (24h prune). Lean
// columns restored.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const QUOTE_SYMBOLS: Array<{ symbol: string; label: string }> = [
  { symbol: "SPY", label: "SPY" }, { symbol: "QQQ", label: "QQQ" },
  { symbol: "DIA", label: "DIA" }, { symbol: "IWM", label: "IWM" },
  { symbol: "^VIX", label: "VIX" }, { symbol: "GLD", label: "GLD" },
  { symbol: "TLT", label: "TLT" }, { symbol: "MSTR", label: "MSTR" },
  { symbol: "NVDA", label: "NVDA" }, { symbol: "TSLA", label: "TSLA" },
];

// Lean set; resolved by header so exact numbering doesn't matter.
const MOVER_COLS = "1,2,3,62,63,64,65,66,67";

const MOVER_SCREENS: Array<{ type: "gainer" | "loser" | "in_play" | "premarket_up" | "premarket_down"; filter: string; sort: string }> = [
  { type: "gainer",         filter: "sh_avgvol_o100,ta_change_u3",     sort: "-change" },
  { type: "loser",          filter: "sh_avgvol_o100,ta_change_d3",     sort: "change" },
  { type: "in_play",        filter: "sh_avgvol_o100,sh_relvol_o2",     sort: "-relativevolume" },
  { type: "premarket_up",   filter: "sh_avgvol_o100,ta_change_pre_u3", sort: "-change" },
  { type: "premarket_down", filter: "sh_avgvol_o100,ta_change_pre_d3", sort: "change" },
];

const TOP_N = 50;

// Premarket movers only mean something during the pre-open window. DST-aware.
function inPremarketWindow(): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
    const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const mins = h * 60 + m;
    return mins >= 240 && mins < 570; // 04:00 - 09:30 ET
  } catch { return true; }
}

async function getSecret(key: string): Promise<string> {
  const { data, error } = await supabase.rpc("get_secret", { p_name: key });
  if (error || data == null || data === "") throw new Error(`Secret ${key} not available from Vault: ${error?.message ?? "not found"}`);
  return data as string;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let field = ""; let i = 0; let inQuotes = false;
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
function pct(s: string | undefined): number | null { if (!s) return null; const t = s.trim(); if (t === "" || t === "-") return null; const n = parseFloat(t.replace(/%$/, "")); return Number.isFinite(n) ? n : null; }
function num(s: string | undefined): number | null { if (!s) return null; const t = s.trim(); if (t === "" || t === "-") return null; const n = parseFloat(t.replace(/,/g, "")); return Number.isFinite(n) ? n : null; }
function int(s: string | undefined): number | null { const n = num(s); return n == null ? null : Math.round(n); }
function str(s: string | undefined): string | null { if (!s) return null; const t = s.trim(); return t === "" || t === "-" ? null : t; }
function findCol(headers: string[], candidates: string[]): number { const norm = headers.map((h) => h.trim()); for (const c of candidates) { const i = norm.indexOf(c); if (i >= 0) return i; } return -1; }

async function fetchYahooQuote(symbol: string): Promise<{ price: number | null; prevClose: number | null } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
  try {
    const resp = await fetch(url, { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    return { price: typeof meta?.regularMarketPrice === "number" ? meta.regularMarketPrice : null, prevClose: typeof meta?.chartPreviousClose === "number" ? meta.chartPreviousClose : null };
  } catch { return null; }
}

async function fetchFinvizMovers(filter: string, sort: string, auth: string): Promise<Array<Record<string, unknown>>> {
  const url = `https://elite.finviz.com/export.ashx?v=152&f=${filter}&o=${sort}&c=${MOVER_COLS}&auth=${auth}`;
  const resp = await fetch(url);
  if (!resp.ok) { const body = await resp.text(); throw new Error(`Finviz ${resp.status}: ${body.slice(0, 200)}`); }
  const rows = parseCSV(await resp.text());
  if (rows.length < 2) return [];
  const headers = rows[0];
  const idx = {
    ticker: findCol(headers, ["Ticker"]), company: findCol(headers, ["Company"]), sector: findCol(headers, ["Sector"]),
    relVol: findCol(headers, ["Relative Volume"]), price: findCol(headers, ["Price"]), change: findCol(headers, ["Change"]), volume: findCol(headers, ["Volume"]),
  };
  const out: Array<Record<string, unknown>> = [];
  const limit = Math.min(rows.length - 1, TOP_N);
  for (let r = 1; r <= limit; r++) {
    const row = rows[r];
    const tk = str(row[idx.ticker]);
    if (!tk) continue;
    out.push({ rank: r, ticker: tk, company: idx.company >= 0 ? str(row[idx.company]) : null, sector: idx.sector >= 0 ? str(row[idx.sector]) : null, price: idx.price >= 0 ? num(row[idx.price]) : null, change_pct: idx.change >= 0 ? pct(row[idx.change]) : null, volume: idx.volume >= 0 ? int(row[idx.volume]) : null, rel_volume: idx.relVol >= 0 ? num(row[idx.relVol]) : null });
  }
  return out;
}

Deno.serve(async (_req: Request) => {
  const started = Date.now();
  const { data: jobRow } = await supabase.from("job_runs").insert({ job_name: "fetch-intraday-quotes-movers", status: "running" }).select("id").single();
  const jobId: number | null = jobRow?.id ?? null;
  const finishJob = async (status: "ok" | "error", summary: Record<string, unknown> | null, error?: string) => {
    if (jobId == null) return;
    await supabase.from("job_runs").update({ finished_at: new Date().toISOString(), status, elapsed_ms: Date.now() - started, summary, error: error ?? null }).eq("id", jobId);
  };

  try {
    const auth = await getSecret("finviz_token");
    const fetchedAt = new Date().toISOString();
    const preWindow = inPremarketWindow();
    const screens = MOVER_SCREENS.filter((m) => preWindow || !m.type.startsWith("premarket"));

    const quoteResults = await Promise.all(QUOTE_SYMBOLS.map(async (q) => ({ q, data: await fetchYahooQuote(q.symbol) })));
    const moverResults = await Promise.all(screens.map(async (m) => {
      try { return { type: m.type, rows: await fetchFinvizMovers(m.filter, m.sort, auth), error: null as string | null }; }
      catch (e) { return { type: m.type, rows: [] as Array<Record<string, unknown>>, error: String(e instanceof Error ? e.message : e) }; }
    }));

    const quoteRows: Array<Record<string, unknown>> = [];
    let quotesOk = 0;
    for (const { q, data } of quoteResults) {
      if (!data || data.price == null) continue;
      quotesOk++;
      const changeAbs = data.prevClose != null ? data.price - data.prevClose : null;
      const changePct = data.prevClose != null && data.prevClose > 0 ? ((data.price - data.prevClose) / data.prevClose) * 100 : null;
      quoteRows.push({ ticker: q.symbol, display_label: q.label, fetched_at: fetchedAt, price: data.price, prev_close: data.prevClose, change_abs: changeAbs, change_pct: changePct });
    }
    if (quoteRows.length > 0) { const { error: qErr } = await supabase.from("intraday_quotes").insert(quoteRows); if (qErr) throw new Error(`Quote insert: ${qErr.message}`); }

    const moverInserts: Array<Record<string, unknown>> = [];
    const moverSummary: Record<string, unknown> = {};
    for (const result of moverResults) {
      if (result.error) { moverSummary[result.type] = { error: result.error }; continue; }
      moverSummary[result.type] = result.rows.length;
      for (const r of result.rows) moverInserts.push({ mover_type: result.type, ticker: r.ticker, fetched_at: fetchedAt, rank: r.rank, company: r.company, sector: r.sector, price: r.price, change_pct: r.change_pct, volume: r.volume, rel_volume: r.rel_volume });
    }
    if (moverInserts.length > 0) { const { error: mErr } = await supabase.from("intraday_movers").insert(moverInserts); if (mErr) throw new Error(`Mover insert: ${mErr.message}`); }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("intraday_quotes").delete().lt("fetched_at", cutoff);
    await supabase.from("intraday_movers").delete().lt("fetched_at", cutoff);

    const summary = { fetched_at: fetchedAt, premarket_window: preWindow, quotes_ok: quotesOk, mover_inserts: moverInserts.length, movers: moverSummary };
    await finishJob("ok", summary);
    return new Response(JSON.stringify({ ok: true, ...summary }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await finishJob("error", null, errMsg);
    return new Response(JSON.stringify({ ok: false, error: errMsg, elapsed_ms: Date.now() - started }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

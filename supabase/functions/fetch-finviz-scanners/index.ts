// fetch-finviz-scanners v9 — reference filters, FinViz v=152 universal view.
//
// Same as v8 (verbatim reference filters, rewrite v=->v=152 + full c=),
// PLUS: FinViz's v=152 "Average Volume" column is returned in THOUSANDS
// while "Volume" is raw shares. We multiply avg_volume by 1000 so both
// are in absolute shares (e.g. AMD avg vol 38958 -> 38,958,000). The
// reference handles this in _format_screener_vol (layout.py:940).
//
// Only derived value: atr_pct = atr / price * 100.
//
// Dispatch: ?group=trend|perf|perf2|special|all (default trend)
//           ?only=<scanner_id>   ?earnings=1

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const CALL_DELAY_MS = 1500;
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function getSecret(key: string): Promise<string> {
  const { data, error } = await supabase.from("app_config").select("value").eq("key", key).single();
  if (error || !data) throw new Error(`Secret ${key} not configured: ${error?.message}`);
  return data.value;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let cur: string[] = []; let field = ""; let i = 0; let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
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

function pct(s?: string): number | null {
  if (!s) return null; const t = s.trim();
  if (t === "" || t === "-") return null;
  const n = parseFloat(t.replace(/%$/, "")); return Number.isFinite(n) ? n : null;
}
function num(s?: string): number | null {
  if (!s) return null; const t = s.trim();
  if (t === "" || t === "-") return null;
  const m = /^([\-+]?[\d.]+)\s*([KMB])?\s*%?$/i.exec(t.replace(/,/g, ""));
  if (!m) return null;
  let v = parseFloat(m[1]); if (!Number.isFinite(v)) return null;
  const suf = (m[2] ?? "").toUpperCase();
  if (suf === "K") v *= 1e3; else if (suf === "M") v *= 1e6; else if (suf === "B") v *= 1e9;
  return v;
}
function int(s?: string): number | null { const n = num(s); return n == null ? null : Math.round(n); }
function str(s?: string): string | null {
  if (!s) return null; const t = s.trim(); return t === "" || t === "-" ? null : t;
}
function findCol(headers: string[], cands: string[]): number {
  const norm = headers.map((h) => h.trim());
  for (const c of cands) { const i = norm.indexOf(c); if (i >= 0) return i; }
  return -1;
}

// Reference FINVIZ_EXPORT_URLS — verbatim from constants.py. We keep f=,
// o=, ft= and rewrite v= + c= (see header note).
const REF_URLS: Record<string, string> = {
  qulla_episodic:            "https://elite.finviz.com/export.ashx?v=141&f=ta_gap_u10,sh_relvol_o2,sh_price_o1,sh_avgvol_o1000&o=-change&c=1,47,61,62,63,64,65",
  qulla_ps_large:            "https://elite.finviz.com/export.ashx?v=141&f=cap_largeover,ta_perf_50to-4w&o=-change&c=1,47,61,62,63,64,65",
  qulla_ps_small:            "https://elite.finviz.com/export.ashx?v=141&f=cap_to9,ta_perf_300to-4w,ta_perf2_100to-1w&ft=4&o=-change&c=1,47,61,62,63,64,65",
  qulla_breakouts:           "https://elite.finviz.com/export.ashx?v=141&f=sh_avgvol_o1000,sh_price_o1,ta_highlow52w_0to25-bhx,ta_perf_30to-4w,tad_0_close::close:d|abvpct::10:|sma:20:sma:d&o=-change&c=1,47,61,62,63,64,65",
  minervini:                 "https://elite.finviz.com/export.ashx?v=141&f=sh_avgvol_o1000,sh_price_o1,ta_sma200_pa,tad_0_sma:150:sma:d|abv:::1|close::close:d,tad_1_sma:200:sma:d|abv:::1|close::close:d,tad_2_sma:200:sma:d|abv:::1|sma:150:sma:d,tad_3_sma:50:sma:d|abv:::|sma:150:sma:d,tad_4_sma:50:sma:d|abv:::|sma:200:sma:d,tad_5_sma:50:sma:d|abv:::1|close::close:d,tad_6_close::close:d|abvpct:30::|hilo:52:low:d,tad_7_close::close:d|blwpct::25:|hilo:52:high:d,tad_8_rsi:14:rsi:d|abveq:::|value:::70&o=-change&c=1,47,61,62,63,64,65",
  oneil:                     "https://elite.finviz.com/export.ashx?v=161&f=fa_epsyoy_o25,fa_epsyoy1_o25,fa_epsyoyttm_pos,fa_netmargin_pos,fa_roe_pos&o=-change&ft=2&c=1,32,40,47,61,62,63,64,65",
  jeff_sun_canslim:          "https://elite.finviz.com/export.ashx?v=141&f=cap_midover,fa_salesqoq_high,fa_salesyoyttm_high,sh_avgvol_500to,sh_curvol_o2000,sh_insttrans_pos,ta_highlow20d_a5h,ta_highlow50d_a5h,ta_volatility_wo4&ft=4&o=-change&c=1,47,61,62,63,64,65",
  jeff_sun_high_adr:         "https://elite.finviz.com/export.ashx?v=141&f=cap_midover,sh_avgvol_500to,sh_curvol_o2000,sh_relvol_o2,ta_volatility_wo10&ft=4&o=-change&c=1,47,61,62,63,64,65",
  jeff_sun_extended_bases:   "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o1000,sh_curvol_o1000,sh_insttrans_pos,sh_price_o1,ta_alltime_b70h,ta_highlow50d_a15h,ta_highlow52w_b30h,ta_perf_ytddown,ta_sma200_-20to20-a,ta_volatility_wo4&ft=4&o=-change&c=1,47,61,62,63,64,65",
  jeff_sun_1w20:             "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_1w20o,ta_volatility_wo4&ft=4&o=-marketcap&c=1,47,61,62,63,64,65",
  jeff_sun_4w30:             "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_4w30o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65",
  jeff_sun_4w50:             "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_4w50o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65",
  jeff_sun_13w50:            "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_13w50o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65",
  jeff_sun_26w100:           "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_26w100o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65",
  jeff_sun_ipo_thisweek:     "https://elite.finviz.com/export.ashx?v=141&f=cap_midover,fa_epsyoy1_pos,ipodate_prevyear,sh_avgvol_o1000&ft=4&o=industry&c=1,47,61,62,63,64,65",
  jeff_sun_high_short_float: "https://elite.finviz.com/export.ashx?v=131&f=cap_smallover,ind_stocksonly,sh_avgvol_o1000,sh_float_u100,sh_short_o30&ft=4&c=1,32,47,61,62,63,64,65",
  jeff_sun_liquid_etfs:      "https://elite.finviz.com/export.ashx?v=111&f=ind_exchangetradedfund,sh_avgvol_o1000,ta_volatility_wo3&ft=4&o=-volume&c=1,47,61,62,63,64,65",
  julian_komar_strongest:    "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,ind_stocksonly,sh_avgvol_o100,sh_price_o7,ta_highlow52w_a70h,ta_sma50_pa&ft=4&o=-low52w&c=1,47,61,62,63,64,65",
  up4_daily:                 "https://elite.finviz.com/export.ashx?v=141&f=sh_avgvol_o1000,sh_price_o1,ta_perf_4to-d&o=-change&c=1,47,61,62,63,64,65",
};

const FULL_V152_COLS =
  "0,1,2,79,3,4,5,129,6,7,8,9,10,11,12,13,73,74,75,14,130,131,147,148,149,15,16,77,17,18,142,19,20,143,21,23,22,132,133,82,78,127,128,144,145,146,24,25,85,26,27,28,29,30,31,84,32,33,34,35,36,37,38,39,40,41,90,91,92,93,94,95,96,97,98,99,42,43,44,45,47,46,138,139,140,48,49,50,51,52,53,54,55,56,57,58,134,125,126,59,68,70,80,83,76,60,61,62,63,64,67,89,69,81,86,87,88,65,66,71,72,141,135,136,137,150,103,100,101,104,102,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123,124,105";

function buildUrl(refUrl: string, auth: string): string {
  let u = refUrl.replace(/([?&])v=\d+/, "$1v=152");
  u = u.replace(/([?&])c=[^&]*/, "$1c=" + FULL_V152_COLS);
  return `${u}&auth=${auth}`;
}

type ParsedRow = {
  ticker: string; price: number | null; volume: number | null;
  avgVolume: number | null; relVolume: number | null;
  perfDay: number | null; atr: number | null;
  roe: number | null; netMargin: number | null; shortFloat: number | null;
};

async function finvizPull(refUrl: string, auth: string): Promise<ParsedRow[]> {
  const url = buildUrl(refUrl, auth);
  const attempts = [0, 3000, 6000]; let lastErr: Error | null = null;
  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i] > 0) await sleep(attempts[i]);
    try {
      const res = await fetch(url);
      if (res.status === 429) { await res.body?.cancel(); lastErr = new Error(`Finviz 429 #${i + 1}`); continue; }
      if (!res.ok) { const b = await res.text(); throw new Error(`Finviz ${res.status}: ${b.slice(0, 200)}`); }
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length < 1) throw new Error("Empty CSV");
      const headers = rows[0].map((h) => h.trim());
      const idx = {
        ticker:     findCol(headers, ["Ticker"]),
        price:      findCol(headers, ["Price"]),
        change:     findCol(headers, ["Change"]),
        volume:     findCol(headers, ["Volume"]),
        avgVolume:  findCol(headers, ["Average Volume"]),
        relVolume:  findCol(headers, ["Relative Volume"]),
        atr:        findCol(headers, ["Average True Range"]),
        roe:        findCol(headers, ["Return on Equity"]),
        netMargin:  findCol(headers, ["Profit Margin", "Net Margin"]),
        shortFloat: findCol(headers, ["Short Float", "Float Short"]),
      };
      const get = (row: string[], k: number) => k >= 0 ? row[k] : undefined;
      const parsed: ParsedRow[] = []; const seen = new Set<string>();
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const ticker = str(get(row, idx.ticker)) ?? "";
        if (!ticker || seen.has(ticker)) continue;
        seen.add(ticker);
        const avRaw = int(get(row, idx.avgVolume));
        parsed.push({
          ticker,
          price: num(get(row, idx.price)),
          volume: int(get(row, idx.volume)),
          // FinViz v=152 returns Average Volume in THOUSANDS; Volume is raw.
          avgVolume: avRaw == null ? null : avRaw * 1000,
          relVolume: num(get(row, idx.relVolume)),
          perfDay: pct(get(row, idx.change)),
          atr: num(get(row, idx.atr)),
          roe: pct(get(row, idx.roe)),
          netMargin: pct(get(row, idx.netMargin)),
          shortFloat: pct(get(row, idx.shortFloat)),
        });
      }
      return parsed;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (!String(lastErr.message).includes("429")) break;
    }
  }
  throw lastErr ?? new Error("Finviz pull failed");
}

function toRecord(scannerId: string, snapshotDate: string, r: ParsedRow, rank: number, stageTag: string | null = null) {
  const atrPct = r.atr != null && r.price != null && r.price !== 0
    ? Math.round((r.atr / r.price) * 100 * 100) / 100 : null;
  return {
    scanner_id: scannerId, ticker: r.ticker, snapshot_date: snapshotDate, rank,
    company: null, sector: null, industry: null,
    price: r.price, market_cap_millions: null,
    volume: r.volume, avg_volume: r.avgVolume, rel_volume: r.relVolume,
    perf_day: r.perfDay, perf_week: null, perf_month: null,
    perf_quarter: null, perf_half: null, perf_year: null, perf_ytd: null,
    rsi14: null, atr: r.atr, atr_pct: atrPct,
    stage_tag: stageTag, dist_52w_high_pct: null,
    roe: r.roe, net_margin: r.netMargin, short_float_pct: r.shortFloat,
    extras: null as Record<string, unknown> | null,
  };
}

async function upsertScanner(scannerId: string, snapshotDate: string, records: ReturnType<typeof toRecord>[]) {
  await supabase.from("scanner_results").delete().eq("scanner_id", scannerId).eq("snapshot_date", snapshotDate);
  if (records.length === 0) return;
  const { error } = await supabase.from("scanner_results").insert(records);
  if (error) throw error;
}

async function runSingle(scannerId: string, urlKey: string, auth: string, snap: string, stageTag: string | null = null) {
  const refUrl = REF_URLS[urlKey];
  if (!refUrl) throw new Error(`No REF_URLS entry for ${urlKey}`);
  const raw = await finvizPull(refUrl, auth);
  const records = raw.map((r, i) => toRecord(scannerId, snap, r, i + 1, stageTag));
  await upsertScanner(scannerId, snap, records);
  return { fetched: raw.length, inserted: records.length };
}

async function runParabolicShort(auth: string, snap: string) {
  const large = await finvizPull(REF_URLS.qulla_ps_large, auth);
  await sleep(CALL_DELAY_MS);
  const small = await finvizPull(REF_URLS.qulla_ps_small, auth);
  const byT = new Map<string, ParsedRow>();
  for (const r of large) if (!byT.has(r.ticker)) byT.set(r.ticker, r);
  for (const r of small) if (!byT.has(r.ticker)) byT.set(r.ticker, r);
  const merged = Array.from(byT.values()).sort((a, b) => (b.perfDay ?? -Infinity) - (a.perfDay ?? -Infinity));
  const records = merged.map((r, i) => toRecord("parabolic_short", snap, r, i + 1, "PS"));
  await upsertScanner("parabolic_short", snap, records);
  return { fetched: large.length + small.length, inserted: records.length };
}

async function runQullaCombined(auth: string, snap: string) {
  const ep = await finvizPull(REF_URLS.qulla_episodic, auth);
  await sleep(CALL_DELAY_MS);
  const psL = await finvizPull(REF_URLS.qulla_ps_large, auth);
  await sleep(CALL_DELAY_MS);
  const psS = await finvizPull(REF_URLS.qulla_ps_small, auth);
  await sleep(CALL_DELAY_MS);
  const bo = await finvizPull(REF_URLS.qulla_breakouts, auth);
  const m = new Map<string, { row: ParsedRow; tags: Set<string> }>();
  for (const r of ep)  { const e = m.get(r.ticker) ?? { row: r, tags: new Set() }; e.tags.add("EP"); m.set(r.ticker, e); }
  for (const r of psL) { const e = m.get(r.ticker) ?? { row: r, tags: new Set() }; e.tags.add("PS"); m.set(r.ticker, e); }
  for (const r of psS) { const e = m.get(r.ticker) ?? { row: r, tags: new Set() }; e.tags.add("PS"); m.set(r.ticker, e); }
  for (const r of bo)  { const e = m.get(r.ticker) ?? { row: r, tags: new Set() }; e.tags.add("BO"); m.set(r.ticker, e); }
  const merged = Array.from(m.values()).sort((a, b) => (b.row.perfDay ?? -Infinity) - (a.row.perfDay ?? -Infinity));
  const records = merged.map(({ row, tags }, i) => toRecord("qullamaggie_combined", snap, row, i + 1, Array.from(tags).sort().join(", ")));
  await upsertScanner("qullamaggie_combined", snap, records);
  return { fetched: ep.length + psL.length + psS.length + bo.length, inserted: records.length };
}

const RUNNERS: Record<string, (auth: string, snap: string) => Promise<{ fetched: number; inserted: number }>> = {
  minervini:            (a, s) => runSingle("minervini", "minervini", a, s),
  canslim:              (a, s) => runSingle("canslim", "oneil", a, s),
  jeff_sun_canslim:     (a, s) => runSingle("jeff_sun_canslim", "jeff_sun_canslim", a, s),
  high_adr:             (a, s) => runSingle("high_adr", "jeff_sun_high_adr", a, s),
  extended_bases:       (a, s) => runSingle("extended_bases", "jeff_sun_extended_bases", a, s),
  julian_strongest:     (a, s) => runSingle("julian_strongest", "julian_komar_strongest", a, s),
  qullamaggie:          (a, s) => runSingle("qullamaggie", "qulla_episodic", a, s, "EP"),
  qullamaggie_breakout: (a, s) => runSingle("qullamaggie_breakout", "qulla_breakouts", a, s, "BO"),
  parabolic_short:      (a, s) => runParabolicShort(a, s),
  qullamaggie_combined: (a, s) => runQullaCombined(a, s),
  perf_1w20:            (a, s) => runSingle("perf_1w20", "jeff_sun_1w20", a, s),
  perf_4w30:            (a, s) => runSingle("perf_4w30", "jeff_sun_4w30", a, s),
  perf_4w50:            (a, s) => runSingle("perf_4w50", "jeff_sun_4w50", a, s),
  perf_13w50:           (a, s) => runSingle("perf_13w50", "jeff_sun_13w50", a, s),
  perf_26w100:          (a, s) => runSingle("perf_26w100", "jeff_sun_26w100", a, s),
  up4_daily:            (a, s) => runSingle("up4_daily", "up4_daily", a, s),
  ipo_thisweek:         (a, s) => runSingle("ipo_thisweek", "jeff_sun_ipo_thisweek", a, s),
  high_short:           (a, s) => runSingle("high_short", "jeff_sun_high_short_float", a, s),
  liquid_etfs:          (a, s) => runSingle("liquid_etfs", "jeff_sun_liquid_etfs", a, s),
};

const GROUPS: Record<string, string[]> = {
  trend:   ["minervini", "canslim", "jeff_sun_canslim", "high_adr", "extended_bases", "julian_strongest"],
  perf:    ["qullamaggie", "qullamaggie_combined", "qullamaggie_breakout", "parabolic_short", "perf_1w20", "perf_4w30"],
  perf2:   ["perf_4w50", "perf_13w50", "perf_26w100", "up4_daily"],
  special: ["ipo_thisweek", "high_short", "liquid_etfs"],
};

function parseEarningsDate(raw: string | null): { date: string | null; time: string | null } {
  if (!raw) return { date: null, time: null };
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.+))?$/.exec(raw.trim());
  if (!m) return { date: null, time: null };
  const mo = parseInt(m[1], 10), d = parseInt(m[2], 10), y = parseInt(m[3], 10);
  if (y < 2000 || mo < 1 || mo > 12 || d < 1) return { date: null, time: null };
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    return { date: null, time: null };
  const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const tp = m[4]?.trim() || null;
  const time = !tp
    ? null
    : /\b(bmo|before)\b/i.test(tp) ? "BMO"
    : /\b(amc|after)\b/i.test(tp) ? "AMC"
    : /\bAM\b/i.test(tp) ? "BMO"
    : /\bPM\b/i.test(tp) ? "AMC"
    : null;
  return { date, time };
}

async function fetchEarnings(auth: string): Promise<{ rows: Array<Record<string, unknown>>; raw: number }> {
  const url = "https://elite.finviz.com/export.ashx?v=161&f=earningsdate_thisweek,sh_avgvol_o1000,sh_price_o1&ft=4&o=-marketcap&c=1,68,6,65";
  const res = await fetch(`${url}&auth=${auth}`);
  if (!res.ok) { await res.body?.cancel(); throw new Error(`Finviz earnings ${res.status}`); }
  const rows = parseCSV(await res.text());
  if (rows.length < 2) return { rows: [], raw: 0 };
  const hdr = rows[0].map((h) => h.trim());
  const tI = findCol(hdr, ["Ticker"]);
  const dI = findCol(hdr, ["Earnings Date"]);
  const out: Array<Record<string, unknown>> = []; const seen = new Set<string>();
  for (let r = 1; r < rows.length; r++) {
    const t = str(rows[r][tI]); if (!t) continue;
    const { date, time } = parseEarningsDate(str(rows[r][dI]));
    if (!date) continue;
    const key = `${t}|${date}`; if (seen.has(key)) continue; seen.add(key);
    out.push({ ticker: t, earnings_date: date, earnings_time: time, fetched_at: new Date().toISOString() });
  }
  return { rows: out, raw: rows.length - 1 };
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  const url = new URL(req.url);
  const group = url.searchParams.get("group") ?? "trend";
  const onlyId = url.searchParams.get("only");
  const includeEarnings = url.searchParams.get("earnings") === "1" || group === "special";

  const { data: jobRow } = await supabase.from("job_runs")
    .insert({ job_name: `fetch-finviz-scanners:${onlyId ?? group}`, status: "running" })
    .select("id").single();
  const jobId: number | null = jobRow?.id ?? null;
  const finishJob = async (status: "ok" | "error", summary: Record<string, unknown> | null, error?: string) => {
    if (jobId == null) return;
    await supabase.from("job_runs").update({
      finished_at: new Date().toISOString(), status, elapsed_ms: Date.now() - started, summary, error: error ?? null,
    }).eq("id", jobId);
  };

  try {
    const auth = await getSecret("finviz_token");
    const snap = new Date().toISOString().slice(0, 10);
    let ids: string[];
    if (onlyId) { if (!RUNNERS[onlyId]) throw new Error(`Unknown scanner id: ${onlyId}`); ids = [onlyId]; }
    else if (group === "all") ids = Object.keys(RUNNERS);
    else { if (!GROUPS[group]) throw new Error(`Unknown group: ${group}`); ids = GROUPS[group]; }

    const summary: Record<string, { fetched: number; inserted: number; elapsed_ms: number; error?: string }> = {};
    for (let i = 0; i < ids.length; i++) {
      if (i > 0) await sleep(CALL_DELAY_MS);
      const t0 = Date.now();
      try {
        const { fetched, inserted } = await RUNNERS[ids[i]](auth, snap);
        summary[ids[i]] = { fetched, inserted, elapsed_ms: Date.now() - t0 };
      } catch (err) {
        summary[ids[i]] = { fetched: 0, inserted: 0, elapsed_ms: Date.now() - t0, error: String(err instanceof Error ? err.message : err) };
      }
    }

    let earningsSummary: Record<string, unknown> | null = null;
    if (includeEarnings && !onlyId) {
      await sleep(CALL_DELAY_MS);
      try {
        const e = await fetchEarnings(auth);
        if (e.rows.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const runStamp = new Date().toISOString();
          const rows = e.rows.map((r) => ({ ...r, fetched_at: runStamp }));
          // Write first: if this fails, the existing table is left intact.
          const { error } = await supabase.from("earnings_calendar").upsert(rows, { onConflict: "ticker,earnings_date" });
          if (error) throw error;
          // Then drop only future rows this run did not refresh (delisted/moved).
          await supabase.from("earnings_calendar").delete().gte("earnings_date", today).lt("fetched_at", runStamp);
        }
        earningsSummary = { fetched: e.raw, inserted: e.rows.length };
      } catch (err) { earningsSummary = { error: String(err instanceof Error ? err.message : err) }; }
    }

    const failed = Object.values(summary).filter((s) => s.error).length;
    const full = { group: onlyId ? `only:${onlyId}` : group, snapshot_date: snap,
      scanner_count: Object.keys(summary).length, scanners_ok: Object.keys(summary).length - failed,
      scanners_failed: failed, scanners: summary, earnings: earningsSummary };
    await finishJob(failed === 0 ? "ok" : "error", full);
    return new Response(JSON.stringify({ ok: failed === 0, elapsed_ms: Date.now() - started, ...full }),
      { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    await finishJob("error", null, m);
    return new Response(JSON.stringify({ ok: false, error: m, elapsed_ms: Date.now() - started }),
      { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

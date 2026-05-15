// fetch-finviz-scanners v5 — FinViz-Elite parity rebuild.
//
// Each scanner uses its VERBATIM FinViz Elite export URL (copied from the
// reference repo's src/constants.py FINVIZ_EXPORT_URLS, finviz-elite branch).
// We persist FinViz's CSV values as-is — only atr_pct is derived
// (atr / price * 100). No in-edge re-ranking; FinViz's &o= ordering wins.
//
// Dispatch: ?group=trend|perf|special|all   (default: trend)
//           ?only=<scanner_id>              (single scanner debug)
//           ?earnings=1                     (also refresh earnings calendar)

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

// ----- CSV + numeric parsing --------------------------------------------------
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

// FinViz numeric: bare number, K/M/B suffix, commas, or trailing %.
function num(s?: string): number | null {
  if (!s) return null; const t = s.trim();
  if (t === "" || t === "-") return null;
  const m = /^([\-+]?[\d.]+)\s*([KMB])?\s*%?$/i.exec(t.replace(/,/g, ""));
  if (!m) { const n = parseFloat(t.replace(/,/g, "")); return Number.isFinite(n) ? n : null; }
  let v = parseFloat(m[1]); if (!Number.isFinite(v)) return null;
  const suf = (m[2] ?? "").toUpperCase();
  if (suf === "K") v *= 1e3;
  else if (suf === "M") v *= 1e6;
  else if (suf === "B") v *= 1e9;
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

// ----- Reference FinViz export URLs (verbatim from constants.py) -------------
// Stripped of any &auth= — added at fetch time. The auth secret is in
// app_config.finviz_token.
const REF_URLS: Record<string, string> = {
  qulla_episodic:
    "https://elite.finviz.com/export.ashx?v=141&f=ta_gap_u10,sh_relvol_o2,sh_price_o1,sh_avgvol_o1000&o=-change&c=1,47,61,62,63,64,65",
  qulla_breakouts:
    "https://elite.finviz.com/export.ashx?v=141&f=sh_avgvol_o1000,sh_price_o1,ta_highlow52w_0to25-bhx,ta_perf_30to-4w,tad_0_close::close:d|abvpct::10:|sma:20:sma:d&o=-change&c=1,47,61,62,63,64,65",
  qulla_ps_large:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_largeover,ta_perf_50to-4w&o=-change&c=1,47,61,62,63,64,65",
  qulla_ps_small:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_to9,ta_perf_300to-4w,ta_perf2_100to-1w&ft=4&o=-change&c=1,47,61,62,63,64,65",
  minervini:
    "https://elite.finviz.com/export.ashx?v=141&f=sh_avgvol_o1000,sh_price_o1,ta_sma200_pa,tad_0_sma:150:sma:d|abv:::1|close::close:d,tad_1_sma:200:sma:d|abv:::1|close::close:d,tad_2_sma:200:sma:d|abv:::1|sma:150:sma:d,tad_3_sma:50:sma:d|abv:::|sma:150:sma:d,tad_4_sma:50:sma:d|abv:::|sma:200:sma:d,tad_5_sma:50:sma:d|abv:::1|close::close:d,tad_6_close::close:d|abvpct:30::|hilo:52:low:d,tad_7_close::close:d|blwpct::25:|hilo:52:high:d,tad_8_rsi:14:rsi:d|abveq:::|value:::70&o=-change&c=1,47,61,62,63,64,65",
  oneil:
    "https://elite.finviz.com/export.ashx?v=161&f=fa_epsyoy_o25,fa_epsyoy1_o25,fa_epsyoyttm_pos,fa_netmargin_pos,fa_roe_pos&o=-change&ft=2&c=1,32,40,47,61,62,63,64,65",
  jeff_sun_canslim:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_midover,fa_salesqoq_high,fa_salesyoyttm_high,sh_avgvol_500to,sh_curvol_o2000,sh_insttrans_pos,ta_highlow20d_a5h,ta_highlow50d_a5h,ta_volatility_wo4&ft=4&o=-change&c=1,47,61,62,63,64,65",
  jeff_sun_high_adr:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_midover,sh_avgvol_500to,sh_curvol_o2000,sh_relvol_o2,ta_volatility_wo10&ft=4&o=-change&c=1,47,61,62,63,64,65",
  jeff_sun_extended_bases:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o1000,sh_curvol_o1000,sh_insttrans_pos,sh_price_o1,ta_alltime_b70h,ta_highlow50d_a15h,ta_highlow52w_b30h,ta_perf_ytddown,ta_sma200_-20to20-a,ta_volatility_wo4&ft=4&o=-change&c=1,47,61,62,63,64,65",
  jeff_sun_1w20:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_1w20o,ta_volatility_wo4&ft=4&o=-marketcap&c=1,47,61,62,63,64,65",
  jeff_sun_4w30:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_4w30o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65",
  jeff_sun_4w50:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_4w50o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65",
  jeff_sun_13w50:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_13w50o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65",
  jeff_sun_26w100:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_26w100o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65",
  jeff_sun_ipo_thisweek:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_midover,fa_epsyoy1_pos,ipodate_prevyear,sh_avgvol_o1000&ft=4&o=industry&c=1,47,61,62,63,64,65",
  jeff_sun_high_short_float:
    "https://elite.finviz.com/export.ashx?v=131&f=cap_smallover,ind_stocksonly,sh_avgvol_o1000,sh_float_u100,sh_short_o30&ft=4&c=1,32,47,61,62,63,64,65",
  jeff_sun_liquid_etfs:
    "https://elite.finviz.com/export.ashx?v=111&f=ind_exchangetradedfund,sh_avgvol_o1000,ta_volatility_wo3&ft=4&o=-volume&c=1,47,61,62,63,64,65",
  julian_komar_strongest:
    "https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,ind_stocksonly,sh_avgvol_o100,sh_price_o7,ta_highlow52w_a70h,ta_sma50_pa&ft=4&o=-low52w&c=1,47,61,62,63,64,65",
  up4_daily:
    "https://elite.finviz.com/export.ashx?v=141&f=sh_avgvol_o1000,sh_price_o1,ta_perf_4to-d&o=-change&c=1,47,61,62,63,64,65",
};

// Union column set: Ticker, Company, Sector, Industry, MarketCap, Price,
// PerfWeek, PerfMonth, PerfQuarter, PerfHalf, PerfYear, PerfYtd, ATR, AvgVol,
// RelVol, Change, Volume, 52w High, 52w Low, RSI(14), Short Float.
const UNION_COLS = "1,2,3,4,6,41,42,43,44,45,46,47,50,51,52,55,56,61,62,63,64,65,67,73,79";

function buildUrl(baseUrl: string, auth: string): string {
  // Replace any existing &c= with UNION_COLS so we always pull the full
  // column set the dashboard needs, regardless of what the reference URL
  // requested. Filters and &o= sort are preserved.
  const stripped = baseUrl.replace(/(?:^|[?&])c=[^&]*/, (m) => m[0] === "?" ? "?" : "&");
  const sep = stripped.includes("?") ? "&" : "?";
  return `${stripped}${sep}c=${UNION_COLS}&auth=${auth}`;
}

// ----- Row parsing -----------------------------------------------------------
type ParsedRow = {
  ticker: string; company: string | null; sector: string | null; industry: string | null;
  price: number | null; marketCapM: number | null; volume: number | null;
  avgVolume: number | null; relVolume: number | null;
  perfDay: number | null; perfWeek: number | null; perfMonth: number | null;
  perfQuarter: number | null; perfHalf: number | null; perfYear: number | null; perfYtd: number | null;
  atr: number | null; rsi14: number | null;
  high52wPct: number | null; low52wPct: number | null;
  shortFloat: number | null;
};

async function finvizPullRef(baseUrl: string, auth: string): Promise<ParsedRow[]> {
  const url = buildUrl(baseUrl, auth);
  const attempts = [0, 3000, 6000]; let lastErr: Error | null = null;
  for (let i = 0; i < attempts.length; i++) {
    if (attempts[i] > 0) await sleep(attempts[i]);
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        await res.body?.cancel();
        lastErr = new Error(`Finviz 429 attempt ${i + 1}`);
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Finviz ${res.status}: ${body.slice(0, 200)}`);
      }
      const text = await res.text();
      const rows = parseCSV(text);
      if (rows.length < 1) throw new Error("Empty CSV");
      const headers = rows[0].map((h) => h.trim());
      const idx = {
        ticker:      findCol(headers, ["Ticker"]),
        company:     findCol(headers, ["Company"]),
        sector:      findCol(headers, ["Sector"]),
        industry:    findCol(headers, ["Industry"]),
        marketCap:   findCol(headers, ["Market Cap"]),
        price:       findCol(headers, ["Price"]),
        change:      findCol(headers, ["Change"]),
        perfWeek:    findCol(headers, ["Performance (Week)"]),
        perfMonth:   findCol(headers, ["Performance (Month)"]),
        perfQuarter: findCol(headers, ["Performance (Quarter)"]),
        perfHalf:    findCol(headers, ["Performance (Half Year)"]),
        perfYear:    findCol(headers, ["Performance (Year)"]),
        perfYtd:     findCol(headers, ["Performance (YTD)"]),
        atr:         findCol(headers, ["Average True Range"]),
        avgVolume:   findCol(headers, ["Average Volume"]),
        relVolume:   findCol(headers, ["Relative Volume"]),
        volume:      findCol(headers, ["Volume"]),
        high52w:     findCol(headers, ["52-Week High"]),
        low52w:      findCol(headers, ["52-Week Low"]),
        rsi14:       findCol(headers, ["Relative Strength Index (14)"]),
        shortFloat:  findCol(headers, ["Short Float"]),
      };
      const get = (row: string[], k: number) => k >= 0 ? row[k] : undefined;
      const parsed: ParsedRow[] = []; const seen = new Set<string>();
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const ticker = str(get(row, idx.ticker)) ?? "";
        if (!ticker || seen.has(ticker)) continue;
        seen.add(ticker);
        const mcapRaw = num(get(row, idx.marketCap));
        parsed.push({
          ticker, company: str(get(row, idx.company)),
          sector: str(get(row, idx.sector)), industry: str(get(row, idx.industry)),
          price: num(get(row, idx.price)),
          marketCapM: mcapRaw == null ? null : mcapRaw / 1e6,
          volume: int(get(row, idx.volume)),
          avgVolume: int(get(row, idx.avgVolume)),
          relVolume: num(get(row, idx.relVolume)),
          perfDay: pct(get(row, idx.change)),
          perfWeek: pct(get(row, idx.perfWeek)),
          perfMonth: pct(get(row, idx.perfMonth)),
          perfQuarter: pct(get(row, idx.perfQuarter)),
          perfHalf: pct(get(row, idx.perfHalf)),
          perfYear: pct(get(row, idx.perfYear)),
          perfYtd: pct(get(row, idx.perfYtd)),
          atr: num(get(row, idx.atr)),
          rsi14: num(get(row, idx.rsi14)),
          high52wPct: pct(get(row, idx.high52w)),
          low52wPct: pct(get(row, idx.low52w)),
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
    ? Math.round((r.atr / r.price) * 100 * 100) / 100
    : null;
  // 52w-high distance: FinViz returns -X% (negative) meaning X% below high.
  // dist_52w_high_pct stored as positive absolute distance for cleaner sorting.
  const dist52wHighPct = r.high52wPct != null ? Math.abs(r.high52wPct) : null;
  return {
    scanner_id: scannerId, ticker: r.ticker, snapshot_date: snapshotDate, rank,
    company: r.company, sector: r.sector, industry: r.industry,
    price: r.price, market_cap_millions: r.marketCapM,
    volume: r.volume, avg_volume: r.avgVolume, rel_volume: r.relVolume,
    perf_day: r.perfDay, perf_week: r.perfWeek, perf_month: r.perfMonth,
    perf_quarter: r.perfQuarter, perf_half: r.perfHalf,
    perf_year: r.perfYear, perf_ytd: r.perfYtd,
    rsi14: r.rsi14, atr: r.atr, atr_pct: atrPct,
    stage_tag: stageTag, dist_52w_high_pct: dist52wHighPct,
    extras: null as Record<string, unknown> | null,
  };
}

async function upsertScanner(scannerId: string, snapshotDate: string, records: ReturnType<typeof toRecord>[]) {
  await supabase.from("scanner_results").delete()
    .eq("scanner_id", scannerId).eq("snapshot_date", snapshotDate);
  if (records.length === 0) return;
  const { error } = await supabase.from("scanner_results").insert(records);
  if (error) throw error;
}

// ----- Per-scanner runners ---------------------------------------------------
async function runSingleUrl(scannerId: string, urlKey: string, auth: string, snapshotDate: string, stageTag: string | null = null) {
  const url = REF_URLS[urlKey];
  if (!url) throw new Error(`No REF_URLS entry for ${urlKey}`);
  const raw = await finvizPullRef(url, auth);
  const records = raw.map((r, i) => toRecord(scannerId, snapshotDate, r, i + 1, stageTag));
  await upsertScanner(scannerId, snapshotDate, records);
  return { fetched: raw.length, inserted: records.length };
}

async function runParabolicShort(auth: string, snapshotDate: string) {
  const large = await finvizPullRef(REF_URLS.qulla_ps_large, auth);
  await sleep(CALL_DELAY_MS);
  const small = await finvizPullRef(REF_URLS.qulla_ps_small, auth);
  const byTicker = new Map<string, ParsedRow>();
  for (const r of large) if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, r);
  for (const r of small) if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, r);
  const merged = Array.from(byTicker.values())
    .sort((a, b) => (b.perfDay ?? -Infinity) - (a.perfDay ?? -Infinity));
  const records = merged.map((r, i) => toRecord("parabolic_short", snapshotDate, r, i + 1, "PS"));
  await upsertScanner("parabolic_short", snapshotDate, records);
  return { fetched: large.length + small.length, inserted: records.length };
}

async function runQullamaggieCombined(auth: string, snapshotDate: string) {
  const ep = await finvizPullRef(REF_URLS.qulla_episodic, auth);
  await sleep(CALL_DELAY_MS);
  const psL = await finvizPullRef(REF_URLS.qulla_ps_large, auth);
  await sleep(CALL_DELAY_MS);
  const psS = await finvizPullRef(REF_URLS.qulla_ps_small, auth);
  await sleep(CALL_DELAY_MS);
  const bo = await finvizPullRef(REF_URLS.qulla_breakouts, auth);
  const tagsByTicker = new Map<string, { row: ParsedRow; tags: Set<string> }>();
  for (const r of ep)  { const e = tagsByTicker.get(r.ticker) ?? { row: r, tags: new Set() }; e.tags.add("EP"); tagsByTicker.set(r.ticker, e); }
  for (const r of psL) { const e = tagsByTicker.get(r.ticker) ?? { row: r, tags: new Set() }; e.tags.add("PS"); tagsByTicker.set(r.ticker, e); }
  for (const r of psS) { const e = tagsByTicker.get(r.ticker) ?? { row: r, tags: new Set() }; e.tags.add("PS"); tagsByTicker.set(r.ticker, e); }
  for (const r of bo)  { const e = tagsByTicker.get(r.ticker) ?? { row: r, tags: new Set() }; e.tags.add("BO"); tagsByTicker.set(r.ticker, e); }
  const merged = Array.from(tagsByTicker.values())
    .sort((a, b) => (b.row.perfDay ?? -Infinity) - (a.row.perfDay ?? -Infinity));
  const records = merged.map(({ row, tags }, i) => {
    const tag = Array.from(tags).sort().join(", ");
    return toRecord("qullamaggie_combined", snapshotDate, row, i + 1, tag);
  });
  await upsertScanner("qullamaggie_combined", snapshotDate, records);
  return { fetched: ep.length + psL.length + psS.length + bo.length, inserted: records.length };
}

// scanner_id (db) -> runner
const RUNNERS: Record<string, (auth: string, snap: string) => Promise<{ fetched: number; inserted: number }>> = {
  minervini:            (a, s) => runSingleUrl("minervini", "minervini", a, s),
  canslim:              (a, s) => runSingleUrl("canslim", "oneil", a, s),
  jeff_sun_canslim:     (a, s) => runSingleUrl("jeff_sun_canslim", "jeff_sun_canslim", a, s),
  high_adr:             (a, s) => runSingleUrl("high_adr", "jeff_sun_high_adr", a, s),
  extended_bases:       (a, s) => runSingleUrl("extended_bases", "jeff_sun_extended_bases", a, s),
  julian_strongest:     (a, s) => runSingleUrl("julian_strongest", "julian_komar_strongest", a, s),
  qullamaggie:          (a, s) => runSingleUrl("qullamaggie", "qulla_episodic", a, s, "EP"),
  qullamaggie_breakout: (a, s) => runSingleUrl("qullamaggie_breakout", "qulla_breakouts", a, s, "BO"),
  parabolic_short:      (a, s) => runParabolicShort(a, s),
  qullamaggie_combined: (a, s) => runQullamaggieCombined(a, s),
  perf_1w20:            (a, s) => runSingleUrl("perf_1w20", "jeff_sun_1w20", a, s),
  perf_4w30:            (a, s) => runSingleUrl("perf_4w30", "jeff_sun_4w30", a, s),
  perf_4w50:            (a, s) => runSingleUrl("perf_4w50", "jeff_sun_4w50", a, s),
  perf_13w50:           (a, s) => runSingleUrl("perf_13w50", "jeff_sun_13w50", a, s),
  perf_26w100:          (a, s) => runSingleUrl("perf_26w100", "jeff_sun_26w100", a, s),
  up4_daily:            (a, s) => runSingleUrl("up4_daily", "up4_daily", a, s),
  ipo_thisweek:         (a, s) => runSingleUrl("ipo_thisweek", "jeff_sun_ipo_thisweek", a, s),
  high_short:           (a, s) => runSingleUrl("high_short", "jeff_sun_high_short_float", a, s),
  liquid_etfs:          (a, s) => runSingleUrl("liquid_etfs", "jeff_sun_liquid_etfs", a, s),
};

// Groups follow scanner_catalog.group_tab. 6-7 per call to stay under the
// edge runtime wall-clock limit (~25s for the full set with 1.5s spacing).
const GROUPS: Record<string, string[]> = {
  trend:   ["minervini", "canslim", "jeff_sun_canslim", "high_adr", "extended_bases", "julian_strongest"],
  perf:    ["qullamaggie", "qullamaggie_combined", "qullamaggie_breakout", "parabolic_short", "perf_1w20", "perf_4w30"],
  perf2:   ["perf_4w50", "perf_13w50", "perf_26w100", "up4_daily"],
  special: ["ipo_thisweek", "high_short", "liquid_etfs"],
};

// Earnings calendar: unchanged from v4 (same data shape, FinViz earnings_thisweek).
function parseEarningsDate(raw: string | null): { date: string | null; time: string | null } {
  if (!raw) return { date: null, time: null };
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.+))?$/.exec(raw.trim());
  if (!m) return { date: null, time: null };
  const mo = parseInt(m[1], 10), d = parseInt(m[2], 10), y = parseInt(m[3], 10);
  if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31) return { date: null, time: null };
  const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const tp = m[4]?.trim() || null;
  const time = tp ? (/AM\s*$/i.test(tp) ? "BMO" : "AMC") : null;
  return { date, time };
}

async function fetchEarningsThisWeek(auth: string): Promise<{ rows: Array<Record<string, unknown>>; raw: number }> {
  const url =
    "https://elite.finviz.com/export.ashx?v=161&f=earningsdate_thisweek,sh_avgvol_o1000,sh_price_o1&ft=4&o=-marketcap";
  const raw = await finvizPullRef(url, auth);
  const out: Array<Record<string, unknown>> = []; const seen = new Set<string>();
  // The Earnings Date column is at FinViz v=161; UNION_COLS doesn't include it.
  // Re-fetch a tiny earnings-date-only set for the dates.
  await sleep(CALL_DELAY_MS);
  const dateRes = await fetch(
    `https://elite.finviz.com/export.ashx?v=161&f=earningsdate_thisweek,sh_avgvol_o1000,sh_price_o1&ft=4&o=-marketcap&c=1,68&auth=${auth}`,
  );
  const dateMap = new Map<string, string>();
  if (dateRes.ok) {
    const text = await dateRes.text();
    const rows = parseCSV(text);
    if (rows.length > 1) {
      const hdr = rows[0].map((h) => h.trim());
      const tIdx = findCol(hdr, ["Ticker"]);
      const dIdx = findCol(hdr, ["Earnings Date"]);
      for (let r = 1; r < rows.length; r++) {
        const t = str(rows[r][tIdx]); const d = str(rows[r][dIdx]);
        if (t && d) dateMap.set(t, d);
      }
    }
  } else {
    await dateRes.body?.cancel();
  }
  for (const r of raw) {
    const dateRaw = dateMap.get(r.ticker) ?? null;
    const { date, time } = parseEarningsDate(dateRaw);
    if (!date) continue;
    const key = `${r.ticker}|${date}`; if (seen.has(key)) continue; seen.add(key);
    out.push({
      ticker: r.ticker, earnings_date: date, earnings_time: time,
      company: r.company, sector: r.sector, industry: r.industry,
      market_cap_millions: r.marketCapM, fetched_at: new Date().toISOString(),
    });
  }
  return { rows: out, raw: raw.length };
}

// ----- HTTP handler ----------------------------------------------------------
Deno.serve(async (req: Request) => {
  const started = Date.now();
  const url = new URL(req.url);
  const group = url.searchParams.get("group") ?? "trend";
  const onlyId = url.searchParams.get("only");
  const includeEarnings = url.searchParams.get("earnings") === "1" || group === "special";

  const { data: jobRow } = await supabase
    .from("job_runs")
    .insert({ job_name: `fetch-finviz-scanners:${onlyId ?? group}`, status: "running" })
    .select("id").single();
  const jobId: number | null = jobRow?.id ?? null;

  const finishJob = async (status: "ok" | "error", summary: Record<string, unknown> | null, error?: string) => {
    if (jobId == null) return;
    await supabase.from("job_runs").update({
      finished_at: new Date().toISOString(),
      status, elapsed_ms: Date.now() - started, summary, error: error ?? null,
    }).eq("id", jobId);
  };

  try {
    const auth = await getSecret("finviz_token");
    const snapshotDate = new Date().toISOString().slice(0, 10);

    let scannerIds: string[];
    if (onlyId) {
      if (!RUNNERS[onlyId]) throw new Error(`Unknown scanner id: ${onlyId}`);
      scannerIds = [onlyId];
    } else if (group === "all") {
      scannerIds = Object.keys(RUNNERS);
    } else {
      if (!GROUPS[group]) throw new Error(`Unknown group: ${group} (trend|perf|perf2|special|all)`);
      scannerIds = GROUPS[group];
    }

    const summary: Record<string, { fetched: number; inserted: number; elapsed_ms: number; error?: string }> = {};

    for (let idx = 0; idx < scannerIds.length; idx++) {
      const id = scannerIds[idx];
      if (idx > 0) await sleep(CALL_DELAY_MS);
      const t0 = Date.now();
      try {
        const { fetched, inserted } = await RUNNERS[id](auth, snapshotDate);
        summary[id] = { fetched, inserted, elapsed_ms: Date.now() - t0 };
      } catch (err) {
        summary[id] = { fetched: 0, inserted: 0, elapsed_ms: Date.now() - t0, error: String(err instanceof Error ? err.message : err) };
      }
    }

    let earningsSummary: Record<string, unknown> | null = null;
    if (includeEarnings && !onlyId) {
      await sleep(CALL_DELAY_MS);
      try {
        const earnings = await fetchEarningsThisWeek(auth);
        if (earnings.rows.length > 0) {
          const today = new Date().toISOString().slice(0, 10);
          await supabase.from("earnings_calendar").delete().gte("earnings_date", today);
          const { error } = await supabase.from("earnings_calendar")
            .upsert(earnings.rows, { onConflict: "ticker,earnings_date" });
          if (error) throw error;
        }
        earningsSummary = { fetched: earnings.raw, inserted: earnings.rows.length };
      } catch (err) {
        earningsSummary = { error: String(err instanceof Error ? err.message : err) };
      }
    }

    const failedCount = Object.values(summary).filter((s) => s.error).length;
    const fullSummary = {
      group: onlyId ? `only:${onlyId}` : group,
      snapshot_date: snapshotDate,
      scanner_count: Object.keys(summary).length,
      scanners_ok: Object.keys(summary).length - failedCount,
      scanners_failed: failedCount,
      scanners: summary,
      earnings: earningsSummary,
    };
    await finishJob(failedCount === 0 ? "ok" : (failedCount > Object.keys(summary).length / 2 ? "error" : "ok"), fullSummary);

    return new Response(
      JSON.stringify({ ok: failedCount === 0, elapsed_ms: Date.now() - started, ...fullSummary }),
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

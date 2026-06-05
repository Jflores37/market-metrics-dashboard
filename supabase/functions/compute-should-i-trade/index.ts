// compute-should-i-trade
// 1:1 port of should_i_trade_scoring.py + should_i_trade_data.py to TypeScript.
// Reads from the Supabase tables populated by Phase 2 fetchers and writes a
// scoring snapshot per (snapshot_date, mode) to should_i_trade_history.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const WEIGHTS = { volatility: 0.25, momentum: 0.25, trend: 0.20, breadth: 0.20, macro: 0.10 };
const THRESHOLDS = {
  swing: { yes_min: 80, caution_min: 60 },
  day:   { yes_min: 85, caution_min: 65 },
} as const;

const SECTOR_SPDRS = ["XLK","XLV","XLF","XLY","XLC","XLI","XLE","XLP","XLU","XLB","XLRE"];

type Interp = "healthy" | "moderate" | "weakening" | "risk-off" | "unknown";
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const bucket3 = (s: number, mid: "moderate" | "weakening"): Interp =>
  s >= 75 ? "healthy" : s >= 50 ? mid : "risk-off";

function scoreVolatility(vix: number | null, slope: number | null) {
  if (vix == null) return { score: 50.0, interpretation: "unknown" as Interp };
  let base = 100;
  if (vix < 12) base = 95;
  else if (vix < 15) base = 88;
  else if (vix < 18) base = 78;
  else if (vix < 20) base = 68;
  else if (vix < 25) base = 55;
  else if (vix < 30) base = 40;
  else base = 25;
  let penalty = 0;
  if (slope != null) {
    if (slope > 1.0) penalty = 15;
    else if (slope > 0.5) penalty = 8;
    else if (slope < -0.5) penalty = -5;
  }
  const score = clamp(base - penalty);
  return { score: round1(score), interpretation: bucket3(score, "moderate") };
}

function scoreTrend(regime: "uptrend"|"downtrend"|"chop", qqqAbove50: boolean|null, spyRsi: number|null) {
  let base = regime === "uptrend" ? 85 : regime === "downtrend" ? 25 : 55;
  if (qqqAbove50 === true) base += 5;
  else if (qqqAbove50 === false) base -= 10;
  if (spyRsi != null) {
    if (spyRsi >= 40 && spyRsi <= 70) base += 5;
    else if (spyRsi > 75) base -= 5;
    else if (spyRsi < 30) base -= 10;
  }
  const score = clamp(base);
  return { score: round1(score), interpretation: bucket3(score, "weakening") };
}

function scoreBreadthCat(pct200: number|null, r5: number|null, nh: number|null, nl: number|null) {
  let base = 50;
  if (pct200 != null) {
    if (pct200 >= 60) base = 85;
    else if (pct200 >= 50) base = 75;
    else if (pct200 >= 40) base = 60;
    else base = 40;
  }
  if (r5 != null) {
    if (r5 > 1.2) base += 10;
    else if (r5 > 1.0) base += 5;
    else if (r5 < 0.8) base -= 15;
  }
  if (nh != null && nl != null && nl > 0 && nh > nl) base += 5;
  const score = clamp(base);
  return { score: round1(score), interpretation: bucket3(score, "weakening") };
}

function scoreMomentumCat(spread: number|null, pctHH: number|null) {
  let base = 50;
  if (spread != null) {
    if (spread > 1.5) base = 85;
    else if (spread > 0.5) base = 75;
    else if (spread > 0) base = 65;
    else if (spread < -1.0) base = 30;
    else base = 50;
  }
  if (pctHH != null && pctHH > 5) base += 5;
  const score = clamp(base);
  return { score: round1(score), interpretation: bucket3(score, "weakening") };
}

function scoreMacroCat(tnxTrend: number|null) {
  let base = 70;
  if (tnxTrend != null && Math.abs(tnxTrend) > 0.15) base -= 5;
  const score = clamp(base);
  return { score: round1(score), interpretation: bucket3(score, "weakening") };
}

type UB = { pct_sma20: number|null; pct_sma50: number|null; pct_sma200: number|null;
            pct_new_highs: number|null; pct_new_lows: number|null;
            nh_nl_ratio: number|null; pct_up4_of_universe: number|null };

function breakoutHealth(u: UB, r5: number|null): { score: number|null; detail: string } {
  const r5Score = r5 != null ? clamp((r5 - 0.5) * 80) : null;
  const smas = [u.pct_sma20, u.pct_sma50, u.pct_sma200].filter((x): x is number => x != null);
  const avgSma = smas.length > 0 ? smas.reduce((a,b)=>a+b,0)/smas.length : null;
  const parts: Array<[number, number]> = [];
  if (avgSma != null) parts.push([avgSma, 0.38]);
  if (u.pct_new_highs != null) parts.push([Math.min(100, u.pct_new_highs * 8), 0.28]); // 52wk new-high scale
  if (u.nh_nl_ratio != null) parts.push([u.nh_nl_ratio * 100, 0.17]);
  if (r5Score != null) parts.push([r5Score, 0.17]);
  if (parts.length === 0) return { score: null, detail: "" };
  const tw = parts.reduce((s,[,w])=>s+w,0);
  const raw = parts.reduce((s,[v,w])=>s+v*w,0)/tw;
  const score = round1(clamp(raw));
  const bits: string[] = [];
  if (avgSma != null) bits.push(`$1B+ above SMAs ~${Math.round(avgSma)}%`);
  if (u.pct_new_highs != null) bits.push(`new 52wk highs ${u.pct_new_highs.toFixed(1)}%`);
  if (u.nh_nl_ratio != null) bits.push(`NH/(NH+NL) ${Math.round(u.nh_nl_ratio*100)}%`);
  if (r5 != null) bits.push(`5d breadth r ${r5.toFixed(2)}`);
  return { score, detail: bits.join(" · ") };
}

type Badge3 = "Yes" | "No" | "Mixed";
function breakoutBadge(health: number|null, u: UB, r5: number|null): { status: Badge3; tag: string } {
  if (health == null) {
    if (r5 == null) return { status: "Mixed", tag: "Insufficient breadth data" };
    if (r5 > 1.1) return { status: "Yes", tag: "Working (5d ratio only)" };
    if (r5 < 0.9) return { status: "No", tag: "Failing (5d ratio only)" };
    return { status: "Mixed", tag: "Unclear (5d ratio only)" };
  }
  const pnh = u.pct_new_highs, nhnl = u.nh_nl_ratio;
  let tag: string;
  if (health >= 58 && (pnh == null || pnh >= 4.5) && (nhnl == null || nhnl >= 0.42)) tag = "Working";
  else if (health < 40 || (pnh != null && pnh < 1.5) || (nhnl != null && nhnl < 0.33)) tag = "Failing";
  else tag = "Unclear";
  return { status: tag === "Working" ? "Yes" : tag === "Failing" ? "No" : "Mixed", tag };
}

function scoreExecWindow(
  breadth: Awaited<ReturnType<typeof buildBreadth>>,
  momentum: Awaited<ReturnType<typeof buildMomentum>>,
) {
  const u = breadth.universe_1b;
  const r5 = breadth.ratio5;
  const bh = breakoutHealth(u, r5);
  const badge = breakoutBadge(bh.score, u, r5);

  const parts: Array<[number, number]> = [];
  if (bh.score != null) parts.push([bh.score, 0.45]);
  else if (r5 != null) parts.push([clamp((r5-0.5)*80), 0.4]);
  if (breadth.pct_above_20 != null) parts.push([breadth.pct_above_20, bh.score != null ? 0.28 : 0.3]);
  if (momentum.spread != null) parts.push([clamp(50 + momentum.spread*15), bh.score != null ? 0.17 : 0.2]);
  if (momentum.pct_higher_highs != null) parts.push([Math.min(100, momentum.pct_higher_highs*5), 0.1]);

  let score: number;
  if (parts.length === 0) score = 50;
  else {
    const tw = parts.reduce((s,[,w])=>s+w,0);
    score = tw > 0 ? parts.reduce((s,[v,w])=>s+v*w,0)/tw : 50;
  }
  score = round1(clamp(score));

  const posCount = momentum.sectors.filter(s => (s.chg ?? 0) >= 0).length;
  const leaders: Badge3 = posCount >= 6 ? "Yes" : posCount <= 2 ? "No" : "Mixed";
  const leadersDetail = leaders === "Yes" ? "Holding" : leaders === "No" ? "Fading" : "Mixed";

  const smas = [u.pct_sma20, u.pct_sma50, u.pct_sma200].filter((x): x is number => x != null);
  const avgSma = smas.length > 0 ? smas.reduce((a,b)=>a+b,0)/smas.length : null;
  let pbScore: number|null = null;
  if (r5 != null) pbScore = clamp((r5-0.5)*80);
  if (avgSma != null && pbScore != null) pbScore = 0.55*pbScore + 0.45*avgSma;
  else if (avgSma != null) pbScore = avgSma;
  let pullbacks: Badge3, pbDetail: string;
  if (pbScore != null) {
    pullbacks = pbScore >= 52 ? "Yes" : pbScore < 38 ? "No" : "Mixed";
  } else {
    pullbacks = r5 != null && r5 > 0.95 ? "Yes" : r5 != null && r5 < 0.7 ? "No" : "Mixed";
  }
  pbDetail = pullbacks === "Yes" ? "Support" : pullbacks === "No" ? "Selling" : "Mixed";

  const follow: "Strong"|"Weak"|"Moderate" = score >= 70 ? "Strong" : score < 40 ? "Weak" : "Moderate";
  const followDetail = follow === "Strong" ? "High conviction" : follow === "Weak" ? "Low conviction" : "Moderate";
  const breakoutsLabel = badge.status === "Yes" ? "Passing" : badge.status === "No" ? "Failing" : "Unclear";

  return {
    score,
    factors: {
      breakouts: { status: badge.status, detail: breakoutsLabel },
      leaders:   { status: leaders, detail: leadersDetail },
      pullbacks: { status: pullbacks, detail: pbDetail },
      follow:    { status: follow, detail: followDetail },
    },
  };
}

async function fetchVixBlock() {
  const { data: rows } = await supabase
    .from("vix_history")
    .select("observation_date,vix_close,vvix_close")
    .order("observation_date", { ascending: false })
    .limit(252);
  if (!rows || rows.length === 0) return { vix: null, vix_5d_slope: null, vvix: null, vix_1y_pct: null };

  const sorted = [...rows].sort((a,b) => a.observation_date < b.observation_date ? -1 : 1);
  const closes = sorted.map(r => Number(r.vix_close)).filter(Number.isFinite);
  const vix = closes.length > 0 ? closes[closes.length - 1] : null;
  const vvix = sorted[sorted.length - 1].vvix_close != null ? Number(sorted[sorted.length - 1].vvix_close) : null;

  let slope: number | null = null;
  if (closes.length >= 5) {
    const last5 = closes.slice(-5);
    const xs = [0, 1, 2, 3, 4];
    const meanX = 2, meanY = last5.reduce((a,b)=>a+b,0)/5;
    let num = 0, den = 0;
    for (let i = 0; i < 5; i++) { num += (xs[i]-meanX)*(last5[i]-meanY); den += (xs[i]-meanX)**2; }
    slope = den > 0 ? num/den : null;
  }

  let pct: number | null = null;
  if (vix != null && closes.length >= 50) {
    const yearCloses = closes.slice(-252);
    const below = yearCloses.filter(c => c < vix).length;
    pct = (below / yearCloses.length) * 100;
  }

  return { vix, vix_5d_slope: slope, vvix, vix_1y_pct: pct };
}

async function fetchTrendBlock() {
  const { data } = await supabase
    .from("index_etf_quotes")
    .select("ticker,observation_date,close,sma20,sma50,sma200,rsi14")
    .in("ticker", ["SPY", "QQQ"])
    .order("observation_date", { ascending: false })
    .limit(20);
  const spy = (data ?? []).find(r => r.ticker === "SPY");
  const qqq = (data ?? []).find(r => r.ticker === "QQQ");

  const spyPrice = spy ? Number(spy.close) : null;
  const spyS20 = spy && spy.sma20 != null ? Number(spy.sma20) : null;
  const spyS50 = spy && spy.sma50 != null ? Number(spy.sma50) : null;
  const spyS200 = spy && spy.sma200 != null ? Number(spy.sma200) : null;
  const spyRsi = spy && spy.rsi14 != null ? Number(spy.rsi14) : null;
  const qqqPrice = qqq ? Number(qqq.close) : null;
  const qqqS50 = qqq && qqq.sma50 != null ? Number(qqq.sma50) : null;

  const above = (price: number|null, sma: number|null) => (price != null && sma != null ? price > sma : null);
  const a20 = above(spyPrice, spyS20), a50 = above(spyPrice, spyS50), a200 = above(spyPrice, spyS200);
  let regime: "uptrend"|"downtrend"|"chop" = "chop";
  if (a20 && a50 && a200) regime = "uptrend";
  else if (a20 === false && a50 === false && a200 === false) regime = "downtrend";

  return {
    spy_price: spyPrice, spy_sma20: spyS20, spy_sma50: spyS50, spy_sma200: spyS200,
    spy_above_20: a20, spy_above_50: a50, spy_above_200: a200, spy_rsi: spyRsi,
    qqq_price: qqqPrice, qqq_sma50: qqqS50,
    qqq_above_50: above(qqqPrice, qqqS50),
    regime,
  };
}

async function buildBreadth() {
  const { data: latest } = await supabase
    .from("breadth_daily_history")
    .select("*")
    .order("snapshot_date", { ascending: false })
    .limit(20);
  const sp = (latest ?? []).find(r => r.universe_id === "sp500");
  const cap1b = (latest ?? []).find(r => r.universe_id === "cap1b_plus");

  const { data: sb } = await supabase
    .from("stockbee_breadth_raw")
    .select("observation_date,ratio5,ratio10,up_4pct,down_4pct")
    .order("observation_date", { ascending: false })
    .limit(1);
  const sbRow = sb && sb[0];

  const u1b: UB = {
    pct_sma20:  cap1b && cap1b.pct_above_sma20  != null ? Number(cap1b.pct_above_sma20) : null,
    pct_sma50:  cap1b && cap1b.pct_above_sma50  != null ? Number(cap1b.pct_above_sma50) : null,
    pct_sma200: cap1b && cap1b.pct_above_sma200 != null ? Number(cap1b.pct_above_sma200) : null,
    pct_new_highs: null, pct_new_lows: null, nh_nl_ratio: null, pct_up4_of_universe: null,
  };
  if (cap1b && cap1b.total_count > 0) {
    // Finviz exports no 20-day high/low column, so new_20day_* in breadth_daily_history
    // is permanently 0. Use the real, populated 52-week new-high/low counts instead.
    if (cap1b.new_52w_highs != null) u1b.pct_new_highs = (Number(cap1b.new_52w_highs)/Number(cap1b.total_count))*100;
    if (cap1b.new_52w_lows  != null) u1b.pct_new_lows  = (Number(cap1b.new_52w_lows) /Number(cap1b.total_count))*100;
    if (cap1b.up_4pct != null) u1b.pct_up4_of_universe = (Number(cap1b.up_4pct)/Number(cap1b.total_count))*100;
    const nh = cap1b.new_52w_highs != null ? Number(cap1b.new_52w_highs) : null;
    const nl = cap1b.new_52w_lows  != null ? Number(cap1b.new_52w_lows)  : null;
    if (nh != null && nl != null && (nh + nl) > 0) u1b.nh_nl_ratio = nh / (nh + nl);
  }

  return {
    pct_above_20:  sp && sp.pct_above_sma20  != null ? Number(sp.pct_above_sma20)  : null,
    pct_above_50:  sp && sp.pct_above_sma50  != null ? Number(sp.pct_above_sma50)  : null,
    pct_above_200: sp && sp.pct_above_sma200 != null ? Number(sp.pct_above_sma200) : null,
    ratio5:  sbRow && sbRow.ratio5  != null ? Number(sbRow.ratio5)  : null,
    ratio10: sbRow && sbRow.ratio10 != null ? Number(sbRow.ratio10) : null,
    up4:   (sp && sp.up_4pct   != null ? Number(sp.up_4pct)   : null) ?? (sbRow ? Number(sbRow.up_4pct)   : null),
    down4: (sp && sp.down_4pct != null ? Number(sp.down_4pct) : null) ?? (sbRow ? Number(sbRow.down_4pct) : null),
    new_highs: sp && sp.new_52w_highs != null ? Number(sp.new_52w_highs) : null,
    new_lows:  sp && sp.new_52w_lows  != null ? Number(sp.new_52w_lows)  : null,
    universe_1b: u1b,
  };
}

async function buildMomentum() {
  const { data: sectors } = await supabase
    .from("sector_etf_snapshot")
    .select("ticker,sector_label,perf_day,snapshot_date")
    .in("ticker", SECTOR_SPDRS)
    .order("snapshot_date", { ascending: false });
  const latestDate = sectors && sectors[0] ? sectors[0].snapshot_date : null;
  const todaysSectors = (sectors ?? [])
    .filter(s => s.snapshot_date === latestDate)
    .map(s => ({ ticker: s.ticker as string, chg: s.perf_day != null ? Number(s.perf_day) : null }));

  const sorted = [...todaysSectors].sort((a,b) => (b.chg ?? -Infinity) - (a.chg ?? -Infinity));
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3);
  let spread: number | null = null;
  if (sorted.length >= 6) {
    const topAvg = top3.reduce((s,x)=>s+(x.chg ?? 0),0)/3;
    const botAvg = bottom3.reduce((s,x)=>s+(x.chg ?? 0),0)/3;
    spread = Math.round((topAvg - botAvg) * 100) / 100;
  }

  const { data: sp500Row } = await supabase
    .from("breadth_daily_history")
    .select("new_52w_highs,total_count")
    .eq("universe_id", "sp500")
    .order("snapshot_date", { ascending: false })
    .limit(1);
  let pctHH: number | null = null;
  if (sp500Row && sp500Row[0] && sp500Row[0].total_count > 0 && sp500Row[0].new_52w_highs != null) {
    pctHH = Math.round((Number(sp500Row[0].new_52w_highs)/Number(sp500Row[0].total_count))*100*10)/10;
  }

  return { sectors: todaysSectors, top3, bottom3, spread, pct_higher_highs: pctHH };
}

async function buildMacro() {
  const { data: tnx } = await supabase
    .from("macro_observations")
    .select("observation_date,value")
    .eq("series_id", "DGS10")
    .order("observation_date", { ascending: false })
    .limit(10);
  if (!tnx || tnx.length < 2) return { tnx: null, tnx_5d_trend: null };
  const latest = Number(tnx[0].value);
  const cutoff = new Date(tnx[0].observation_date as string);
  cutoff.setDate(cutoff.getDate() - 7);
  let prev: number | null = null;
  for (const r of tnx) {
    const d = new Date(r.observation_date as string);
    if (d <= cutoff) { prev = Number(r.value); break; }
  }
  if (prev == null) prev = Number(tnx[tnx.length - 1].value);
  const trend = Number.isFinite(latest) && Number.isFinite(prev) ? latest - prev : null;
  return { tnx: latest, tnx_5d_trend: trend };
}

function buildNarrative(args: {
  decision: "YES"|"CAUTION"|"NO";
  regime: "uptrend"|"downtrend"|"chop";
  vix: number | null;
  breadth: Awaited<ReturnType<typeof buildBreadth>>;
  momentum: Awaited<ReturnType<typeof buildMomentum>>;
}): { text: string; suggested_action: string } {
  const { decision, regime, vix, breadth, momentum } = args;
  const trendDesc = regime === "uptrend" ? "strong trend" : regime === "downtrend" ? "weak trend" : "choppy";
  const volDesc =
    vix == null ? "unknown volatility" :
    vix < 15 ? "low volatility" :
    vix < 20 ? "moderate volatility" : "elevated volatility";

  const u1b = breadth.universe_1b;
  const smas = [u1b.pct_sma20, u1b.pct_sma50, u1b.pct_sma200].filter((x): x is number => x != null);
  const avg1b = smas.length > 0 ? smas.reduce((a,b)=>a+b,0)/smas.length : null;
  let breadthDesc: string;
  if (avg1b != null && u1b.pct_new_highs != null) {
    breadthDesc = `$1B+ tape ~${Math.round(avg1b)}% above key SMAs, ${u1b.pct_new_highs.toFixed(1)}% new 52wk highs`;
    if (breadth.ratio5 != null) breadthDesc += `, StockBee 5d ratio ${breadth.ratio5.toFixed(2)}`;
  } else if (breadth.ratio5 == null) breadthDesc = "neutral breadth";
  else if (breadth.ratio5 > 1.2) breadthDesc = "expanding breadth";
  else if (breadth.ratio5 < 0.8) breadthDesc = "contracting breadth";
  else breadthDesc = "neutral breadth";

  const leaderNames = momentum.top3.length > 0 ? momentum.top3.map(s => s.ticker).join(", ") : "mixed";

  let action: string, suggested: string;
  if (decision === "YES") { action = "Favor selective swing trades with disciplined risk."; suggested = "Full size, press risk"; }
  else if (decision === "CAUTION") { action = "Reduce size, A+ setups only."; suggested = "Half size, A+ setups only"; }
  else { action = "Avoid trading, preserve capital."; suggested = "Sit on hands"; }

  const vixPart = vix != null ? ` (VIX ${vix.toFixed(1)})` : "";
  const text = `This is a ${trendDesc} environment with ${breadthDesc} and ${volDesc}${vixPart}. Sector leadership in ${leaderNames}. ${action}`;
  return { text, suggested_action: suggested };
}

Deno.serve(async (_req: Request) => {
  const started = Date.now();
  const { data: jobRow } = await supabase
    .from("job_runs")
    .insert({ job_name: "compute-should-i-trade", status: "running" })
    .select("id").single();
  const jobId: number | null = jobRow?.id ?? null;

  const finishJob = async (status: "ok"|"error", summary: Record<string, unknown>|null, error?: string) => {
    if (jobId == null) return;
    await supabase.from("job_runs").update({
      finished_at: new Date().toISOString(),
      status, elapsed_ms: Date.now() - started, summary, error: error ?? null,
    }).eq("id", jobId);
  };

  try {
    const [vol, trend, breadth, momentum, macro] = await Promise.all([
      fetchVixBlock(), fetchTrendBlock(), buildBreadth(), buildMomentum(), buildMacro(),
    ]);

    const snapshotDate = new Date().toISOString().slice(0, 10);

    const sVol   = scoreVolatility(vol.vix, vol.vix_5d_slope);
    const sTrend = scoreTrend(trend.regime, trend.qqq_above_50, trend.spy_rsi);
    const sBr    = scoreBreadthCat(breadth.pct_above_200, breadth.ratio5, breadth.new_highs, breadth.new_lows);
    const sMom   = scoreMomentumCat(momentum.spread, momentum.pct_higher_highs);
    const sMac   = scoreMacroCat(macro.tnx_5d_trend);

    const mqs = round1(
      sVol.score * WEIGHTS.volatility + sMom.score * WEIGHTS.momentum +
      sTrend.score * WEIGHTS.trend + sBr.score * WEIGHTS.breadth + sMac.score * WEIGHTS.macro
    );

    const ew = scoreExecWindow(breadth, momentum);

    const rowsToUpsert = (["swing", "day"] as const).map((mode) => {
      const thr = THRESHOLDS[mode];
      const decision: "YES"|"CAUTION"|"NO" =
        mqs >= thr.yes_min ? "YES" : mqs >= thr.caution_min ? "CAUTION" : "NO";
      const narrative = buildNarrative({ decision, regime: trend.regime, vix: vol.vix, breadth, momentum });
      return {
        snapshot_date: snapshotDate, mode, computed_at: new Date().toISOString(),
        decision, market_quality_score: mqs, execution_window_score: ew.score,
        vol_score: sVol.score, vol_weight: WEIGHTS.volatility, vol_interpretation: sVol.interpretation,
        trend_score: sTrend.score, trend_weight: WEIGHTS.trend, trend_interpretation: sTrend.interpretation,
        breadth_score: sBr.score, breadth_weight: WEIGHTS.breadth, breadth_interpretation: sBr.interpretation,
        momentum_score: sMom.score, momentum_weight: WEIGHTS.momentum, momentum_interpretation: sMom.interpretation,
        macro_score: sMac.score, macro_weight: WEIGHTS.macro, macro_interpretation: sMac.interpretation,
        exec_breakouts_status: ew.factors.breakouts.status, exec_breakouts_detail: ew.factors.breakouts.detail,
        exec_leaders_status: ew.factors.leaders.status, exec_leaders_detail: ew.factors.leaders.detail,
        exec_pullbacks_status: ew.factors.pullbacks.status, exec_pullbacks_detail: ew.factors.pullbacks.detail,
        exec_followthrough_status: ew.factors.follow.status, exec_followthrough_detail: ew.factors.follow.detail,
        narrative_text: narrative.text, suggested_action: narrative.suggested_action,
        raw_inputs: { volatility: vol, trend, breadth, momentum, macro },
      };
    });

    const { error: upErr } = await supabase
      .from("should_i_trade_history")
      .upsert(rowsToUpsert, { onConflict: "snapshot_date,mode" });
    if (upErr) throw new Error(`Upsert failed: ${upErr.message}`);

    const summary = {
      snapshot_date: snapshotDate, mqs, execution_window: ew.score,
      decision_swing: rowsToUpsert[0].decision, decision_day: rowsToUpsert[1].decision,
      categories: { volatility: sVol.score, trend: sTrend.score, breadth: sBr.score, momentum: sMom.score, macro: sMac.score },
      inputs_present: {
        vix: vol.vix != null, spy_rsi: trend.spy_rsi != null, ratio5: breadth.ratio5 != null,
        sectors: momentum.sectors.length, tnx_trend: macro.tnx_5d_trend != null,
      },
    };
    await finishJob("ok", summary);
    return new Response(JSON.stringify({ ok: true, ...summary }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishJob("error", null, msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});

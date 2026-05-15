import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, colorClass } from "@/lib/format";

// ===== Types =====
type BadgeTone = "green" | "red" | "yellow" | "gray";
interface DetailRow {
  label: string;
  value: string;
  badge?: string | null;
  badgeTone?: BadgeTone;
}
interface SITRow {
  snapshot_date: string;
  decision: string;
  market_quality_score: number;
  execution_window_score: number | null;
  vol_score: number | null; vol_weight: number | null;
  trend_score: number | null; trend_weight: number | null;
  breadth_score: number | null; breadth_weight: number | null;
  momentum_score: number | null; momentum_weight: number | null;
  macro_score: number | null; macro_weight: number | null;
  exec_breakouts_status: string | null; exec_breakouts_detail: string | null;
  exec_leaders_status: string | null; exec_leaders_detail: string | null;
  exec_pullbacks_status: string | null; exec_pullbacks_detail: string | null;
  exec_followthrough_status: string | null; exec_followthrough_detail: string | null;
  narrative_text: string | null;
  suggested_action: string | null;
  raw_inputs: {
    volatility?: { vix: number | null; vix_5d_slope: number | null; vix_1y_pct: number | null };
    trend?: { spy_above_20: boolean | null; spy_above_50: boolean | null; spy_above_200: boolean | null; qqq_above_50: boolean | null; regime: string };
    breadth?: { pct_above_20: number | null; pct_above_50: number | null; pct_above_200: number | null; ratio5: number | null; new_highs: number | null; new_lows: number | null };
    momentum?: { sectors: Array<{ ticker: string; chg: number | null }>; top3: Array<{ ticker: string; chg: number | null }>; bottom3: Array<{ ticker: string; chg: number | null }>; spread: number | null };
    macro?: { tnx: number | null; tnx_5d_trend: number | null };
  };
}
interface SectorRow { ticker: string; sector_label: string | null; perf_day: number | null; is_benchmark: boolean }

// ===== Queries =====
function useSIT() {
  return useQuery({
    queryKey: ["sit-swing-full"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("should_i_trade_latest_v")
        .select("*")
        .eq("mode", "swing")
        .maybeSingle();
      if (error) throw error;
      return data as SITRow | null;
    },
    enabled: isSupabaseConfigured,
  });
}
function useSectors() {
  return useQuery({
    queryKey: ["sit-sectors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sector_etf_latest_v")
        .select("ticker, sector_label, perf_day, is_benchmark");
      if (error) throw error;
      return ((data ?? []) as SectorRow[]).filter((s) => !s.is_benchmark);
    },
    enabled: isSupabaseConfigured,
  });
}

// ===== Style helpers =====
const TONE_BG: Record<BadgeTone, string> = {
  green: "bg-accent-green/15 text-accent-green",
  red: "bg-accent-red/15 text-accent-red",
  yellow: "bg-accent-yellow/15 text-accent-yellow",
  gray: "bg-text-dim/15 text-text-secondary",
};
const TONE_DOT: Record<BadgeTone, string> = {
  green: "bg-accent-green",
  red: "bg-accent-red",
  yellow: "bg-accent-yellow",
  gray: "bg-text-dim",
};
const scoreColor = (s: number | null) => s == null ? "text-text-dim" : s >= 80 ? "text-accent-green" : s >= 60 ? "text-accent-yellow" : "text-accent-red";
const scoreBg = (s: number | null) => s == null ? "bg-text-dim" : s >= 80 ? "bg-accent-green" : s >= 60 ? "bg-accent-yellow" : "bg-accent-red";
const decBorder = (d: string) => d === "YES" ? "border-accent-green" : d === "CAUTION" ? "border-accent-yellow" : "border-accent-red";
const decText = (d: string) => d === "YES" ? "text-accent-green" : d === "CAUTION" ? "text-accent-yellow" : "text-accent-red";

// ===== Gauge =====
function Gauge({ value, size = 110 }: { value: number | null; size?: number }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, Number(value)));
  const cx = size / 2; const cy = size / 2;
  const r = size / 2 - 8; const sw = 7;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  const color = v >= 80 ? "#3fb950" : v >= 60 ? "#d29922" : "#f85149";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1c2128" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash.toFixed(2)} ${c.toFixed(2)}`}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle"
        fill="#e6edf3" fontFamily="JetBrains Mono, monospace" fontSize={26} fontWeight={700}>
        {Math.round(v)}
      </text>
      <text x={cx} y={cy + 17} textAnchor="middle" fill="#6e7681"
        fontFamily="JetBrains Mono, monospace" fontSize={9}>/ 100</text>
    </svg>
  );
}

// ===== Mini score chip (5 in hero row) =====
function ScoreChip({ icon, name, score }: { icon: string; name: string; score: number | null }) {
  const v = score == null ? 0 : Number(score);
  return (
    <div className="flex flex-col gap-1.5 text-center min-w-[80px]">
      <div className="text-accent-orange text-sm">{icon}</div>
      <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">{name}</div>
      <div className={`font-mono text-2xl font-bold tabular-nums ${scoreColor(score)}`}>{num(score, 0)}</div>
      <div className="h-1 bg-bg-panel rounded-full overflow-hidden">
        <div className={`h-full ${scoreBg(score)}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </div>
    </div>
  );
}

// ===== Category detail panel =====
function CategoryPanel({ icon, name, score, rows }: { icon: string; name: string; score: number | null; rows: DetailRow[] }) {
  return (
    <div className="terminal-card p-4 flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-orange text-sm">{icon}</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">{name}</span>
        </div>
        <span className={`font-mono text-2xl font-bold tabular-nums ${scoreColor(score)}`}>{num(score, 0)}</span>
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-1.5 text-2xs">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className={`inline-block w-1 h-1 rounded-full shrink-0 ${TONE_DOT[row.badgeTone ?? "gray"]}`} />
              <span className="text-text-dim mono truncate">{row.label}</span>
            </div>
            <span className="font-mono text-text-primary tabular-nums shrink-0">{row.value}</span>
            {row.badge && (
              <span className={`px-1.5 py-0.5 rounded text-2xs mono font-semibold shrink-0 ${TONE_BG[row.badgeTone ?? "gray"]}`}>
                {row.badge}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Row builders =====
function buildVolatility(r: SITRow["raw_inputs"]): DetailRow[] {
  const v = r.volatility;
  const vix = v?.vix ?? null;
  const slope = v?.vix_5d_slope ?? null;
  const pctile = v?.vix_1y_pct ?? null;
  const vixTone: BadgeTone = vix == null ? "gray" : vix < 15 ? "green" : vix < 20 ? "yellow" : "red";
  const slopeTone: BadgeTone = slope == null ? "gray" : Math.abs(slope) < 0.3 ? "yellow" : slope > 0 ? "red" : "green";
  const pctileTone: BadgeTone = pctile == null ? "gray" : pctile < 33 ? "green" : pctile < 67 ? "yellow" : "red";
  return [
    { label: "VIX Level", value: vix != null ? num(vix, 2) : "—", badge: vixTone === "green" ? "Low" : vixTone === "yellow" ? "Normal" : "Elevated", badgeTone: vixTone },
    { label: "VIX Trend", value: slope == null ? "—" : slope > 0.3 ? "Rising" : slope < -0.3 ? "Falling" : "Flat", badge: slope == null ? null : slope > 0.3 ? "Rising" : slope < -0.3 ? "Falling" : "Flat", badgeTone: slopeTone },
    { label: "VIX 1Y %ile", value: pctile != null ? `${Math.round(pctile)}th` : "—", badge: pctileTone === "green" ? "Low" : pctileTone === "yellow" ? "Normal" : "High", badgeTone: pctileTone },
    { label: "Put/Call", value: "—", badge: "Neutral", badgeTone: "gray" },
  ];
}
function buildTrend(r: SITRow["raw_inputs"]): DetailRow[] {
  const t = r.trend;
  const above = (b: boolean | null | undefined): string => b == null ? "—" : b ? "Above" : "Below";
  const aboveTone = (b: boolean | null | undefined): BadgeTone => b == null ? "gray" : b ? "green" : "red";
  return [
    { label: "SPX vs 20d", value: above(t?.spy_above_20), badge: t?.spy_above_20 ? "Intact" : "Broken", badgeTone: aboveTone(t?.spy_above_20) },
    { label: "SPX vs 50d", value: above(t?.spy_above_50), badge: t?.spy_above_50 ? "Intact" : "Broken", badgeTone: aboveTone(t?.spy_above_50) },
    { label: "SPX vs 200d", value: above(t?.spy_above_200), badge: t?.spy_above_200 ? "Intact" : "Broken", badgeTone: aboveTone(t?.spy_above_200) },
    { label: "QQQ Trend", value: t?.qqq_above_50 == null ? "—" : t.qqq_above_50 ? "Above 50d" : "Below 50d", badge: t?.qqq_above_50 ? "Strong" : "Weak", badgeTone: aboveTone(t?.qqq_above_50) },
    { label: "Regime", value: t?.regime ? t.regime[0].toUpperCase() + t.regime.slice(1) : "—", badge: t?.regime === "uptrend" ? "Uptrend" : t?.regime === "downtrend" ? "Downtrend" : "Chop", badgeTone: t?.regime === "uptrend" ? "green" : t?.regime === "downtrend" ? "red" : "yellow" },
  ];
}
function buildBreadth(r: SITRow["raw_inputs"]): DetailRow[] {
  const b = r.breadth;
  const fmtP = (n: number | null | undefined) => n == null ? "—" : `${num(n, 1)}%`;
  const toneP = (n: number | null | undefined): BadgeTone => n == null ? "gray" : n >= 60 ? "green" : n >= 40 ? "gray" : "red";
  const r5 = b?.ratio5 ?? null;
  return [
    { label: "% > 50d MA", value: fmtP(b?.pct_above_50), badge: toneP(b?.pct_above_50) === "green" ? "Strong" : toneP(b?.pct_above_50) === "red" ? "Weak" : "Neutral", badgeTone: toneP(b?.pct_above_50) },
    { label: "% > 200d MA", value: fmtP(b?.pct_above_200), badge: toneP(b?.pct_above_200) === "green" ? "Strong" : toneP(b?.pct_above_200) === "red" ? "Weak" : "Neutral", badgeTone: toneP(b?.pct_above_200) },
    { label: "% > 20d MA", value: fmtP(b?.pct_above_20), badge: toneP(b?.pct_above_20) === "green" ? "Strong" : toneP(b?.pct_above_20) === "red" ? "Weak" : "Neutral", badgeTone: toneP(b?.pct_above_20) },
    { label: "5d A/D", value: r5 != null ? `${num(r5, 2)}:1` : "—", badge: r5 == null ? "—" : r5 > 1.1 ? "Positive" : r5 < 0.9 ? "Negative" : "Flat", badgeTone: r5 == null ? "gray" : r5 > 1.1 ? "green" : r5 < 0.9 ? "red" : "yellow" },
    { label: "Highs/Lows", value: b?.new_highs != null && b?.new_lows != null ? `${b.new_highs}/${b.new_lows}` : "—", badge: b?.new_highs != null && b?.new_lows != null ? (b.new_highs > b.new_lows ? "Highs lead" : b.new_lows > b.new_highs ? "Lows lead" : "Balanced") : "—", badgeTone: b?.new_highs != null && b?.new_lows != null ? (b.new_highs > b.new_lows ? "green" : b.new_lows > b.new_highs ? "red" : "gray") : "gray" },
  ];
}
function buildMomentum(r: SITRow["raw_inputs"], sectorLabel: (t: string) => string): DetailRow[] {
  const m = r.momentum;
  const list = m?.sectors ?? [];
  const pos = list.filter((s) => (s.chg ?? 0) > 0).length;
  const total = list.length;
  const top = m?.top3?.[0] ?? null;
  const bot = m?.bottom3 ? m.bottom3[m.bottom3.length - 1] : null;
  const broadTone: BadgeTone = total === 0 ? "gray" : pos >= total * 0.6 ? "green" : pos >= total * 0.4 ? "yellow" : "red";
  return [
    { label: "Sectors +", value: total ? `${pos}/${total}` : "—", badge: broadTone === "green" ? "Broad" : broadTone === "red" ? "Narrow" : "Mixed", badgeTone: broadTone },
    { label: "Leader", value: top ? `${sectorLabel(top.ticker)} (${top.chg != null ? pct(top.chg, 2) : "—"})` : "—" },
    { label: "Laggard", value: bot ? `${sectorLabel(bot.ticker)} (${bot.chg != null ? pct(bot.chg, 2) : "—"})` : "—" },
    { label: "Spread", value: m?.spread != null ? `${num(m.spread, 2)}%` : "—", badge: m?.spread == null ? "—" : m.spread > 1.0 ? "Wide" : "Tight", badgeTone: m?.spread == null ? "gray" : m.spread > 1.0 ? "green" : "yellow" },
  ];
}
function buildMacro(r: SITRow["raw_inputs"]): DetailRow[] {
  const m = r.macro;
  const yld = m?.tnx ?? null;
  const tr = m?.tnx_5d_trend ?? null;
  return [
    { label: "10Y Yield", value: yld != null ? `${num(yld, 2)}%` : "—", badge: tr == null ? "—" : tr > 0.05 ? "Rising" : tr < -0.05 ? "Falling" : "Flat", badgeTone: tr == null ? "gray" : Math.abs(tr) < 0.05 ? "yellow" : "yellow" },
    { label: "10Y Δ 5d", value: tr != null ? `${tr > 0 ? "+" : ""}${num(tr * 100, 1)} bp` : "—" },
    { label: "DXY", value: "—", badge: "Monitor", badgeTone: "gray" },
    { label: "Geopolitical", value: "—", badge: "Monitor", badgeTone: "gray" },
  ];
}

// ===== Sub-components for the bottom rows =====
function SectorBar({ ticker, perf }: { ticker: string; perf: number | null }) {
  const p = perf ?? 0;
  const positive = p >= 0;
  const widthPct = Math.min(100, (Math.abs(p) / 2) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="font-mono text-text-secondary w-10 shrink-0">{ticker}</div>
      <div className="flex-1 flex items-center h-3 bg-bg-panel rounded-sm overflow-hidden">
        <div className={`h-full ${positive ? "bg-accent-green" : "bg-accent-red"}`} style={{ width: `${widthPct}%` }} />
      </div>
      <div className={`font-mono tabular-nums w-14 text-right ${colorClass(perf)}`}>{pct(perf, 2)}</div>
    </div>
  );
}

function ExecFactor({ label, value, badge }: { label: string; value: string | null; badge: string | null }) {
  const lv = (value ?? "").toLowerCase();
  const tone: BadgeTone =
    lv === "yes" || lv === "strong" ? "green" :
    lv === "no" || lv === "weak" ? "red" :
    "yellow";
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} />
        <span className="text-text-secondary text-sm">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-text-primary text-sm">{value ?? "—"}</span>
        {badge && (
          <span className={`px-1.5 py-0.5 rounded text-2xs mono font-semibold ${TONE_BG[tone]}`}>{badge}</span>
        )}
      </div>
    </div>
  );
}

function WeightRow({ name, score, weight }: { name: string; score: number | null; weight: number | null }) {
  const v = score == null ? 0 : Number(score);
  const wpct = weight != null ? Math.round(Number(weight) * 100) : null;
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="text-text-secondary w-16 shrink-0">{name}</div>
      <div className="flex-1 h-1.5 bg-bg-panel rounded-full overflow-hidden">
        <div className={`h-full ${scoreBg(score)}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </div>
      <div className="font-mono tabular-nums text-text-primary w-8 text-right">{num(score, 0)}</div>
      <div className="font-mono text-text-dim text-2xs w-12">×{wpct ?? "—"}%</div>
    </div>
  );
}

const ICONS = { vol: "〰", trend: "↗", breadth: "⊞", momentum: "↑", macro: "●" };

// ===== Main page =====
export default function ShouldITrade() {
  const { data, isLoading } = useSIT();
  const { data: sectors } = useSectors();

  if (!isSupabaseConfigured) return <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">Supabase not configured.</div>;
  if (isLoading) return <div className="terminal-card p-6"><div className="font-mono text-xs text-text-dim">Loading…</div></div>;
  if (!data) return <div className="terminal-card p-6"><div className="font-mono text-xs text-text-dim">No SIT data.</div></div>;

  const raw = data.raw_inputs ?? {};
  const sectorLabel = (t: string) => sectors?.find((s) => s.ticker === t)?.sector_label ?? t;

  const volRows = buildVolatility(raw);
  const trendRows = buildTrend(raw);
  const breadthRows = buildBreadth(raw);
  const momentumRows = buildMomentum(raw, sectorLabel);
  const macroRows = buildMacro(raw);

  const positionSize = data.decision === "YES" ? "FULL" : data.decision === "CAUTION" ? "HALF" : "NONE";
  const ews = data.execution_window_score ?? 0;
  const sortedSectors = (sectors ?? []).slice().sort((a, b) => (Number(b.perf_day) || 0) - (Number(a.perf_day) || 0));

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3 flex-wrap pb-1">
        <h1 className="font-mono text-xl font-bold tracking-tight">SHOULD I BE TRADING?</h1>
        <span className="text-2xs text-text-dim mono uppercase tracking-widest">market quality terminal.</span>
      </div>

      {/* Hero */}
      <div className="terminal-card p-5">
        <div className="flex items-center gap-5 flex-wrap">
          <div className="shrink-0 text-center">
            <div className="font-mono text-2xs text-text-dim uppercase tracking-widest mb-2">Decision</div>
            <div className={`inline-block px-5 py-1.5 border-2 ${decBorder(data.decision)} rounded`}>
              <div className={`font-mono text-3xl font-bold ${decText(data.decision)}`}>{data.decision}</div>
            </div>
            <div className="text-2xs text-text-dim mono mt-1.5">Swing Trading</div>
          </div>

          <div className="shrink-0"><Gauge value={Number(data.market_quality_score)} /></div>

          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 min-w-[180px]">
            <ScoreChip icon={ICONS.vol} name="VOLATILITY" score={data.vol_score} />
            <ScoreChip icon={ICONS.trend} name="TREND" score={data.trend_score} />
            <ScoreChip icon={ICONS.breadth} name="BREADTH" score={data.breadth_score} />
            <ScoreChip icon={ICONS.momentum} name="MOMENTUM" score={data.momentum_score} />
            <ScoreChip icon={ICONS.macro} name="MACRO" score={data.macro_score} />
          </div>

          <div className="shrink-0 text-right">
            <div className="font-mono text-2xs text-text-dim uppercase tracking-widest mb-1">♥ Position Size</div>
            <div className={`font-mono text-2xl font-bold ${decText(data.decision)}`}>{positionSize}</div>
            <div className="text-2xs text-text-dim mono mt-0.5">{data.suggested_action ?? ""}</div>
          </div>
        </div>
      </div>

      {/* 5 category panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <CategoryPanel icon={ICONS.vol} name="VOLATILITY" score={data.vol_score} rows={volRows} />
        <CategoryPanel icon={ICONS.trend} name="TREND" score={data.trend_score} rows={trendRows} />
        <CategoryPanel icon={ICONS.breadth} name="BREADTH" score={data.breadth_score} rows={breadthRows} />
        <CategoryPanel icon={ICONS.momentum} name="MOMENTUM" score={data.momentum_score} rows={momentumRows} />
        <CategoryPanel icon={ICONS.macro} name="MACRO" score={data.macro_score} rows={macroRows} />
      </div>

      {/* Execution window + Sector performance */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="terminal-card p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="flex items-baseline gap-2">
              <span className="text-accent-orange">◐</span>
              <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">Execution Window</span>
            </div>
            <span className={`font-mono text-2xl font-bold tabular-nums ${scoreColor(ews)}`}>{num(ews, 0)}</span>
          </div>
          <div className="h-1 bg-bg-panel rounded-full overflow-hidden mb-4">
            <div className={`h-full ${scoreBg(ews)}`} style={{ width: `${Math.max(0, Math.min(100, ews))}%` }} />
          </div>
          <div className="space-y-3">
            <ExecFactor label="Breakouts working?" value={data.exec_breakouts_status} badge={data.exec_breakouts_detail} />
            <ExecFactor label="Leaders holding?" value={data.exec_leaders_status} badge={data.exec_leaders_detail} />
            <ExecFactor label="Pullbacks bought?" value={data.exec_pullbacks_status} badge={data.exec_pullbacks_detail} />
            <ExecFactor label="Follow-through?" value={data.exec_followthrough_status} badge={data.exec_followthrough_detail} />
          </div>
        </div>

        <div className="terminal-card p-5">
          <div className="mb-3 font-mono text-xs text-text-secondary font-semibold">Sector Performance</div>
          <div className="space-y-1.5">
            {sortedSectors.map((s) => <SectorBar key={s.ticker} ticker={s.ticker} perf={Number(s.perf_day)} />)}
            {sortedSectors.length === 0 && <div className="text-2xs text-text-dim mono">No sector data.</div>}
          </div>
        </div>
      </div>

      {/* Scoring weights + AI narrative */}
      <div className="grid lg:grid-cols-2 gap-3">
        <div className="terminal-card p-5">
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-accent-orange">〰</span>
            <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">Scoring Weights</span>
          </div>
          <div className="space-y-2.5">
            <WeightRow name="Volatility" score={data.vol_score} weight={data.vol_weight} />
            <WeightRow name="Momentum" score={data.momentum_score} weight={data.momentum_weight} />
            <WeightRow name="Trend" score={data.trend_score} weight={data.trend_weight} />
            <WeightRow name="Breadth" score={data.breadth_score} weight={data.breadth_weight} />
            <WeightRow name="Macro" score={data.macro_score} weight={data.macro_weight} />
          </div>
          <div className="border-t border-border-subtle mt-4 pt-3 flex items-baseline justify-between">
            <span className="font-mono text-2xs text-text-dim uppercase tracking-widest">Total Score</span>
            <span className="font-mono text-xl font-bold text-text-primary tabular-nums">{num(data.market_quality_score, 0)}/100</span>
          </div>
          <div className="mt-3 space-y-1 text-2xs mono">
            <div className="flex items-center gap-2"><span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-green" /><span className="text-text-dim">80-100: YES (press risk)</span></div>
            <div className="flex items-center gap-2"><span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-yellow" /><span className="text-text-dim">60-79: CAUTION (selective)</span></div>
            <div className="flex items-center gap-2"><span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-red" /><span className="text-text-dim">&lt;60: NO (preserve capital)</span></div>
          </div>
        </div>

        <div className="terminal-card p-5">
          <div className="mb-3 font-mono text-xs text-text-secondary font-semibold">AI-Generated Market Assessment</div>
          <div className="text-sm text-text-secondary leading-relaxed font-mono">{data.narrative_text}</div>
          {data.suggested_action && (
            <div className="mt-4 pt-3 border-t border-border-subtle text-sm">
              <span className="text-text-dim mono text-xs">Suggested action: </span>
              <span className={`font-mono font-semibold ${decText(data.decision)}`}>{data.suggested_action}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

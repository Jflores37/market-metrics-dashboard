import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, colorClass } from "@/lib/format";
import { chartColors } from "@/lib/chartTheme";
import CategoryPanel, {
  type DetailRow,
  type BadgeTone,
  TONE_BG,
  TONE_DOT,
  scoreColor,
  scoreBg,
} from "@/components/sit/CategoryPanel";

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
    volatility?: { vix: number | null; vix_5d_slope: number | null; vix_1y_pct: number | null; vvix?: number | null };
    trend?: { spy_above_20: boolean | null; spy_above_50: boolean | null; spy_above_200: boolean | null; qqq_above_50: boolean | null; regime: string };
    breadth?: { pct_above_20: number | null; pct_above_50: number | null; pct_above_200: number | null; ratio5: number | null; up4: number | null; down4: number | null; new_highs: number | null; new_lows: number | null };
    momentum?: { sectors: Array<{ ticker: string; chg: number | null }>; top3: Array<{ ticker: string; chg: number | null }>; bottom3: Array<{ ticker: string; chg: number | null }>; spread: number | null };
    macro?: { tnx: number | null; tnx_5d_trend: number | null };
  };
}

interface SectorRow { ticker: string; sector_label: string | null; perf_day: number | null; is_benchmark: boolean }

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

// USD Broad Index (FRED DTWEXBGS) — DXY proxy. raw_inputs.macro doesn't
// carry it, so read macro_observations directly: latest level + ~1-week
// (5 business day) % change for a direction read.
function useDxy() {
  return useQuery({
    queryKey: ["sit-dxy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("macro_observations")
        .select("observation_date, value")
        .eq("series_id", "DTWEXBGS")
        .order("observation_date", { ascending: false })
        .limit(8);
      if (error) throw error;
      const rows = (data ?? []) as { observation_date: string; value: number | null }[];
      if (rows.length === 0) return null;
      const latest = rows[0]?.value != null ? Number(rows[0].value) : null;
      const prior = rows[5]?.value != null ? Number(rows[5].value) : null;
      const pctChg =
        latest != null && prior != null && prior !== 0
          ? ((latest - prior) / prior) * 100
          : null;
      return { latest, pctChg };
    },
    enabled: isSupabaseConfigured,
  });
}

const decBorder = (d: string) => d === "YES" ? "border-accent-green" : d === "CAUTION" ? "border-accent-yellow" : "border-accent-red";
const decText = (d: string) => d === "YES" ? "text-accent-green" : d === "CAUTION" ? "text-accent-yellow" : "text-accent-red";

function Gauge({ value, size = 110 }: { value: number | null; size?: number }) {
  const v = value == null ? 0 : Math.max(0, Math.min(100, Number(value)));
  const cx = size / 2; const cy = size / 2;
  const r = size / 2 - 8; const sw = 7;
  const c = 2 * Math.PI * r;
  const dash = (v / 100) * c;
  const color = v >= 80 ? chartColors.green : v >= 60 ? chartColors.amber : chartColors.red;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={chartColors.border} strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash.toFixed(2)} ${c.toFixed(2)}`}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="middle"
        fill={chartColors.textPrimary} fontFamily="JetBrains Mono, monospace" fontSize={26} fontWeight={700}>
        {Math.round(v)}
      </text>
      <text x={cx} y={cy + 17} textAnchor="middle" fill={chartColors.textDim}
        fontFamily="JetBrains Mono, monospace" fontSize={9}>/ 100</text>
    </svg>
  );
}

function ScoreChip({ icon, name, score }: { icon: string; name: string; score: number | null }) {
  const v = score == null ? 0 : Number(score);
  return (
    <div className="flex flex-col gap-1.5 text-center min-w-[80px]">
      <div className="text-accent-cyan text-sm signal-glow-cyan">{icon}</div>
      <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">{name}</div>
      <div className={`font-mono text-2xl font-bold tabular-nums ${scoreColor(score)}`}>{num(score, 0)}</div>
      <div className="h-1 bg-bg-panel rounded-full overflow-hidden">
        <div className={`h-full ${scoreBg(score)}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </div>
    </div>
  );
}

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

// ===== Row builders (UPDATED per the local Dash reference) =====

function buildVolatility(r: SITRow["raw_inputs"]): DetailRow[] {
  const v = r.volatility;
  const vix = v?.vix ?? null;
  const slope = v?.vix_5d_slope ?? null;
  const pctile = v?.vix_1y_pct ?? null;
  const vvix = v?.vvix ?? null;
  const vixTone: BadgeTone = vix == null ? "gray" : vix < 15 ? "green" : vix < 20 ? "yellow" : "red";
  const slopeTone: BadgeTone = slope == null ? "gray" : Math.abs(slope) < 0.3 ? "yellow" : slope > 0 ? "red" : "green";
  const pctileTone: BadgeTone = pctile == null ? "gray" : pctile < 33 ? "green" : pctile < 67 ? "yellow" : "red";
  // VVIX is "VIX of VIX" — high VVIX means traders expect VIX itself to be volatile (uncertainty).
  // Typical: ~80=calm, ~95=normal, >110=elevated. Below 80 = unusually calm.
  const vvixTone: BadgeTone = vvix == null ? "gray" : vvix < 85 ? "green" : vvix < 105 ? "yellow" : "red";
  return [
    { label: "VIX Level", value: vix != null ? num(vix, 2) : "—", badge: vixTone === "green" ? "Low" : vixTone === "yellow" ? "Normal" : "Elevated", badgeTone: vixTone },
    { label: "VIX Trend", value: slope == null ? "—" : slope > 0.3 ? "Rising" : slope < -0.3 ? "Falling" : "Flat", badge: slope == null ? null : slope > 0.3 ? "Rising" : slope < -0.3 ? "Falling" : "Flat", badgeTone: slopeTone },
    { label: "VIX 1Y %ile", value: pctile != null ? `${Math.round(pctile)}th` : "—", badge: pctileTone === "green" ? "Low" : pctileTone === "yellow" ? "Normal" : "High", badgeTone: pctileTone },
    { label: "VVIX", value: vvix != null ? num(vvix, 1) : "—", badge: vvixTone === "green" ? "Calm" : vvixTone === "yellow" ? "Normal" : "Stressed", badgeTone: vvixTone },
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
  const toneP = (n: number | null | undefined): BadgeTone => n == null ? "gray" : n >= 60 ? "green" : n >= 40 ? "yellow" : "red";
  const up4 = b?.up4 ?? null;
  const down4 = b?.down4 ?? null;
  const ad = up4 != null && down4 != null && down4 > 0 ? up4 / down4 : null;
  const adValue = ad != null
    ? `${num(ad, 1)}:1`
    : up4 != null || down4 != null
      ? `${up4 ?? 0}/${down4 ?? 0}`
      : "—";
  return [
    { label: "% > 50d MA", value: fmtP(b?.pct_above_50), badge: "Neutral", badgeTone: toneP(b?.pct_above_50) },
    { label: "% > 200d MA", value: fmtP(b?.pct_above_200), badge: "Neutral", badgeTone: toneP(b?.pct_above_200) },
    { label: "% > 20d MA", value: fmtP(b?.pct_above_20), badge: "Neutral", badgeTone: toneP(b?.pct_above_20) },
    { label: "NYSE A/D", value: adValue, badge: ad == null ? "—" : ad > 1 ? "Positive" : ad < 1 ? "Negative" : "Flat", badgeTone: ad == null ? "gray" : ad > 1 ? "green" : ad < 1 ? "red" : "yellow" },
    { label: "NAS Highs/Lows", value: b?.new_highs != null && b?.new_lows != null ? `${b.new_highs}/${b.new_lows}` : "—", badge: b?.new_highs != null && b?.new_lows != null ? (b.new_highs > b.new_lows ? "Highs dominate" : b.new_lows > b.new_highs ? "Lows dominate" : "Balanced") : "—", badgeTone: b?.new_highs != null && b?.new_lows != null ? (b.new_highs > b.new_lows ? "green" : b.new_lows > b.new_highs ? "red" : "gray") : "gray" },
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

  // Participation: derived from spread + sectors agreement
  const spread = m?.spread ?? null;
  let participation: { value: string; tone: BadgeTone };
  if (total === 0) {
    participation = { value: "—", tone: "gray" };
  } else if (spread != null && Math.abs(spread) > 1.5) {
    participation = { value: "Mixed", tone: "yellow" };
  } else if (pos >= total * 0.75) {
    participation = { value: "Strong", tone: "green" };
  } else if (pos <= total * 0.25) {
    participation = { value: "Weak", tone: "red" };
  } else {
    participation = { value: "Mixed", tone: "yellow" };
  }

  return [
    { label: "Sectors +", value: total ? `${pos}/${total}` : "—", badge: broadTone === "green" ? "Broad" : broadTone === "red" ? "Narrow" : "Mixed", badgeTone: broadTone },
    { label: "Leader", value: top ? `${sectorLabel(top.ticker)} (${top.chg != null ? pct(top.chg, 2) : "—"})` : "—", dotTone: "green" },
    { label: "Laggard", value: bot ? `${sectorLabel(bot.ticker)} (${bot.chg != null ? pct(bot.chg, 2) : "—"})` : "—", dotTone: "red" },
    { label: "Participation", value: participation.value, badge: participation.value === "—" ? null : participation.value, badgeTone: participation.tone },
  ];
}

function buildMacro(
  r: SITRow["raw_inputs"],
  dxy: { latest: number | null; pctChg: number | null } | null,
): DetailRow[] {
  const m = r.macro;
  const yld = m?.tnx ?? null;
  const tr = m?.tnx_5d_trend ?? null;
  // Rising USD = headwind for risk; falling = tailwind. Flat band ±0.5%/wk.
  const dxyVal = dxy?.latest ?? null;
  const dxyChg = dxy?.pctChg ?? null;
  const dxyBadge =
    dxyChg == null ? "—" : dxyChg > 0.5 ? "Rising" : dxyChg < -0.5 ? "Falling" : "Flat";
  const dxyTone: BadgeTone =
    dxyChg == null ? "gray" : dxyChg > 0.5 ? "red" : dxyChg < -0.5 ? "green" : "yellow";
  return [
    { label: "10Y Yield", value: yld != null ? `${num(yld, 2)}%` : "—", badge: tr == null ? "—" : tr > 0.05 ? "Rising" : tr < -0.05 ? "Falling" : "Flat", badgeTone: tr == null ? "gray" : tr > 0.05 ? "red" : tr < -0.05 ? "green" : "yellow" },
    {
      label: "DXY",
      value: dxyVal != null ? num(dxyVal, 2) : "—",
      badge: dxyChg != null ? `${dxyBadge} ${pct(dxyChg, 2)}` : dxyBadge,
      badgeTone: dxyTone,
    },
  ];
}

const ICONS = { vol: "〰", trend: "↗", breadth: "⊞", momentum: "↑", macro: "●" };

export default function ShouldITrade() {
  const { data, isLoading } = useSIT();
  const { data: sectors } = useSectors();
  const { data: dxy } = useDxy();

  if (!isSupabaseConfigured) return <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">Supabase not configured.</div>;
  if (isLoading) return <div className="terminal-card p-6"><div className="font-mono text-xs text-text-dim">Loading…</div></div>;
  if (!data) return <div className="terminal-card p-6"><div className="font-mono text-xs text-text-dim">No SIT data.</div></div>;

  const raw = data.raw_inputs ?? {};
  const sectorLabel = (t: string) => sectors?.find((s) => s.ticker === t)?.sector_label ?? t;

  const volRows = buildVolatility(raw);
  const trendRows = buildTrend(raw);
  const breadthRows = buildBreadth(raw);
  const momentumRows = buildMomentum(raw, sectorLabel);
  const macroRows = buildMacro(raw, dxy ?? null);

  const positionSize = data.decision === "YES" ? "FULL" : data.decision === "CAUTION" ? "HALF" : "NONE";
  const ews = data.execution_window_score ?? 0;
  const sortedSectors = (sectors ?? []).slice().sort((a, b) => (Number(b.perf_day) || 0) - (Number(a.perf_day) || 0));

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3 flex-wrap pb-1">
        <h1 className="font-mono text-xl font-bold tracking-tight text-text-primary signal-glow-green">SHOULD I BE TRADING?</h1>
        <span className="text-2xs text-text-dim mono uppercase tracking-widest">market quality terminal.</span>
      </div>

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <CategoryPanel icon={ICONS.vol} name="VOLATILITY" score={data.vol_score} rows={volRows} />
        <CategoryPanel icon={ICONS.trend} name="TREND" score={data.trend_score} rows={trendRows} />
        <CategoryPanel icon={ICONS.breadth} name="BREADTH" score={data.breadth_score} rows={breadthRows} />
        <CategoryPanel icon={ICONS.momentum} name="MOMENTUM" score={data.momentum_score} rows={momentumRows} />
        <CategoryPanel icon={ICONS.macro} name="MACRO" score={data.macro_score} rows={macroRows} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <div className="terminal-card p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="flex items-baseline gap-2">
              <span className="text-accent-cyan signal-glow-cyan">◐</span>
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

      <div className="grid lg:grid-cols-2 gap-3">
        <div className="terminal-card p-5">
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-accent-cyan signal-glow-cyan">〰</span>
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

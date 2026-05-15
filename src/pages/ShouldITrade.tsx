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

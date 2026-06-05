import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer,
} from "recharts";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, usd, usdCompact, colorClass } from "@/lib/format";
import {
  chartColors,
  tooltipContentStyle,
  tooltipLabelStyle,
  tooltipItemStyle,
  tooltipCursor,
  tooltipCursorFill,
  referenceLineStroke,
} from "@/lib/chartTheme";
import { TickerLink } from "@/components/TickerChartModal";
import CsvButton from "@/components/ui/CsvButton";
import KeyMetricsGrid from "@/components/mm/KeyMetricsGrid";
import { BreadthBars } from "@/components/mm/BreadthBars";
import {
  LeadingIndustriesTable,
  ThematicsByThemeTable,
  ThematicsBySectorTable,
  ThematicsTopMovers,
} from "@/components/mm/IndustryThemeBlocks";
import RRGScatter from "@/components/mm/RRGScatter";
import SP500Landscape from "@/components/mm/SP500Landscape";

// ===== Pinned SIT Banner =====
type Verdict = { word: "Strong" | "Mixed" | "Weak" | "Unknown"; color: string };

// MQS bands mirror the engine's swing decision thresholds (80 / 60) so the
// word can't visually contradict the YES/CAUTION/NO. EWS has no published
// threshold; use the engine's follow-through bands (>=70 / 40 / <40).
function scoreVerdict(
  score: number | null | undefined,
  kind: "market" | "timing",
): Verdict {
  if (score == null || !Number.isFinite(Number(score))) {
    return { word: "Unknown", color: "text-text-dim" };
  }
  const v = Number(score);
  if (kind === "market") {
    if (v >= 80) return { word: "Strong", color: "text-accent-green" };
    if (v >= 60) return { word: "Mixed", color: "text-accent-yellow" };
    return { word: "Weak", color: "text-accent-red" };
  }
  if (v >= 70) return { word: "Strong", color: "text-accent-green" };
  if (v >= 40) return { word: "Mixed", color: "text-accent-yellow" };
  return { word: "Weak", color: "text-accent-red" };
}

function PinnedSITBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ["sit-pinned-swing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("should_i_trade_latest_v")
        .select("snapshot_date, mode, decision, market_quality_score, execution_window_score, narrative_text, suggested_action")
        .eq("mode", "swing")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isSupabaseConfigured,
  });

  if (!isSupabaseConfigured || isLoading || !data) return null;

  const decisionColor =
    data.decision === "YES" ? "text-accent-green" :
    data.decision === "CAUTION" ? "text-accent-yellow" :
    "text-accent-red";

  const market = scoreVerdict(data.market_quality_score, "market");
  const timing = scoreVerdict(data.execution_window_score, "timing");

  return (
    <div className="terminal-card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
          Should I Trade · swing mode
        </div>
        <div className="font-mono text-2xs text-text-dim">as of {data.snapshot_date}</div>
      </div>
      <div className="flex items-baseline gap-6 flex-wrap">
        <div className={`font-mono text-3xl font-bold ${decisionColor}`}>{data.decision}</div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-2xs text-text-dim uppercase tracking-widest">Market</span>
          <span className="font-mono text-base font-semibold">
            <span className={market.color}>{market.word}</span>{" "}
            <span className="text-text-dim text-2xs tabular-nums">{num(data.market_quality_score, 1)}</span>
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-2xs text-text-dim uppercase tracking-widest">Timing</span>
          <span className="font-mono text-base font-semibold">
            <span className={timing.color}>{timing.word}</span>{" "}
            <span className="text-text-dim text-2xs tabular-nums">{num(data.execution_window_score, 1)}</span>
          </span>
        </div>
      </div>
      {data.suggested_action && (
        <div className="text-sm">
          <span className="font-mono text-2xs text-text-dim uppercase tracking-widest">What to do </span>
          <span className={`font-mono font-semibold ${decisionColor}`}>{data.suggested_action}</span>
        </div>
      )}
      {data.narrative_text && (
        <div className="sit-narrative text-xs sm:text-2xs text-text-dim leading-relaxed border-t border-border-subtle pt-3 font-mono">
          {data.narrative_text}
        </div>
      )}
    </div>
  );
}

// ===== Sector SPDRs =====
interface SectorRow {
  ticker: string;
  sector_label: string | null;
  is_benchmark: boolean;
  price: number | null;
  perf_day: number | null;
  perf_week: number | null;
  perf_month: number | null;
  perf_quarter: number | null;
  perf_year: number | null;
  perf_ytd: number | null;
}

function SectorGrid() {
  const { data } = useQuery({
    queryKey: ["mm-sectors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sector_etf_latest_v").select("*");
      if (error) throw error;
      return (data ?? []) as SectorRow[];
    },
    enabled: isSupabaseConfigured,
  });
  if (!data || data.length === 0) return null;

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">◆</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">Sector SPDRs</span>
        </div>
        <span className="font-mono text-2xs text-text-dim">{data.length} ETFs</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[480px] sticky-col-1 tbl-readable mm-aligned">
          <thead className="border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1 max-sm:w-[3.25rem]">Ticker</th>
              <th className="py-1.5 max-sm:w-[110px]">Name</th>
              <th className="py-1.5 text-right">Price</th>
              <th className="py-1.5 text-right">Day</th>
              <th className="py-1.5 text-right">Wk</th>
              <th className="py-1.5 text-right">Mo</th>
              <th className="py-1.5 text-right">Qtr</th>
              <th className="py-1.5 text-right">Yr</th>
              <th className="py-1.5 text-right pr-1">YTD</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.ticker} className={`border-b border-border-subtle/40 hover:bg-bg-hover ${row.is_benchmark ? "bg-bg-panel/40" : ""}`}>
                <td className="py-1 pl-1">
                  <span className="text-text-primary font-semibold">{row.ticker}</span>
                  {row.is_benchmark && <span className="text-2xs text-accent-amber ml-1">·</span>}
                </td>
                <td className="py-1 text-text-secondary text-2xs truncate max-w-[110px]">{row.sector_label || "—"}</td>
                <td className="py-1 text-text-primary tabular-nums text-right">{usd(row.price, 2)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_day)}`}>{pct(row.perf_day, 1)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_week)}`}>{pct(row.perf_week, 1)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_month)}`}>{pct(row.perf_month, 1)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_quarter)}`}>{pct(row.perf_quarter, 1)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_year)}`}>{pct(row.perf_year, 1)}</td>
                <td className={`py-1 tabular-nums text-right pr-1 ${colorClass(row.perf_ytd)}`}>{pct(row.perf_ytd, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Watchlist =====
interface WatchlistRow {
  id: number;
  ticker: string;
  sector: string | null;
  industry: string | null;
  price: number | null;
  market_cap_millions: number | null;
  perf_day: number | null;
  perf_week: number | null;
  perf_month: number | null;
  perf_year: number | null;
  sma50_pct: number | null;
  rsi14: number | null;
  atr_pct: number | null;
}

function WatchlistTable() {
  const { data } = useQuery({
    queryKey: ["mm-watchlist"],
    queryFn: async () => {
      const { data, error } = await supabase.from("watchlist_v").select("*");
      if (error) throw error;
      return (data ?? []) as WatchlistRow[];
    },
    enabled: isSupabaseConfigured,
  });
  if (!data || data.length === 0) return null;

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">★</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">Watchlist</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-2xs text-text-dim">{data.length} symbols</span>
          <CsvButton
            filename="watchlist.csv"
            rows={data}
            columns={[
              { header: "Ticker",   value: (r) => r.ticker },
              { header: "Sector",   value: (r) => r.sector ?? "" },
              { header: "Industry", value: (r) => r.industry ?? "" },
              { header: "Price",    value: (r) => r.price },
              { header: "MarketCapM", value: (r) => r.market_cap_millions },
              { header: "PerfDay",  value: (r) => r.perf_day },
              { header: "PerfWeek", value: (r) => r.perf_week },
              { header: "PerfMonth",value: (r) => r.perf_month },
              { header: "PerfYear", value: (r) => r.perf_year },
              { header: "VsSMA50",  value: (r) => r.sma50_pct },
              { header: "RSI14",    value: (r) => r.rsi14 },
              { header: "ATRpct",   value: (r) => r.atr_pct },
            ]}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[460px] sticky-col-1 tbl-readable mm-aligned">
          <thead className="border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1 max-sm:w-[3.25rem]">Ticker</th>
              <th className="py-1.5 max-sm:w-[6rem]">Sector</th>
              <th className="py-1.5 text-right">Cap</th>
              <th className="py-1.5 text-right">Price</th>
              <th className="py-1.5 text-right">Day</th>
              <th className="py-1.5 text-right">Wk</th>
              <th className="py-1.5 text-right">Mo</th>
              <th className="py-1.5 text-right">Yr</th>
              <th className="py-1.5 text-right">vs SMA50</th>
              <th className="py-1.5 text-right">RSI</th>
              <th className="py-1.5 text-right pr-1">ATR%</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.ticker} className="border-b border-border-subtle/40 hover:bg-bg-hover">
                <td className="py-1 pl-1"><TickerLink ticker={row.ticker} /></td>
                <td className="py-1 text-text-secondary text-2xs truncate max-w-[140px] max-sm:max-w-[6rem]">{row.sector || "—"}</td>
                <td className="py-1 text-text-secondary tabular-nums text-right text-2xs">{usdCompact(row.market_cap_millions, "millions")}</td>
                <td className="py-1 text-text-primary tabular-nums text-right">{usd(row.price, 2)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_day)}`}>{pct(row.perf_day, 1)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_week)}`}>{pct(row.perf_week, 1)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_month)}`}>{pct(row.perf_month, 1)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_year)}`}>{pct(row.perf_year, 1)}</td>
                <td className={`py-1 tabular-nums text-right text-2xs ${colorClass(row.sma50_pct)}`}>{pct(row.sma50_pct, 1)}</td>
                <td className="py-1 text-text-secondary tabular-nums text-right text-2xs">{num(row.rsi14, 0)}</td>
                <td className="py-1 text-text-secondary tabular-nums text-right text-2xs pr-1">{num(row.atr_pct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Stage Analysis =====
interface StageRow {
  stage: string;
  sort_order: number;
  count: number;
  pct: number;
  universe_size: number;
}

const STAGE_DESC: Record<string, string> = {
  "1A": "Basing low", "1B": "Basing high",
  "2A": "Early advance", "2B": "Mid advance", "2C": "Strong advance",
  "3A": "Distribution", "3B": "Topping",
  "4A": "Early decline", "4B": "Mid decline", "4C": "Strong decline",
};

function stageColor(stage: string): { bar: string; text: string } {
  if (stage.startsWith("1")) return { bar: "bg-text-dim", text: "text-text-secondary" };
  if (stage === "2C") return { bar: "bg-accent-green", text: "text-accent-green" };
  if (stage === "2B") return { bar: "bg-accent-green/80", text: "text-accent-green" };
  if (stage === "2A") return { bar: "bg-accent-green/60", text: "text-accent-green" };
  if (stage.startsWith("3")) return { bar: "bg-accent-yellow", text: "text-accent-yellow" };
  if (stage === "4C") return { bar: "bg-accent-red", text: "text-accent-red" };
  if (stage === "4B") return { bar: "bg-accent-red/80", text: "text-accent-red" };
  if (stage === "4A") return { bar: "bg-accent-red/60", text: "text-accent-red" };
  return { bar: "bg-text-dim", text: "text-text-secondary" };
}

function StageAnalysisCard() {
  const { data } = useQuery({
    queryKey: ["mm-stage-analysis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stage_analysis_counts_v").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as StageRow[];
    },
    enabled: isSupabaseConfigured,
  });
  if (!data || data.length === 0) return null;

  const maxPct = Math.max(...data.map((d) => d.pct), 1);
  const universe = data[0]?.universe_size ?? 0;

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">◫</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">Stage Analysis · Weinstein 10 substages</span>
        </div>
        <span className="font-mono text-2xs text-text-dim tabular-nums">{universe.toLocaleString()} stocks</span>
      </div>
      <div className="space-y-1.5">
        {data.map((row) => {
          const c = stageColor(row.stage);
          const widthPct = (row.pct / maxPct) * 100;
          return (
            <div key={row.stage} className="grid grid-cols-[1.75rem_4.5rem_1fr_3rem] sm:grid-cols-[2rem_6rem_1fr_3.5rem] gap-1.5 sm:gap-2 items-center text-xs font-mono">
              <div className={`font-semibold ${c.text}`}>{row.stage}</div>
              <div className="h-4 bg-bg-panel rounded-sm overflow-hidden">
                <div className={`h-full ${c.bar} transition-all`} style={{ width: `${widthPct}%` }} />
              </div>
              <div className="text-text-dim text-2xs truncate">{STAGE_DESC[row.stage]}</div>
              <div className="text-right">
                <div className="text-text-primary tabular-nums text-xs">{row.count}</div>
                <div className="text-text-dim text-2xs tabular-nums">{num(row.pct, 1)}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== Stockbee Breadth =====
interface StockbeeBreadth {
  observation_date: string;
  up_4pct: number;
  down_4pct: number;
  ratio5: number;
  ratio10: number;
  up_25pct_qtr: number;
  down_25pct_qtr: number;
  universe_size: number;
  t2108: number;
  sp500_level: number;
}

function StockbeeBreadthCard() {
  const { data } = useQuery({
    queryKey: ["mm-stockbee-latest"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stockbee_breadth_latest_v").select("*").maybeSingle();
      if (error) throw error;
      return data as StockbeeBreadth | null;
    },
    enabled: isSupabaseConfigured,
  });
  if (!data) return null;

  const t2108Tone =
    data.t2108 >= 70 ? "text-accent-red" :
    data.t2108 >= 50 ? "text-accent-green" :
    data.t2108 >= 30 ? "text-accent-yellow" :
    "text-accent-red";

  const ratio5Tone =
    Number(data.ratio5) >= 1.5 ? "text-accent-green" :
    Number(data.ratio5) >= 0.9 ? "text-text-primary" :
    "text-accent-red";

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">⊟</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">Stockbee Breadth</span>
        </div>
        <span className="font-mono text-2xs text-text-dim">{data.observation_date}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
        <div>
          <div className="text-text-dim text-2xs uppercase tracking-wider mb-1">4% Up / Down</div>
          <div className="flex items-baseline gap-1">
            <span className="text-accent-green tabular-nums text-lg font-semibold">{data.up_4pct}</span>
            <span className="text-text-dim">/</span>
            <span className="text-accent-red tabular-nums text-lg font-semibold">{data.down_4pct}</span>
          </div>
        </div>
        <div>
          <div className="text-text-dim text-2xs uppercase tracking-wider mb-1">5d A/D Ratio</div>
          <div className={`tabular-nums text-lg font-semibold ${ratio5Tone}`}>{num(data.ratio5, 2)}</div>
        </div>
        <div>
          <div className="text-text-dim text-2xs uppercase tracking-wider mb-1">25%+ Qtr Up / Dn</div>
          <div className="flex items-baseline gap-1">
            <span className="text-accent-green tabular-nums text-lg font-semibold">{data.up_25pct_qtr}</span>
            <span className="text-text-dim">/</span>
            <span className="text-accent-red tabular-nums text-lg font-semibold">{data.down_25pct_qtr}</span>
          </div>
        </div>
        <div>
          <div className="text-text-dim text-2xs uppercase tracking-wider mb-1">T2108</div>
          <div className={`tabular-nums text-lg font-semibold ${t2108Tone}`}>{num(data.t2108, 1)}</div>
        </div>
      </div>
    </div>
  );
}

// ===== Stockbee 4-chart history =====
interface StockbeeHistoryRow {
  observation_date: string;
  up_4pct: number;
  down_4pct: number;
  up_25pct_qtr: number;
  down_25pct_qtr: number;
  ratio5: number;
  ratio10: number;
  t2108: number;
  sp500_level: number;
}

function useStockbeeHistory() {
  return useQuery({
    queryKey: ["mm-stockbee-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stockbee_breadth_history_v")
        .select("*")
        .order("observation_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return ((data ?? []) as StockbeeHistoryRow[]).reverse();
    },
    enabled: isSupabaseConfigured,
  });
}

type MiniChartType = "ratio5" | "t2108" | "fourpct_net" | "qtr_net";

function MiniChartCard({ title, history, type, refLine }: { title: string; history: StockbeeHistoryRow[]; type: MiniChartType; refLine?: number }) {
  const data = history.map((d) => {
    let value: number;
    if (type === "ratio5") value = Number(d.ratio5);
    else if (type === "t2108") value = Number(d.t2108);
    else if (type === "fourpct_net") value = (d.up_4pct ?? 0) - (d.down_4pct ?? 0);
    else value = (d.up_25pct_qtr ?? 0) - (d.down_25pct_qtr ?? 0);
    return { date: d.observation_date, value };
  });

  const last = data[data.length - 1]?.value ?? 0;
  const useBar = type === "fourpct_net" || type === "qtr_net";
  const lineColor = last >= (refLine ?? 0) ? chartColors.green : chartColors.red;
  const displayValue = type === "ratio5" || type === "t2108" ? num(last, 2) : `${last > 0 ? "+" : ""}${Math.round(last)}`;
  const displayColor =
    type === "ratio5" ? (last >= 1 ? "text-accent-green" : "text-accent-red") :
    type === "t2108" ? (last >= 50 ? "text-accent-green" : last >= 30 ? "text-accent-yellow" : "text-accent-red") :
    last >= 0 ? "text-accent-green" : "text-accent-red";

  return (
    <div className="terminal-card p-4">
      <div className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold mb-1">{title}</div>
      <div className={`font-mono text-base tabular-nums font-semibold ${displayColor}`}>{displayValue}</div>
      <div className="h-16 sm:h-12 mt-1">
        <ResponsiveContainer width="100%" height="100%">
          {useBar ? (
            <BarChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <ReferenceLine y={0} stroke={referenceLineStroke} strokeWidth={1} />
              <Bar dataKey="value">
                {data.map((d, i) => (
                  <Cell key={i} fill={d.value >= 0 ? chartColors.green : chartColors.red} />
                ))}
              </Bar>
              <Tooltip
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle}
                cursor={tooltipCursorFill}
                formatter={(v: any) => [v > 0 ? `+${v}` : `${v}`, ""]}
              />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              {refLine !== undefined && <ReferenceLine y={refLine} stroke={referenceLineStroke} strokeWidth={1} strokeDasharray="2 2" />}
              <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={1.5} dot={false} />
              <Tooltip
                contentStyle={tooltipContentStyle}
                labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle}
                cursor={tooltipCursor}
                formatter={(v: any) => [num(v, 2), ""]}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Sp500HistoryChart() {
  const { data } = useStockbeeHistory();
  if (!data || data.length === 0) return null;
  const points = data.map((d) => ({ date: d.observation_date, value: Number(d.sp500_level) }));
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const change = last - first;
  const changePct = first ? (change / first) * 100 : 0;
  const isUp = change >= 0;
  const lineColor = isUp ? chartColors.green : chartColors.red;

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">📈</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            S&amp;P 500 · 60-day
          </span>
        </div>
        <div className="flex items-baseline gap-3 font-mono text-2xs">
          <span className="text-text-primary tabular-nums">{num(last, 2)}</span>
          <span className={`tabular-nums ${isUp ? "text-accent-green" : "text-accent-red"}`}>
            {isUp ? "+" : ""}{num(change, 2)} ({isUp ? "+" : ""}{num(changePct, 2)}%)
          </span>
        </div>
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} hide />
            <Line type="monotone" dataKey="value" stroke={lineColor} strokeWidth={1.5} dot={false} />
            <Tooltip
              contentStyle={tooltipContentStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              cursor={tooltipCursor}
              formatter={(v: any) => [num(v, 2), "SPX"]}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StockbeeHistoryCharts() {
  const { data } = useStockbeeHistory();
  if (!data || data.length === 0) return null;
  return (
    <div>
      <div className="font-mono text-2xs text-text-dim uppercase tracking-widest mb-2 flex items-baseline gap-2">
        <span className="text-accent-cyan signal-glow-cyan">▦</span>
        Stockbee · 60-day history
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniChartCard title="4% Up − Down" history={data} type="fourpct_net" />
        <MiniChartCard title="5d A/D Ratio" history={data} type="ratio5" refLine={1} />
        <MiniChartCard title="25% Qtr Up − Down" history={data} type="qtr_net" />
        <MiniChartCard title="T2108" history={data} type="t2108" refLine={50} />
      </div>
    </div>
  );
}

// ===== Stockbee Momentum 50 =====
function StockbeeMomentum50() {
  const { data } = useQuery({
    queryKey: ["mm-momentum50"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stockbee_momentum50_latest_v").select("*").maybeSingle();
      if (error) throw error;
      return data as { observation_date: string; tickers: string[] } | null;
    },
    enabled: isSupabaseConfigured,
  });
  if (!data?.tickers || data.tickers.length === 0) return null;

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">⚡</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">Stockbee Momentum 50</span>
        </div>
        <span className="font-mono text-2xs text-text-dim">{data.observation_date} · {data.tickers.length} tickers</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-1.5">
        {data.tickers.map((t) => (
          <div key={t} className="bg-bg-panel rounded text-center hover:bg-bg-hover transition-colors">
            <TickerLink ticker={t} className="block px-2 py-2 sm:py-1 text-xs w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ===== Main page =====
export default function MarketMetrics() {
  return (
    <div className="space-y-4 mm-tables">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex flex-col items-start gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-accent-cyan text-base signal-glow-cyan">⊞</span>
            <h1 className="font-mono text-base font-semibold text-text-primary signal-glow-green">Market Metrics</h1>
          </div>
          <span className="font-mono text-2xs text-text-dim uppercase tracking-widest sm:normal-case sm:tracking-normal sm:text-xs">Universe breadth · sectors · stages</span>
        </div>
      </header>

      <PinnedSITBanner />
      <KeyMetricsGrid />

      <BreadthBars universes={["NQ100", "SPY500", "DJIA"]} title="Breadth Bars · Major Indexes" icon="▌" />
      <BreadthBars universes={["RUS2000", "$1B+"]} title="Breadth Bars · Small-cap / Liquid" icon="▌" />

      <div className="grid lg:grid-cols-2 gap-3">
        <SectorGrid />
        <StageAnalysisCard />
      </div>

      <WatchlistTable />

      <StockbeeBreadthCard />
      <Sp500HistoryChart />
      <StockbeeHistoryCharts />
      <StockbeeMomentum50 />

      <LeadingIndustriesTable />
      <ThematicsByThemeTable />
      <ThematicsBySectorTable />
      <ThematicsTopMovers />

      <RRGScatter />
      <SP500Landscape />
    </div>
  );
}

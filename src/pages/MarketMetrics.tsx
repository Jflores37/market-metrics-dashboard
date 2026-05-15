import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, usd, usdCompact, colorClass } from "@/lib/format";
import KeyMetricsGrid from "@/components/mm/KeyMetricsGrid";

// ===== Pinned SIT Banner =====
function PinnedSITBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ["sit-pinned-swing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("should_i_trade_latest_v")
        .select("snapshot_date, mode, decision, market_quality_score, execution_window_score, narrative_text")
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

  return (
    <div className="terminal-card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
          Should I Trade · swing mode
        </div>
        <div className="font-mono text-2xs text-text-dim">as of {data.snapshot_date}</div>
      </div>
      <div className="flex items-baseline gap-5 flex-wrap">
        <div className={`font-mono text-3xl font-bold ${decisionColor}`}>{data.decision}</div>
        <div className="font-mono text-sm text-text-secondary">
          MQS{" "}
          <span className="text-text-primary font-semibold">
            {num(data.market_quality_score, 1)}
          </span>
          {"  ·  "}EWS{" "}
          <span className={colorClass((data.execution_window_score ?? 50) - 50)}>
            {num(data.execution_window_score, 1)}
          </span>
        </div>
      </div>
      {data.narrative_text && (
        <div className="text-xs text-text-secondary leading-relaxed border-t border-border-subtle pt-3 font-mono">
          {data.narrative_text}
        </div>
      )}
    </div>
  );
}

// ===== Sector SPDR Grid =====
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
          <span className="text-accent-orange text-sm">◆</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            Sector SPDRs
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">{data.length} ETFs</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[640px]">
          <thead className="border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1">Ticker</th>
              <th className="py-1.5">Name</th>
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
              <tr
                key={row.ticker}
                className={`border-b border-border-subtle/40 hover:bg-bg-hover ${
                  row.is_benchmark ? "bg-bg-panel/40" : ""
                }`}
              >
                <td className="py-1 pl-1">
                  <span className="text-text-primary font-semibold">{row.ticker}</span>
                  {row.is_benchmark && (
                    <span className="text-2xs text-accent-orange ml-1">·</span>
                  )}
                </td>
                <td className="py-1 text-text-secondary text-2xs truncate max-w-[180px]">
                  {row.sector_label || "—"}
                </td>
                <td className="py-1 text-text-primary tabular-nums text-right">
                  {usd(row.price, 2)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_day)}`}>
                  {pct(row.perf_day, 1)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_week)}`}>
                  {pct(row.perf_week, 1)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_month)}`}>
                  {pct(row.perf_month, 1)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_quarter)}`}>
                  {pct(row.perf_quarter, 1)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_year)}`}>
                  {pct(row.perf_year, 1)}
                </td>
                <td className={`py-1 tabular-nums text-right pr-1 ${colorClass(row.perf_ytd)}`}>
                  {pct(row.perf_ytd, 1)}
                </td>
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
  position: number | null;
  notes: string | null;
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
          <span className="text-accent-orange text-sm">★</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            Watchlist
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">{data.length} symbols</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[760px]">
          <thead className="border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1">Ticker</th>
              <th className="py-1.5">Sector</th>
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
                <td className="py-1 pl-1 text-text-primary font-semibold">{row.ticker}</td>
                <td className="py-1 text-text-secondary text-2xs truncate max-w-[140px]">
                  {row.sector || "—"}
                </td>
                <td className="py-1 text-text-secondary tabular-nums text-right text-2xs">
                  {usdCompact(row.market_cap_millions, "millions")}
                </td>
                <td className="py-1 text-text-primary tabular-nums text-right">
                  {usd(row.price, 2)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_day)}`}>
                  {pct(row.perf_day, 1)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_week)}`}>
                  {pct(row.perf_week, 1)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_month)}`}>
                  {pct(row.perf_month, 1)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_year)}`}>
                  {pct(row.perf_year, 1)}
                </td>
                <td className={`py-1 tabular-nums text-right text-2xs ${colorClass(row.sma50_pct)}`}>
                  {pct(row.sma50_pct, 1)}
                </td>
                <td className="py-1 text-text-secondary tabular-nums text-right text-2xs">
                  {num(row.rsi14, 0)}
                </td>
                <td className="py-1 text-text-secondary tabular-nums text-right text-2xs pr-1">
                  {num(row.atr_pct, 1)}
                </td>
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
  "1A": "Basing low",
  "1B": "Basing high",
  "2A": "Early advance",
  "2B": "Mid advance",
  "2C": "Strong advance",
  "3A": "Distribution",
  "3B": "Topping",
  "4A": "Early decline",
  "4B": "Mid decline",
  "4C": "Strong decline",
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
      const { data, error } = await supabase
        .from("stage_analysis_counts_v")
        .select("*")
        .order("sort_order");
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
          <span className="text-accent-orange text-sm">◫</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            Stage Analysis · Weinstein 10 substages
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim tabular-nums">
          {universe.toLocaleString()} stocks
        </span>
      </div>
      <div className="space-y-1.5">
        {data.map((row) => {
          const c = stageColor(row.stage);
          const widthPct = (row.pct / maxPct) * 100;
          return (
            <div
              key={row.stage}
              className="grid grid-cols-[2.5rem_1fr_5.5rem_3.5rem] gap-2 items-center text-xs font-mono"
            >
              <div className={`font-semibold ${c.text}`}>{row.stage}</div>
              <div className="h-4 bg-bg-panel rounded-sm overflow-hidden">
                <div
                  className={`h-full ${c.bar} transition-all`}
                  style={{ width: `${widthPct}%` }}
                />
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

// ===== Main page =====
export default function MarketMetrics() {
  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-blue text-base">⊞</span>
          <h1 className="font-mono text-base font-semibold text-accent-blue">Market Metrics</h1>
          <span className="text-xs text-text-dim mono">— Universe breadth · sectors · stages</span>
        </div>
      </header>

      <PinnedSITBanner />
      <KeyMetricsGrid />

      <div className="grid lg:grid-cols-2 gap-3">
        <SectorGrid />
        <StageAnalysisCard />
      </div>

      <WatchlistTable />
    </div>
  );
}

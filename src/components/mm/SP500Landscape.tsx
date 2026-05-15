import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine, Tooltip, ResponsiveContainer,
} from "recharts";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, usd, usdCompact, colorClass } from "@/lib/format";

interface LandscapeRow {
  ticker: string;
  sector: string;
  industry: string;
  price: number | null;
  market_cap_millions: number | null;
  perf_week: number | null;
  perf_month: number | null;
  perf_quarter: number | null;
  perf_year: number | null;
  perf_ytd: number | null;
  sma50_pct: number | null;
  rsi14: number | null;
}

const SECTOR_COLOR: Record<string, string> = {
  Technology: "#58a6ff",
  Healthcare: "#ff7b72",
  Financial: "#3fb950",
  "Consumer Cyclical": "#f0883e",
  "Communication Services": "#b87cff",
  Industrials: "#d29922",
  "Consumer Defensive": "#8b949e",
  Energy: "#f85149",
  "Real Estate": "#88d3e6",
  Utilities: "#56d364",
  "Basic Materials": "#ddb544",
};

const X_OPTIONS = [
  { key: "perf_week", label: "Week %" },
  { key: "perf_month", label: "Month %" },
  { key: "perf_quarter", label: "Quarter %" },
  { key: "perf_ytd", label: "YTD %" },
] as const;

const Y_OPTIONS = [
  { key: "perf_year", label: "Year %" },
  { key: "perf_month", label: "Month %" },
  { key: "sma50_pct", label: "vs SMA50 %" },
  { key: "rsi14", label: "RSI" },
] as const;

type XKey = (typeof X_OPTIONS)[number]["key"];
type YKey = (typeof Y_OPTIONS)[number]["key"];

function useLandscape() {
  return useQuery({
    queryKey: ["mm-landscape"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sp500_landscape_v")
        .select("ticker, sector, industry, price, market_cap_millions, perf_week, perf_month, perf_quarter, perf_year, perf_ytd, sma50_pct, rsi14");
      if (error) throw error;
      return (data ?? []) as LandscapeRow[];
    },
    enabled: isSupabaseConfigured,
  });
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d: LandscapeRow = payload[0].payload;
  return (
    <div className="bg-bg-card border border-border rounded px-3 py-2 font-mono text-2xs space-y-0.5 min-w-[180px]">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-text-primary font-bold text-xs">{d.ticker}</span>
        <span className="text-text-dim text-2xs ml-auto">{usdCompact(d.market_cap_millions, "millions")}</span>
      </div>
      <div className="text-text-secondary">{d.sector}</div>
      <div className="text-text-dim text-2xs truncate">{d.industry}</div>
      <div className="border-t border-border-subtle pt-1 mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
        <span className="text-text-dim">Price</span>
        <span className="text-text-primary tabular-nums text-right">{usd(d.price, 2)}</span>
        <span className="text-text-dim">Week</span>
        <span className={`tabular-nums text-right ${colorClass(d.perf_week)}`}>{pct(d.perf_week, 1)}</span>
        <span className="text-text-dim">Month</span>
        <span className={`tabular-nums text-right ${colorClass(d.perf_month)}`}>{pct(d.perf_month, 1)}</span>
        <span className="text-text-dim">Year</span>
        <span className={`tabular-nums text-right ${colorClass(d.perf_year)}`}>{pct(d.perf_year, 1)}</span>
        <span className="text-text-dim">RSI</span>
        <span className="tabular-nums text-text-secondary text-right">{num(d.rsi14, 0)}</span>
      </div>
    </div>
  );
}

export default function SP500Landscape() {
  const { data, isLoading } = useLandscape();
  const [xKey, setXKey] = useState<XKey>("perf_week");
  const [yKey, setYKey] = useState<YKey>("perf_year");

  if (isLoading) {
    return (
      <div className="terminal-card p-6">
        <div className="font-mono text-xs text-text-dim">Loading S&amp;P 500 landscape…</div>
      </div>
    );
  }
  if (!data || data.length === 0) return null;

  const sectors = Array.from(new Set(data.map((d) => d.sector).filter(Boolean))).sort();
  const dataWithZ = data.map((d) => ({
    ...d,
    z: Math.log10(Math.max(10, d.market_cap_millions ?? 10)) * 100,
  }));

  const xLabel = X_OPTIONS.find((o) => o.key === xKey)?.label ?? xKey;
  const yLabel = Y_OPTIONS.find((o) => o.key === yKey)?.label ?? yKey;

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">◯</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            S&amp;P 500 Landscape · {data.length} stocks
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">
          bubble size = market cap (log) · color = sector
        </span>
      </div>

      <div className="flex flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2 text-2xs font-mono">
          <span className="text-text-dim uppercase tracking-wider">X:</span>
          <select
            value={xKey}
            onChange={(e) => setXKey(e.target.value as XKey)}
            className="bg-bg-card border border-border-subtle text-text-primary rounded px-2 py-0.5 font-mono text-2xs"
          >
            {X_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 text-2xs font-mono">
          <span className="text-text-dim uppercase tracking-wider">Y:</span>
          <select
            value={yKey}
            onChange={(e) => setYKey(e.target.value as YKey)}
            className="bg-bg-card border border-border-subtle text-text-primary rounded px-2 py-0.5 font-mono text-2xs"
          >
            {Y_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 font-mono text-2xs">
        {sectors.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: SECTOR_COLOR[s] || "#8b949e" }} />
            <span className="text-text-secondary">{s}</span>
          </span>
        ))}
      </div>

      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 30 }}>
            <ReferenceLine y={0} stroke="#30363d" strokeWidth={1} strokeDasharray="2 2" />
            <ReferenceLine x={0} stroke="#30363d" strokeWidth={1} strokeDasharray="2 2" />
            <XAxis
              type="number"
              dataKey={xKey}
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6e7681" }}
              stroke="#30363d"
              label={{ value: xLabel, fontSize: 10, fill: "#6e7681", fontFamily: "JetBrains Mono, monospace", position: "insideBottom", offset: -10 }}
            />
            <YAxis
              type="number"
              dataKey={yKey}
              tick={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace", fill: "#6e7681" }}
              stroke="#30363d"
              label={{ value: yLabel, fontSize: 10, fill: "#6e7681", fontFamily: "JetBrains Mono, monospace", angle: -90, position: "insideLeft", offset: 10 }}
            />
            <ZAxis type="number" dataKey="z" range={[20, 400]} />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />

            {sectors.map((s) => (
              <Scatter
                key={s}
                name={s}
                data={dataWithZ.filter((d) => d.sector === s)}
                fill={SECTOR_COLOR[s] || "#8b949e"}
                fillOpacity={0.65}
                stroke={SECTOR_COLOR[s] || "#8b949e"}
                strokeOpacity={0.85}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

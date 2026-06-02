import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, usd, usdCompact, colorClass } from "@/lib/format";
import { chartColors, axisTickStyle, axisStroke, referenceLineStroke, axisTick } from "@/lib/chartTheme";
import { useIsMobile } from "@/lib/useIsMobile";

interface LandscapeRow {
  ticker: string;
  sector: string;
  industry: string;
  price: number | null;
  market_cap_millions: number | null;
  perf_day: number | null;
  perf_week: number | null;
  perf_month: number | null;
  perf_quarter: number | null;
  perf_year: number | null;
  perf_ytd: number | null;
  sma50_pct: number | null;
  rsi14: number | null;
}

// Per-sector identifying colors. Chosen for categorical distinction; tones
// shifted to align with the new terminal palette (cyan/green/amber/etc.).
const SECTOR_COLOR: Record<string, string> = {
  Technology: chartColors.cyan,
  Healthcare: "#ff7b72",
  Financial: chartColors.green,
  "Consumer Cyclical": "#f0883e",
  "Communication Services": "#b87cff",
  Industrials: chartColors.amber,
  "Consumer Defensive": chartColors.textSecondary,
  Energy: chartColors.red,
  "Real Estate": "#88d3e6",
  Utilities: "#56d364",
  "Basic Materials": "#ddb544",
};

const X_OPTIONS = [
  { key: "perf_day", label: "Day %" },
  { key: "perf_week", label: "Week %" },
  { key: "perf_month", label: "Month %" },
  { key: "perf_quarter", label: "Quarter %" },
  { key: "perf_ytd", label: "YTD %" },
] as const;

const Y_OPTIONS = [
  { key: "perf_day", label: "Day %" },
  { key: "perf_year", label: "Year %" },
  { key: "perf_month", label: "Month %" },
  { key: "sma50_pct", label: "vs SMA50 %" },
  { key: "rsi14", label: "RSI" },
] as const;

type XKey = (typeof X_OPTIONS)[number]["key"];
type YKey = (typeof Y_OPTIONS)[number]["key"];

const SELECT_CLASS =
  "bg-bg-card border border-border-subtle text-text-primary rounded px-2 py-1 sm:py-0.5 font-mono text-xs sm:text-2xs min-h-[40px] sm:min-h-[32px] flex-1 sm:flex-none min-w-0";

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

// Robust axis domain: clamp to the [qlo, qhi] percentile band (+padding) so a
// single extreme outlier (e.g. a +4573%/yr stock) can't stretch the axis and
// squash everyone else. Paired with allowDataOverflow, out-of-band points pin
// to the edge while the tooltip still shows their true value.
function clampDomain(values: number[], qlo: number, qhi: number, pad: number): [number, number] {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return [0, 1];
  if (v.length === 1) return [v[0] - 1, v[0] + 1];
  let lo = quantile(v, qlo);
  let hi = quantile(v, qhi);
  if (lo === hi) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [lo - p, hi + p];
}

function useLandscape() {
  return useQuery({
    queryKey: ["mm-landscape"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sp500_landscape_v")
        .select("ticker, sector, industry, price, market_cap_millions, perf_day, perf_week, perf_month, perf_quarter, perf_year, perf_ytd, sma50_pct, rsi14");
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
        <span className="text-text-dim">Day</span>
        <span className={`tabular-nums text-right ${colorClass(d.perf_day)}`}>{pct(d.perf_day, 1)}</span>
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
  const isMobile = useIsMobile();
  const [xKey, setXKey] = useState<XKey>("perf_week");
  const [yKey, setYKey] = useState<YKey>("perf_year");
  const [sector, setSector] = useState<string>("All");

  if (isLoading) {
    return (
      <div className="terminal-card p-6">
        <div className="font-mono text-xs text-text-dim">Loading S&amp;P 500 landscape…</div>
      </div>
    );
  }
  if (!data || data.length === 0) return null;

  const sectors = Array.from(new Set(data.map((d) => d.sector).filter(Boolean))).sort();
  const dataWithZ = data
    .filter(
      (d) =>
        d[xKey] != null && d[yKey] != null &&
        Number.isFinite(Number(d[xKey])) && Number.isFinite(Number(d[yKey])),
    )
    .map((d) => ({
      ...d,
      z: Math.log10(Math.max(10, d.market_cap_millions ?? 10)) * 100,
    }));

  const isAll = sector === "All";
  const shown = isAll ? dataWithZ : dataWithZ.filter((d) => d.sector === sector);
  const shownSectors = isAll ? sectors : [sector];

  // Clamp to the 1st–99th percentile of whatever is shown: in the All view this
  // tames global outliers; with a sector selected it auto-zooms to that sector
  // so each stock spreads out around its own center.
  const xDomain = clampDomain(shown.map((d) => Number(d[xKey])), 0.01, 0.99, 0.06);
  const yDomain = clampDomain(shown.map((d) => Number(d[yKey])), 0.01, 0.99, 0.06);

  const xLabel = X_OPTIONS.find((o) => o.key === xKey)?.label ?? xKey;
  const yLabel = Y_OPTIONS.find((o) => o.key === yKey)?.label ?? yKey;

  // Per-stock ticker labels when a single sector is selected. Always on desktop;
  // on mobile only when the set is small enough that 7px labels stay legible
  // rather than collapsing into overlapping mush (tap still shows the tooltip).
  const showLabels = !isAll && (!isMobile || shown.length <= 30);

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">◯</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            S&amp;P 500 Landscape · {isAll ? `${data.length} stocks` : `${shown.length} · ${sector}`}
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">
          bubble size = market cap (log) · color = sector
        </span>
      </div>

      <div className="flex flex-wrap gap-2 sm:gap-3 mb-3">
        <div className="flex items-center gap-2 text-2xs font-mono flex-1 sm:flex-none min-w-0">
          <span className="text-text-dim uppercase tracking-wider">Sector:</span>
          <select value={sector} onChange={(e) => setSector(e.target.value)} className={SELECT_CLASS}>
            <option value="All">All</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 text-2xs font-mono flex-1 sm:flex-none min-w-0">
          <span className="text-text-dim uppercase tracking-wider">X:</span>
          <select value={xKey} onChange={(e) => setXKey(e.target.value as XKey)} className={SELECT_CLASS}>
            {X_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 text-2xs font-mono flex-1 sm:flex-none min-w-0">
          <span className="text-text-dim uppercase tracking-wider">Y:</span>
          <select value={yKey} onChange={(e) => setYKey(e.target.value as YKey)} className={SELECT_CLASS}>
            {Y_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {isAll && (
        <div className="flex flex-wrap gap-2 mb-3 font-mono text-2xs">
          {sectors.map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: SECTOR_COLOR[s] || chartColors.textSecondary }} />
              <span className="text-text-secondary">{s}</span>
            </span>
          ))}
        </div>
      )}

      <div className="h-72 sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={isMobile ? { top: 12, right: 12, bottom: 28, left: 24 } : { top: 20, right: 20, bottom: 30, left: 30 }}>
            <ReferenceLine y={0} stroke={referenceLineStroke} strokeWidth={1} strokeDasharray="2 2" />
            <ReferenceLine x={0} stroke={referenceLineStroke} strokeWidth={1} strokeDasharray="2 2" />
            <XAxis
              type="number"
              dataKey={xKey}
              domain={xDomain}
              allowDataOverflow
              tickFormatter={axisTick(0)}
              allowDecimals={false}
              interval="preserveStartEnd"
              minTickGap={isMobile ? 24 : 8}
              tick={isMobile ? { ...axisTickStyle, fontSize: 9 } : axisTickStyle}
              stroke={axisStroke}
              label={{ value: xLabel, fontSize: 10, fill: chartColors.textDim, fontFamily: "JetBrains Mono, monospace", position: "insideBottom", offset: -10 }}
            />
            <YAxis
              type="number"
              dataKey={yKey}
              domain={yDomain}
              allowDataOverflow
              tickFormatter={axisTick(0)}
              allowDecimals={false}
              interval="preserveStartEnd"
              minTickGap={isMobile ? 24 : 8}
              tick={isMobile ? { ...axisTickStyle, fontSize: 9 } : axisTickStyle}
              stroke={axisStroke}
              label={{ value: yLabel, fontSize: 10, fill: chartColors.textDim, fontFamily: "JetBrains Mono, monospace", angle: -90, position: "insideLeft", offset: 10 }}
            />
            <ZAxis type="number" dataKey="z" range={[20, 400]} />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />

            {shownSectors.map((s) => (
              <Scatter
                key={s}
                name={s}
                data={shown.filter((d) => d.sector === s)}
                fill={SECTOR_COLOR[s] || chartColors.textSecondary}
                fillOpacity={0.65}
                stroke={SECTOR_COLOR[s] || chartColors.textSecondary}
                strokeOpacity={0.85}
                isAnimationActive={false}
              >
                {showLabels && (
                  <LabelList
                    dataKey="ticker"
                    position="top"
                    offset={5}
                    fill={chartColors.textSecondary}
                    fontSize={isMobile ? 7 : 8}
                    fontFamily="JetBrains Mono, monospace"
                  />
                )}
              </Scatter>
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

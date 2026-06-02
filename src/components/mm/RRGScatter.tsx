import { useQuery } from "@tanstack/react-query";
import {
  ScatterChart, Scatter, XAxis, YAxis, ReferenceLine, ReferenceArea, Tooltip, ResponsiveContainer,
} from "recharts";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num } from "@/lib/format";
import { chartColors, axisTickStyle, axisStroke, referenceLineStroke, axisTick } from "@/lib/chartTheme";
import { useIsMobile } from "@/lib/useIsMobile";

type Quadrant = "leading" | "weakening" | "lagging" | "improving";

interface RRGRow {
  ticker: string;
  sector_label: string;
  snapshot_date: string;
  rs_ratio: number;
  rs_momentum: number;
  quadrant: Quadrant;
}

interface TrailRow {
  ticker: string;
  sector_label: string;
  snapshot_date: string;
  rs_ratio: number;
  rs_momentum: number;
}

const QUADRANT_COLOR: Record<Quadrant, string> = {
  leading: chartColors.green,
  weakening: chartColors.amber,
  lagging: chartColors.red,
  improving: chartColors.cyan,
};

function useRRG() {
  return useQuery({
    queryKey: ["mm-rrg"],
    queryFn: async () => {
      const [current, trails] = await Promise.all([
        supabase.from("rrg_sectors_v").select("*"),
        supabase.from("rrg_sectors_trail_v").select("*").order("snapshot_date"),
      ]);
      if (current.error) throw current.error;
      if (trails.error) throw trails.error;
      return {
        current: (current.data ?? []) as RRGRow[],
        trails: (trails.data ?? []) as TrailRow[],
      };
    },
    enabled: isSupabaseConfigured,
  });
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const d: RRGRow = payload[0].payload;
  return (
    <div className="bg-bg-card border border-border rounded px-3 py-2 font-mono text-2xs">
      <div className="text-text-primary font-bold text-xs">{d.ticker}</div>
      <div className="text-text-secondary mb-1">{d.sector_label}</div>
      <div className="space-y-0.5">
        <div className="text-text-dim">RS Ratio: <span className="text-text-primary tabular-nums">{num(d.rs_ratio, 2)}</span></div>
        <div className="text-text-dim">RS Momentum: <span className="text-text-primary tabular-nums">{num(d.rs_momentum, 2)}</span></div>
        <div className="text-text-dim">Quadrant: <span className="capitalize font-semibold" style={{ color: QUADRANT_COLOR[d.quadrant] }}>{d.quadrant}</span></div>
      </div>
    </div>
  );
}

function makeCurrentDot(isMobile: boolean) {
  return function CurrentDot(props: any) {
    const { cx, cy, payload } = props;
    const color = QUADRANT_COLOR[payload.quadrant as Quadrant] || chartColors.textSecondary;
    return (
      <g key={`g-${payload.ticker}`}>
        <circle cx={cx} cy={cy} r={7} fill={color} stroke={chartColors.bg} strokeWidth={1.5} />
        {!isMobile && (
          <text x={cx + 10} y={cy + 4} fontSize={10} fontFamily="JetBrains Mono, monospace" fill={chartColors.textPrimary} fontWeight={600}>
            {payload.ticker}
          </text>
        )}
      </g>
    );
  };
}

function renderTrailDot(props: any) {
  const { cx, cy } = props;
  return <circle cx={cx} cy={cy} r={2} fill={chartColors.textDim} opacity={0.35} />;
}

// RRG indices are centered at 100. A fixed domain is immune to non-finite
// data (the cause of the "34599999999999" tick garbage) and keeps the
// x=100 / y=100 quadrant guides stable frame-to-frame.
// Upper bound 120 (not 115) so the most-extreme sector — momentum runs to
// ~115.3 in the live data — is never clipped/pinned to the top edge.
const RRG_DOMAIN: [number, number] = [90, 120];
const RRG_TICKS = [90, 95, 100, 105, 110, 115, 120];
const RRG_TICKS_MOBILE = [90, 100, 110];

const isFiniteRow = (d: { rs_ratio: number; rs_momentum: number }) =>
  Number.isFinite(Number(d.rs_ratio)) && Number.isFinite(Number(d.rs_momentum));

export default function RRGScatter() {
  const { data, isLoading } = useRRG();
  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <div className="terminal-card p-6">
        <div className="font-mono text-xs text-text-dim">Loading RRG…</div>
      </div>
    );
  }
  if (!data || data.current.length === 0) return null;

  const currentPts = data.current.filter(isFiniteRow);
  const trailPts = data.trails.filter(isFiniteRow);
  const ticks = isMobile ? RRG_TICKS_MOBILE : RRG_TICKS;
  const tickStyle = isMobile ? { ...axisTickStyle, fontSize: 9 } : axisTickStyle;

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">◎</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            RRG · Sector Rotation
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">
          x = RS Ratio · y = RS Momentum · centered at 100
        </span>
      </div>

      <div className="flex flex-wrap gap-3 mb-2 font-mono text-2xs">
        {(["leading", "weakening", "lagging", "improving"] as const).map((q) => (
          <span key={q} className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: QUADRANT_COLOR[q] }} />
            <span className="text-text-secondary capitalize">{q}</span>
          </span>
        ))}
      </div>

      <div className="h-72 sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={isMobile ? { top: 12, right: 12, bottom: 24, left: 8 } : { top: 20, right: 30, bottom: 30, left: 30 }}>
            <ReferenceArea x1={100} x2={RRG_DOMAIN[1]} y1={100} y2={RRG_DOMAIN[1]} fill={QUADRANT_COLOR.leading} fillOpacity={0.06} />
            <ReferenceArea x1={100} x2={RRG_DOMAIN[1]} y1={RRG_DOMAIN[0]} y2={100} fill={QUADRANT_COLOR.weakening} fillOpacity={0.06} />
            <ReferenceArea x1={RRG_DOMAIN[0]} x2={100} y1={RRG_DOMAIN[0]} y2={100} fill={QUADRANT_COLOR.lagging} fillOpacity={0.06} />
            <ReferenceArea x1={RRG_DOMAIN[0]} x2={100} y1={100} y2={RRG_DOMAIN[1]} fill={QUADRANT_COLOR.improving} fillOpacity={0.06} />

            <ReferenceLine x={100} stroke={referenceLineStroke} strokeWidth={1} />
            <ReferenceLine y={100} stroke={referenceLineStroke} strokeWidth={1} />

            <XAxis
              type="number"
              dataKey="rs_ratio"
              domain={RRG_DOMAIN}
              ticks={ticks}
              allowDecimals={false}
              allowDataOverflow
              tickFormatter={axisTick(0)}
              tick={tickStyle}
              stroke={axisStroke}
            />
            <YAxis
              type="number"
              dataKey="rs_momentum"
              domain={RRG_DOMAIN}
              ticks={ticks}
              allowDecimals={false}
              allowDataOverflow
              tickFormatter={axisTick(0)}
              tick={tickStyle}
              stroke={axisStroke}
            />

            <Scatter name="trail" data={trailPts} shape={renderTrailDot} />
            <Scatter name="current" data={currentPts} shape={makeCurrentDot(isMobile)} />

            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

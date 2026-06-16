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

function quadrantOf(r: number, m: number): Quadrant {
  return r >= 100 ? (m >= 100 ? "leading" : "weakening") : m >= 100 ? "improving" : "lagging";
}

// One point shape: the live position is a big quadrant-colored dot (+ ticker
// label on desktop); each historical tail position is a small fading dot.
function makeRRGDot(isMobile: boolean, color: string) {
  return function RRGDot(props: any) {
    const { cx, cy, payload } = props;
    if (payload?.isCurrent) {
      // Fan each label OUTWARD from the 100/100 crosshair (by the sign of its
      // ratio/momentum) so the central cluster's labels stop overlapping.
      const off = isMobile ? 7 : 10;
      const right = payload.rs_ratio >= 100;
      const top = payload.rs_momentum >= 100;
      return (
        <g key={`c-${payload.ticker}`}>
          <circle cx={cx} cy={cy} r={14} fill="transparent" />
          <circle cx={cx} cy={cy} r={6} fill={color} stroke={chartColors.bg} strokeWidth={2} />
          <text
            x={cx + (right ? off : -off)}
            y={cy + (top ? -off : off) + 3}
            textAnchor={right ? "start" : "end"}
            fontSize={isMobile ? 8 : 10}
            fontFamily="JetBrains Mono, monospace"
            fill={chartColors.textPrimary}
            fontWeight={600}
          >
            {payload.ticker}
          </text>
        </g>
      );
    }
    // The trail now reads as the connecting comet line alone; the per-point
    // "shadow dots" were pure noise. Keep only a faint hollow ring at the
    // oldest point so the path has a visible start. Every point still anchors
    // the line geometry and its tooltip — no data lost.
    if (payload?.isStart) {
      return <circle key={`s-${payload.ticker}`} cx={cx} cy={cy} r={2} fill="none" stroke={color} strokeOpacity={0.5} />;
    }
    return <g key={`t-${payload?.ticker}-${payload?.idx}`} />;
  };
}

const TAIL_LEN = 5;

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

  // group trail rows by ticker (query already orders by snapshot_date asc)
  const trailByTicker = new Map<string, TrailRow[]>();
  for (const t of trailPts) {
    const arr = trailByTicker.get(t.ticker);
    if (arr) arr.push(t);
    else trailByTicker.set(t.ticker, [t]);
  }

  // one short tail series per sector: last TAIL_LEN history points + the live
  // point, oldest -> newest so the connecting line ends at the live dot.
  const sectorTails = currentPts.map((cur) => {
    const color = QUADRANT_COLOR[cur.quadrant] || chartColors.textSecondary;
    const hist = (trailByTicker.get(cur.ticker) ?? []).slice(-TAIL_LEN);
    const n = hist.length;
    const points = hist.map((t, i) => {
      const r = Number(t.rs_ratio);
      const m = Number(t.rs_momentum);
      return {
        ticker: cur.ticker, sector_label: cur.sector_label,
        rs_ratio: r, rs_momentum: m, quadrant: quadrantOf(r, m),
        isCurrent: false, isStart: i === 0, idx: i,
      };
    });
    points.push({
      ticker: cur.ticker, sector_label: cur.sector_label,
      rs_ratio: Number(cur.rs_ratio), rs_momentum: Number(cur.rs_momentum),
      quadrant: cur.quadrant, isCurrent: true, isStart: false, idx: n,
    });
    return { ticker: cur.ticker, color, points };
  });

  // Symmetric domain centered on 100 (RRG is conventionally a square around the
  // 100/100 crosshair), auto-fit to cover every shown point + padding. Immune
  // to non-finite data and keeps 100 dead-center each day.
  let dev = 4;
  for (const s of sectorTails) {
    for (const p of s.points) {
      dev = Math.max(dev, Math.abs(p.rs_ratio - 100), Math.abs(p.rs_momentum - 100));
    }
  }
  const half = Math.max(5, Math.ceil(dev * 1.08));
  const lo = 100 - half;
  const hi = 100 + half;
  const desktopTicks: number[] = [];
  for (let t = Math.ceil(lo / 5) * 5; t <= hi; t += 5) desktopTicks.push(t);
  const mobileTicks: number[] = [];
  for (let t = Math.ceil(lo / 10) * 10; t <= hi; t += 10) mobileTicks.push(t);
  const ticks = isMobile ? mobileTicks : desktopTicks;
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
          <ScatterChart margin={isMobile ? { top: 12, right: 12, bottom: 24, left: 22 } : { top: 20, right: 30, bottom: 30, left: 30 }}>
            <ReferenceArea x1={100} x2={hi} y1={100} y2={hi} fill={QUADRANT_COLOR.leading} fillOpacity={0.06} />
            <ReferenceArea x1={100} x2={hi} y1={lo} y2={100} fill={QUADRANT_COLOR.weakening} fillOpacity={0.06} />
            <ReferenceArea x1={lo} x2={100} y1={lo} y2={100} fill={QUADRANT_COLOR.lagging} fillOpacity={0.06} />
            <ReferenceArea x1={lo} x2={100} y1={100} y2={hi} fill={QUADRANT_COLOR.improving} fillOpacity={0.06} />

            <ReferenceLine x={100} stroke={referenceLineStroke} strokeWidth={1} />
            <ReferenceLine y={100} stroke={referenceLineStroke} strokeWidth={1} />

            <XAxis
              type="number"
              dataKey="rs_ratio"
              domain={[lo, hi]}
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
              domain={[lo, hi]}
              ticks={ticks}
              allowDecimals={false}
              allowDataOverflow
              tickFormatter={axisTick(0)}
              tick={tickStyle}
              stroke={axisStroke}
            />

            {sectorTails.map((s) => (
              <Scatter
                key={s.ticker}
                data={s.points}
                line={{ stroke: s.color, strokeWidth: 1.5, strokeOpacity: 0.5 }}
                shape={makeRRGDot(isMobile, s.color)}
                isAnimationActive={false}
              />
            ))}

            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

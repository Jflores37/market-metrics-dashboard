import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface SignalCounts {
  hawkish: number;
  dovish: number;
  neutral: number;
  tightening: number;
}

const SIGNAL_HEX = {
  hawkish: "#f85149",
  neutral: "#8b949e",
  dovish: "#3fb950",
  tightening: "#d29922",
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number; color: string } }>;
  total: number;
}

function CustomTooltip({ active, payload, total }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0].payload;
  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="bg-bg-card border border-border rounded px-3 py-2 font-mono text-xs shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="inline-block w-2 h-2 rounded-sm"
          style={{ backgroundColor: item.color }}
        />
        <span className="text-text-primary font-semibold uppercase tracking-wider text-2xs">
          {item.name}
        </span>
      </div>
      <div className="text-text-secondary tabular-nums">
        <span className="text-text-primary font-semibold">{item.value}</span>
        <span className="text-text-dim mx-1.5">·</span>
        <span>{pct}%</span>
      </div>
    </div>
  );
}

const dominantClass = (label: string) => {
  const l = (label || "").toLowerCase();
  if (l.includes("hawkish")) return "text-accent-red";
  if (l.includes("dovish")) return "text-accent-green";
  if (l.includes("tightening")) return "text-accent-yellow";
  return "text-text-secondary";
};

export default function SignalDonut({
  counts,
  dominantLabel,
  size = 180,
}: {
  counts: SignalCounts;
  dominantLabel: string;
  size?: number;
}) {
  const data = [
    { name: "Hawkish", value: counts.hawkish || 0, color: SIGNAL_HEX.hawkish },
    { name: "Neutral", value: counts.neutral || 0, color: SIGNAL_HEX.neutral },
    { name: "Dovish", value: counts.dovish || 0, color: SIGNAL_HEX.dovish },
    { name: "Tightening", value: counts.tightening || 0, color: SIGNAL_HEX.tightening },
  ].filter((d) => d.value > 0);

  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div
        className="font-mono text-2xs text-text-dim flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        no data
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.34}
            outerRadius={size * 0.48}
            paddingAngle={2}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            stroke="#0a0e14"
            strokeWidth={1.5}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={<CustomTooltip total={total} />}
            cursor={false}
            wrapperStyle={{ outline: "none" }}
          />
        </PieChart>
      </ResponsiveContainer>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className={`font-mono text-xs font-semibold text-center px-2 leading-tight ${dominantClass(dominantLabel)}`}>
          {dominantLabel}
        </div>
      </div>
    </div>
  );
}

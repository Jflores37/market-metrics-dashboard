type Signal = "hawkish" | "dovish" | "neutral" | "tightening";

interface SparkPoint {
  d: string;
  v: number | string | null;
}

export const signalStroke: Record<Signal, string> = {
  hawkish: "#f85149",
  dovish: "#3fb950",
  neutral: "#8b949e",
  tightening: "#d29922",
};

export default function Sparkline({
  points,
  signal,
  width = 100,
  height = 28,
}: {
  points: SparkPoint[] | null | undefined;
  signal?: Signal | string | null;
  width?: number;
  height?: number;
}) {
  if (!points || points.length < 2) {
    return (
      <div className="text-2xs text-text-dim mono flex items-center h-7">—</div>
    );
  }

  const values = points
    .map((p) => Number(p.v))
    .filter((n) => Number.isFinite(n));
  if (values.length < 2) {
    return (
      <div className="text-2xs text-text-dim mono flex items-center h-7">—</div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 1;

  let path = "";
  values.forEach((v, i) => {
    const x =
      (i / (values.length - 1)) * (width - padding * 2) + padding;
    const y =
      height - padding - ((v - min) / range) * (height - padding * 2);
    path += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
  });

  const color =
    signal && signal in signalStroke
      ? signalStroke[signal as Signal]
      : "#8b949e";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-7"
      preserveAspectRatio="none"
    >
      <path d={path.trim()} fill="none" stroke={color} strokeWidth="1.25" />
    </svg>
  );
}

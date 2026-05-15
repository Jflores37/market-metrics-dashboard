interface SignalCounts {
  hawkish: number;
  dovish: number;
  neutral: number;
  tightening: number;
}

const SIGNAL_HEX = {
  hawkish: "#f85149",
  dovish: "#3fb950",
  neutral: "#8b949e",
  tightening: "#d29922",
};

export default function SignalDonut({
  counts,
  size = 160,
  innerRatio = 0.62,
}: {
  counts: SignalCounts;
  size?: number;
  innerRatio?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 4;
  const innerR = outerR * innerRatio;

  const slices = [
    { key: "hawkish", value: counts.hawkish || 0, color: SIGNAL_HEX.hawkish },
    { key: "dovish", value: counts.dovish || 0, color: SIGNAL_HEX.dovish },
    { key: "neutral", value: counts.neutral || 0, color: SIGNAL_HEX.neutral },
    { key: "tightening", value: counts.tightening || 0, color: SIGNAL_HEX.tightening },
  ];
  const total = slices.reduce((s, x) => s + x.value, 0);

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

  let cursor = -Math.PI / 2; // start at 12 o'clock
  const paths = slices
    .filter((s) => s.value > 0)
    .map((slice) => {
      const angle = (slice.value / total) * Math.PI * 2;
      const startAngle = cursor;
      const endAngle = cursor + angle;
      cursor = endAngle;

      const largeArc = angle > Math.PI ? 1 : 0;
      const x1 = cx + outerR * Math.cos(startAngle);
      const y1 = cy + outerR * Math.sin(startAngle);
      const x2 = cx + outerR * Math.cos(endAngle);
      const y2 = cy + outerR * Math.sin(endAngle);
      const x3 = cx + innerR * Math.cos(endAngle);
      const y3 = cy + innerR * Math.sin(endAngle);
      const x4 = cx + innerR * Math.cos(startAngle);
      const y4 = cy + innerR * Math.sin(startAngle);

      const d = [
        `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
        `A ${outerR.toFixed(2)} ${outerR.toFixed(2)} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
        `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
        `A ${innerR.toFixed(2)} ${innerR.toFixed(2)} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
        "Z",
      ].join(" ");

      return <path key={slice.key} d={d} fill={slice.color} />;
    });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths}
      <text
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        fill="#e6edf3"
        fontFamily="JetBrains Mono, monospace"
        fontSize="26"
        fontWeight="700"
      >
        {total}
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        fill="#6e7681"
        fontFamily="JetBrains Mono, monospace"
        fontSize="9"
        letterSpacing="0.1em"
      >
        SIGNALS
      </text>
    </svg>
  );
}

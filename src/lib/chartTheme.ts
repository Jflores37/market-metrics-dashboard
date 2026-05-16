/**
 * Centralized Recharts / SVG chart palette and config.
 * Exact HSL values mirrored from the reference repo's
 * assets/macro_terminal.css :root (and our tailwind.config.ts) so the
 * chart layer renders in lockstep with the terminal palette rather than
 * the stale approximate hex it used before Phase 1.
 */

export const chartColors = {
  bg: "hsl(220 20% 4%)",          // --background
  card: "hsl(220 20% 6%)",        // --card
  panel: "hsl(220 20% 7%)",       // --term-surface
  surface2: "hsl(220 20% 5%)",    // --term-surface2
  border: "hsl(220 15% 14%)",     // --term-border
  borderSubtle: "hsl(220 15% 12%)",
  textPrimary: "hsl(142 70% 70%)",   // --foreground
  textSecondary: "hsl(220 10% 50%)", // --muted-foreground
  textDim: "hsl(220 10% 40%)",       // --term-dim
  green: "hsl(142 70% 55%)",      // --term-green
  red: "hsl(0 72% 55%)",          // --term-red
  amber: "hsl(45 90% 55%)",       // --term-amber
  cyan: "hsl(185 70% 55%)",       // --term-cyan
  yellow: "#d29922",              // non-terminal accent (kept as-is)
} as const;

export const signalStroke = {
  hawkish: chartColors.red,
  dovish: chartColors.green,
  neutral: chartColors.textSecondary,
  tightening: chartColors.amber,
} as const;

export type SignalKey = keyof typeof signalStroke;

/** Recharts <Tooltip> contentStyle — dark card, mono font, sharp 2px corners */
export const tooltipContentStyle = {
  backgroundColor: chartColors.card,
  border: `1px solid ${chartColors.border}`,
  fontSize: 10,
  fontFamily: "JetBrains Mono, monospace",
  padding: "4px 6px",
  borderRadius: 2,
  color: chartColors.textPrimary,
};

export const tooltipLabelStyle = { color: chartColors.textSecondary };
export const tooltipItemStyle = { color: chartColors.textPrimary };
export const tooltipCursor = { stroke: chartColors.border };
export const tooltipCursorFill = { fill: "hsl(220 15% 14% / 0.3)" };

/** Recharts <XAxis>/<YAxis> tick + stroke defaults */
export const axisTickStyle = {
  fontSize: 10,
  fontFamily: "JetBrains Mono, monospace",
  fill: chartColors.textDim,
};
export const axisStroke = chartColors.border;

/** Recharts <ReferenceLine>/<CartesianGrid> defaults */
export const referenceLineStroke = chartColors.border;
export const gridStroke = chartColors.border;

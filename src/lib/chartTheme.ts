/**
 * Centralized Recharts / SVG chart palette and config.
 * All colors match the Tailwind tokens defined in tailwind.config.ts
 * so the chart layer stays in lockstep with the rest of the UI.
 */

export const chartColors = {
  bg: "#0a0d12",          // bg.DEFAULT
  card: "#0e1218",        // bg.card
  panel: "#10141c",       // bg.panel
  surface2: "#0c0f15",
  border: "#1f242f",      // border.DEFAULT
  borderSubtle: "#1a1f29",
  textPrimary: "#7ee3a4", // text.primary
  textSecondary: "#7a8092",
  textDim: "#5e6473",
  green: "#3fcf6b",
  red: "#e04444",
  amber: "#f0b424",
  cyan: "#34c5d6",
  yellow: "#d29922",
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
export const tooltipCursorFill = { fill: "rgba(48,54,61,0.3)" };

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

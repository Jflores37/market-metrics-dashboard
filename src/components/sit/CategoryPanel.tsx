import { num } from "@/lib/format";

export type BadgeTone = "green" | "red" | "yellow" | "gray";

export interface DetailRow {
  label: string;
  value: string;
  badge?: string | null;
  badgeTone?: BadgeTone;
  /** Optional override: defaults to badgeTone */
  dotTone?: BadgeTone;
}

export const TONE_BG: Record<BadgeTone, string> = {
  green: "bg-accent-green/15 text-accent-green",
  red: "bg-accent-red/15 text-accent-red",
  yellow: "bg-accent-yellow/15 text-accent-yellow",
  gray: "bg-text-dim/15 text-text-secondary",
};

export const TONE_DOT: Record<BadgeTone, string> = {
  green: "bg-accent-green",
  red: "bg-accent-red",
  yellow: "bg-accent-yellow",
  gray: "bg-text-dim",
};

export const scoreColor = (s: number | null) =>
  s == null
    ? "text-text-dim"
    : s >= 80
    ? "text-accent-green"
    : s >= 60
    ? "text-accent-yellow"
    : "text-accent-red";

export const scoreBg = (s: number | null) =>
  s == null
    ? "bg-text-dim"
    : s >= 80
    ? "bg-accent-green"
    : s >= 60
    ? "bg-accent-yellow"
    : "bg-accent-red";

export default function CategoryPanel({
  icon,
  name,
  score,
  rows,
}: {
  icon: string;
  name: string;
  score: number | null;
  rows: DetailRow[];
}) {
  const v = score == null ? 0 : Number(score);
  return (
    <div className="terminal-card p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">{icon}</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            {name}
          </span>
        </div>
        <span
          className={`font-mono text-2xl font-bold tabular-nums ${scoreColor(score)}`}
        >
          {num(score, 0)}
        </span>
      </div>

      {/* Status bar — thin colored progress bar under header, width = score% */}
      <div className="h-0.5 bg-bg-panel rounded-full overflow-hidden mb-4">
        <div
          className={`h-full ${scoreBg(score)} transition-all`}
          style={{ width: `${Math.max(0, Math.min(100, v))}%` }}
        />
      </div>

      {/* Detail rows — true 3-column grid: [dot+label] | [value] | [badge] */}
      <div className="space-y-2.5">
        {rows.map((row, i) => {
          const dotTone = row.dotTone ?? row.badgeTone ?? "gray";
          return (
            <div
              key={i}
              className="grid grid-cols-[auto_1fr_auto] gap-3 items-center text-2xs"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`inline-block w-1 h-1 rounded-full shrink-0 ${TONE_DOT[dotTone]}`}
                />
                <span className="text-text-dim mono whitespace-nowrap">
                  {row.label}
                </span>
              </div>
              <span className="font-mono text-text-primary tabular-nums whitespace-nowrap text-right">
                {row.value}
              </span>
              <div className="text-right shrink-0">
                {row.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-2xs mono font-semibold ${TONE_BG[row.badgeTone ?? "gray"]}`}
                  >
                    {row.badge}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

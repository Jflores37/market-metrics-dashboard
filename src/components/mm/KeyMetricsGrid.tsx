import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num } from "@/lib/format";
import { finvizScreenerUrl } from "@/lib/finviz";
import { useIsMobile } from "@/lib/useIsMobile";

interface KeyMetricRow {
  universe_id: string;
  universe_order: number;
  metric_id: string;
  metric_label: string;
  display_order: number;
  above_count: number;
  below_count: number | null;
  pct: number | null;
}

// Named type alias — keeps the Map generic on a single line below so
// mobile paste doesn't strip the `<` after a newline.
type MetricEntry = {
  label: string;
  order: number;
  cells: Map<string, KeyMetricRow>;
};

const UNIVERSES = ["NQ100", "SPY500", "DJIA", "RUS2000", "$1B+"];

// Universe group banner shown above the column headers
const UNIVERSE_GROUPS: Array<{ label: string; span: number }> = [
  { label: "Major Indexes", span: 3 }, // NQ100 · SPY500 · DJIA
  { label: "Broad",         span: 1 }, // RUS2000
  { label: "Liquid",        span: 1 }, // $1B+
];

function pctTextColor(pct: number | null): string {
  if (pct == null) return "text-text-dim";
  if (pct >= 70) return "text-accent-green";
  if (pct >= 50) return "text-accent-blue";
  if (pct >= 30) return "text-accent-yellow";
  return "text-accent-red";
}

function pctBarColor(pct: number | null): string {
  if (pct == null) return "bg-text-dim";
  if (pct >= 70) return "bg-accent-green";
  if (pct >= 50) return "bg-accent-blue";
  if (pct >= 30) return "bg-accent-yellow";
  return "bg-accent-red";
}

function useKeyMetrics() {
  return useQuery({
    queryKey: ["key-metrics-grid"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("key_metrics_v")
        .select("*")
        .order("display_order")
        .order("universe_order");
      if (error) throw error;
      return (data ?? []) as KeyMetricRow[];
    },
    enabled: isSupabaseConfigured,
  });
}

function MetricCell({ row, isStocks }: { row: KeyMetricRow | undefined; isStocks: boolean }) {
  if (!row) {
    return <td className="py-1.5 px-2 text-text-dim text-2xs text-right">—</td>;
  }
  if (isStocks) {
    return (
      <td className="py-1.5 px-2 text-right">
        <span className="font-mono text-sm text-text-primary tabular-nums">{row.above_count}</span>
      </td>
    );
  }
  const aboveUrl = finvizScreenerUrl(row.universe_id, row.metric_id, "above");
  const belowUrl = finvizScreenerUrl(row.universe_id, row.metric_id, "below");
  const linkCls = "hover:text-accent-cyan hover:underline transition-colors";
  return (
    <td className="py-1.5 px-2 text-right align-top">
      <div className="space-y-0.5">
        <div className={`font-mono text-xs tabular-nums ${pctTextColor(row.pct)}`}>
          {row.pct != null ? `${num(row.pct, 0)}%` : "—"}
        </div>
        <div className="font-mono text-2xs text-text-dim tabular-nums">
          {aboveUrl ? (
            <a href={aboveUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
              {row.above_count}
            </a>
          ) : (
            row.above_count
          )}
          {"/"}
          {belowUrl && (row.below_count ?? 0) > 0 ? (
            <a href={belowUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
              {row.below_count ?? 0}
            </a>
          ) : (
            row.below_count ?? 0
          )}
        </div>
        <div className="h-0.5 bg-bg-panel rounded-full overflow-hidden">
          <div
            className={`h-full ${pctBarColor(row.pct)}`}
            style={{ width: `${Math.max(0, Math.min(100, row.pct ?? 0))}%` }}
          />
        </div>
      </div>
    </td>
  );
}

export default function KeyMetricsGrid() {
  const { data, isLoading } = useKeyMetrics();
  const isMobile = useIsMobile();
  // The right-edge fade is a "more columns →" cue. Hide it once scrolled to the
  // end so it never sits on top of the last universe's values (lose nothing).
  const [atEnd, setAtEnd] = useState(false);

  if (isLoading) {
    return (
      <div className="terminal-card p-6">
        <div className="font-mono text-xs text-text-dim">Loading key metrics…</div>
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="terminal-card p-6">
        <div className="font-mono text-xs text-text-dim">No key metrics data</div>
      </div>
    );
  }

  // Pivot: one row per metric, with a cell map keyed by universe
  const metricMap = new Map<string, MetricEntry>();
  for (const row of data) {
    if (!metricMap.has(row.metric_id)) {
      metricMap.set(row.metric_id, {
        label: row.metric_label,
        order: row.display_order,
        cells: new Map(),
      });
    }
    metricMap.get(row.metric_id)!.cells.set(row.universe_id, row);
  }
  const metrics = Array.from(metricMap.entries())
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => a.order - b.order);

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">⊞</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            Key Metrics · {UNIVERSES.length} universes × {metrics.length} rows
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">
          % bullish · breakdown · bar
        </span>
      </div>

      {isMobile ? (
        <div className="space-y-2">
          {metrics.map((m) => {
            const isStocks = m.id === "stocks";
            return (
              <div key={m.id} className="terminal-card p-2.5">
                <div className="font-mono text-xs text-text-secondary mb-1.5">{m.label}</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {UNIVERSES.map((u) => {
                    const row = m.cells.get(u);
                    return (
                      <div key={u} className="bg-bg-panel rounded-[2px] px-1 py-1 text-center">
                        <div className="font-mono text-2xs text-text-dim uppercase tracking-wider truncate">{u}</div>
                        {!row ? (
                          <div className="font-mono text-2xs text-text-dim">—</div>
                        ) : isStocks ? (
                          <div className="font-mono text-sm text-text-primary tabular-nums">{row.above_count}</div>
                        ) : (
                          <>
                            <div className={`font-mono text-xs tabular-nums ${pctTextColor(row.pct)}`}>
                              {row.pct != null ? `${num(row.pct, 0)}%` : "—"}
                            </div>
                            <div className="font-mono text-2xs text-text-dim tabular-nums">
                              {row.above_count}/{row.below_count ?? 0}
                            </div>
                            <div className="h-0.5 mt-0.5 bg-bg-card rounded-full overflow-hidden">
                              <div className={`h-full ${pctBarColor(row.pct)}`} style={{ width: `${Math.max(0, Math.min(100, row.pct ?? 0))}%` }} />
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
      <div className="relative">
        <div
          className="overflow-x-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
          }}
        >
        <table className="w-full font-mono min-w-[680px] sticky-col-1 tbl-readable">
          <thead className="border-b border-border-subtle">
            <tr className="border-b border-border-subtle/60">
              <th className="py-1 px-2" />
              {UNIVERSE_GROUPS.map((g, i) => (
                <th
                  key={i}
                  colSpan={g.span}
                  className="py-1 px-2 text-center text-2xs text-accent-cyan uppercase tracking-widest font-semibold"
                >
                  {g.label}
                </th>
              ))}
            </tr>
            <tr>
              <th className="py-2 px-2 text-left text-2xs text-text-dim uppercase tracking-wider">
                Metric
              </th>
              {UNIVERSES.map((u) => (
                <th
                  key={u}
                  className="py-2 px-2 min-w-[64px] text-right text-2xs text-text-secondary uppercase tracking-wider font-semibold"
                >
                  {u}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => {
              const isStocks = m.id === "stocks";
              return (
                <tr key={m.id} className="border-b border-border-subtle/40 hover:bg-bg-hover/50">
                  <td className="py-1.5 px-2 text-xs text-text-secondary mono whitespace-nowrap">
                    {m.label}
                  </td>
                  {UNIVERSES.map((u) => (
                    <MetricCell key={u} row={m.cells.get(u)} isStocks={isStocks} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <div className={`sm:hidden pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-bg-card to-transparent transition-opacity duration-200 ${atEnd ? "opacity-0" : "opacity-100"}`} />
      </div>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num } from "@/lib/format";

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

const UNIVERSES = ["NQ100", "SPY500", "DJIA", "RUS2000", "$1B+"];

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
  const total = row.above_count + (row.below_count ?? 0);
  return (
    <td className="py-1.5 px-2 text-right align-top">
      <div className="space-y-0.5">
        <div className={`font-mono text-xs tabular-nums ${pctTextColor(row.pct)}`}>
          {row.pct != null ? `${num(row.pct, 0)}%` : "—"}
        </div>
        <div className="font-mono text-2xs text-text-dim tabular-nums">
          {row.above_count}/{total}
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
  const metricMap = new Map
    string,
    { label: string; order: number; cells: Map<string, KeyMetricRow> }
  >();
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
          <span className="text-accent-orange text-sm">⊞</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            Key Metrics · 5 universes × 19 rows
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">
          % bullish · breakdown · status bar
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full font-mono min-w-[680px]">
          <thead className="border-b border-border-subtle">
            <tr>
              <th className="py-2 px-2 text-left text-2xs text-text-dim uppercase tracking-wider">
                Metric
              </th>
              {UNIVERSES.map((u) => (
                <th
                  key={u}
                  className="py-2 px-2 text-right text-2xs text-text-secondary uppercase tracking-wider font-semibold"
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
    </div>
  );
}

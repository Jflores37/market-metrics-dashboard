import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num } from "@/lib/format";

interface BreadthBarRow {
  universe_id: string;
  universe_order: number;
  metric_id: string;
  metric_label: string;
  display_order: number;
  above_count: number;
  below_count: number;
  pct: number;
}

function useBreadthBars() {
  return useQuery({
    queryKey: ["breadth-bars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("breadth_bars_v")
        .select("*")
        .order("universe_order")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as BreadthBarRow[];
    },
    enabled: isSupabaseConfigured,
  });
}

const barColor = (pct: number) =>
  pct >= 70 ? "bg-accent-green" :
  pct >= 50 ? "bg-accent-blue" :
  pct >= 30 ? "bg-accent-yellow" :
  "bg-accent-red";

const textColor = (pct: number) =>
  pct >= 70 ? "text-accent-green" :
  pct >= 50 ? "text-accent-blue" :
  pct >= 30 ? "text-accent-yellow" :
  "text-accent-red";

function UniverseBreadthCard({ universe, rows }: { universe: string; rows: BreadthBarRow[] }) {
  const total = rows[0] ? (rows[0].above_count + rows[0].below_count) : 0;
  return (
    <div className="terminal-card p-4">
      <div className="font-mono text-2xs uppercase tracking-widest font-semibold mb-3 flex items-center justify-between">
        <span className="text-text-secondary">
          <span className="text-accent-cyan mr-1.5 signal-glow-cyan">▌</span>
          {universe}
        </span>
        <span className="text-text-dim font-normal tabular-nums">
          {total.toLocaleString()} stocks
        </span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const p = Number(r.pct);
          return (
            <div
              key={r.metric_id}
              className="grid grid-cols-[4rem_1fr_3rem] sm:grid-cols-[5.5rem_1fr_3.25rem] gap-1.5 sm:gap-2 items-center text-xs font-mono"
            >
              <div className="text-text-dim text-2xs truncate">{r.metric_label}</div>
              <div className="h-3.5 bg-bg-panel rounded-sm overflow-hidden">
                <div
                  className={`h-full ${barColor(p)} transition-all`}
                  style={{ width: `${Math.max(0, Math.min(100, p))}%` }}
                />
              </div>
              <div className={`text-right tabular-nums ${textColor(p)}`}>
                {num(p, 1)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BreadthBars({
  universes, title, icon,
}: {
  universes: string[];
  title: string;
  icon?: string;
}) {
  const { data } = useBreadthBars();
  if (!data || data.length === 0) return null;

  const grouped: Record<string, BreadthBarRow[]> = {};
  for (const u of universes) grouped[u] = [];
  for (const row of data) {
    if (grouped[row.universe_id]) grouped[row.universe_id].push(row);
  }

  return (
    <div>
      <div className="font-mono text-2xs text-text-dim uppercase tracking-widest mb-2 flex items-baseline gap-2">
        {icon && <span className="text-accent-cyan signal-glow-cyan">{icon}</span>}
        {title}
      </div>
      <div
        className={`grid gap-3 grid-cols-1 ${
          universes.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        {universes.map((u) => (
          <UniverseBreadthCard key={u} universe={u} rows={grouped[u] ?? []} />
        ))}
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { dateLong } from "@/lib/format";

interface FreshnessRow {
  dataset: string;
  label: string;
  latest_date: string | null;
  trading_days_behind: number;
  is_stale: boolean;
  is_critical: boolean;
}

// Surfaces stale critical feeds at the top of every page. The dashboard is a
// trading tool: silently showing days-old data (as happened during the
// fetch-finviz-breadth 429 outage) is a correctness hazard, not a cosmetic
// one. Renders nothing when every critical feed is current.
export default function FreshnessBanner() {
  const { data } = useQuery({
    queryKey: ["data-freshness"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_freshness_v")
        .select("dataset,label,latest_date,trading_days_behind,is_stale,is_critical")
        .eq("is_critical", true)
        .eq("is_stale", true);
      if (error) throw error;
      return (data ?? []) as FreshnessRow[];
    },
    enabled: isSupabaseConfigured,
    // Cron-driven; checking freshness a couple times an hour is plenty.
    staleTime: 15 * 60 * 1000,
  });

  if (!data || data.length === 0) return null;

  const sorted = [...data].sort((a, b) => b.trading_days_behind - a.trading_days_behind);

  return (
    <div
      role="alert"
      className="border-b border-accent-amber/40 bg-accent-amber/10 px-4 md:px-6 py-2"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 leading-snug font-mono text-xs sm:text-2xs">
        <span className="text-accent-amber font-semibold uppercase tracking-widest">
          ⚠ Stale data
        </span>
        {sorted.map((r) => (
          <span key={r.dataset} className="text-text-secondary">
            {r.label}
            <span className="text-text-dim">
              {" "}
              ({r.trading_days_behind}d behind · last {dateLong(r.latest_date)})
            </span>
          </span>
        ))}
        <span className="text-text-dim">
          — feed delayed or a backend job failed; figures below may be out of date.
        </span>
      </div>
    </div>
  );
}

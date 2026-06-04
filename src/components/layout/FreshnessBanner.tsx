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

interface FailureRow {
  job_name: string;
  status: string;
  started_at: string;
}

// Friendly names for the cron jobs that feed the dashboard.
const JOB_LABEL: Record<string, string> = {
  "fetch-finviz-breadth": "Universe / breadth",
  "fetch-finviz-scanners": "Super Scanners",
  "fetch-finviz-sectors": "Sector SPDRs",
  "fetch-intraday-quotes-movers": "Intraday movers",
  "fetch-index-etf-quotes": "Index trend",
  "fetch-vix-yfinance": "VIX",
  "fetch-stockbee-breadth": "StockBee breadth",
  "fetch-stockbee-momentum50": "StockBee Momentum50",
  "fetch-fred": "Macro (FRED)",
  "fetch-cnbc-premarket": "CNBC premarket",
  "compute-should-i-trade": "Should-I-Trade",
};
const jobLabel = (j: string): string =>
  JOB_LABEL[j] ?? j.replace(/^fetch-/, "").replace(/[-:]/g, " ");

// Surfaces broken/stale critical feeds at the top of every page. The dashboard is
// a trading tool: silently showing days-old data, or a backend job that died, is a
// correctness hazard, not a cosmetic one. A failed/stuck cron job shows in RED
// immediately (pipeline_failures_v); merely-late data shows in AMBER once it's
// actually behind (data_freshness_v). Renders nothing when everything is healthy.
export default function FreshnessBanner() {
  const { data: stale } = useQuery({
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
    staleTime: 15 * 60 * 1000,
  });

  const { data: failures } = useQuery({
    queryKey: ["pipeline-failures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pipeline_failures_v")
        .select("job_name,status,started_at");
      if (error) throw error;
      return (data ?? []) as FailureRow[];
    },
    enabled: isSupabaseConfigured,
    // A dead feed should scream fast — re-check a few times an hour.
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const hasFail = !!failures && failures.length > 0;
  const hasStale = !!stale && stale.length > 0;
  if (!hasFail && !hasStale) return null;

  const sortedStale = hasStale
    ? [...stale].sort((a, b) => b.trading_days_behind - a.trading_days_behind)
    : [];

  return (
    <>
      {hasFail && (
        <div role="alert" className="border-b border-accent-red/50 bg-accent-red/10 px-4 md:px-6 py-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 leading-snug font-mono text-xs sm:text-2xs">
            <span className="text-accent-red font-semibold uppercase tracking-widest signal-glow-red">
              ⛔ Pipeline failure
            </span>
            {failures!.map((f) => (
              <span key={f.job_name} className="text-text-secondary">
                {jobLabel(f.job_name)}
                <span className="text-text-dim"> ({f.status === "running" ? "stuck" : "failed"})</span>
              </span>
            ))}
            <span className="text-text-dim">
              — a backend feed broke; numbers below may be stale or missing.
            </span>
          </div>
        </div>
      )}
      {hasStale && (
        <div role="alert" className="border-b border-accent-amber/40 bg-accent-amber/10 px-4 md:px-6 py-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 leading-snug font-mono text-xs sm:text-2xs">
            <span className="text-accent-amber font-semibold uppercase tracking-widest">
              ⚠ Stale data
            </span>
            {sortedStale.map((r) => (
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
      )}
    </>
  );
}

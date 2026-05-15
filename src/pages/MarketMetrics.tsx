import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, colorClass } from "@/lib/format";

// Pinned at the top of the Market Metrics tab per spec.
// The full Should I Trade widget lives on its own tab (/should-i-trade)
// and gets built out in a later batch.
function PinnedSITBanner() {
  const { data, isLoading } = useQuery({
    queryKey: ["sit-pinned-swing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("should_i_trade_latest_v")
        .select(
          "snapshot_date, mode, decision, market_quality_score, execution_window_score, narrative_text"
        )
        .eq("mode", "swing")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isSupabaseConfigured,
  });

  if (!isSupabaseConfigured || isLoading || !data) return null;

  const decisionColor =
    data.decision === "YES"
      ? "text-accent-green"
      : data.decision === "CAUTION"
      ? "text-accent-yellow"
      : "text-accent-red";

  return (
    <div className="terminal-card p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
          Should I Trade · swing mode
        </div>
        <div className="font-mono text-2xs text-text-dim">
          as of {data.snapshot_date}
        </div>
      </div>

      <div className="flex items-baseline gap-5 flex-wrap">
        <div className={`font-mono text-3xl font-bold ${decisionColor}`}>
          {data.decision}
        </div>
        <div className="font-mono text-sm text-text-secondary">
          MQS{" "}
          <span className="text-text-primary font-semibold">
            {num(data.market_quality_score, 1)}
          </span>
          {"  ·  "}EWS{" "}
          <span className={colorClass((data.execution_window_score ?? 50) - 50)}>
            {num(data.execution_window_score, 1)}
          </span>
        </div>
      </div>

      {data.narrative_text && (
        <div className="text-xs text-text-secondary leading-relaxed border-t border-border-subtle pt-3 font-mono">
          {data.narrative_text}
        </div>
      )}
    </div>
  );
}

export default function MarketMetrics() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-mono text-xl font-bold tracking-tight">Market Metrics</h1>
        <p className="text-sm text-text-secondary mt-1">
          Universe breadth · sectors · leading industries · stage analysis
        </p>
      </header>

      <PinnedSITBanner />

      <div className="terminal-card p-8 space-y-2">
        <div className="font-mono text-xs text-text-dim uppercase tracking-wider">
          Status
        </div>
        <div className="text-text-secondary">
          The 19 widgets for this tab are being wired up in the next batches.
        </div>
        <div className="text-2xs text-text-dim mono pt-3 leading-relaxed">
          Backend complete: <span className="text-text-secondary">key_metrics_v · sector_etf_latest_v · leading_industries_v · rrg_sectors_v · sp500_landscape_v · stage_analysis_counts_v · watchlist_v · stockbee_breadth_history_v</span>
        </div>
      </div>
    </div>
  );
}

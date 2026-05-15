import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, colorClass } from "@/lib/format";

// Smoke test: pulls today's Should I Trade row to prove Supabase is wired.
// This whole component will get replaced in the next batch by the real tab
// shell + 5-tab dashboard.
function useSmokeTest() {
  return useQuery({
    queryKey: ["smoke-test"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("should_i_trade_latest_v")
        .select(
          "snapshot_date, mode, decision, market_quality_score, execution_window_score"
        )
        .eq("mode", "swing")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isSupabaseConfigured,
  });
}

export default function App() {
  const { data, error, isLoading } = useSmokeTest();

  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <header className="border-b border-border px-6 py-4">
        <div className="flex items-baseline gap-3">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-accent-orange">
            Pulse
          </h1>
          <span className="text-xs text-text-dim mono">
            v0.2 — phase 8 foundation
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h2 className="mb-6 text-lg font-semibold">Backend smoke test</h2>

        {!isSupabaseConfigured && (
          <div className="terminal-card p-4 border-accent-red">
            <div className="font-mono text-sm text-accent-red mb-2">
              ⚠ Supabase not configured
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Set{" "}
              <code className="font-mono text-text-primary">
                VITE_SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="font-mono text-text-primary">
                VITE_SUPABASE_ANON_KEY
              </code>{" "}
              in Vercel → Project Settings → Environment Variables, then redeploy.
            </p>
          </div>
        )}

        {isSupabaseConfigured && isLoading && (
          <div className="terminal-card p-4">
            <div className="font-mono text-sm text-text-secondary">
              Connecting to Supabase…
            </div>
          </div>
        )}

        {isSupabaseConfigured && error && (
          <div className="terminal-card p-4 border-accent-red">
            <div className="font-mono text-sm text-accent-red mb-2">
              ⚠ Query failed
            </div>
            <pre className="text-xs text-text-secondary whitespace-pre-wrap">
              {String((error as Error).message ?? error)}
            </pre>
          </div>
        )}

        {isSupabaseConfigured && data && (
          <div className="terminal-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs text-text-dim uppercase tracking-wider">
                Should I Trade — {data.mode}
              </div>
              <div className="font-mono text-xs text-text-dim">
                as of {data.snapshot_date}
              </div>
            </div>

            <div className="flex items-baseline gap-4">
              <div
                className={`font-mono text-4xl font-bold ${
                  data.decision === "YES"
                    ? "text-accent-green"
                    : data.decision === "CAUTION"
                    ? "text-accent-yellow"
                    : "text-accent-red"
                }`}
              >
                {data.decision}
              </div>
              <div className="font-mono text-sm text-text-secondary">
                MQS{" "}
                <span className="text-text-primary">
                  {num(data.market_quality_score, 1)}
                </span>
                {"  ·  "}EWS{" "}
                <span
                  className={colorClass(
                    (data.execution_window_score ?? 50) - 50
                  )}
                >
                  {num(data.execution_window_score, 1)}
                </span>
              </div>
            </div>

            <div className="border-t border-border-subtle pt-3 font-mono text-xs text-accent-green">
              ✓ Connected to Pulse backend · all 5 tabs ready to wire up
            </div>
          </div>
        )}

        <div className="mt-12 text-xs text-text-dim font-mono">
          Next batches will add the tab bar, routing, and the 5 dashboard tabs.
        </div>
      </main>
    </div>
  );
}

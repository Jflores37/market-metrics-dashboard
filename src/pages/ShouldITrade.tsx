import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, colorClass } from "@/lib/format";

type Mode = "swing" | "day";
type Interp = "healthy" | "moderate" | "weakening" | "risk-off" | "unknown";

interface SITRow {
  snapshot_date: string;
  mode: Mode;
  computed_at: string;
  decision: "YES" | "CAUTION" | "NO";
  market_quality_score: number;
  execution_window_score: number | null;
  vol_score: number | null;
  vol_weight: number | null;
  vol_interpretation: Interp | null;
  trend_score: number | null;
  trend_weight: number | null;
  trend_interpretation: Interp | null;
  breadth_score: number | null;
  breadth_weight: number | null;
  breadth_interpretation: Interp | null;
  momentum_score: number | null;
  momentum_weight: number | null;
  momentum_interpretation: Interp | null;
  macro_score: number | null;
  macro_weight: number | null;
  macro_interpretation: Interp | null;
  exec_breakouts_status: string | null;
  exec_breakouts_detail: string | null;
  exec_leaders_status: string | null;
  exec_leaders_detail: string | null;
  exec_pullbacks_status: string | null;
  exec_pullbacks_detail: string | null;
  exec_followthrough_status: string | null;
  exec_followthrough_detail: string | null;
  narrative_text: string | null;
  suggested_action: string | null;
}

function useShouldITrade(mode: Mode) {
  return useQuery({
    queryKey: ["sit-full", mode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("should_i_trade_latest_v")
        .select("*")
        .eq("mode", mode)
        .maybeSingle();
      if (error) throw error;
      return data as SITRow | null;
    },
    enabled: isSupabaseConfigured,
  });
}

const decisionTextColor = (d: string) =>
  d === "YES" ? "text-accent-green" : d === "CAUTION" ? "text-accent-yellow" : "text-accent-red";

const interpretationLabel = (interp: Interp | null | undefined) => {
  if (!interp) return "—";
  if (interp === "risk-off") return "Risk-off";
  return interp[0].toUpperCase() + interp.slice(1);
};

const interpretationDot = (interp: Interp | null | undefined) => {
  switch (interp) {
    case "healthy": return "bg-accent-green";
    case "moderate": return "bg-accent-blue";
    case "weakening": return "bg-accent-yellow";
    case "risk-off": return "bg-accent-red";
    default: return "bg-text-dim";
  }
};

const factorColorClasses = (status: string | null | undefined) => {
  if (!status) return { dot: "bg-text-dim", text: "text-text-dim" };
  const s = status.toLowerCase();
  if (s === "yes" || s === "strong") return { dot: "bg-accent-green", text: "text-accent-green" };
  if (s === "no" || s === "weak") return { dot: "bg-accent-red", text: "text-accent-red" };
  return { dot: "bg-accent-yellow", text: "text-accent-yellow" };
};

function scoreBarColor(score: number | null | undefined): string {
  if (score == null) return "bg-text-dim";
  if (score >= 80) return "bg-accent-green";
  if (score >= 65) return "bg-accent-blue";
  if (score >= 40) return "bg-accent-yellow";
  return "bg-accent-red";
}

function CategoryRow({
  name, weight, score, interpretation,
}: {
  name: string;
  weight: number | null;
  score: number | null;
  interpretation: Interp | null;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm text-text-primary">{name}</span>
          <span className="text-2xs text-text-dim mono">
            {weight != null ? `${Math.round(Number(weight) * 100)}%` : ""}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-2xs mono uppercase tracking-wider flex items-center gap-1.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${interpretationDot(interpretation)}`} />
            <span className="text-text-secondary">{interpretationLabel(interpretation)}</span>
          </span>
          <span className="font-mono text-sm text-text-primary font-semibold tabular-nums w-10 text-right">
            {num(score, 1)}
          </span>
        </div>
      </div>
      <div className="h-1.5 bg-bg-panel rounded-full overflow-hidden">
        <div
          className={`h-full ${scoreBarColor(score)} transition-all`}
          style={{ width: `${Math.max(0, Math.min(100, Number(score) || 0))}%` }}
        />
      </div>
    </div>
  );
}

function FactorBadge({
  label, status, detail,
}: {
  label: string;
  status: string | null;
  detail: string | null;
}) {
  const { dot, text } = factorColorClasses(status);
  return (
    <div className="terminal-panel rounded px-3 py-2.5 flex flex-col gap-1">
      <div className="text-2xs mono text-text-dim uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className={`font-mono text-sm font-semibold ${text}`}>{status ?? "—"}</span>
      </div>
      {detail && (
        <div className="text-2xs text-text-secondary mono">{detail}</div>
      )}
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex items-center bg-bg-panel rounded-md p-0.5 border border-border-subtle">
      {(["swing", "day"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors rounded ${
            mode === m
              ? "bg-bg-card text-accent-orange"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export default function ShouldITrade() {
  const [mode, setMode] = useState<Mode>("swing");
  const { data, isLoading, error } = useShouldITrade(mode);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-mono text-xl font-bold tracking-tight">Should I Trade</h1>
          <p className="text-sm text-text-secondary mt-1">
            5-factor market quality score · execution window · {mode} mode
          </p>
        </div>
        <ModeToggle mode={mode} onChange={setMode} />
      </header>

      {!isSupabaseConfigured && (
        <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">
          Supabase not configured.
        </div>
      )}

      {isLoading && (
        <div className="terminal-card p-6">
          <div className="font-mono text-xs text-text-dim">Loading…</div>
        </div>
      )}

      {error && (
        <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">
          {String((error as Error).message ?? error)}
        </div>
      )}

      {data && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="terminal-card p-6">
              <div className="font-mono text-2xs text-text-dim uppercase tracking-widest mb-3">
                Decision · {mode} mode
              </div>
              <div className={`font-mono text-5xl font-bold ${decisionTextColor(data.decision)} mb-3`}>
                {data.decision}
              </div>
              {data.suggested_action && (
                <div className="text-sm text-text-secondary mt-2 leading-relaxed">
                  {data.suggested_action}
                </div>
              )}
              <div className="text-2xs text-text-dim mono pt-3 border-t border-border-subtle mt-4">
                as of {data.snapshot_date} · re-computed{" "}
                {new Date(data.computed_at).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            </div>

            <div className="terminal-card p-5 space-y-3">
              <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
                Market Quality Score
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-4xl font-bold text-text-primary">
                  {num(data.market_quality_score, 1)}
                </span>
                <span className="font-mono text-xs text-text-dim">/ 100</span>
              </div>
              <div className="h-2 bg-bg-panel rounded-full overflow-hidden">
                <div
                  className={`h-full ${scoreBarColor(data.market_quality_score)} transition-all`}
                  style={{ width: `${Math.max(0, Math.min(100, Number(data.market_quality_score) || 0))}%` }}
                />
              </div>
            </div>

            <div className="terminal-card p-5 space-y-3">
              <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
                Execution Window Score
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`font-mono text-3xl font-bold ${colorClass((data.execution_window_score ?? 50) - 50)}`}>
                  {num(data.execution_window_score, 1)}
                </span>
                <span className="font-mono text-xs text-text-dim">/ 100</span>
              </div>
              <div className="h-2 bg-bg-panel rounded-full overflow-hidden">
                <div
                  className={`h-full ${scoreBarColor(data.execution_window_score)} transition-all`}
                  style={{ width: `${Math.max(0, Math.min(100, Number(data.execution_window_score) || 0))}%` }}
                />
              </div>
              <div className="text-2xs text-text-dim mono">
                Are conditions right for new entries to work *today*?
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="terminal-card p-5 space-y-4">
              <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
                Five-factor category scores
              </div>
              <CategoryRow name="Volatility" weight={data.vol_weight} score={data.vol_score} interpretation={data.vol_interpretation} />
              <CategoryRow name="Momentum" weight={data.momentum_weight} score={data.momentum_score} interpretation={data.momentum_interpretation} />
              <CategoryRow name="Trend" weight={data.trend_weight} score={data.trend_score} interpretation={data.trend_interpretation} />
              <CategoryRow name="Breadth" weight={data.breadth_weight} score={data.breadth_score} interpretation={data.breadth_interpretation} />
              <CategoryRow name="Macro" weight={data.macro_weight} score={data.macro_score} interpretation={data.macro_interpretation} />
            </div>

            <div className="terminal-card p-5 space-y-3">
              <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
                Execution window — four factor badges
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <FactorBadge label="Breakouts" status={data.exec_breakouts_status} detail={data.exec_breakouts_detail} />
                <FactorBadge label="Leaders" status={data.exec_leaders_status} detail={data.exec_leaders_detail} />
                <FactorBadge label="Pullbacks" status={data.exec_pullbacks_status} detail={data.exec_pullbacks_detail} />
                <FactorBadge label="Follow-thru" status={data.exec_followthrough_status} detail={data.exec_followthrough_detail} />
              </div>
            </div>

            {data.narrative_text && (
              <div className="terminal-card p-5 space-y-2">
                <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
                  Narrative
                </div>
                <div className="text-sm text-text-secondary leading-relaxed font-mono">
                  {data.narrative_text}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

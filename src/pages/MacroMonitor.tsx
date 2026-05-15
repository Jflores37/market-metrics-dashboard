import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { dateLong } from "@/lib/format";
import Sparkline from "@/components/macro/Sparkline";
import SignalDonut from "@/components/macro/SignalDonut";

type Signal = "hawkish" | "dovish" | "neutral" | "tightening";

interface Kpi {
  metric_id: string;
  label: string;
  short: string;
  observation_date: string;
  value_num: number | null;
  display: string;
  prev_value: number | null;
  delta: number | null;
  trend: "up" | "down" | "flat";
  signal: Signal;
  source: string;
  display_order: number;
  sparkline: Array<{ d: string; v: number | string | null }> | null;
}

interface FiscalRow {
  row_id: number;
  label: string;
  fred_id: string;
  observation_date: string | null;
  value: number | null;
  prev_value: number | null;
  display: string;
  trend: "up" | "down" | "flat";
  usd_unit: string;
}

interface SignalBalance {
  counts: { hawkish: number; dovish: number; neutral: number; tightening: number };
  dominant_label: string;
  narrative: string;
  hawkish: number;
  dovish: number;
  neutral: number;
  tightening: number;
  total: number;
}

interface DashboardPayload {
  kpis: Kpi[];
  fiscal: FiscalRow[];
  signal_balance: SignalBalance;
  generated_at: string;
}

function useMacroDashboard() {
  return useQuery({
    queryKey: ["macro-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("macro_monitor_dashboard_v")
        .select("dashboard")
        .maybeSingle();
      if (error) throw error;
      return (data?.dashboard ?? null) as DashboardPayload | null;
    },
    enabled: isSupabaseConfigured,
  });
}

const SIGNAL_TEXT_COLOR: Record<Signal, string> = {
  hawkish: "text-signal-hawkish",
  dovish: "text-signal-dovish",
  neutral: "text-signal-neutral",
  tightening: "text-signal-tightening",
};

const SIGNAL_DOT_COLOR: Record<Signal, string> = {
  hawkish: "bg-signal-hawkish",
  dovish: "bg-signal-dovish",
  neutral: "bg-signal-neutral",
  tightening: "bg-signal-tightening",
};

function TrendArrow({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <span className="text-accent-green text-xs">▲</span>;
  if (trend === "down") return <span className="text-accent-red text-xs">▼</span>;
  return <span className="text-text-dim text-xs">▬</span>;
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <div className="terminal-card p-3 flex flex-col gap-2 min-h-[140px]">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-mono text-2xs text-text-dim uppercase tracking-wider truncate">
          {kpi.short}
        </div>
        <span
          className={`flex items-center gap-1.5 text-2xs mono uppercase tracking-wider ${SIGNAL_TEXT_COLOR[kpi.signal]}`}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${SIGNAL_DOT_COLOR[kpi.signal]}`}
          />
          {kpi.signal}
        </span>
      </div>

      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-mono text-base sm:text-lg font-semibold text-text-primary tabular-nums">
          {kpi.display}
        </span>
        <TrendArrow trend={kpi.trend} />
      </div>

      <div className="flex-1 -mx-1">
        <Sparkline points={kpi.sparkline} signal={kpi.signal} />
      </div>

      <div className="text-2xs text-text-dim mono truncate">{kpi.source}</div>
    </div>
  );
}

function FiscalTable({ rows }: { rows: FiscalRow[] }) {
  return (
    <div className="terminal-card p-5 space-y-3">
      <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
        Fiscal block
      </div>
      <div className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <div
            key={row.row_id}
            className="flex items-baseline justify-between gap-3 py-2.5"
          >
            <div className="flex flex-col">
              <span className="text-sm text-text-primary">{row.label}</span>
              <span className="text-2xs text-text-dim mono">
                {row.fred_id} ·{" "}
                {row.observation_date ? dateLong(row.observation_date) : "—"}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <TrendArrow trend={row.trend} />
              <span className="font-mono text-sm font-semibold text-text-primary tabular-nums">
                {row.display}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SignalBalanceCard({ balance }: { balance: SignalBalance }) {
  return (
    <div className="terminal-card p-5 space-y-4">
      <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
        Signal balance
      </div>

      <div className="flex items-center gap-5 flex-wrap justify-between">
        <div className="shrink-0">
          <SignalDonut counts={balance.counts} size={150} />
        </div>

        <div className="flex flex-col gap-1.5 min-w-[140px] flex-1">
          {(["hawkish", "dovish", "neutral", "tightening"] as const).map((sig) => (
            <div
              key={sig}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${SIGNAL_DOT_COLOR[sig]}`}
                />
                <span className="text-text-secondary">{sig}</span>
              </span>
              <span className="font-mono font-semibold tabular-nums text-text-primary">
                {balance[sig]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-3 border-t border-border-subtle">
        <div className="font-mono text-2xs text-text-dim uppercase tracking-widest mb-1.5">
          Dominant
        </div>
        <div className="font-mono text-lg font-semibold text-accent-orange">
          {balance.dominant_label}
        </div>
      </div>
    </div>
  );
}

export default function MacroMonitor() {
  const { data, isLoading, error } = useMacroDashboard();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-mono text-xl font-bold tracking-tight">Macro Monitor</h1>
        <p className="text-sm text-text-secondary mt-1">
          12 FRED KPIs · fiscal block · hawkish/dovish balance
        </p>
      </header>

      {!isSupabaseConfigured && (
        <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">
          Supabase not configured.
        </div>
      )}

      {isLoading && (
        <div className="terminal-card p-6">
          <div className="font-mono text-xs text-text-dim">
            Loading macro data…
          </div>
        </div>
      )}

      {error && (
        <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">
          {String((error as Error).message ?? error)}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {data.kpis.map((kpi) => (
              <KpiCard key={kpi.metric_id} kpi={kpi} />
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <FiscalTable rows={data.fiscal} />
            <SignalBalanceCard balance={data.signal_balance} />
          </div>

          <div className="terminal-card p-5 space-y-2">
            <div className="font-mono text-2xs text-text-dim uppercase tracking-widest">
              Bottom-line narrative
            </div>
            <div className="text-sm text-text-secondary leading-relaxed font-mono">
              {data.signal_balance.narrative}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

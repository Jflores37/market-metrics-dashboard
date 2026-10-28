import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { usdCompact, num, timeShort, dateLong } from "@/lib/format";
import Sparkline from "@/components/macro/Sparkline";
import SignalDonut from "@/components/macro/SignalDonut";

const REFRESH_INTERVAL_MIN = 30;

// When the FRED data itself was last fetched (max macro_observations.fetched_at),
// not when the view was queried.
function UpdatedIndicator({ fetchedAt }: { fetchedAt: string }) {
  if (Number.isNaN(new Date(fetchedAt).getTime())) return null;
  const sameDayEt =
    new Date(fetchedAt).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) ===
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return (
    <span className="font-mono text-2xs text-text-dim uppercase tracking-widest tabular-nums">
      Updated {sameDayEt ? "" : `${dateLong(fetchedAt)} `}{timeShort(fetchedAt)}
    </span>
  );
}

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
  // Appended by migration 430; optional so an older view still renders.
  data_fetched_at?: string | null;
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
    refetchInterval: REFRESH_INTERVAL_MIN * 60_000,
  });
}

const SIGNAL_TEXT: Record<Signal, string> = {
  hawkish: "text-accent-red",
  dovish: "text-accent-green",
  neutral: "text-text-primary",
  tightening: "text-accent-yellow",
};

const SIGNAL_DOT_SQ: Record<Signal, string> = {
  hawkish: "bg-accent-red",
  dovish: "bg-accent-green",
  neutral: "bg-text-dim",
  tightening: "bg-accent-yellow",
};

// Monthly FRED series render as "Oct 2026"; everything else keeps its exact
// day, even when that day is the 1st.
const MONTHLY_METRICS = new Set([
  "cpi_yoy", "core_cpi_yoy", "ppi_yoy", "pce_yoy", "core_pce_yoy", "unemployment", "nfp", "sentiment",
]);

function formatObsDate(iso: string | null, metricId?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
    if (isNaN(d.getTime())) return iso;
    if (metricId && MONTHLY_METRICS.has(metricId)) {
      return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    }
    return iso.slice(0, 10);
  } catch {
    return iso;
  }
}

// Fiscal series are annual (FY, Sept 30 year-end) or quarterly. Tag each value
// with its period so a year-old deficit doesn't read like this quarter's debt.
function fiscalPeriod(iso: string | null): string {
  if (!iso) return "—";
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m) return iso;
  if (m === 9 && iso.slice(8, 10) === "30") return `FY${y}`;
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
}

// 'deficit' is the only KPI whose server string is an unscaled "-$1775B".
// Reformat it from value_num (FRED millions) via the shared compact
// formatter so it reads -$1.77T like the fiscal panel; every other KPI is
// already correctly formatted server-side.
function kpiDisplay(kpi: Kpi): string {
  if (kpi.metric_id === "deficit" && kpi.value_num != null) {
    return usdCompact(kpi.value_num, "millions");
  }
  return kpi.display;
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  return (
    <div className="terminal-card p-3 flex flex-col gap-1.5 min-h-[115px]">
      <div className="font-mono text-2xs text-text-dim uppercase tracking-wider truncate">
        {kpi.short}
      </div>
      <div className={`font-mono text-base font-semibold tabular-nums ${SIGNAL_TEXT[kpi.signal] ?? "text-text-primary"}`}>
        {kpiDisplay(kpi)}
      </div>
      <div className="text-2xs text-text-dim mono truncate">
        {kpi.metric_id === "deficit"
          ? fiscalPeriod(kpi.observation_date)
          : formatObsDate(kpi.observation_date, kpi.metric_id)}
      </div>
      <div className="flex-1 min-h-[22px] -mx-1">
        <Sparkline points={kpi.sparkline} signal={kpi.signal} />
      </div>
    </div>
  );
}

function SignalBalanceCard({ balance }: { balance: SignalBalance }) {
  const dominantClass =
    balance.dominant_label.toLowerCase().includes("hawkish") ? "text-accent-red" :
    balance.dominant_label.toLowerCase().includes("dovish") ? "text-accent-green" :
    balance.dominant_label.toLowerCase().includes("tightening") ? "text-accent-yellow" :
    "text-text-secondary";

  return (
    <div className="terminal-card p-5 flex flex-col">
      <div className="font-mono text-2xs text-text-dim uppercase tracking-widest mb-1">
        Signal Balance
      </div>
      <div className={`font-mono text-base font-bold mb-4 uppercase tracking-wider ${dominantClass}`}>
        {balance.dominant_label}
      </div>

      <div className="flex flex-col items-center gap-5 md:flex-row md:flex-wrap md:justify-around flex-1">
        <div className="shrink-0">
          <SignalDonut counts={balance.counts} dominantLabel={balance.dominant_label} size={180} />
        </div>

        <div className="flex flex-col gap-2.5 min-w-[140px]">
          {(["hawkish", "neutral", "dovish", "tightening"] as const).map((sig) => (
            <div key={sig} className="flex items-center gap-2 text-sm">
              <span className={`inline-block w-2.5 h-2.5 rounded-sm shrink-0 ${SIGNAL_DOT_SQ[sig]}`} />
              <span className="font-mono text-xs uppercase tracking-wider text-text-secondary capitalize">
                {sig}
              </span>
              <span className="font-mono text-xs text-text-dim tabular-nums">
                ({balance[sig]})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BottomLineCard({ narrative }: { narrative: string }) {
  return (
    <div className="terminal-card p-5 border-l-4 border-l-accent-amber">
      <div className="font-mono text-2xs text-accent-amber uppercase tracking-widest mb-3 font-semibold signal-glow-amber">
        Bottom Line
      </div>
      <div className="text-sm text-text-secondary leading-relaxed font-mono">
        {narrative}
      </div>
    </div>
  );
}

// Format from the raw value + unit so large billions roll up to trillions
// ($38.51T, not $38514B) with correct sign placement. The server-built
// `display` is the fallback for any unit we don't special-case.
function fiscalDisplay(row: FiscalRow): string {
  if (row.value == null) return "—";
  switch (row.usd_unit) {
    case "millions":
      return usdCompact(row.value, "millions");
    case "billions":
      return usdCompact(row.value, "billions");
    case "percent":
      return `${num(row.value, 1)}%`;
    default:
      return row.display;
  }
}

// Group fiscal rows by FRED id (not blind array position) so each card's rows
// always match its title even if the view's row order changes.
function pickFiscal(fiscal: FiscalRow[], ids: string[]): FiscalRow[] {
  return ids
    .map((id) => fiscal.find((r) => r.fred_id === id))
    .filter((r): r is FiscalRow => r != null);
}

function FiscalCard({ title, rows }: { title: string; rows: FiscalRow[] }) {
  return (
    <div className="terminal-card p-4">
      <div className="font-mono text-2xs text-accent-cyan uppercase tracking-widest mb-3 font-semibold">
        {title}
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.row_id}
            className="flex items-baseline justify-between gap-2 border-b border-border-subtle pb-2 last:border-b-0 last:pb-0"
          >
            <span className="text-xs text-text-secondary mono">
              {row.label}
              <span className="ml-1.5 text-2xs text-text-dim">{fiscalPeriod(row.observation_date)}</span>
            </span>
            <span className="font-mono text-sm font-semibold text-text-primary tabular-nums shrink-0">
              {fiscalDisplay(row)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MacroMonitor() {
  const { data, isLoading, error } = useMacroDashboard();

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-base signal-glow-cyan">◉</span>
          <h1 className="font-mono text-base font-semibold text-text-primary signal-glow-green">Macro Monitor</h1>
          <span className="text-xs text-text-dim mono">— Policy & market signals</span>
        </div>
        {data?.data_fetched_at && <UpdatedIndicator fetchedAt={data.data_fetched_at} />}
      </header>

      {!isSupabaseConfigured && (
        <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">
          Supabase not configured.
        </div>
      )}

      {isLoading && (
        <div className="terminal-card p-6">
          <div className="font-mono text-xs text-text-dim">Loading macro data…</div>
        </div>
      )}

      {error && (
        <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">
          {String((error as Error).message ?? error)}
        </div>
      )}

      {data && (
        <>
          {/* 12 KPI cards — dense horizontal grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-12 gap-2.5">
            {data.kpis.map((kpi) => (
              <KpiCard key={kpi.metric_id} kpi={kpi} />
            ))}
          </div>

          {/* Signal Balance (1/3) + Bottom Line (2/3) */}
          <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
            <SignalBalanceCard balance={data.signal_balance} />
            <BottomLineCard narrative={data.signal_balance.narrative} />
          </div>

          {/* Fiscal section */}
          <div>
            <div className="font-mono text-2xs text-text-dim uppercase tracking-widest mb-3 mt-1">
              U.S. Fiscal Snapshot (Latest Available)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FiscalCard title="Debt & Balance" rows={pickFiscal(data.fiscal, ["GFDEBTN", "FYFSD"])} />
              <FiscalCard title="Revenue & Spending" rows={pickFiscal(data.fiscal, ["FGRECPT", "FGEXPND"])} />
              <FiscalCard title="Interest & Ratios" rows={pickFiscal(data.fiscal, ["FYOINT", "GFDEGDQ188S"])} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

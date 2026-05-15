import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, usd, usdCompact, colorClass } from "@/lib/format";
import { useSortable } from "@/lib/sortable";
import CsvButton from "@/components/ui/CsvButton";
import WlButton from "@/components/ui/WlButton";
import SortableHeader from "@/components/ui/SortableHeader";

// ===== Types =====
interface ScannerSummary {
  scanner_id: string;
  label: string;
  description: string | null;
  group_tab: "trend" | "perf" | "special";
  display_order: number;
  source: string | null;
  doc_url: string | null;
  snapshot_date: string | null;
  row_count: number;
  fetched_at: string | null;
}

interface ScannerResult {
  scanner_id: string;
  scanner_label: string | null;
  group_tab: string;
  display_order: number;
  source: string | null;
  snapshot_date: string;
  rank: number | null;
  ticker: string;
  company: string | null;
  sector: string | null;
  industry: string | null;
  price: number | null;
  market_cap_millions: number | null;
  volume: number | null;
  avg_volume: number | null;
  rel_volume: number | null;
  perf_day: number | null;
  perf_week: number | null;
  perf_month: number | null;
  perf_quarter: number | null;
  perf_year: number | null;
  rsi14: number | null;
  fetched_at: string;
}

interface EarningsThisWeek {
  ticker: string;
  earnings_date: string;
  earnings_time: string | null;
  company: string | null;
  sector: string | null;
  market_cap_millions: number | null;
  price: number | null;
  perf_day: number | null;
  perf_week: number | null;
  perf_month: number | null;
  perf_year: number | null;
  rsi14: number | null;
}

const GROUP_ICON: Record<ScannerSummary["group_tab"], string> = {
  trend: "↗",
  perf: "⚡",
  special: "◇",
};

// ===== Queries =====
function useScannerSummary() {
  return useQuery({
    queryKey: ["scanner-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scanner_summary_v")
        .select("*");
      if (error) throw error;
      return (data ?? []) as ScannerSummary[];
    },
    enabled: isSupabaseConfigured,
  });
}

/**
 * One batched fetch for ALL scanner results across all scanners.
 * Avoids N parallel queries when we render every scanner card on
 * mount. The view caps at ~20-50 rows per scanner so total rows
 * stay well under Supabase's 1000-row default response limit.
 */
function useAllScannerResults() {
  return useQuery({
    queryKey: ["scanner-results-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scanner_results_latest_v")
        .select("*")
        .order("scanner_id", { ascending: true })
        .order("rank", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ScannerResult[];
    },
    enabled: isSupabaseConfigured,
  });
}

function useEarningsThisWeek() {
  return useQuery({
    queryKey: ["earnings-thisweek"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("earnings_this_week_v")
        .select(
          "ticker, earnings_date, earnings_time, company, sector, market_cap_millions, price, perf_day, perf_week, perf_month, perf_year, rsi14"
        );
      if (error) throw error;
      return (data ?? []) as EarningsThisWeek[];
    },
    enabled: isSupabaseConfigured,
  });
}

// ===== Scanner card =====
function ScannerCard({
  scanner,
  rows,
}: {
  scanner: ScannerSummary;
  rows: ScannerResult[];
}) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { sorted, sortKey, sortDir, toggle } = useSortable<ScannerResult>(rows, {
    initialKey: "rank",
    initialDir: "asc",
  });

  async function refresh() {
    setRefreshing(true);
    try {
      // Refresh the master query that feeds every card; React Query
      // re-renders just this one because the rows for other scanners
      // are referentially stable in the .filter() output.
      await queryClient.invalidateQueries({ queryKey: ["scanner-results-all"] });
    } finally {
      setTimeout(() => setRefreshing(false), 300);
    }
  }

  return (
    <section className="terminal-card p-4 space-y-2">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-accent-cyan signal-glow-cyan">{GROUP_ICON[scanner.group_tab]}</span>
          <span className="font-mono text-sm font-semibold text-text-primary truncate">
            {scanner.label}
          </span>
          <span className="font-mono text-2xs text-accent-amber tabular-nums shrink-0">
            {rows.length}
          </span>
        </div>
        <div className="flex items-baseline gap-3 shrink-0">
          <span className="font-mono text-2xs text-text-dim">
            {scanner.source || "—"}
            {scanner.snapshot_date ? ` · ${scanner.snapshot_date}` : ""}
          </span>
          <CsvButton
            filename={`${scanner.scanner_id}-${scanner.snapshot_date ?? "latest"}.csv`}
            rows={sorted}
            columns={[
              { header: "Rank",       value: (r) => r.rank },
              { header: "Ticker",     value: (r) => r.ticker },
              { header: "Company",    value: (r) => r.company ?? "" },
              { header: "Sector",     value: (r) => r.sector ?? "" },
              { header: "Industry",   value: (r) => r.industry ?? "" },
              { header: "Price",      value: (r) => r.price },
              { header: "MarketCapM", value: (r) => r.market_cap_millions },
              { header: "Volume",     value: (r) => r.volume },
              { header: "RelVolume",  value: (r) => r.rel_volume },
              { header: "PerfDay",    value: (r) => r.perf_day },
              { header: "PerfWeek",   value: (r) => r.perf_week },
              { header: "PerfMonth",  value: (r) => r.perf_month },
              { header: "PerfQuarter",value: (r) => r.perf_quarter },
              { header: "PerfYear",   value: (r) => r.perf_year },
              { header: "RSI14",      value: (r) => r.rsi14 },
            ]}
          />
          <WlButton
            filename={`${scanner.scanner_id}-${scanner.snapshot_date ?? "latest"}.txt`}
            tickers={sorted.map((r) => r.ticker)}
          />
          <button
            onClick={refresh}
            aria-label="Refresh"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-2xs text-text-secondary hover:text-accent-cyan hover:bg-bg-hover transition-colors uppercase tracking-widest font-mono"
          >
            <span className={refreshing ? "animate-spin inline-block" : "inline-block"}>↻</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Description */}
      {scanner.description && (
        <div className="text-2xs text-text-secondary mono leading-relaxed">
          {scanner.description}
        </div>
      )}

      {/* Body */}
      {rows.length === 0 ? (
        <div className="font-mono text-2xs text-text-dim text-center py-6">No results</div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[320px] border border-border-subtle/60 rounded-[2px]">
          <table className="w-full text-xs font-mono min-w-[800px]">
            <thead className="border-b border-border-subtle bg-bg-card sticky top-0 z-10">
              <tr>
                <SortableHeader<keyof ScannerResult> label="#" sortKey="rank" activeKey={sortKey} dir={sortDir} onSort={toggle} align="left" className="pl-2 w-10" />
                <SortableHeader<keyof ScannerResult> label="Ticker" sortKey="ticker" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortableHeader<keyof ScannerResult> label="Sector" sortKey="sector" activeKey={sortKey} dir={sortDir} onSort={toggle} className="hidden md:table-cell" />
                <SortableHeader<keyof ScannerResult> label="Price" sortKey="price" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof ScannerResult> label="Cap" sortKey="market_cap_millions" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof ScannerResult> label="Day %" sortKey="perf_day" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof ScannerResult> label="Wk %" sortKey="perf_week" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof ScannerResult> label="Mo %" sortKey="perf_month" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof ScannerResult> label="Qtr %" sortKey="perf_quarter" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof ScannerResult> label="Yr %" sortKey="perf_year" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof ScannerResult> label="RSI" sortKey="rsi14" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="pr-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={`${row.scanner_id}-${row.ticker}-${row.rank}`}
                  className="border-b border-border-subtle/40 hover:bg-bg-hover"
                >
                  <td className="py-1 pl-2 text-text-dim tabular-nums">{row.rank}</td>
                  <td className="py-1">
                    <div className="text-text-primary font-semibold">{row.ticker}</div>
                    {row.company && (
                      <div className="text-text-dim text-2xs truncate max-w-[140px]">
                        {row.company}
                      </div>
                    )}
                  </td>
                  <td className="py-1 text-text-secondary text-2xs truncate max-w-[140px] hidden md:table-cell">
                    {row.sector || "—"}
                  </td>
                  <td className="py-1 text-text-primary tabular-nums text-right">{usd(row.price, 2)}</td>
                  <td className="py-1 text-text-secondary tabular-nums text-right text-2xs">
                    {usdCompact(row.market_cap_millions, "millions")}
                  </td>
                  <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_day)}`}>{pct(row.perf_day, 1)}</td>
                  <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_week)}`}>{pct(row.perf_week, 1)}</td>
                  <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_month)}`}>{pct(row.perf_month, 1)}</td>
                  <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_quarter)}`}>{pct(row.perf_quarter, 1)}</td>
                  <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_year)}`}>{pct(row.perf_year, 1)}</td>
                  <td className="py-1 text-text-secondary tabular-nums text-right text-2xs pr-2">{num(row.rsi14, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ===== Earnings card (different schema) =====
function EarningsCard({ rows }: { rows: EarningsThisWeek[] }) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { sorted, sortKey, sortDir, toggle } = useSortable<EarningsThisWeek>(rows, {
    initialKey: "earnings_date",
    initialDir: "asc",
  });

  async function refresh() {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["earnings-thisweek"] });
    } finally {
      setTimeout(() => setRefreshing(false), 300);
    }
  }

  return (
    <section className="terminal-card p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-accent-cyan signal-glow-cyan">◇</span>
          <span className="font-mono text-sm font-semibold text-text-primary truncate">
            Earnings This Week
          </span>
          <span className="font-mono text-2xs text-accent-amber tabular-nums shrink-0">
            {rows.length}
          </span>
        </div>
        <div className="flex items-baseline gap-3 shrink-0">
          <span className="font-mono text-2xs text-text-dim">Earnings calendar</span>
          <CsvButton
            filename="earnings-this-week.csv"
            rows={sorted}
            columns={[
              { header: "EarningsDate", value: (r) => r.earnings_date },
              { header: "EarningsTime", value: (r) => r.earnings_time ?? "" },
              { header: "Ticker",       value: (r) => r.ticker },
              { header: "Company",      value: (r) => r.company ?? "" },
              { header: "Sector",       value: (r) => r.sector ?? "" },
              { header: "MarketCapM",   value: (r) => r.market_cap_millions },
              { header: "Price",        value: (r) => r.price },
              { header: "PerfDay",      value: (r) => r.perf_day },
              { header: "PerfWeek",     value: (r) => r.perf_week },
              { header: "PerfMonth",    value: (r) => r.perf_month },
              { header: "PerfYear",     value: (r) => r.perf_year },
              { header: "RSI14",        value: (r) => r.rsi14 },
            ]}
          />
          <WlButton
            filename="earnings-this-week.txt"
            tickers={sorted.map((r) => r.ticker)}
          />
          <button
            onClick={refresh}
            aria-label="Refresh"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-2xs text-text-secondary hover:text-accent-cyan hover:bg-bg-hover transition-colors uppercase tracking-widest font-mono"
          >
            <span className={refreshing ? "animate-spin inline-block" : "inline-block"}>↻</span>
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="font-mono text-2xs text-text-dim text-center py-6">No earnings this week</div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[320px] border border-border-subtle/60 rounded-[2px]">
          <table className="w-full text-xs font-mono min-w-[800px]">
            <thead className="border-b border-border-subtle bg-bg-card sticky top-0 z-10">
              <tr>
                <SortableHeader<keyof EarningsThisWeek> label="Date" sortKey="earnings_date" activeKey={sortKey} dir={sortDir} onSort={toggle} className="pl-2" />
                <SortableHeader<keyof EarningsThisWeek> label="Time" sortKey="earnings_time" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortableHeader<keyof EarningsThisWeek> label="Ticker" sortKey="ticker" activeKey={sortKey} dir={sortDir} onSort={toggle} />
                <SortableHeader<keyof EarningsThisWeek> label="Sector" sortKey="sector" activeKey={sortKey} dir={sortDir} onSort={toggle} className="hidden md:table-cell" />
                <SortableHeader<keyof EarningsThisWeek> label="Cap" sortKey="market_cap_millions" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof EarningsThisWeek> label="Price" sortKey="price" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof EarningsThisWeek> label="Day %" sortKey="perf_day" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof EarningsThisWeek> label="Wk %" sortKey="perf_week" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof EarningsThisWeek> label="Mo %" sortKey="perf_month" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof EarningsThisWeek> label="Yr %" sortKey="perf_year" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" />
                <SortableHeader<keyof EarningsThisWeek> label="RSI" sortKey="rsi14" activeKey={sortKey} dir={sortDir} onSort={toggle} align="right" className="pr-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={`${row.ticker}-${row.earnings_date}`}
                  className="border-b border-border-subtle/40 hover:bg-bg-hover"
                >
                  <td className="py-1 pl-2 text-text-secondary text-2xs tabular-nums">{row.earnings_date}</td>
                  <td className="py-1 text-text-dim text-2xs">{row.earnings_time ?? "—"}</td>
                  <td className="py-1">
                    <div className="text-text-primary font-semibold">{row.ticker}</div>
                    {row.company && (
                      <div className="text-text-dim text-2xs truncate max-w-[140px]">
                        {row.company}
                      </div>
                    )}
                  </td>
                  <td className="py-1 text-text-secondary text-2xs truncate max-w-[140px] hidden md:table-cell">
                    {row.sector || "—"}
                  </td>
                  <td className="py-1 text-text-secondary tabular-nums text-right text-2xs">
                    {usdCompact(row.market_cap_millions, "millions")}
                  </td>
                  <td className="py-1 text-text-primary tabular-nums text-right">{usd(row.price, 2)}</td>
                  <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_day)}`}>{pct(row.perf_day, 1)}</td>
                  <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_week)}`}>{pct(row.perf_week, 1)}</td>
                  <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_month)}`}>{pct(row.perf_month, 1)}</td>
                  <td className={`py-1 tabular-nums text-right ${colorClass(row.perf_year)}`}>{pct(row.perf_year, 1)}</td>
                  <td className="py-1 text-text-secondary tabular-nums text-right text-2xs pr-2">{num(row.rsi14, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ===== Page =====
export default function SuperScanners() {
  const { data: summary, isLoading: summaryLoading } = useScannerSummary();
  const { data: allResults, isLoading: resultsLoading } = useAllScannerResults();
  const { data: earnings, isLoading: earningsLoading } = useEarningsThisWeek();

  // Bucket results once: scanner_id → rows
  const resultsByScanner = useMemo(() => {
    const map = new Map<string, ScannerResult[]>();
    for (const row of allResults ?? []) {
      const existing = map.get(row.scanner_id);
      if (existing) existing.push(row);
      else map.set(row.scanner_id, [row]);
    }
    return map;
  }, [allResults]);

  // Stacked render order: by display_order across all groups
  const orderedScanners = useMemo(
    () => (summary ?? []).slice().sort((a, b) => a.display_order - b.display_order),
    [summary]
  );

  const totalCount =
    (summary?.length ?? 0) + (earningsLoading || (earnings && earnings.length > 0) ? 1 : 0);

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-base signal-glow-cyan">⊙</span>
          <h1 className="font-mono text-base font-semibold text-text-primary signal-glow-green">
            Super Scanners
          </h1>
          <span className="text-xs text-text-dim mono">— 19 curated screens · click any column to sort</span>
        </div>
        <div className="font-mono text-2xs text-text-dim">
          {totalCount} cards
        </div>
      </header>

      {!isSupabaseConfigured && (
        <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">
          Supabase not configured.
        </div>
      )}

      {(summaryLoading || resultsLoading) && (
        <div className="terminal-card p-6">
          <div className="font-mono text-xs text-text-dim">Loading scanners…</div>
        </div>
      )}

      {orderedScanners.map((s) => {
        // Skip the earnings entry in scanner_summary_v — it has a different
        // schema and is rendered by EarningsCard below.
        if (s.scanner_id === "earnings_thisweek") return null;
        return (
          <ScannerCard
            key={s.scanner_id}
            scanner={s}
            rows={resultsByScanner.get(s.scanner_id) ?? []}
          />
        );
      })}

      {/* Earnings card uses a different schema — render separately */}
      {!earningsLoading && earnings && <EarningsCard rows={earnings} />}
    </div>
  );
}

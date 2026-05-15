import { useState, useMemo, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, usd, usdCompact, numCompact, colorClass } from "@/lib/format";
import { useSortable, SortDir } from "@/lib/sortable";
import { layoutFor, ScannerColKey } from "@/lib/scannerConfig";
import CsvButton from "@/components/ui/CsvButton";
import WlButton from "@/components/ui/WlButton";
import SortableHeader from "@/components/ui/SortableHeader";
import StageTagBadge from "@/components/scanners/StageTagBadge";
import { TickerLink } from "@/components/TickerChartModal";

// ===== Types =====
interface ScannerSummary {
  scanner_id: string;
  label: string;
  description: string | null;
  group_tab: "trend" | "perf" | "special";
  display_order: number;
  source: string | null;
  doc_url: string | null;
  default_sort_column: string | null;
  default_sort_direction: SortDir | null;
  max_rows: number | null;
  finviz_url: string | null;
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
  default_sort_column: string | null;
  default_sort_direction: SortDir | null;
  max_rows: number | null;
  finviz_url: string | null;
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
  perf_half: number | null;
  perf_year: number | null;
  perf_ytd: number | null;
  rsi14: number | null;
  atr: number | null;
  atr_pct: number | null;
  stage_tag: string | null;
  dist_52w_high_pct: number | null;
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
 * Per-scanner query. We deliberately do NOT batch all scanners into a
 * single request: PostgREST's response is capped at 1,000 rows by
 * default regardless of any client-side `.range()`, which means a
 * unioned fetch silently drops scanners after the alphabetical cutoff.
 * Twenty parallel queries deduplicate in React Query and avoid the cap.
 */
function useScannerResults(scannerId: string | undefined) {
  return useQuery({
    queryKey: ["scanner-results", scannerId],
    queryFn: async () => {
      if (!scannerId) return [];
      const { data, error } = await supabase
        .from("scanner_results_latest_v")
        .select("*")
        .eq("scanner_id", scannerId)
        .order("rank", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as ScannerResult[];
    },
    enabled: isSupabaseConfigured && !!scannerId,
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
// Maps a per-scanner ScannerColKey -> sortable ScannerResult field. Header
// label, alignment, and cell renderer are co-located with the key so each
// scanner's column set stays declarative (see scannerConfig.ts).
type ColumnSpec = {
  key: ScannerColKey;
  label: string;
  sortKey: keyof ScannerResult;
  align: "left" | "right";
  cell: (r: ScannerResult) => ReactNode;
};

function tickerCell(r: ScannerResult): ReactNode {
  return (
    <div className="flex flex-col">
      <TickerLink ticker={r.ticker} />
      {r.company && (
        <span className="text-text-dim text-2xs truncate max-w-[140px]">{r.company}</span>
      )}
    </div>
  );
}

function pctCell(v: number | null | undefined): ReactNode {
  return <span className={`tabular-nums ${colorClass(v)}`}>{pct(v, 1)}</span>;
}

const COL_SPECS: Record<ScannerColKey, ColumnSpec> = {
  ticker:   { key: "ticker",   label: "Ticker",  sortKey: "ticker",              align: "left",  cell: (r) => tickerCell(r) },
  price:    { key: "price",    label: "Price",   sortKey: "price",               align: "right", cell: (r) => <span className="text-text-primary tabular-nums">{usd(r.price, 2)}</span> },
  avg_vol:  { key: "avg_vol",  label: "Avg Vol", sortKey: "avg_volume",          align: "right", cell: (r) => <span className="text-text-secondary tabular-nums text-2xs">{numCompact(r.avg_volume)}</span> },
  rel_vol:  { key: "rel_vol",  label: "Rel V",   sortKey: "rel_volume",          align: "right", cell: (r) => <span className="text-text-secondary tabular-nums">{num(r.rel_volume, 2)}</span> },
  change:   { key: "change",   label: "Change",  sortKey: "perf_day",            align: "right", cell: (r) => pctCell(r.perf_day) },
  volume:   { key: "volume",   label: "Vol",     sortKey: "volume",              align: "right", cell: (r) => <span className="text-text-secondary tabular-nums text-2xs">{numCompact(r.volume)}</span> },
  atr_pct:  { key: "atr_pct",  label: "ATR %",   sortKey: "atr_pct",             align: "right", cell: (r) => <span className="text-text-secondary tabular-nums">{r.atr_pct == null ? "—" : `${num(r.atr_pct, 2)}%`}</span> },
  tag:      { key: "tag",      label: "Tag",     sortKey: "stage_tag",           align: "left",  cell: (r) => <StageTagBadge tag={r.stage_tag} /> },
  week:     { key: "week",     label: "Week",    sortKey: "perf_week",           align: "right", cell: (r) => pctCell(r.perf_week) },
  mkt_cap:  { key: "mkt_cap",  label: "Mkt Cap", sortKey: "market_cap_millions", align: "right", cell: (r) => <span className="text-text-secondary tabular-nums text-2xs">{usdCompact(r.market_cap_millions, "millions")}</span> },
};

function ScannerCard({ scanner }: { scanner: ScannerSummary }) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  // Each card fetches its own scanner_results slice — avoids PostgREST's
  // 1k-row default response cap (would otherwise drop ~12 scanners
  // alphabetically past julian_strongest).
  const { data: rows = [], isLoading } = useScannerResults(scanner.scanner_id);

  // Per-scanner column spec drives the table layout. The reference repo
  // (pakkiraju/Market-Metrics-, finviz-elite branch) uses 9 distinct
  // table builders rather than one universal schema; we mirror that via
  // src/lib/scannerConfig.ts.
  const cols = useMemo(
    () => layoutFor(scanner.scanner_id).columns.map((k) => COL_SPECS[k]),
    [scanner.scanner_id],
  );

  // Reference default sort: Change DESC on every scanner (layout.py:2773).
  // The few exceptions (earnings = market_cap DESC, weekly mover = week DESC)
  // come from scanner_catalog.default_sort_column.
  const CATALOG_SORT_MAP: Record<string, keyof ScannerResult> = {
    perf_day: "perf_day",
    perf_week: "perf_week",
    market_cap_millions: "market_cap_millions",
    volume: "volume",
  };
  const initialKey: keyof ScannerResult =
    (scanner.default_sort_column && CATALOG_SORT_MAP[scanner.default_sort_column]) ||
    "perf_day";
  const initialDir: SortDir = scanner.default_sort_direction ?? "desc";

  const { sorted, sortKey, sortDir, toggle } = useSortable<ScannerResult>(rows, {
    initialKey,
    initialDir,
  });

  async function refresh() {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["scanner-results", scanner.scanner_id] });
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
              { header: "Rank",        value: (r) => r.rank },
              { header: "Ticker",      value: (r) => r.ticker },
              { header: "Stage",       value: (r) => r.stage_tag ?? "" },
              { header: "Company",     value: (r) => r.company ?? "" },
              { header: "Sector",      value: (r) => r.sector ?? "" },
              { header: "Industry",    value: (r) => r.industry ?? "" },
              { header: "Price",       value: (r) => r.price },
              { header: "MarketCapM",  value: (r) => r.market_cap_millions },
              { header: "AvgVolume",   value: (r) => r.avg_volume },
              { header: "Volume",      value: (r) => r.volume },
              { header: "RelVolume",   value: (r) => r.rel_volume },
              { header: "ATR",         value: (r) => r.atr },
              { header: "ATRpct",      value: (r) => r.atr_pct },
              { header: "PerfDay",     value: (r) => r.perf_day },
              { header: "PerfWeek",    value: (r) => r.perf_week },
              { header: "PerfMonth",   value: (r) => r.perf_month },
              { header: "PerfQuarter", value: (r) => r.perf_quarter },
              { header: "PerfHalf",    value: (r) => r.perf_half },
              { header: "PerfYear",    value: (r) => r.perf_year },
              { header: "PerfYtd",     value: (r) => r.perf_ytd },
              { header: "RSI14",       value: (r) => r.rsi14 },
              { header: "Dist52wHigh", value: (r) => r.dist_52w_high_pct },
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
      {isLoading ? (
        <div className="font-mono text-2xs text-text-dim text-center py-6">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="font-mono text-2xs text-text-dim text-center py-6">No results</div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[360px] border border-border-subtle/60 rounded-[2px]">
          <table className="w-full text-xs font-mono">
            <thead className="border-b border-border-subtle bg-bg-card sticky top-0 z-10">
              <tr>
                {cols.map((c, i) => (
                  <SortableHeader<keyof ScannerResult>
                    key={c.key}
                    label={c.label}
                    sortKey={c.sortKey}
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggle}
                    align={c.align}
                    className={i === 0 ? "pl-2" : i === cols.length - 1 ? "pr-2" : ""}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, ri) => (
                <tr
                  key={`${row.scanner_id}-${row.ticker}-${ri}`}
                  className="border-b border-border-subtle/40 hover:bg-bg-hover"
                >
                  {cols.map((c, ci) => (
                    <td
                      key={c.key}
                      className={`py-1 ${c.align === "right" ? "text-right" : ""} ${
                        ci === 0 ? "pl-2" : ci === cols.length - 1 ? "pr-2" : "px-2"
                      }`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
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
                    <TickerLink ticker={row.ticker} />
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
  const { data: earnings, isLoading: earningsLoading } = useEarningsThisWeek();

  // display_order ascending — same ordering as the reference repo's
  // layout.py rows (Minervini first, earnings last).
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
          <span className="text-xs text-text-dim mono">— {summary?.length ?? "—"} curated screens · click any column to sort</span>
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

      {summaryLoading && (
        <div className="terminal-card p-6">
          <div className="font-mono text-xs text-text-dim">Loading scanners…</div>
        </div>
      )}

      {/* Reference repo arranges scanners in rows of 3-4 widgets
          (THIRD_ROW_STYLE / QUARTER_ROW_STYLE in layout.py). The grid
          collapses to 2 then 1 on narrower screens. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        {orderedScanners.map((s) => {
          if (s.scanner_id === "earnings_thisweek") return null;
          return <ScannerCard key={s.scanner_id} scanner={s} />;
        })}
        {!earningsLoading && earnings && <EarningsCard rows={earnings} />}
      </div>
    </div>
  );
}

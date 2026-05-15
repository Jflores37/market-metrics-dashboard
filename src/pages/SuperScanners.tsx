import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, usd, usdCompact, colorClass } from "@/lib/format";

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

const GROUP_LABELS: Record<ScannerSummary["group_tab"], string> = {
  trend: "Trend",
  perf: "Performance",
  special: "Special",
};

const GROUP_ICONS: Record<ScannerSummary["group_tab"], string> = {
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

function useScannerResults(scannerId: string | null) {
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
    enabled: !!scannerId && scannerId !== "earnings_thisweek" && isSupabaseConfigured,
  });
}

function useEarningsThisWeek(active: boolean) {
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
    enabled: active && isSupabaseConfigured,
  });
}

// ===== Sub-components =====
function ScannerChip({
  scanner, active, onClick,
}: {
  scanner: ScannerSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left px-3 py-2 rounded border transition-colors ${
        active
          ? "bg-bg-panel border-accent-orange text-accent-orange"
          : "bg-bg-card border-border-subtle text-text-secondary hover:text-text-primary hover:border-border"
      }`}
    >
      <div className="font-mono text-xs font-semibold truncate">
        {scanner.label}
      </div>
      <div className="font-mono text-2xs text-text-dim mt-0.5 truncate">
        {scanner.row_count} rows
        {scanner.source && ` · ${scanner.source}`}
      </div>
    </button>
  );
}

function ScannerResultsTable({ rows }: { rows: ScannerResult[] }) {
  if (rows.length === 0) {
    return (
      <div className="terminal-card p-8 text-center">
        <div className="font-mono text-xs text-text-dim">No results</div>
      </div>
    );
  }
  return (
    <div className="terminal-card p-4">
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[800px]">
          <thead className="border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1 w-8">#</th>
              <th className="py-1.5">Ticker</th>
              <th className="py-1.5 hidden md:table-cell">Sector</th>
              <th className="py-1.5 text-right">Price</th>
              <th className="py-1.5 text-right">Cap</th>
              <th className="py-1.5 text-right">Day %</th>
              <th className="py-1.5 text-right">Wk %</th>
              <th className="py-1.5 text-right">Mo %</th>
              <th className="py-1.5 text-right">Qtr %</th>
              <th className="py-1.5 text-right">Yr %</th>
              <th className="py-1.5 text-right pr-1">RSI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.scanner_id}-${row.ticker}`}
                className="border-b border-border-subtle/40 hover:bg-bg-hover"
              >
                <td className="py-1 pl-1 text-text-dim tabular-nums">{row.rank}</td>
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
                <td className="py-1 text-text-secondary

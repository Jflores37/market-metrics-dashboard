import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, usd, colorClass } from "@/lib/format";

// ===== Types =====
interface IndustryRow {
  industry: string;
  sector: string;
  week_avg: number;
  month_avg: number;
  stock_count: number;
  week_pct: number;
  month_pct: number;
  top_both: boolean;
  t1: string | null;
  t2: string | null;
  t3: string | null;
  t4: string | null;
}

interface ThemeRow {
  theme: string;
  sector: string;
  week_avg: number;
  month_avg: number;
  stock_count: number;
  top_both: boolean;
  t1: string | null;
  t2: string | null;
  t3: string | null;
  t4: string | null;
}

interface SectorPerfRow {
  sector: string;
  perf_day: number | null;
  perf_open: number | null;
  perf_week: number | null;
  perf_month: number | null;
  perf_quarter: number | null;
  perf_half: number | null;
  perf_year: number | null;
  perf_ytd: number | null;
  stock_count: number;
}

interface TopMoverRow {
  mover_side: "gainer" | "loser";
  ticker: string;
  sector: string;
  industry: string;
  perf_day: number | null;
  perf_week: number | null;
  perf_month: number | null;
  price: number | null;
  atr_pct: number | null;
  rsi14: number | null;
  rank: number;
}

// ===== Leading Industries =====
function LeadingIndustriesTable() {
  const { data } = useQuery({
    queryKey: ["mm-leading-industries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leading_industries_v")
        .select("*")
        .order("top_both", { ascending: false })
        .order("week_avg", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as IndustryRow[];
    },
    enabled: isSupabaseConfigured,
  });
  if (!data || data.length === 0) return null;

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-orange text-sm">▤</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            Leading Industries
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">top {data.length} · ★ = top both wk &amp; mo</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[680px]">
          <thead className="border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1">Industry</th>
              <th className="py-1.5">Sector</th>
              <th className="py-1.5 text-right">Wk Avg</th>
              <th className="py-1.5 text-right">Mo Avg</th>
              <th className="py-1.5 text-right">Stocks</th>
              <th className="py-1.5 pr-1">Top Tickers</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr
                key={r.industry}
                className={`border-b border-border-subtle/40 hover:bg-bg-hover ${r.top_both ? "bg-accent-green/5" : ""}`}
              >
                <td className="py-1 pl-1 text-text-primary font-semibold truncate max-w-[180px]">
                  {r.industry}
                  {r.top_both && <span className="text-2xs text-accent-green ml-1">★</span>}
                </td>
                <td className="py-1 text-text-secondary text-2xs truncate max-w-[120px]">
                  {r.sector}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.week_avg)}`}>
                  {pct(r.week_avg, 2)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.month_avg)}`}>
                  {pct(r.month_avg, 2)}
                </td>
                <td className="py-1 text-text-dim tabular-nums text-right text-2xs">
                  {r.stock_count}
                </td>
                <td className="py-1 pr-1 text-text-secondary text-2xs">
                  {[r.t1, r.t2, r.t3, r.t4].filter(Boolean).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Thematics by Theme =====
function ThematicsByThemeTable() {
  const { data } = useQuery({
    queryKey: ["mm-thematics-theme"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("thematics_by_theme_v")
        .select("*")
        .order("week_avg", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as ThemeRow[];
    },
    enabled: isSupabaseConfigured,
  });
  if (!data || data.length === 0) return null;

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-orange text-sm">◈</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            Thematics · by Theme
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">top {data.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[680px]">
          <thead className="border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1">Theme</th>
              <th className="py-1.5">Sector</th>
              <th className="py-1.5 text-right">Wk Avg</th>
              <th className="py-1.5 text-right">Mo Avg</th>
              <th className="py-1.5 text-right">Stocks</th>
              <th className="py-1.5 pr-1">Top Tickers</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr
                key={r.theme}
                className={`border-b border-border-subtle/40 hover:bg-bg-hover ${r.top_both ? "bg-accent-green/5" : ""}`}
              >
                <td className="py-1 pl-1 text-text-primary font-semibold truncate max-w-[180px]">
                  {r.theme}
                  {r.top_both && <span className="text-2xs text-accent-green ml-1">★</span>}
                </td>
                <td className="py-1 text-text-secondary text-2xs truncate max-w-[120px]">
                  {r.sector}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.week_avg)}`}>
                  {pct(r.week_avg, 2)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.month_avg)}`}>
                  {pct(r.month_avg, 2)}
                </td>
                <td className="py-1 text-text-dim tabular-nums text-right text-2xs">
                  {r.stock_count}
                </td>
                <td className="py-1 pr-1 text-text-secondary text-2xs">
                  {[r.t1, r.t2, r.t3, r.t4].filter(Boolean).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Thematics by Sector =====
function ThematicsBySectorTable() {
  const { data } = useQuery({
    queryKey: ["mm-thematics-sector"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("thematics_by_sector_v")
        .select("*")
        .order("perf_day", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as SectorPerfRow[];
    },
    enabled: isSupabaseConfigured,
  });
  if (!data || data.length === 0) return null;

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-orange text-sm">◔</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            Thematics · by Sector
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">{data.length} sectors</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[680px]">
          <thead className="border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1">Sector</th>
              <th className="py-1.5 text-right">Day</th>
              <th className="py-1.5 text-right">Wk</th>
              <th className="py-1.5 text-right">Mo</th>
              <th className="py-1.5 text-right">Qtr</th>
              <th className="py-1.5 text-right">Yr</th>
              <th className="py-1.5 text-right">YTD</th>
              <th className="py-1.5 text-right pr-1">Stocks</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.sector} className="border-b border-border-subtle/40 hover:bg-bg-hover">
                <td className="py-1 pl-1 text-text-primary font-semibold">{r.sector}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.perf_day)}`}>{pct(r.perf_day, 2)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.perf_week)}`}>{pct(r.perf_week, 2)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.perf_month)}`}>{pct(r.perf_month, 2)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.perf_quarter)}`}>{pct(r.perf_quarter, 2)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.perf_year)}`}>{pct(r.perf_year, 2)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.perf_ytd)}`}>{pct(r.perf_ytd, 2)}</td>
                <td className="py-1 text-text-dim tabular-nums text-right text-2xs pr-1">{r.stock_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Top Movers =====
function TopMoverTable({
  title, rows, accent,
}: {
  title: string;
  rows: TopMoverRow[];
  accent: "green" | "red";
}) {
  const accentText = accent === "green" ? "text-accent-green" : "text-accent-red";
  const icon = accent === "green" ? "▲" : "▼";
  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className={`${accentText} text-sm`}>{icon}</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            {title}
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">{rows.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[440px]">
          <thead className="border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1 w-7">#</th>
              <th className="py-1.5">Ticker</th>
              <th className="py-1.5">Industry</th>
              <th className="py-1.5 text-right">Price</th>
              <th className="py-1.5 text-right">Day</th>
              <th className="py-1.5 text-right pr-1">RSI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.mover_side}-${r.ticker}`}
                className="border-b border-border-subtle/40 hover:bg-bg-hover"
              >
                <td className="py-1 pl-1 text-text-dim tabular-nums">{r.rank}</td>
                <td className="py-1 text-text-primary font-semibold">{r.ticker}</td>
                <td className="py-1 text-text-secondary text-2xs truncate max-w-[140px]">
                  {r.industry || "—"}
                </td>
                <td className="py-1 text-text-primary tabular-nums text-right">{usd(r.price, 2)}</td>
                <td className={`py-1 tabular-nums text-right ${colorClass(r.perf_day)}`}>
                  {pct(r.perf_day, 1)}
                </td>
                <td className="py-1 text-text-secondary tabular-nums text-right text-2xs pr-1">
                  {num(r.rsi14, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThematicsTopMovers() {
  const { data } = useQuery({
    queryKey: ["mm-top-movers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("thematics_top_movers_v")
        .select("*")
        .order("mover_side")
        .order("rank");
      if (error) throw error;
      return (data ?? []) as TopMoverRow[];
    },
    enabled: isSupabaseConfigured,
  });
  if (!data || data.length === 0) return null;

  const gainers = data.filter((r) => r.mover_side === "gainer");
  const losers = data.filter((r) => r.mover_side === "loser");

  return (
    <div className="grid lg:grid-cols-2 gap-3">
      <TopMoverTable title="Thematics · Top Gainers" rows={gainers} accent="green" />
      <TopMoverTable title="Thematics · Top Losers" rows={losers} accent="red" />
    </div>
  );
}

// ===== Default export bundles all 4 widgets =====
export default function IndustryThemeBlocks() {
  return (
    <>
      <LeadingIndustriesTable />
      <ThematicsByThemeTable />
      <ThematicsBySectorTable />
      <ThematicsTopMovers />
    </>
  );
}

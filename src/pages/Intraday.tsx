import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { num, pct, usd, usdCompact, numCompact, colorClass, timeShort } from "@/lib/format";
import { TickerLink } from "@/components/TickerChartModal";

// ===== Types =====
interface MoverRow {
  rank: number;
  ticker: string;
  company: string | null;
  sector: string | null;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  rel_volume: number | null;
}

interface PremarketRow {
  source: "cnbc" | "finviz_up" | "finviz_down";
  rank: number | null;
  ticker: string;
  company: string | null;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  rel_volume: number | null;
  article_url: string | null;
  news: string | null;
}

interface EarningsRow {
  ticker: string;
  company: string | null;
  earnings_date: string;
  earnings_time: string | null;
  bucket: "today" | "yesterday" | "other";
  sector: string | null;
  market_cap_millions: number | null;
  price: number | null;
  perf_day: number | null;
  perf_week: number | null;
  rsi14: number | null;
  atr_pct: number | null;
}

interface IntradayDashboard {
  top_gainers: MoverRow[];
  top_losers: MoverRow[];
  in_play: MoverRow[];
  premarket: PremarketRow[];
  earnings_yest_today: EarningsRow[];
  generated_at: string;
}

// ===== Query =====
function useIntradayDashboard() {
  return useQuery({
    queryKey: ["intraday-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intraday_dashboard_v")
        .select("dashboard")
        .maybeSingle();
      if (error) throw error;
      return (data?.dashboard ?? null) as IntradayDashboard | null;
    },
    enabled: isSupabaseConfigured,
    refetchInterval: 60_000,
  });
}

// ===== Mover table (reused 3x: Gainers, Losers, In Play) =====
function MoverTable({
  title, icon, rows, accentColor = "neutral",
}: {
  title: string;
  icon: string;
  rows: MoverRow[];
  accentColor?: "green" | "red" | "neutral";
}) {
  const iconColor =
    accentColor === "green" ? "text-accent-green signal-glow-green" :
    accentColor === "red" ? "text-accent-red signal-glow-red" :
    "text-accent-cyan signal-glow-cyan";

  return (
    <div className="terminal-card p-4 flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className={`${iconColor} text-sm`}>{icon}</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            {title}
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim tabular-nums">
          {rows.length} symbols
        </span>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[500px]">
        <table className="w-full text-xs font-mono tbl-readable">
          <thead className="sticky top-0 bg-bg-card border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1 w-7">#</th>
              <th className="py-1.5">Ticker</th>
              <th className="py-1.5 hidden md:table-cell">Sector</th>
              <th className="py-1.5 text-right">Price</th>
              <th className="py-1.5 text-right">Chg%</th>
              <th className="py-1.5 text-right pr-1">RelVol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.ticker}-${row.rank}`}
                className="border-b border-border-subtle/40 hover:bg-bg-hover"
              >
                <td className="py-1 pl-1 text-text-dim tabular-nums">{row.rank}</td>
                <td className="py-1"><TickerLink ticker={row.ticker} /></td>
                <td className="py-1 text-text-secondary text-2xs truncate max-w-[120px] hidden md:table-cell">
                  {row.sector || "—"}
                </td>
                <td className="py-1 text-text-primary tabular-nums text-right">
                  {usd(row.price, 2)}
                </td>
                <td className={`py-1 tabular-nums text-right ${colorClass(row.change_pct)}`}>
                  {pct(row.change_pct, 1)}
                </td>
                <td className="py-1 text-text-dim tabular-nums text-right text-2xs pr-1">
                  {row.rel_volume != null ? `${num(row.rel_volume, 1)}x` : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-center text-text-dim text-2xs">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Pre-market =====
function PremarketSection({ rows }: { rows: PremarketRow[] }) {
  const ups = rows.filter((r) => r.source === "finviz_up");
  const downs = rows.filter((r) => r.source === "finviz_down");
  const cnbc = rows.filter((r) => r.source === "cnbc");

  return (
    <div className="terminal-card p-4 flex flex-col">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">⊕</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            Pre-market
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim">
          {ups.length + downs.length} symbols
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-[500px]">
        <div>
          <div className="font-mono text-2xs text-accent-green mb-1.5 uppercase tracking-wider">
            ▲ Up
          </div>
          <div className="space-y-0.5">
            {ups.slice(0, 20).map((row) => (
              <div
                key={`up-${row.ticker}-${row.rank}`}
                className="flex items-baseline justify-between text-xs font-mono py-0.5"
              >
                <span className="text-text-primary font-semibold">{row.ticker}</span>
                <span className={`tabular-nums ${colorClass(row.change_pct)}`}>
                  {pct(row.change_pct, 1)}
                </span>
              </div>
            ))}
            {ups.length === 0 && (
              <div className="text-2xs text-text-dim mono">No data</div>
            )}
          </div>
        </div>
        <div>
          <div className="font-mono text-2xs text-accent-red mb-1.5 uppercase tracking-wider">
            ▼ Down
          </div>
          <div className="space-y-0.5">
            {downs.slice(0, 20).map((row) => (
              <div
                key={`down-${row.ticker}-${row.rank}`}
                className="flex items-baseline justify-between text-xs font-mono py-0.5"
              >
                <span className="text-text-primary font-semibold">{row.ticker}</span>
                <span className={`tabular-nums ${colorClass(row.change_pct)}`}>
                  {pct(row.change_pct, 1)}
                </span>
              </div>
            ))}
            {downs.length === 0 && (
              <div className="text-2xs text-text-dim mono">No data</div>
            )}
          </div>
        </div>
      </div>

      {cnbc.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <div className="font-mono text-2xs text-accent-cyan mb-2 uppercase tracking-wider">
            CNBC Headlines
          </div>
          <div className="space-y-2 max-h-[150px] overflow-y-auto">
            {cnbc.map((row, i) => (
              <div key={`cnbc-${i}`} className="text-xs">
                <div className="text-text-primary font-mono font-semibold">{row.ticker}</div>
                <div className="text-text-secondary text-2xs leading-snug">{row.news}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Earnings yesterday + today =====
function EarningsRowComp({ row }: { row: EarningsRow }) {
  return (
    <tr className="border-b border-border-subtle/40 hover:bg-bg-hover">
      <td className="py-1.5 pl-1">
        <span
          className={`px-1.5 py-0.5 rounded text-2xs uppercase tracking-wider font-mono font-semibold ${
            row.bucket === "today"
              ? "bg-accent-green/15 text-accent-green"
              : "bg-text-dim/15 text-text-dim"
          }`}
        >
          {row.bucket}
        </span>
      </td>
      <td className="py-1.5"><TickerLink ticker={row.ticker} /></td>
      <td className="py-1.5 text-text-secondary text-2xs font-mono">
        {row.earnings_time || "—"}
      </td>
      <td className="py-1.5 text-text-secondary text-2xs font-mono truncate max-w-[140px] hidden lg:table-cell">
        {row.sector || "—"}
      </td>
      <td className="py-1.5 text-text-primary tabular-nums font-mono text-right text-2xs">
        {usdCompact(row.market_cap_millions, "millions")}
      </td>
      <td className="py-1.5 text-text-primary tabular-nums font-mono text-right">
        {usd(row.price, 2)}
      </td>
      <td className={`py-1.5 tabular-nums font-mono text-right ${colorClass(row.perf_day)}`}>
        {pct(row.perf_day, 1)}
      </td>
      <td className={`py-1.5 tabular-nums font-mono text-right ${colorClass(row.perf_week)}`}>
        {pct(row.perf_week, 1)}
      </td>
      <td className="py-1.5 text-text-secondary tabular-nums font-mono text-right text-2xs pr-1">
        {num(row.rsi14, 0)}
      </td>
    </tr>
  );
}

function EarningsSection({ rows }: { rows: EarningsRow[] }) {
  const today = rows.filter((r) => r.bucket === "today");
  const yesterday = rows.filter((r) => r.bucket === "yesterday");

  return (
    <div className="terminal-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-sm signal-glow-cyan">⊙</span>
          <span className="font-mono text-2xs text-text-secondary uppercase tracking-widest font-semibold">
            Earnings · Yesterday + Today
          </span>
        </div>
        <span className="font-mono text-2xs text-text-dim tabular-nums">
          {rows.length} companies
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[640px] tbl-readable">
          <thead className="border-b border-border-subtle">
            <tr className="text-2xs text-text-dim uppercase tracking-wider text-left">
              <th className="py-1.5 pl-1">When</th>
              <th className="py-1.5">Ticker</th>
              <th className="py-1.5">Time</th>
              <th className="py-1.5 hidden lg:table-cell">Sector</th>
              <th className="py-1.5 text-right">Cap</th>
              <th className="py-1.5 text-right">Price</th>
              <th className="py-1.5 text-right">Day %</th>
              <th className="py-1.5 text-right">Wk %</th>
              <th className="py-1.5 text-right pr-1">RSI</th>
            </tr>
          </thead>
          <tbody>
            {today.map((r) => (
              <EarningsRowComp key={`t-${r.ticker}`} row={r} />
            ))}
            {today.length > 0 && yesterday.length > 0 && (
              <tr>
                <td colSpan={9} className="py-1.5 text-2xs text-text-dim mono uppercase tracking-widest border-b border-border">
                  ── Yesterday ──
                </td>
              </tr>
            )}
            {yesterday.map((r) => (
              <EarningsRowComp key={`y-${r.ticker}`} row={r} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="py-4 text-center text-text-dim text-2xs">
                  No earnings in window
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== Main page =====
export default function Intraday() {
  const { data, isLoading, error } = useIntradayDashboard();

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="text-accent-cyan text-base signal-glow-cyan">▶</span>
          <h1 className="font-mono text-base font-semibold text-text-primary signal-glow-green">Intraday</h1>
          <span className="text-xs text-text-dim mono">— Live market movers</span>
        </div>
        {data && (
          <div className="font-mono text-2xs text-text-dim">
            updated {timeShort(data.generated_at)} · auto-refresh 1m
          </div>
        )}
      </header>

      {!isSupabaseConfigured && (
        <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">
          Supabase not configured.
        </div>
      )}

      {isLoading && (
        <div className="terminal-card p-6">
          <div className="font-mono text-xs text-text-dim">Loading intraday data…</div>
        </div>
      )}

      {error && (
        <div className="terminal-card border-accent-red p-4 text-accent-red font-mono text-sm">
          {String((error as Error).message ?? error)}
        </div>
      )}

      {data && (
        <>
          <div className="grid lg:grid-cols-2 gap-3">
            <MoverTable
              title="Top Gainers"
              icon="▲"
              accentColor="green"
              rows={data.top_gainers}
            />
            <MoverTable
              title="Top Losers"
              icon="▼"
              accentColor="red"
              rows={data.top_losers}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-3">
            <MoverTable
              title="Stocks In Play"
              icon="◈"
              rows={data.in_play}
            />
            <PremarketSection rows={data.premarket} />
          </div>

          <EarningsSection rows={data.earnings_yest_today} />
        </>
      )}
    </div>
  );
}

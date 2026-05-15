import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { pct, colorClass } from "@/lib/format";

interface TickerItem {
  ticker: string;
  label: string;
  change_pct: number | null;
}

const DISPLAY_ORDER: Record<string, number> = {
  SPY: 1, "^VIX": 2, QQQ: 3, DIA: 4, IWM: 5, GLD: 6, TLT: 7,
  XLK: 10, XLV: 11, XLF: 12, XLY: 13, XLC: 14, XLI: 15,
  XLE: 16, XLP: 17, XLU: 18, XLB: 19, XLRE: 20,
  NVDA: 30, TSLA: 31, MSTR: 32,
};

function useTickerTape() {
  return useQuery({
    queryKey: ["ticker-tape"],
    queryFn: async () => {
      const [intraday, sectors] = await Promise.all([
        supabase
          .from("intraday_quotes_latest_v")
          .select("ticker, display_label, change_pct"),
        supabase
          .from("sector_etf_latest_v")
          .select("ticker, perf_day, is_benchmark"),
      ]);

      const items: TickerItem[] = [];

      for (const row of intraday.data ?? []) {
        items.push({
          ticker: row.ticker,
          label: row.display_label ?? row.ticker,
          change_pct: row.change_pct != null ? Number(row.change_pct) : null,
        });
      }

      for (const row of sectors.data ?? []) {
        if (row.is_benchmark) continue; // skip VTI
        // Skip if already in intraday list
        if (items.some((x) => x.ticker === row.ticker)) continue;
        items.push({
          ticker: row.ticker,
          label: row.ticker,
          change_pct: row.perf_day != null ? Number(row.perf_day) : null,
        });
      }

      items.sort(
        (a, b) =>
          (DISPLAY_ORDER[a.ticker] ?? 99) - (DISPLAY_ORDER[b.ticker] ?? 99)
      );
      return items;
    },
    enabled: isSupabaseConfigured,
    refetchInterval: 60_000,
  });
}

export default function TickerTape() {
  const { data } = useTickerTape();
  if (!data || data.length === 0) return null;

  return (
    <div className="border-b border-border-subtle bg-bg-panel overflow-x-auto">
      <div className="flex items-center gap-5 py-2 px-4 whitespace-nowrap min-w-max">
        {data.map((item) => (
          <div
            key={item.ticker}
            className="inline-flex items-baseline gap-1.5 font-mono text-xs"
          >
            <span className="text-text-secondary font-semibold tracking-wider">
              {item.label}
            </span>
            <span className={`${colorClass(item.change_pct)} tabular-nums`}>
              {pct(item.change_pct, 2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

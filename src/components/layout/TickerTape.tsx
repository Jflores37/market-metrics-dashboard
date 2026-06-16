import { useState } from "react";
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
        if (row.is_benchmark) continue;
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

function TickerRow({ items }: { items: TickerItem[] }) {
  return (
    <>
      {items.map((item) => (
        <div
          key={item.ticker}
          className="inline-flex items-baseline gap-1.5 font-mono text-xs px-3"
        >
          <span className="text-text-secondary font-semibold tracking-wider">
            {item.label}
          </span>
          <span className={`${colorClass(item.change_pct)} tabular-nums`}>
            {pct(item.change_pct, 2)}
          </span>
        </div>
      ))}
    </>
  );
}

export default function TickerTape() {
  const { data } = useTickerTape();
  // Tap to freeze the scroll so a number can be read on a touchscreen, where
  // there's no hover to lean on. Desktop still pauses on hover (CSS).
  const [paused, setPaused] = useState(false);
  if (!data || data.length === 0) return null;

  // Duplicate the row so the marquee animation can loop seamlessly
  // (translateX -50% lands the second copy exactly where the first started).
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={paused}
      aria-label="Pause ticker tape"
      className="group border-b border-border-subtle bg-bg-panel overflow-hidden cursor-pointer marquee-mask"
      onClick={() => setPaused((p) => !p)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPaused((p) => !p); } }}
    >
      <div className={`flex items-center py-2 pl-3 whitespace-nowrap animate-marquee w-max ${paused ? "[animation-play-state:paused]" : ""}`}>
        <TickerRow items={data} />
        <TickerRow items={data} />
      </div>
    </div>
  );
}

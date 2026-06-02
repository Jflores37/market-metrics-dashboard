import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Top status bar: date/time in the center, refresh button on the right.
 * The hamburger that used to live here is gone — the sidebar manages
 * its own open/closed state via the collapse chevron inside it and the
 * expand chevron on the thin collapsed-strip.
 */
export default function TopBar() {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries();
    } finally {
      setTimeout(() => setRefreshing(false), 300);
    }
  }

  return (
    <div className="px-3 md:px-5 py-2 border-b border-border-subtle bg-bg-card flex items-center justify-between gap-3">
      <span className="text-accent-cyan font-mono font-bold tracking-tight text-base md:hidden signal-glow-cyan">
        Pulse
      </span>
      <span className="sm:hidden flex-1 text-center font-mono text-2xs text-accent-green tabular-nums uppercase tracking-wider signal-glow-green">
        {time}
      </span>
      <div className="font-mono text-xs text-accent-green flex-1 text-center hidden sm:block tabular-nums uppercase tracking-wider signal-glow-green">
        {date} · {time}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleRefresh}
          aria-label="Refresh data"
          className="flex items-center justify-center gap-1.5 px-2.5 py-2 min-h-[40px] sm:min-h-0 sm:py-1 rounded-[2px] text-2xs text-text-secondary hover:text-accent-cyan hover:bg-bg-hover transition-colors uppercase tracking-widest font-mono"
        >
          <span className={refreshing ? "animate-spin inline-block" : "inline-block"}>↻</span>
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function TopBar({
  sidebarOpen,
  onToggleSidebar,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
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
      // small min-delay so the spinner is visible even on a fast network
      setTimeout(() => setRefreshing(false), 300);
    }
  }

  return (
    <div className="px-3 md:px-5 py-2 border-b border-border-subtle bg-bg-card flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          className="hidden md:flex items-center justify-center w-7 h-7 rounded-[2px] text-text-secondary hover:text-accent-cyan hover:bg-bg-hover transition-colors"
        >
          {sidebarOpen ? "✕" : "☰"}
        </button>
        <span className="text-accent-cyan font-mono font-bold tracking-tight text-base md:hidden signal-glow-cyan">
          Pulse
        </span>
      </div>
      <div className="font-mono text-xs text-accent-green flex-1 text-center hidden sm:block tabular-nums uppercase tracking-wider signal-glow-green">
        {date} · {time}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={handleRefresh}
          aria-label="Refresh data"
          className="flex items-center gap-1.5 px-2 py-1 rounded-[2px] text-2xs text-text-secondary hover:text-accent-cyan hover:bg-bg-hover transition-colors uppercase tracking-widest font-mono"
        >
          <span className={refreshing ? "animate-spin inline-block" : "inline-block"}>↻</span>
          <span className="hidden sm:inline">Refresh</span>
        </button>
        <button
          aria-label="Settings"
          className="hidden sm:flex items-center justify-center w-7 h-7 rounded-[2px] text-text-dim hover:text-accent-cyan hover:bg-bg-hover transition-colors"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}

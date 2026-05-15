import { useEffect, useState } from "react";

export default function TopBar({
  sidebarOpen,
  onToggleSidebar,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const [now, setNow] = useState(() => new Date());
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

  return (
    <div className="px-3 md:px-5 py-2 border-b border-border-subtle bg-bg-card flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          className="hidden md:flex items-center justify-center w-7 h-7 rounded text-text-secondary hover:text-accent-orange hover:bg-bg-hover transition-colors"
        >
          {sidebarOpen ? "✕" : "☰"}
        </button>
        <span className="text-accent-orange font-mono font-bold tracking-tight text-base md:hidden">
          Pulse
        </span>
      </div>
      <div className="font-mono text-xs text-text-secondary flex-1 text-center hidden sm:block tabular-nums">
        {date} · {time}
      </div>
      <div className="text-2xs text-text-dim mono shrink-0 uppercase tracking-wider">
        live · cron-driven
      </div>
    </div>
  );
}

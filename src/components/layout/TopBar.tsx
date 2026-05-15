import { useEffect, useState } from "react";

export default function TopBar() {
  // Tick the clock once a minute so the time stays fresh
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
    <div className="px-4 md:px-6 py-2.5 border-b border-border-subtle bg-bg-card flex items-center justify-between gap-4">
      <div className="font-mono text-xs text-text-dim shrink-0 md:hidden flex items-baseline gap-2">
        <span className="text-accent-orange font-bold tracking-tight text-base">Pulse</span>
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

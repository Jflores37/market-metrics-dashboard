import { Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import MacroMonitor from './components/MacroMonitor';

function useNowUTC() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function formatUTC(d) {
  return d.toISOString().slice(11, 19) + ' UTC';
}

function marketSession(d) {
  // NYSE regular hours: 09:30–16:00 ET => 14:30–21:00 UTC (during EDT)
  //                                        13:30–20:00 UTC (during EST)
  // Pre: 04:00 ET = 09:00 UTC (EDT) / 08:00 (EST)
  // After-hours: ends 20:00 ET = 01:00 UTC (next day, EDT) / 00:00 UTC (EST)
  // Simplification: use EDT mapping (correct ~8 months/yr), label edge cases generically.
  const day = d.getUTCDay(); // 0 Sun ... 6 Sat
  if (day === 0 || day === 6) return { label: 'CLOSED · WEEKEND', tone: 'text-zinc-600' };

  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (minutes >= 13 * 60 + 30 && minutes < 20 * 60)
    return { label: 'REGULAR HOURS', tone: 'text-emerald-400' };
  if (minutes >= 9 * 60 && minutes < 13 * 60 + 30)
    return { label: 'PRE-MARKET', tone: 'text-amber-400' };
  if (minutes >= 20 * 60 || minutes < 1 * 60)
    return { label: 'AFTER-HOURS', tone: 'text-amber-400' };
  return { label: 'CLOSED', tone: 'text-zinc-600' };
}

function Header() {
  const now = useNowUTC();
  const session = marketSession(now);
  return (
    <header className="border-b border-zinc-800 scanlines">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Radio className="w-4 h-4 text-emerald-400 animate-pulse" strokeWidth={2.5} />
          <div className="leading-tight">
            <div className="text-[11px] font-bold tracking-[0.3em] text-zinc-100">MARKET METRICS</div>
            <div className="text-[9px] tracking-[0.2em] text-zinc-600">v0.1 · PHASE 1</div>
          </div>
        </div>
        <div className="text-right leading-tight">
          <div className={`text-[10px] font-bold tracking-[0.2em] ${session.tone}`}>{session.label}</div>
          <div className="text-[10px] tracking-[0.15em] text-zinc-500 tabular-nums">{formatUTC(now)}</div>
        </div>
      </div>
    </header>
  );
}

function WidgetCard({ title, subtitle, badge, badgeTone = 'text-emerald-400', children }) {
  return (
    <section className="border border-zinc-800 bg-zinc-950">
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
        <div className="leading-tight">
          <div className="text-[10px] font-bold tracking-[0.3em] text-zinc-100">{title}</div>
          {subtitle && <div className="text-[9px] tracking-[0.2em] text-zinc-600 mt-0.5">{subtitle}</div>}
        </div>
        {badge && (
          <div className={`text-[9px] font-bold tracking-[0.2em] ${badgeTone}`}>{badge}</div>
        )}
      </div>
      {children}
    </section>
  );
}

function PlaceholderCard({ title, subtitle }) {
  return (
    <WidgetCard title={title} subtitle={subtitle} badge="PHASE 1 · TODO" badgeTone="text-zinc-700">
      <div className="px-3 py-8 text-center text-[10px] tracking-[0.2em] text-zinc-700">
        BUILDING SOON
      </div>
    </WidgetCard>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      <main className="p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <WidgetCard title="MACRO MONITOR" subtitle="FRED · TWICE DAILY" badge="LIVE">
          <MacroMonitor />
        </WidgetCard>
        <PlaceholderCard title="SHOULD I TRADE?" subtitle="MARKET QUALITY SCORE" />
        <PlaceholderCard title="BREADTH METRICS" subtitle="SPY500 + $1B UNIVERSES" />
        <PlaceholderCard title="STAGE ANALYSIS" subtitle="STAGE 2 STOCKS" />
        <PlaceholderCard title="SECTOR PULSE + RRG" subtitle="RELATIVE ROTATION" />
      </main>
      <footer className="px-4 py-4 text-[9px] tracking-[0.25em] text-zinc-700 text-center">
        DATA PIPELINE · SUPABASE EDGE FUNCTIONS · PG_CRON
      </footer>
    </div>
  );
}

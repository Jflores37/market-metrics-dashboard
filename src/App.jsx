import { Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import MacroMonitor from './components/MacroMonitor';
import BreadthMetrics from './components/BreadthMetrics';
import StageAnalysis from './components/StageAnalysis';
import SectorPulse from './components/SectorPulse';
import ShouldITrade from './components/ShouldITrade';
import SuperScanners from './components/SuperScanners';

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
  const day = d.getUTCDay();
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
            <div className="text-[9px] tracking-[0.2em] text-zinc-600">v1.1 · PHASE 2 · SCANNERS</div>
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

function WidgetCard({ title, subtitle, badge, badgeTone = 'text-emerald-400', className = '', children }) {
  return (
    <section className={`border border-zinc-800 bg-zinc-950 ${className}`}>
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

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      <main className="p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <WidgetCard
          title="SHOULD I TRADE?"
          subtitle="MARKET QUALITY SCORE"
          badge="LIVE"
          className="lg:col-span-2"
        >
          <ShouldITrade />
        </WidgetCard>

        <WidgetCard
          title="SUPER SCANNERS"
          subtitle="MINERVINI · QULLAMAGGIE · CANSLIM · LIQUID ETFs"
          badge="LIVE"
          className="lg:col-span-2"
        >
          <SuperScanners />
        </WidgetCard>

        <WidgetCard title="BREADTH METRICS" subtitle="SPY 500 + $1B+ UNIVERSES" badge="LIVE">
          <BreadthMetrics />
        </WidgetCard>

        <WidgetCard title="SECTOR PULSE + RRG" subtitle="SPDR SECTORS VS VTI" badge="LIVE">
          <SectorPulse />
        </WidgetCard>

        <WidgetCard title="STAGE ANALYSIS" subtitle="WEINSTEIN STAGES · $1B+" badge="LIVE">
          <StageAnalysis />
        </WidgetCard>

        <WidgetCard title="MACRO MONITOR" subtitle="FRED · TWICE DAILY" badge="LIVE">
          <MacroMonitor />
        </WidgetCard>
      </main>
      <footer className="px-4 py-4 text-[9px] tracking-[0.25em] text-zinc-700 text-center">
        DATA PIPELINE · SUPABASE EDGE FUNCTIONS · PG_CRON · 4 SCHEDULED JOBS
      </footer>
    </div>
  );
}

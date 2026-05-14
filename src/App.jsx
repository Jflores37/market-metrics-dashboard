import { useEffect, useState } from 'react';
import { TABS } from './lib/tabs';
import { Sidebar } from './components/layout/Sidebar';
import { TopNav } from './components/layout/TopNav';
import { ScoreStrip } from './components/layout/ScoreStrip';
import ShouldITrade from './components/ShouldITrade';
import MacroMonitor from './components/MacroMonitor';
import BreadthMetrics from './components/BreadthMetrics';
import StageAnalysis from './components/StageAnalysis';
import SectorPulse from './components/SectorPulse';
import SuperScanners from './components/SuperScanners';

const TAB_KEY = 'pulse:activeTab';

function ComingSoon({ title, description }) {
  return (
    <div className="pulse-card p-12 text-center">
      <div className="pulse-label mb-3">Coming next</div>
      <div className="text-xl font-semibold mb-2 text-[var(--text-primary)]">{title}</div>
      <div className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">{description}</div>
    </div>
  );
}

function InternalsTab() {
  // Stacked layout: Breadth + Stage on left column, Sectors full-width
  return (
    <div className="space-y-5 pulse-stagger">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">Relative Rotation</h2>
        <SectorPulse />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">Breadth</h2>
          <BreadthMetrics />
        </div>
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">Stage Analysis</h2>
          <StageAnalysis />
        </div>
      </div>
    </div>
  );
}

function TabContent({ tabId }) {
  switch (tabId) {
    case 'should-i-trade':
      return <ShouldITrade />;
    case 'macro':
      return <MacroMonitor />;
    case 'internals':
      return <InternalsTab />;
    case 'scanners':
      return <SuperScanners />;
    case 'intraday':
      return (
        <ComingSoon
          title="Intraday"
          description="Live market snapshot, top gainers and losers, and the pre-market watchlist. Phase 3."
        />
      );
    default:
      return null;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'should-i-trade';
    return localStorage.getItem(TAB_KEY) || 'should-i-trade';
  });

  useEffect(() => {
    localStorage.setItem(TAB_KEY, activeTab);
  }, [activeTab]);

  const activeMeta = TABS.find((t) => t.id === activeTab) ?? TABS[0];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <TopNav activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="flex-1 min-w-0 flex flex-col">
        <ScoreStrip onClickScore={() => setActiveTab('should-i-trade')} />

        <div className="flex-1 px-4 sm:px-6 py-5 max-w-[1400px] w-full mx-auto pulse-fade-in" key={activeTab}>
          <div className="mb-5 hidden md:block">
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              {activeMeta.label}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {activeMeta.description}
            </p>
          </div>

          <TabContent tabId={activeTab} />
        </div>

        <footer className="px-4 sm:px-6 py-4 text-[10px] tracking-wider text-[var(--text-disabled)] text-center border-t border-[var(--border-faint)]">
          DATA · SUPABASE EDGE FUNCTIONS · PG_CRON · 4 SCHEDULED JOBS
        </footer>
      </main>
    </div>
  );
}

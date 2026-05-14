import { TABS } from '../../lib/tabs';
import { Brand } from './Brand';

export function Sidebar({ activeTab, onTabChange }) {
  return (
    <aside className="hidden md:flex flex-col w-[220px] flex-shrink-0 border-r border-[var(--border-faint)] bg-[var(--bg-base)] h-screen sticky top-0">
      <div className="px-4 py-4 border-b border-[var(--border-faint)]">
        <Brand />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              className="pulse-tab"
              data-active={isActive}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onTabChange(tab.id)}
              title={tab.description}
              style={tab.disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" strokeWidth={2} />
              <span className="flex-1">{tab.label}</span>
              {tab.disabled && (
                <span className="text-[9px] tracking-wider text-[var(--text-disabled)] uppercase">soon</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-[var(--border-faint)] text-[10px] tracking-wider text-[var(--text-disabled)]">
        v2.0 · PHASE 2
      </div>
    </aside>
  );
}

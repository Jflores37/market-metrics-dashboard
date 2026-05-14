import { useEffect, useRef } from 'react';
import { TABS } from '../../lib/tabs';
import { Brand } from './Brand';

export function TopNav({ activeTab, onTabChange }) {
  const railRef = useRef(null);

  // Auto-scroll active tab into view on change
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const activeEl = rail.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

  return (
    <div className="md:hidden sticky top-0 z-30 bg-[var(--bg-base)] border-b border-[var(--border-faint)]">
      <div className="flex items-center justify-between px-4 py-3">
        <Brand />
      </div>
      <div
        ref={railRef}
        className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              className="pulse-tab-pill"
              data-active={isActive}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && onTabChange(tab.id)}
              style={tab.disabled ? { opacity: 0.4 } : undefined}
            >
              {tab.short}
              {tab.disabled && <span className="ml-1 text-[var(--text-disabled)]">·</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { NavLink } from "react-router-dom";
import { TABS } from "@/lib/tabs";

export default function Sidebar({ onCollapse }: { onCollapse: () => void }) {
  return (
    <aside className="md:w-56 lg:w-60 shrink-0 border-b md:border-b-0 md:border-r border-border bg-bg-card md:min-h-screen md:sticky md:top-0">
      <div className="p-4 border-b border-border-subtle hidden md:flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xl font-bold tracking-tight text-accent-cyan signal-glow-cyan">
            Pulse
          </div>
          <div className="text-2xs text-text-dim mono mt-0.5 uppercase tracking-widest">
            market terminal
          </div>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          className="text-text-dim hover:text-accent-cyan hover:bg-bg-hover transition-colors w-6 h-6 flex items-center justify-center rounded-[2px] text-sm leading-none"
        >
          ‹
        </button>
      </div>

      {/* Desktop: stacked card-buttons. Mobile: horizontal scroll pills. */}
      <nav className="p-3 flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible">
        {TABS.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.path}
            end={tab.path === "/"}
            className={({ isActive }) =>
              `block px-4 py-2.5 rounded-[2px] border text-sm font-mono tracking-tight transition-colors whitespace-nowrap text-center md:text-left ${
                isActive
                  ? "bg-accent-cyan/10 border-accent-cyan text-accent-cyan signal-glow-cyan"
                  : "bg-bg-card border-border-subtle text-text-secondary hover:text-text-primary hover:border-border hover:bg-bg-hover"
              }`
            }
          >
            <span className="md:hidden">{tab.shortLabel}</span>
            <span className="hidden md:inline">{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

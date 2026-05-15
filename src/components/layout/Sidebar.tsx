import { NavLink } from "react-router-dom";
import { TABS } from "@/lib/tabs";

export default function Sidebar() {
  return (
    <aside className="md:w-56 lg:w-60 shrink-0 border-b md:border-b-0 md:border-r border-border bg-bg-card md:min-h-screen md:sticky md:top-0">
      <div className="p-4 border-b border-border-subtle hidden md:block">
        <div className="font-mono text-xl font-bold tracking-tight text-accent-cyan signal-glow-cyan">
          Pulse
        </div>
        <div className="text-2xs text-text-dim mono mt-0.5 uppercase tracking-widest">
          market terminal
        </div>
      </div>

      <nav className="p-2 md:p-3 flex md:flex-col gap-0.5 overflow-x-auto md:overflow-x-visible">
        {TABS.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.path}
            end={tab.path === "/"}
            className={({ isActive }) =>
              `px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors whitespace-nowrap rounded-[2px] border-l-2 flex items-center gap-2 ${
                isActive
                  ? "text-accent-cyan bg-bg-panel border-accent-cyan signal-glow-cyan"
                  : "text-text-secondary border-transparent hover:text-text-primary hover:bg-bg-hover hover:border-border"
              }`
            }
          >
            <span className="text-accent-cyan/80 text-sm">{tab.glyph}</span>
            <span className="md:hidden">{tab.shortLabel}</span>
            <span className="hidden md:inline">{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

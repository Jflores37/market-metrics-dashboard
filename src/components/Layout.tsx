import { NavLink, Outlet, useLocation } from "react-router-dom";
import { TABS } from "@/lib/tabs";

export default function Layout() {
  const location = useLocation();
  const currentTab = TABS.find(
    (t) =>
      t.path === location.pathname ||
      (t.path !== "/" && location.pathname.startsWith(t.path))
  );

  return (
    <div className="min-h-screen bg-bg text-text-primary flex flex-col">
      <header className="border-b border-border bg-bg-card sticky top-0 z-20">
        <div className="px-4 md:px-6 py-3 flex items-baseline gap-4">
          <NavLink to="/" className="flex items-baseline gap-2 shrink-0">
            <span className="font-mono text-xl font-bold tracking-tight text-accent-orange">
              Pulse
            </span>
            <span className="text-2xs text-text-dim mono hidden sm:inline uppercase tracking-wider">
              market terminal
            </span>
          </NavLink>
          <div className="flex-1 hidden lg:block text-xs text-text-dim mono truncate">
            {currentTab?.description}
          </div>
          <div className="text-2xs text-text-dim mono shrink-0">
            {new Date().toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
        </div>

        <nav className="px-2 md:px-4 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {TABS.map((tab) => (
              <NavLink
                key={tab.key}
                to={tab.path}
                end={tab.path === "/"}
                className={({ isActive }) =>
                  `px-3 py-2 text-sm font-mono uppercase tracking-wider transition-colors whitespace-nowrap border-b-2 ${
                    isActive
                      ? "text-accent-orange border-accent-orange"
                      : "text-text-secondary border-transparent hover:text-text-primary hover:border-border"
                  }`
                }
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      <main className="flex-1 px-4 md:px-6 py-6 max-w-screen-2xl w-full mx-auto">
        <Outlet />
      </main>

      <footer className="border-t border-border-subtle px-4 md:px-6 py-3 text-2xs text-text-dim mono">
        Pulse · backend cron-driven · data refreshes every 10 min during market hours
      </footer>
    </div>
  );
}

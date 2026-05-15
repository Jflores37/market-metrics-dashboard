import { Outlet } from "react-router-dom";
import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import TickerTape from "@/components/layout/TickerTape";
import TerminalFrame from "@/components/layout/TerminalFrame";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-bg text-text-primary md:flex">
      <div className={!sidebarOpen ? "md:hidden" : ""}>
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
        <TickerTape />
        <TerminalFrame>
          <Outlet />
        </TerminalFrame>
        <footer className="border-t border-border-subtle px-4 md:px-6 py-3 text-2xs text-text-dim mono uppercase tracking-widest text-center">
          Pulse · backend cron-driven · data refreshes every 10 min during market hours
        </footer>
      </div>
    </div>
  );
}

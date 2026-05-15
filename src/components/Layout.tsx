import { Outlet } from "react-router-dom";
import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import SidebarStrip from "@/components/layout/SidebarStrip";
import TopBar from "@/components/layout/TopBar";
import TickerTape from "@/components/layout/TickerTape";
import TerminalFrame from "@/components/layout/TerminalFrame";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-bg text-text-primary md:flex">
      {/*
        Desktop: full sidebar OR thin collapsed strip.
        Mobile: full sidebar always (renders as a horizontal pill row at the top).
      */}
      {sidebarOpen ? (
        <Sidebar onCollapse={() => setSidebarOpen(false)} />
      ) : (
        <SidebarStrip onExpand={() => setSidebarOpen(true)} />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
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

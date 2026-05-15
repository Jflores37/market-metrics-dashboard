import { Outlet } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import TickerTape from "@/components/layout/TickerTape";

export default function Layout() {
  return (
    <div className="min-h-screen bg-bg text-text-primary md:flex">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <TickerTape />
        <main className="flex-1 px-4 md:px-6 py-6 w-full">
          <Outlet />
        </main>
        <footer className="border-t border-border-subtle px-4 md:px-6 py-3 text-2xs text-text-dim mono">
          Pulse · backend cron-driven · data refreshes every 10 min during market hours
        </footer>
      </div>
    </div>
  );
}

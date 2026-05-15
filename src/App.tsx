import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { TickerModalProvider } from "@/components/TickerChartModal";
import Layout from "@/components/Layout";
import MarketMetrics from "@/pages/MarketMetrics";
import SuperScanners from "@/pages/SuperScanners";
import Intraday from "@/pages/Intraday";
import MacroMonitor from "@/pages/MacroMonitor";
import ShouldITrade from "@/pages/ShouldITrade";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TickerModalProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<MarketMetrics />} />
              <Route path="scanners" element={<SuperScanners />} />
              <Route path="intraday" element={<Intraday />} />
              <Route path="macro" element={<MacroMonitor />} />
              <Route path="should-i-trade" element={<ShouldITrade />} />
            </Route>
          </Routes>
        </TickerModalProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

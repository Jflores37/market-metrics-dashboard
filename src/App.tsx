import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import MarketMetrics from "@/pages/MarketMetrics";
import SuperScanners from "@/pages/SuperScanners";
import Intraday from "@/pages/Intraday";
import MacroMonitor from "@/pages/MacroMonitor";
import ShouldITrade from "@/pages/ShouldITrade";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<MarketMetrics />} />
        <Route path="scanners" element={<SuperScanners />} />
        <Route path="intraday" element={<Intraday />} />
        <Route path="macro" element={<MacroMonitor />} />
        <Route path="should-i-trade" element={<ShouldITrade />} />
        <Route path="*" element={<MarketMetrics />} />
      </Route>
    </Routes>
  );
}

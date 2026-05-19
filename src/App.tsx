import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { isSupabaseConfigured } from "@/lib/supabase";
import { TickerModalProvider } from "@/components/TickerChartModal";
import Layout from "@/components/Layout";
import MarketMetrics from "@/pages/MarketMetrics";
import SuperScanners from "@/pages/SuperScanners";
import Intraday from "@/pages/Intraday";
import MacroMonitor from "@/pages/MacroMonitor";
import ShouldITrade from "@/pages/ShouldITrade";

function ConfigError() {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "#0a0c14",
        color: "#e8eaf0",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        lineHeight: 1.6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ maxWidth: 640 }}>
        <div style={{ color: "#ef4444", fontWeight: 700, marginBottom: 12 }}>
          Configuration error
        </div>
        <div style={{ color: "#a0a4b3", marginBottom: 16 }}>
          This deployment is missing its Supabase environment variables, so no
          market data can load.
        </div>
        <div style={{ color: "#a0a4b3" }}>
          Set <code style={{ color: "#e8eaf0" }}>VITE_SUPABASE_URL</code> and{" "}
          <code style={{ color: "#e8eaf0" }}>VITE_SUPABASE_ANON_KEY</code> in
          Vercel → Project → Settings → Environment Variables, then redeploy.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigError />;
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

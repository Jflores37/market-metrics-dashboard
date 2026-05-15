export default function MacroMonitor() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-mono text-xl font-bold tracking-tight">Macro Monitor</h1>
        <p className="text-sm text-text-secondary mt-1">
          12 FRED KPIs · fiscal block · hawkish/dovish balance
        </p>
      </header>

      <div className="terminal-card p-8 space-y-2">
        <div className="font-mono text-xs text-text-dim uppercase tracking-wider">
          Status
        </div>
        <div className="text-text-secondary">
          Macro KPI strip + fiscal block + signal donut coming in Batch 5.
        </div>
        <div className="text-2xs text-text-dim mono pt-3 leading-relaxed">
          Backend complete: <span className="text-text-secondary">macro_monitor_dashboard_v · macro_kpi_v · macro_fiscal_v · macro_signal_balance_v</span>
        </div>
      </div>
    </div>
  );
}

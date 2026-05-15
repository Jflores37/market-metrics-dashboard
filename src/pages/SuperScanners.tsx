export default function SuperScanners() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-mono text-xl font-bold tracking-tight">Super Scanners</h1>
        <p className="text-sm text-text-secondary mt-1">
          19 curated scanners: Minervini, CANSLIM, Qullamaggie, IPOs, earnings
        </p>
      </header>

      <div className="terminal-card p-8 space-y-2">
        <div className="font-mono text-xs text-text-dim uppercase tracking-wider">
          Status
        </div>
        <div className="text-text-secondary">
          19 scanner widgets coming in Batch 6.
        </div>
        <div className="text-2xs text-text-dim mono pt-3 leading-relaxed">
          Backend complete: <span className="text-text-secondary">scanner_summary_v · scanner_results_latest_v · scanner_catalog · earnings_this_week_v</span>
        </div>
      </div>
    </div>
  );
}

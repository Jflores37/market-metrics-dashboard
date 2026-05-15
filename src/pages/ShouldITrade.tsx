export default function ShouldITrade() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-mono text-xl font-bold tracking-tight">Should I Trade</h1>
        <p className="text-sm text-text-secondary mt-1">
          5-factor market quality score · execution window · swing/day mode
        </p>
      </header>

      <div className="terminal-card p-8 space-y-2">
        <div className="font-mono text-xs text-text-dim uppercase tracking-wider">
          Status
        </div>
        <div className="text-text-secondary">
          Full Should I Trade widget — 5 category scores, EWS, 4 factor badges, mode toggle, narrative — coming in Batch 5.
        </div>
        <div className="text-2xs text-text-dim mono pt-3 leading-relaxed">
          (Currently visible as a pinned banner on the Market Metrics tab.)
        </div>
        <div className="text-2xs text-text-dim mono pt-3 leading-relaxed">
          Backend complete: <span className="text-text-secondary">should_i_trade_latest_v · should_i_trade_history (updated every 10 min during market hours)</span>
        </div>
      </div>
    </div>
  );
}

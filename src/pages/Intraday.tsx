export default function Intraday() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-mono text-xl font-bold tracking-tight">Intraday</h1>
        <p className="text-sm text-text-secondary mt-1">
          Live tape · top gainers · top losers · stocks in play · pre-market
        </p>
      </header>

      <div className="terminal-card p-8 space-y-2">
        <div className="font-mono text-xs text-text-dim uppercase tracking-wider">
          Status
        </div>
        <div className="text-text-secondary">
          5 intraday widgets + ticker tape coming in Batch 7.
        </div>
        <div className="text-2xs text-text-dim mono pt-3 leading-relaxed">
          Backend complete: <span className="text-text-secondary">intraday_dashboard_v · intraday_quotes_latest_v · intraday_top_gainers_v · intraday_top_losers_v · intraday_in_play_v · intraday_premarket_v · earnings_yesterday_today_v</span>
        </div>
      </div>
    </div>
  );
}

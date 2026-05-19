import { downloadTextFile } from "@/lib/csv";

/**
 * TradingView-compatible watchlist export. One ticker per line.
 * Filename should end in .txt — TradingView's "Import list" reads
 * plain text and adds each line as a symbol.
 *
 * Renders next to CsvButton in scanner card headers.
 */
export default function WlButton({
  filename,
  tickers,
  disabled,
}: {
  filename: string;
  tickers: readonly string[];
  disabled?: boolean;
}) {
  const empty = !tickers || tickers.length === 0;
  return (
    <button
      type="button"
      disabled={disabled || empty}
      onClick={() => downloadTextFile(filename, tickers.join("\n"), "text/plain")}
      aria-label={`Download ${filename} as TradingView watchlist`}
      title="TradingView watchlist (.txt, one ticker per line)"
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] text-2xs text-text-secondary hover:text-accent-cyan hover:bg-bg-hover transition-colors uppercase tracking-widest font-mono disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-text-secondary disabled:hover:bg-transparent"
    >
      <span aria-hidden="true">↓</span>
      <span className="hidden sm:inline">WL</span>
    </button>
  );
}

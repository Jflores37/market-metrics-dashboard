import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface TickerModalContextType {
  open: (ticker: string) => void;
  close: () => void;
  ticker: string | null;
}

const DEFAULT_CTX: TickerModalContextType = {
  ticker: null,
  open: () => {
    console.warn("TickerModalProvider is not wrapping the app — modal will not open.");
  },
  close: () => {},
};

const TickerModalContext = createContext<TickerModalContextType | null>(null);

export function useTickerModal(): TickerModalContextType {
  return useContext(TickerModalContext) ?? DEFAULT_CTX;
}

export function TickerLink({ ticker, className }: { ticker: string; className?: string }) {
  const { open } = useTickerModal();
  const cls = `text-text-primary font-mono font-semibold hover:text-accent-orange transition-colors cursor-pointer ${className ?? ""}`;
  return (
    <button type="button" onClick={() => open(ticker)} className={cls}>
      {ticker}
    </button>
  );
}

function ChartModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const src = `https://www.tradingview.com/widgetembed/?frameElementId=tradingview_chart&symbol=${encodeURIComponent(ticker)}&interval=D&theme=dark&style=1&hide_side_toolbar=1`;
  const tvUrl = `https://www.tradingview.com/symbols/${encodeURIComponent(ticker)}/`;

  const backdropClass = "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4";
  const cardClass = "bg-bg-card border border-border rounded-lg overflow-hidden flex flex-col w-full max-w-5xl h-[90vh] sm:h-[80vh]";
  const headerClass = "flex items-center justify-between border-b border-border-subtle px-4 py-2 shrink-0";
  const closeBtnClass = "w-7 h-7 rounded text-text-secondary hover:text-accent-orange hover:bg-bg-hover transition-colors flex items-center justify-center text-base";
  const openLinkClass = "font-mono text-2xs text-text-dim hover:text-accent-orange transition-colors";

  return (
    <div className={backdropClass} onClick={onClose}>
      <div className={cardClass} onClick={(e) => e.stopPropagation()}>
        <div className={headerClass}>
          <div className="flex items-baseline gap-2">
            <span className="text-accent-orange text-sm">▶</span>
            <span className="font-mono text-sm font-bold text-text-primary">{ticker}</span>
            <span className="font-mono text-2xs text-text-dim uppercase tracking-widest">TradingView</span>
          </div>
          <div className="flex items-center gap-3">
            <a href={tvUrl} target="_blank" rel="noopener noreferrer" className={openLinkClass}>open ↗</a>
            <button type="button" onClick={onClose} aria-label="Close chart" className={closeBtnClass}>✕</button>
          </div>
        </div>
        <iframe src={src} className="flex-1 w-full border-0" title={`${ticker} chart`} allowFullScreen />
      </div>
    </div>
  );
}

export function TickerModalProvider({ children }: { children: ReactNode }) {
  const [ticker, setTicker] = useState<string | null>(null);

  const value: TickerModalContextType = {
    ticker,
    open: (t: string) => setTicker(t.toUpperCase()),
    close: () => setTicker(null),
  };

  return (
    <TickerModalContext.Provider value={value}>
      {children}
      {ticker && <ChartModal ticker={ticker} onClose={() => setTicker(null)} />}
    </TickerModalContext.Provider>
  );
}

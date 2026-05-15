import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type TickerModalCtx = {
  open: (ticker: string) => void;
  close: () => void;
  ticker: string | null;
};

const noop = () => {};
const DEFAULT_CTX: TickerModalCtx = { open: noop, close: noop, ticker: null };
const Ctx = createContext<TickerModalCtx>(DEFAULT_CTX);

export function useTickerModal(): TickerModalCtx {
  return useContext(Ctx);
}

export function TickerLink({ ticker, className }: { ticker: string; className?: string }) {
  const { open } = useTickerModal();
  const baseClass = "font-mono font-semibold text-text-primary hover:text-accent-orange transition-colors cursor-pointer";
  const fullClass = className ? `${baseClass} ${className}` : baseClass;
  return (
    <button type="button" onClick={() => open(ticker)} className={fullClass}>
      {ticker}
    </button>
  );
}

function ChartModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const src = `https://s.tradingview.com/widgetembed/?frameElementId=tv_chart&symbol=${ticker}&interval=D&hidesidetoolbar=0&theme=dark&style=1&timezone=Etc%2FUTC`;
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${ticker}`;
  const backdropClass = "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4";
  const cardClass = "bg-bg-card border border-border-default rounded-md w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden";
  const headerClass = "flex items-center justify-between px-4 py-2 border-b border-border-default bg-bg-secondary";
  const openLinkClass = "font-mono text-2xs text-accent-blue hover:text-accent-orange transition-colors";
  const closeBtnClass = "text-text-dim hover:text-text-primary text-lg leading-none";
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
        <iframe src={src} className="flex-1 w-full border-0" title={`${ticker} chart`} />
      </div>
    </div>
  );
}

export function TickerModalProvider({ children }: { children: ReactNode }) {
  const [ticker, setTicker] = useState<string | null>(null);
  const open = useCallback((t: string) => setTicker(t.toUpperCase()), []);
  const close = useCallback(() => setTicker(null), []);
  const value = useMemo<TickerModalCtx>(() => ({ open, close, ticker }), [open, close, ticker]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {ticker !== null ? <ChartModal ticker={ticker} onClose={close} /> : null}
    </Ctx.Provider>
  );
}

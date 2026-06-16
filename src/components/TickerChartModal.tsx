import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

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
  // text-text-primary picks up the new green-tinted foreground; hover
  // shifts to cyan to match the rest of the terminal palette (icons,
  // active states, glow).
  const baseClass = "font-mono font-semibold text-text-primary hover:text-accent-cyan transition-colors cursor-pointer";
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
  const backdropClass = "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4";
  const cardClass = "bg-bg-card border border-border rounded-none sm:rounded-[2px] w-full max-w-5xl h-full sm:h-[80vh] flex flex-col overflow-hidden";
  const headerClass = "flex items-center justify-between px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] border-b border-border bg-bg-panel";
  const openLinkClass = "font-mono text-2xs text-accent-cyan hover:text-text-primary transition-colors uppercase tracking-widest";
  const closeBtnClass = "inline-flex items-center justify-center min-w-[40px] min-h-[40px] -mr-2 text-text-dim hover:text-text-primary text-xl leading-none";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className={backdropClass} onClick={onClose}>
      <div className={cardClass} onClick={(e) => e.stopPropagation()}>
        <div className={headerClass}>
          <div className="flex items-baseline gap-2">
            <span className="text-accent-cyan text-sm signal-glow-cyan">▶</span>
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

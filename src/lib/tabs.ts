// Single source of truth for the 5 tab definitions. Imported by Layout
// (to render the tab bar) and by individual pages (to show their description).

export type TabKey =
  | "market-metrics"
  | "super-scanners"
  | "intraday"
  | "macro-monitor"
  | "should-i-trade";

export interface Tab {
  key: TabKey;
  path: string;
  label: string;
  shortLabel: string;
  glyph: string;
  description: string;
}

// Display order matches the reference sidebar mock: decision tools
// first, then macro context, then drill-down screens.
export const TABS: readonly Tab[] = [
  {
    key: "should-i-trade",
    path: "/should-i-trade",
    label: "Should I Trade?",
    shortLabel: "SIT",
    glyph: "⚡",
    description: "5-factor market quality score · execution window · swing/day mode",
  },
  {
    key: "macro-monitor",
    path: "/macro",
    label: "Macro Monitor",
    shortLabel: "Macro",
    glyph: "◉",
    description: "12 FRED KPIs · fiscal block · hawkish/dovish balance",
  },
  {
    key: "market-metrics",
    path: "/",
    label: "Market Metrics",
    shortLabel: "Metrics",
    glyph: "⊞",
    description: "Universe breadth · sectors · leading industries · stage analysis",
  },
  {
    key: "super-scanners",
    path: "/scanners",
    label: "Super Scanners",
    shortLabel: "Scanners",
    glyph: "⊙",
    description: "19 curated scanners: Minervini, CANSLIM, Qullamaggie, IPOs, earnings",
  },
  {
    key: "intraday",
    path: "/intraday",
    label: "Intraday Inspector",
    shortLabel: "Intraday",
    glyph: "▶",
    description: "Live tape · top gainers · top losers · stocks in play · pre-market",
  },
] as const;

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
  description: string;
}

export const TABS: readonly Tab[] = [
  {
    key: "market-metrics",
    path: "/",
    label: "Market Metrics",
    shortLabel: "Metrics",
    description: "Universe breadth · sectors · leading industries · stage analysis",
  },
  {
    key: "super-scanners",
    path: "/scanners",
    label: "Super Scanners",
    shortLabel: "Scanners",
    description: "19 curated scanners: Minervini, CANSLIM, Qullamaggie, IPOs, earnings",
  },
  {
    key: "intraday",
    path: "/intraday",
    label: "Intraday",
    shortLabel: "Intraday",
    description: "Live tape · top gainers · top losers · stocks in play · pre-market",
  },
  {
    key: "macro-monitor",
    path: "/macro",
    label: "Macro Monitor",
    shortLabel: "Macro",
    description: "12 FRED KPIs · fiscal block · hawkish/dovish balance",
  },
  {
    key: "should-i-trade",
    path: "/should-i-trade",
    label: "Should I Trade",
    shortLabel: "SIT",
    description: "5-factor market quality score · execution window · swing/day mode",
  },
] as const;

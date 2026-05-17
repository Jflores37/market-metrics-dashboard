// Per-scanner column layout, mirroring the reference repo's 9 distinct
// table builders (pakkiraju/Market-Metrics-, finviz-elite branch,
// src/layout.py). Each scanner declares which columns to render and in
// what order. Drives the SuperScanners table renderer.
//
// Reference column set (the "basic" 7-column layout shared by ~10 scanners):
//   Ticker | Price | Avg Vol | Rel Vol | Change % | Volume | ATR %
//
// Variants:
//   - Qullamaggie family adds a `tag` column (EP/PS/BO badges).
//   - StockBee 20% weekly inserts a `week` perf column.
//   - StockBee 4% daily reorders to put `change` before `price`.
//   - Earnings This Week inserts `mkt_cap` after ticker.

export type ScannerColKey =
  | "ticker"
  | "price"
  | "avg_vol"
  | "rel_vol"
  | "change"
  | "volume"
  | "atr_pct"
  | "tag"
  | "week"
  | "mkt_cap"
  | "roe"
  | "net_margin"
  | "short_float";

export interface ScannerLayout {
  columns: ScannerColKey[];
}

// Basic 7-column layout (Ticker / Price / Avg Vol / Rel Vol / Change /
// Vol / ATR %). Matches `_build_screener_table` in reference layout.py:494
// and the reference's verbatim export URL c=1,47,61,62,63,64,65.
const BASIC: ScannerColKey[] = ["ticker", "price", "avg_vol", "rel_vol", "change", "volume", "atr_pct"];

// Qullamaggie variants: basic + tag column (EP/PS/BO badges).
const QULLA: ScannerColKey[] = [...BASIC, "tag"];

// StockBee 4% daily: change column comes BEFORE price.
const DAILY_4PCT: ScannerColKey[] = ["ticker", "change", "price", "avg_vol", "rel_vol", "volume", "atr_pct"];

// O'Neil full (reference build_oneil_table L1075): basic + ROE + Net Margin.
// The reference's oneil URL requests c=1,32,40,47,... (ROE col 32, Profit
// Margin col 40), so these resolve from the CSV header names.
const ONEIL: ScannerColKey[] = [...BASIC, "roe", "net_margin"];

// High Short Float (reference L1328): Sh Float inserted right after Ticker.
// Reference's jeff_sun_high_short_float URL is v=131 c=1,32,... (col 32 =
// Short Float in the Financial view).
const HIGH_SHORT: ScannerColKey[] = ["ticker", "short_float", "price", "avg_vol", "rel_vol", "change", "volume", "atr_pct"];

// StockBee 20% Weekly Movers (reference build_20pct_weekly_table): Week perf
// column after Ticker. Reference export c=1,41,47,61,62,63,64,65.
const WEEKLY: ScannerColKey[] = ["ticker", "week", "price", "avg_vol", "rel_vol", "change", "volume", "atr_pct"];

export const SCANNER_LAYOUTS: Record<string, ScannerLayout> = {
  // Trend group
  minervini:            { columns: BASIC },
  canslim:              { columns: ONEIL },
  jeff_sun_canslim:     { columns: BASIC },
  high_adr:             { columns: BASIC },
  extended_bases:       { columns: BASIC },
  julian_strongest:     { columns: BASIC },
  club_97:              { columns: BASIC },
  nine_m_movers:        { columns: BASIC },
  weekly_20pct:         { columns: WEEKLY },

  // Qullamaggie family (EP / PS / BO + combined rollup)
  qullamaggie:          { columns: QULLA },
  qullamaggie_breakout: { columns: QULLA },
  qullamaggie_combined: { columns: QULLA },
  parabolic_short:      { columns: QULLA },

  // Jeff Sun movers — reference URLs all use the BASIC c= set
  // (jeff_sun_1w20 does NOT include PerfWeek, so no Week column).
  perf_1w20:            { columns: BASIC },
  perf_4w30:            { columns: BASIC },
  perf_4w50:            { columns: BASIC },
  perf_13w50:           { columns: BASIC },
  perf_26w100:          { columns: BASIC },

  // Special
  up4_daily:            { columns: DAILY_4PCT },
  ipo_thisweek:         { columns: BASIC },
  high_short:           { columns: HIGH_SHORT },
  liquid_etfs:          { columns: BASIC },
};

export function layoutFor(scannerId: string): ScannerLayout {
  return SCANNER_LAYOUTS[scannerId] ?? { columns: BASIC };
}

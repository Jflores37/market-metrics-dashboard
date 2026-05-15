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
  | "mkt_cap";

export interface ScannerLayout {
  columns: ScannerColKey[];
}

// Basic 7-column layout (Ticker / Price / Avg Vol / Rel Vol / Change /
// Vol / ATR %). Matches `_build_screener_table` in reference layout.py:494.
const BASIC: ScannerColKey[] = ["ticker", "price", "avg_vol", "rel_vol", "change", "volume", "atr_pct"];

// Qullamaggie variants: basic + tag column (EP/PS/BO badges).
const QULLA: ScannerColKey[] = [...BASIC, "tag"];

// StockBee 20% weekly mover: inserts `week` between ticker and price.
const WEEKLY_MOVER: ScannerColKey[] = ["ticker", "week", "price", "avg_vol", "rel_vol", "change", "volume", "atr_pct"];

// StockBee 4% daily: change column comes BEFORE price.
const DAILY_4PCT: ScannerColKey[] = ["ticker", "change", "price", "avg_vol", "rel_vol", "volume", "atr_pct"];

export const SCANNER_LAYOUTS: Record<string, ScannerLayout> = {
  // Trend group
  minervini:            { columns: BASIC },
  canslim:              { columns: BASIC },
  jeff_sun_canslim:     { columns: BASIC },
  high_adr:             { columns: BASIC },
  extended_bases:       { columns: BASIC },
  julian_strongest:     { columns: BASIC },
  club_97:              { columns: BASIC },

  // Qullamaggie family (EP / PS / BO + combined rollup)
  qullamaggie:          { columns: QULLA },
  qullamaggie_breakout: { columns: QULLA },
  qullamaggie_combined: { columns: QULLA },
  parabolic_short:      { columns: QULLA },

  // Jeff Sun movers
  perf_1w20:            { columns: WEEKLY_MOVER },
  perf_4w30:            { columns: BASIC },
  perf_4w50:            { columns: BASIC },
  perf_13w50:           { columns: BASIC },
  perf_26w100:          { columns: BASIC },

  // Special
  up4_daily:            { columns: DAILY_4PCT },
  ipo_thisweek:         { columns: BASIC },
  high_short:           { columns: BASIC },
  liquid_etfs:          { columns: BASIC },
};

export function layoutFor(scannerId: string): ScannerLayout {
  return SCANNER_LAYOUTS[scannerId] ?? { columns: BASIC };
}

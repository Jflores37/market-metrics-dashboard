/**
 * Build FinViz Elite screener URLs for the Key Metrics grid cells.
 * Each cell knows its universe (NQ100 / SPY500 / DJIA / RUS2000 / $1B+)
 * and its metric (% above SMA50, new 52w highs, etc.), so we can deep-link
 * to a screener pre-filtered for that exact slice.
 */

type Universe = "NQ100" | "SPY500" | "DJIA" | "RUS2000" | "$1B+" | string;
type Side = "above" | "below";

/** FinViz `f=` filter token per universe */
const UNIVERSE_FILTER: Record<string, string> = {
  NQ100: "idx_ndx",
  SPY500: "idx_sp500",
  DJIA: "idx_dji",
  RUS2000: "idx_rut",
  "$1B+": "cap_largeover", // $2B+ in FinViz parlance; closest tier to $1B+
};

/**
 * Map of metric_id → FinViz filter tokens for the "above / matching" side.
 * The "below" side is the inverse where applicable; for metrics with no
 * binary opposite (e.g. new highs), we drop the metric filter and just
 * keep the universe.
 */
const METRIC_FILTER: Record<string, { above?: string; below?: string }> = {
  pct_above_sma20:       { above: "ta_sma20_pa",   below: "ta_sma20_pb" },
  pct_above_sma50:       { above: "ta_sma50_pa",   below: "ta_sma50_pb" },
  pct_above_sma200:      { above: "ta_sma200_pa",  below: "ta_sma200_pb" },
  pct_aligned_bullish:   { above: "ta_perf_4w20o,ta_sma20_pa,ta_sma50_pa,ta_sma200_pa" },
  new_52w_highs:         { above: "ta_highlow52w_nh" },
  new_52w_lows:          { above: "ta_highlow52w_nl" },
  up_4pct:               { above: "ta_perf_dup" },
  down_4pct:             { above: "ta_perf_ddown" },
};

/**
 * Build a FinViz screener URL for a given (universe, metric, side).
 * Returns null if the universe isn't mappable.
 */
export function finvizScreenerUrl(
  universe: Universe,
  metricId: string,
  side: Side
): string | null {
  const universeFilter = UNIVERSE_FILTER[universe];
  if (!universeFilter) return null;

  const metricFilters = METRIC_FILTER[metricId];
  const metricFilter = metricFilters?.[side] ?? null;

  const filters = [universeFilter, metricFilter].filter(Boolean).join(",");
  // v=111 = "Overview" view (default Finviz screener layout)
  return `https://finviz.com/screener.ashx?v=111&f=${filters}`;
}

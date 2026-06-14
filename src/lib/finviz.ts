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
  "$1B+": "cap_midover", // Finviz has no $1B tier; cap_midover ($2B+) is closest (cap_largeover is $10B+)
};

/**
 * Map of metric_id → FinViz filter tokens for the "above / matching" side.
 * The "below" side is the inverse where applicable; for metrics with no
 * binary opposite (e.g. new highs), we drop the metric filter and just
 * keep the universe.
 */
// Keyed by the metric_id values key_metrics_v actually emits. Tokens validated
// live against finviz.com (2026-06-14). Metrics with no Finviz equivalent
// (open_chg, sma10, ema10_sma20) are omitted, so their links fall back to the
// universe-only screener rather than a wrong filter.
const METRIC_FILTER: Record<string, { above?: string; below?: string }> = {
  day_chg:   { above: "ta_perf_dup",    below: "ta_perf_ddown" },
  week:      { above: "ta_perf_1wup",   below: "ta_perf_1wdown" },
  month:     { above: "ta_perf_4wup",   below: "ta_perf_4wdown" },
  qtr:       { above: "ta_perf_13wup",  below: "ta_perf_13wdown" },
  half:      { above: "ta_perf_26wup",  below: "ta_perf_26wdown" },
  year:      { above: "ta_perf_52wup",  below: "ta_perf_52wdown" },
  sma20:     { above: "ta_sma20_pa",    below: "ta_sma20_pb" },
  sma50:     { above: "ta_sma50_pa",    below: "ta_sma50_pb" },
  sma200:    { above: "ta_sma200_pa",   below: "ta_sma200_pb" },
  sma20_50:  { above: "ta_sma20_sa50",  below: "ta_sma20_sb50" },
  sma50_200: { above: "ta_sma50_sa200", below: "ta_sma50_sb200" },
  sma_stack: { above: "ta_sma20_sa50,ta_sma50_sa200" }, // no clean "not stacked" inverse
  up4:       { above: "ta_change_u4",   below: "ta_change_d4" },
  nh20:      { above: "ta_highlow52w_nh" },
  nl20:      { above: "ta_highlow52w_nl" },
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

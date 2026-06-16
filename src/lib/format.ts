// Tabular formatters used across every widget. Returns strings; the caller
// chooses the color class via num-pos / num-neg utilities from index.css.

const fmtNum = (n: number, digits = 2): string =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Plain number with N decimals. 748.17 */
export function num(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return fmtNum(Number(v), digits);
}

/** Signed percent with N decimals. +0.79% / -3.41% */
export function pct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(Number(v).toFixed(digits)) || 0; // round first so tiny negatives don't print "-0.00%"
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtNum(n, digits)}%`;
}

/** Dollar amount. $748.17 */
export function usd(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `$${fmtNum(Number(v), digits)}`;
}

/** Compact money: $38.5T, $1.77T, $970B, $350M.
 *  Set fromUnit if your input is already in millions/billions (FRED fiscal series). */
export function usdCompact(
  v: number | null | undefined,
  fromUnit: "raw" | "millions" | "billions" = "raw"
): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  let n = Number(v);
  if (fromUnit === "millions") n = n * 1_000_000;
  else if (fromUnit === "billions") n = n * 1_000_000_000;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  // Round-aware tier thresholds so e.g. 999.999e9 reads "$1.00T", not "$1000.00B".
  if (abs >= 999.995e9) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 999.995e6) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 999.995e3) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 999.995)   return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Compact non-money number (volumes etc.): 43.7M, 1.2B */
export function numCompact(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 999.995e6) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 999.995e3) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 999.5)     return `${sign}${(abs / 1e3).toFixed(2)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

/** Tailwind class for positive / negative / flat numbers. */
export function colorClass(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "num-flat";
  const n = Number(v);
  if (n > 0) return "num-pos";
  if (n < 0) return "num-neg";
  return "num-flat";
}

/** Format an ISO date as "May 14, 2026" */
export function dateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Short time like "4:50 PM" — assumes local time zone. */
export function timeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

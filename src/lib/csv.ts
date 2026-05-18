/**
 * Minimal client-side CSV builder + download trigger.
 * No dependency on papaparse / FileSaver — keeps the bundle slim.
 */

export interface CsvColumn<T> {
  /** Column header in the output file */
  header: string;
  /** Pull the raw value from a row */
  value: (row: T) => string | number | null | undefined;
}

function escapeCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  // RFC 4180: quote if cell contains comma, quote, or newline; escape inner quotes
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a CSV string from rows + a column spec */
export function buildCsv<T>(rows: readonly T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.value(row))).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

/** Trigger a browser download of arbitrary text content */
export function downloadTextFile(filename: string, content: string, mimeType = "text/csv") {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Firefox doesn't cancel the download mid-stream
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convenience: build + download in one call */
export function downloadCsv<T>(filename: string, rows: readonly T[], columns: CsvColumn<T>[]) {
  downloadTextFile(filename, buildCsv(rows, columns));
}

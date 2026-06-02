import { downloadCsv, type CsvColumn } from "@/lib/csv";

/**
 * Small "CSV ↓" button — drop into any card header next to the title.
 * Keeps the table data in render order; for sorted/filtered views,
 * pass the post-sort/filter `rows` array.
 */
export default function CsvButton<T>({
  filename,
  rows,
  columns,
  disabled,
}: {
  filename: string;
  rows: readonly T[];
  columns: CsvColumn<T>[];
  disabled?: boolean;
}) {
  const empty = !rows || rows.length === 0;
  return (
    <button
      type="button"
      disabled={disabled || empty}
      onClick={() => downloadCsv(filename, rows, columns)}
      aria-label={`Download ${filename}`}
      className="flex items-center justify-center gap-1 px-2 py-1.5 sm:px-1.5 sm:py-0.5 min-h-[36px] sm:min-h-0 rounded-[2px] text-2xs text-text-secondary hover:text-accent-cyan hover:bg-bg-hover transition-colors uppercase tracking-widest font-mono disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-text-secondary disabled:hover:bg-transparent"
    >
      <span aria-hidden="true">↓</span>
      <span className="hidden sm:inline">CSV</span>
    </button>
  );
}

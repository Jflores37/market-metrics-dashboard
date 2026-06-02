import type { SortDir } from "@/lib/sortable";

/**
 * A <th> that drives a useSortable() hook. Click to toggle asc/desc;
 * shows an indicator arrow when this column is the active sort.
 *
 * Style matches the existing scanner-table <thead> conventions:
 * uppercase, 0.625rem (2xs), text-dim, tracking-wider.
 */
export default function SortableHeader<K extends string | number | symbol>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  sortKey: K;
  activeKey: K | null;
  dir: SortDir;
  onSort: (key: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const isActive = activeKey === sortKey;
  const indicator = !isActive ? "" : dir === "asc" ? " ↑" : " ↓";
  const alignCls =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`py-2.5 sm:py-1.5 text-2xs uppercase tracking-wider cursor-pointer select-none transition-colors ${alignCls} ${
        isActive ? "text-accent-cyan" : "text-text-dim hover:text-text-secondary"
      } ${className}`}
      title="Click to sort"
    >
      {label}
      <span className="text-accent-cyan ml-0.5">{indicator}</span>
    </th>
  );
}

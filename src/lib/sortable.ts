import { useCallback, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface SortState<T> {
  key: keyof T | null;
  dir: SortDir;
}

/**
 * Generic client-side sortable table state.
 * Pass the row list; get back a stable sorted copy, the current sort
 * key/direction, and a toggle handler to bind to <th onClick>.
 *
 * Numeric columns sort numerically; everything else by localeCompare.
 * Nulls/undefined always sort last regardless of direction (so they
 * don't disrupt the visible top of a "desc" view).
 */
export function useSortable<T>(
  rows: readonly T[],
  options?: { initialKey?: keyof T; initialDir?: SortDir }
) {
  const [state, setState] = useState<SortState<T>>({
    key: options?.initialKey ?? null,
    dir: options?.initialDir ?? "asc",
  });

  const sorted = useMemo(() => {
    if (!state.key) return rows;
    const k = state.key;
    return [...rows].sort((a, b) => {
      const av = a[k];
      const bv = b[k];
      const aNull = av === null || av === undefined;
      const bNull = bv === null || bv === undefined;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return state.dir === "asc" ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return state.dir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [rows, state.key, state.dir]);

  const toggle = useCallback((key: keyof T) => {
    setState((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }, []);

  return { sorted, sortKey: state.key, sortDir: state.dir, toggle };
}

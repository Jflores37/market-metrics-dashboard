import { useEffect, useState } from "react";

/**
 * True below Tailwind's `sm` breakpoint (640px). Used to branch the few
 * Recharts numeric props (margins, tick set, in-chart label visibility)
 * that CSS/Tailwind classes can't reach. SSR-safe; listener cleaned up.
 */
export function useIsMobile(query = "(max-width: 639px)"): boolean {
  const get = () =>
    typeof window !== "undefined" && window.matchMedia(query).matches;
  const [isMobile, setIsMobile] = useState(get);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return isMobile;
}

import type { ReactNode } from "react";

/**
 * Page frame that mimics the reference Dash app's macro-terminal-frame:
 *   - 1px glowing top bar (green→cyan gradient) via ::before
 *   - subtle scanline overlay via ::after
 *   - max-width 1680px inner container
 *
 * The .terminal-frame class is defined in src/index.css.
 */
export default function TerminalFrame({ children }: { children: ReactNode }) {
  return (
    <div className="terminal-frame flex-1">
      <div className="max-w-[1680px] mx-auto px-4 md:px-6 py-4 w-full">
        {children}
      </div>
    </div>
  );
}

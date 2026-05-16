/**
 * Thin (32px) collapsed-sidebar rail. Shows on desktop only when the
 * full sidebar is hidden. A vertical "Pulse" wordmark keeps the
 * branding present and a ›-chevron at the top re-opens the sidebar.
 *
 * Hidden on mobile — there the sidebar is a horizontal pill row at
 * the top of the page and there's no collapsed state.
 */
export default function SidebarStrip({ onExpand }: { onExpand: () => void }) {
  return (
    <aside className="hidden md:flex flex-col items-center w-10 shrink-0 border-r border-border bg-bg-card sticky top-0 h-screen py-3 gap-4">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Expand sidebar"
        title="Expand sidebar"
        className="text-accent-cyan hover:text-text-primary hover:bg-bg-hover transition-colors w-6 h-6 flex items-center justify-center rounded-[2px] text-base leading-none signal-glow-cyan"
      >
        ›
      </button>
      <div
        className="font-mono text-2xs text-text-dim uppercase tracking-[0.25em] select-none"
        style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
        }}
      >
        Pulse · market terminal
      </div>
    </aside>
  );
}

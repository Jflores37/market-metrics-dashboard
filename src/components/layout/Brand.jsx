// Brand mark: an oscilloscope-style pulse wave glyph paired with the wordmark.
// The wave is hand-tuned to feel like a heartbeat / market tick.

export function BrandGlyph({ size = 24, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pulseGrad" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0d9488" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="#11141d" stroke="#262b3c" strokeWidth="1" />
      <path
        d="M5 16 L10 16 L12 10 L15 22 L17 13 L20 18 L22 16 L27 16"
        stroke="url(#pulseGrad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function Brand({ collapsed = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandGlyph size={28} />
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]">Pulse</div>
          <div className="text-[10px] tracking-wider text-[var(--text-tertiary)] uppercase font-medium">
            Market Metrics
          </div>
        </div>
      )}
    </div>
  );
}

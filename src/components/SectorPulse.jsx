import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const QUADRANT_STYLE = {
  leading:   { color: 'var(--bull)',  dot: '#22c55e', label: 'Leading',   bg: 'rgba(34, 197, 94, 0.05)' },
  improving: { color: 'var(--accent)', dot: '#14b8a6', label: 'Improving', bg: 'rgba(20, 184, 166, 0.05)' },
  weakening: { color: 'var(--warn)',  dot: '#f59e0b', label: 'Weakening', bg: 'rgba(245, 158, 11, 0.05)' },
  lagging:   { color: 'var(--bear)',  dot: '#ef4444', label: 'Lagging',   bg: 'rgba(239, 68, 68, 0.05)' },
};

function fmtPct(v) {
  if (v == null) return '—';
  const n = Number(v);
  const s = n > 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

function changeColor(v) {
  if (v == null) return 'var(--text-disabled)';
  const n = Number(v);
  if (n > 0) return 'var(--bull)';
  if (n < 0) return 'var(--bear)';
  return 'var(--text-secondary)';
}

function RRGChart({ rows }) {
  // Responsive SVG quadrant chart
  const W = 480, H = 360;
  const P = 32;
  const MIN = 60, MAX = 140;
  const xScale = (x) => P + ((Math.max(MIN, Math.min(MAX, x)) - MIN) / (MAX - MIN)) * (W - 2 * P);
  const yScale = (y) => H - P - ((Math.max(MIN, Math.min(MAX, y)) - MIN) / (MAX - MIN)) * (H - 2 * P);
  const cx = xScale(100);
  const cy = yScale(100);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* Quadrant tints */}
      <rect x={cx} y={P}  width={W - P - cx} height={cy - P}        fill={QUADRANT_STYLE.leading.bg} />
      <rect x={P}  y={P}  width={cx - P}      height={cy - P}        fill={QUADRANT_STYLE.improving.bg} />
      <rect x={P}  y={cy} width={cx - P}      height={H - P - cy}    fill={QUADRANT_STYLE.lagging.bg} />
      <rect x={cx} y={cy} width={W - P - cx} height={H - P - cy}    fill={QUADRANT_STYLE.weakening.bg} />

      {/* Crosshairs */}
      <line x1={P} y1={cy} x2={W - P} y2={cy} stroke="#262b3c" strokeWidth="1" strokeDasharray="3 4" />
      <line x1={cx} y1={P} x2={cx} y2={H - P} stroke="#262b3c" strokeWidth="1" strokeDasharray="3 4" />

      {/* Quadrant labels */}
      <text x={W - P - 6} y={P + 14} fill={QUADRANT_STYLE.leading.dot}   fontSize="10" fontWeight="600" textAnchor="end" letterSpacing="1.5">LEADING</text>
      <text x={P + 6}     y={P + 14} fill={QUADRANT_STYLE.improving.dot} fontSize="10" fontWeight="600" letterSpacing="1.5">IMPROVING</text>
      <text x={P + 6}     y={H - P - 6} fill={QUADRANT_STYLE.lagging.dot}   fontSize="10" fontWeight="600" letterSpacing="1.5">LAGGING</text>
      <text x={W - P - 6} y={H - P - 6} fill={QUADRANT_STYLE.weakening.dot} fontSize="10" fontWeight="600" textAnchor="end" letterSpacing="1.5">WEAKENING</text>

      {/* Axis labels */}
      <text x={W / 2}  y={H - 8}  fill="#6b7088" fontSize="9" textAnchor="middle" letterSpacing="1.2">JdK RS-RATIO →</text>
      <text x={12}     y={H / 2}  fill="#6b7088" fontSize="9" textAnchor="middle" letterSpacing="1.2" transform={`rotate(-90, 12, ${H / 2})`}>JdK RS-MOMENTUM →</text>

      {/* Sector dots + labels */}
      {rows.map((r) => {
        if (r.rs_ratio == null || r.rs_momentum == null) return null;
        const x = xScale(Number(r.rs_ratio));
        const y = yScale(Number(r.rs_momentum));
        const dotColor = QUADRANT_STYLE[r.rrg_quadrant]?.dot ?? '#6b7088';
        return (
          <g key={r.ticker}>
            <circle cx={x} cy={y} r="5" fill={dotColor} stroke="#0a0c14" strokeWidth="1.5" />
            <text x={x + 8} y={y + 4} fill="#e8eaf0" fontSize="11" fontWeight="600" fontFamily="JetBrains Mono">
              {r.ticker}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="pulse-card p-5"><div className="pulse-shimmer h-72" /></div>
      <div className="pulse-card p-5 space-y-2">{[...Array(7)].map((_, i) => <div key={i} className="pulse-shimmer h-6" />)}</div>
    </div>
  );
}

export default function SectorPulse() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('sector_pulse_v').select('*');
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data ?? []);
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="pulse-card p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--bear)' }} />
        <div>
          <div className="font-semibold mb-1" style={{ color: 'var(--bear)' }}>Failed to load sectors</div>
          <div className="text-sm text-[var(--text-secondary)]">{error}</div>
        </div>
      </div>
    );
  }

  if (rows === null) return <LoadingSkeleton />;
  if (rows.length === 0) {
    return <div className="pulse-card p-8 text-center text-sm text-[var(--text-tertiary)]">No sector data yet</div>;
  }

  const order = { leading: 0, improving: 1, weakening: 2, lagging: 3 };
  const sorted = [...rows].sort((a, b) => (order[a.rrg_quadrant] ?? 9) - (order[b.rrg_quadrant] ?? 9));

  // Quadrant counts for legend
  const counts = sorted.reduce((acc, r) => {
    acc[r.rrg_quadrant] = (acc[r.rrg_quadrant] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="pulse-card p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">Relative rotation vs VTI</div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">SPDR sectors plotted on relative strength × momentum</div>
          </div>
        </div>
        <RRGChart rows={rows} />

        {/* Quadrant legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-4 border-t border-[var(--border-faint)]">
          {Object.entries(QUADRANT_STYLE).map(([key, style]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: style.dot }} />
              <span className="text-xs text-[var(--text-secondary)] flex-1">{style.label}</span>
              <span className="pulse-number text-xs font-semibold tabular-nums" style={{ color: style.color }}>
                {counts[key] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Sector list */}
      <div className="pulse-card">
        <div className="px-5 py-3 border-b border-[var(--border-faint)] grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center text-[10px] tracking-wider uppercase font-semibold text-[var(--text-tertiary)]">
          <span>Sector</span>
          <span className="w-16 text-right">State</span>
          <span className="w-16 text-right">Quarter</span>
          <span className="w-16 text-right">Year</span>
        </div>
        <div className="divide-y divide-[var(--border-faint)]">
          {sorted.map((r) => {
            const qStyle = QUADRANT_STYLE[r.rrg_quadrant] ?? { color: 'var(--text-tertiary)', label: '—' };
            return (
              <div key={r.ticker} className="px-5 py-2.5 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center hover:bg-[var(--bg-elevated)] transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="pulse-number text-sm font-semibold w-12 text-[var(--text-primary)]">{r.ticker}</span>
                  <span className="text-xs text-[var(--text-secondary)] truncate">{r.sector_label}</span>
                </div>
                <span className="pulse-number text-[11px] font-semibold tracking-wider uppercase w-16 text-right" style={{ color: qStyle.color }}>
                  {qStyle.label}
                </span>
                <span className="pulse-number text-sm w-16 text-right tabular-nums" style={{ color: changeColor(r.perf_quarter) }}>{fmtPct(r.perf_quarter)}</span>
                <span className="pulse-number text-sm w-16 text-right tabular-nums" style={{ color: changeColor(r.perf_year) }}>{fmtPct(r.perf_year)}</span>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-2.5 text-[11px] text-[var(--text-tertiary)] border-t border-[var(--border-faint)]">
          11 SPDR sectors · VTI benchmark · sorted by quadrant
        </div>
      </div>
    </div>
  );
}

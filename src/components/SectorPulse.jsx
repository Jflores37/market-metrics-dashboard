import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const QUADRANT_TONE = {
  leading:   'text-emerald-400',
  improving: 'text-cyan-400',
  weakening: 'text-amber-400',
  lagging:   'text-red-400',
};
const QUADRANT_DOT = {
  leading:   '#34d399',
  improving: '#22d3ee',
  weakening: '#fbbf24',
  lagging:   '#f87171',
};
const QUADRANT_LABEL = {
  leading:   'LEAD',
  improving: 'IMPR',
  weakening: 'WEAK',
  lagging:   'LAG',
};

function fmtPct(v, sign = true) {
  if (v == null) return '—';
  const n = Number(v);
  const s = sign && n > 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

function changeColor(v) {
  if (v == null) return 'text-zinc-600';
  const n = Number(v);
  if (n > 0) return 'text-emerald-400';
  if (n < 0) return 'text-red-400';
  return 'text-zinc-500';
}

function RRGChart({ rows }) {
  // SVG quadrant chart. x = RS-Ratio, y = RS-Momentum.
  // Centered at (100, 100). Range: 60-140 in both dims (clamped).
  const W = 320, H = 240;
  const P = 24; // padding
  const X_MIN = 60, X_MAX = 140;
  const Y_MIN = 60, Y_MAX = 140;

  const xScale = (x) => P + ((Math.max(X_MIN, Math.min(X_MAX, x)) - X_MIN) / (X_MAX - X_MIN)) * (W - 2 * P);
  const yScale = (y) => H - P - ((Math.max(Y_MIN, Math.min(Y_MAX, y)) - Y_MIN) / (Y_MAX - Y_MIN)) * (H - 2 * P);
  const cx = xScale(100);
  const cy = yScale(100);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      {/* Quadrant background tints */}
      <rect x={cx} y={P} width={W - P - cx} height={cy - P} fill="rgba(52,211,153,0.04)" />        {/* leading (top-right) */}
      <rect x={P} y={P} width={cx - P} height={cy - P} fill="rgba(34,211,238,0.04)" />              {/* improving (top-left) */}
      <rect x={P} y={cy} width={cx - P} height={H - P - cy} fill="rgba(248,113,113,0.04)" />        {/* lagging (bot-left) */}
      <rect x={cx} y={cy} width={W - P - cx} height={H - P - cy} fill="rgba(251,191,36,0.04)" />    {/* weakening (bot-right) */}

      {/* Crosshairs */}
      <line x1={P} y1={cy} x2={W - P} y2={cy} stroke="#3f3f46" strokeWidth="1" strokeDasharray="2 3" />
      <line x1={cx} y1={P} x2={cx} y2={H - P} stroke="#3f3f46" strokeWidth="1" strokeDasharray="2 3" />

      {/* Quadrant labels (small, corner) */}
      <text x={W - P - 4} y={P + 10} fill="#34d399" fontSize="8" textAnchor="end" letterSpacing="1.5">LEADING</text>
      <text x={P + 4} y={P + 10} fill="#22d3ee" fontSize="8" letterSpacing="1.5">IMPROVING</text>
      <text x={P + 4} y={H - P - 4} fill="#f87171" fontSize="8" letterSpacing="1.5">LAGGING</text>
      <text x={W - P - 4} y={H - P - 4} fill="#fbbf24" fontSize="8" textAnchor="end" letterSpacing="1.5">WEAKENING</text>

      {/* Sector dots + labels */}
      {rows.map((r) => {
        if (r.rs_ratio == null || r.rs_momentum == null) return null;
        const x = xScale(Number(r.rs_ratio));
        const y = yScale(Number(r.rs_momentum));
        const dotColor = QUADRANT_DOT[r.rrg_quadrant] ?? '#a1a1aa';
        return (
          <g key={r.ticker}>
            <circle cx={x} cy={y} r="4" fill={dotColor} stroke="#09090b" strokeWidth="1" />
            <text x={x + 6} y={y + 3} fill="#e4e4e7" fontSize="9" fontWeight="600">{r.ticker}</text>
          </g>
        );
      })}
    </svg>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="px-3 py-3 border-b border-zinc-900">
        <div className="h-40 bg-zinc-900 rounded"></div>
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="px-3 py-2 border-b border-zinc-900">
          <div className="h-3 bg-zinc-900 rounded w-3/4"></div>
        </div>
      ))}
    </div>
  );
}

export default function SectorPulse() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('sector_pulse_v')
        .select('*');
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data ?? []);
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="px-3 py-4 flex items-start gap-2 text-red-400 text-[11px] tracking-wider">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-bold mb-1">FAILED TO LOAD SECTORS</div>
          <div className="text-zinc-500">{error}</div>
        </div>
      </div>
    );
  }

  if (rows === null) return <LoadingSkeleton />;
  if (rows.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[10px] tracking-[0.2em] text-zinc-700">
        NO SECTOR DATA YET
      </div>
    );
  }

  // Order: leading first, then improving, weakening, lagging
  const order = { leading: 0, improving: 1, weakening: 2, lagging: 3 };
  const sorted = [...rows].sort((a, b) => (order[a.rrg_quadrant] ?? 9) - (order[b.rrg_quadrant] ?? 9));

  return (
    <div>
      <div className="px-3 py-3 border-b border-zinc-800 bg-zinc-950">
        <div className="text-[9px] font-bold tracking-[0.3em] text-zinc-500 mb-2">RELATIVE ROTATION VS VTI</div>
        <RRGChart rows={rows} />
      </div>

      {sorted.map((r) => {
        const qTone = QUADRANT_TONE[r.rrg_quadrant] ?? 'text-zinc-500';
        return (
          <div key={r.ticker} className="px-3 py-1.5 border-b border-zinc-900 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[12px] font-bold tracking-wide text-zinc-100 w-12">{r.ticker}</span>
              <span className="text-[10px] text-zinc-500 truncate">{r.sector_label}</span>
            </div>
            <div className="flex items-center gap-2 tabular-nums">
              <span className={`text-[10px] font-bold tracking-wider w-10 text-right ${qTone}`}>
                {QUADRANT_LABEL[r.rrg_quadrant] ?? '—'}
              </span>
              <span className={`text-[11px] w-14 text-right ${changeColor(r.perf_quarter)}`}>{fmtPct(r.perf_quarter)}</span>
              <span className={`text-[11px] w-14 text-right ${changeColor(r.perf_year)}`}>{fmtPct(r.perf_year)}</span>
            </div>
          </div>
        );
      })}

      <div className="px-3 py-2 border-t border-zinc-800 text-[9px] tracking-[0.2em] text-zinc-600 flex justify-between">
        <span>11 SPDR SECTORS · VTI BENCHMARK</span>
        <span>QTR · YR</span>
      </div>
    </div>
  );
}

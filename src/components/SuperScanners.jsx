import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

const SCANNERS = [
  {
    id: 'minervini',
    label: 'Minervini',
    subtitle: 'Trend Template',
    description: '> SMA20/50/200, SMA50 > SMA200, RSI ≥ 70, within 25% of 52w high.',
  },
  {
    id: 'qullamaggie',
    label: 'Qullamaggie',
    subtitle: 'Episodic Pivot',
    description: 'Today\'s gap-ups ≥ 10% with relative volume ≥ 2x. Fresh breakouts.',
  },
  {
    id: 'canslim',
    label: 'CANSLIM',
    subtitle: "O'Neil growth",
    description: 'EPS growth (yr + qtr) ≥ 25%, ROE ≥ 15%, net margin ≥ 10%.',
  },
  {
    id: 'liquid_etfs',
    label: 'Liquid ETFs',
    subtitle: 'Top by volume',
    description: 'ETFs with avg volume ≥ 500K and price ≥ $5.',
  },
];

function fmtPct(v) {
  if (v == null) return '—';
  const n = Number(v);
  const s = n > 0 ? '+' : '';
  return `${s}${n.toFixed(1)}%`;
}

function fmtPrice(v) {
  if (v == null) return '—';
  return `$${Number(v).toFixed(2)}`;
}

function fmtVol(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString('en-US');
}

function changeColor(v) {
  if (v == null) return 'var(--text-disabled)';
  const n = Number(v);
  if (n > 0) return 'var(--bull)';
  if (n < 0) return 'var(--bear)';
  return 'var(--text-secondary)';
}

function tvUrl(t) { return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(t)}`; }

const COLUMN_DEFS = {
  minervini: [
    { label: 'Price', get: (r) => r.price,        fmt: fmtPrice, tone: () => 'var(--text-primary)' },
    { label: 'Qtr',   get: (r) => r.perf_quarter, fmt: fmtPct,   tone: changeColor },
    { label: 'Year',  get: (r) => r.perf_year,    fmt: fmtPct,   tone: changeColor },
    { label: 'RSI',   get: (r) => r.rsi14,        fmt: (v) => v == null ? '—' : Number(v).toFixed(0), tone: () => 'var(--warn)' },
  ],
  qullamaggie: [
    { label: 'Price', get: (r) => r.price,                  fmt: fmtPrice, tone: () => 'var(--text-primary)' },
    { label: 'Gap',   get: (r) => r.extras?.gap_pct,        fmt: fmtPct,   tone: changeColor },
    { label: 'RVol',  get: (r) => r.extras?.rel_volume,     fmt: (v) => v == null ? '—' : `${Number(v).toFixed(1)}x`, tone: () => 'var(--accent)' },
    { label: 'Day',   get: (r) => r.perf_day,               fmt: fmtPct,   tone: changeColor },
  ],
  canslim: [
    { label: 'Price', get: (r) => r.price,        fmt: fmtPrice, tone: () => 'var(--text-primary)' },
    { label: 'Qtr',   get: (r) => r.perf_quarter, fmt: fmtPct,   tone: changeColor },
    { label: 'Year',  get: (r) => r.perf_year,    fmt: fmtPct,   tone: changeColor },
    { label: 'RSI',   get: (r) => r.rsi14,        fmt: (v) => v == null ? '—' : Number(v).toFixed(0), tone: () => 'var(--warn)' },
  ],
  liquid_etfs: [
    { label: 'Price', get: (r) => r.price,      fmt: fmtPrice, tone: () => 'var(--text-primary)' },
    { label: 'Day',   get: (r) => r.perf_day,   fmt: fmtPct,   tone: changeColor },
    { label: 'Year',  get: (r) => r.perf_year,  fmt: fmtPct,   tone: changeColor },
    { label: 'Vol',   get: (r) => r.avg_volume, fmt: fmtVol,   tone: () => 'var(--text-secondary)' },
  ],
};

function LoadingSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {[...Array(10)].map((_, i) => <div key={i} className="pulse-shimmer h-7" />)}
    </div>
  );
}

export default function SuperScanners() {
  const [active, setActive] = useState('minervini');
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('scanner_summary_v').select('*');
      if (!cancelled && !error && data) {
        const map = {};
        for (const r of data) map[r.scanner_id] = r;
        setSummary(map);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    (async () => {
      const { data, error } = await supabase
        .from('scanner_latest_v')
        .select('*')
        .eq('scanner_id', active)
        .order('rank');
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data ?? []);
    })();
    return () => { cancelled = true; };
  }, [active]);

  const activeMeta = useMemo(() => SCANNERS.find((s) => s.id === active), [active]);
  const cols = COLUMN_DEFS[active];

  return (
    <div className="space-y-4">
      {/* Scanner cards - top selector */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SCANNERS.map((s) => {
          const isActive = s.id === active;
          const count = summary[s.id]?.result_count;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={`pulse-card text-left p-4 transition-all ${
                isActive ? 'ring-1 ring-[rgba(20,184,166,0.4)] !border-[rgba(20,184,166,0.4)]' : ''
              }`}
              style={isActive ? { background: 'var(--accent-bg)' } : undefined}
            >
              <div className="flex items-baseline justify-between mb-1">
                <div className={`text-sm font-semibold ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                  {s.label}
                </div>
                {count != null && (
                  <span className="pulse-number text-xs font-semibold tabular-nums" style={{ color: isActive ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                    {count}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)]">{s.subtitle}</div>
            </button>
          );
        })}
      </div>

      {/* Active scanner content */}
      <div className="pulse-card">
        <div className="px-5 py-3 border-b border-[var(--border-faint)]">
          <div className="text-xs text-[var(--text-secondary)]">{activeMeta?.description}</div>
        </div>

        {/* Header row */}
        <div className="px-5 py-2.5 border-b border-[var(--border-faint)] bg-[var(--bg-elevated)]/30 grid grid-cols-[2rem_1fr_auto] gap-3 text-[10px] tracking-wider uppercase font-semibold text-[var(--text-tertiary)]">
          <span className="text-right">#</span>
          <span>Ticker · Sector</span>
          <div className="grid grid-flow-col auto-cols-fr gap-3">
            {cols.map((c) => (
              <span key={c.label} className="w-14 text-right">{c.label}</span>
            ))}
          </div>
        </div>

        {/* Body */}
        {error ? (
          <div className="p-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--bear)' }} />
            <div>
              <div className="font-semibold mb-1" style={{ color: 'var(--bear)' }}>Failed to load scanner</div>
              <div className="text-sm text-[var(--text-secondary)]">{error}</div>
            </div>
          </div>
        ) : rows === null ? (
          <LoadingSkeleton />
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">
            No {activeMeta?.label} results today
          </div>
        ) : (
          <div className="max-h-[480px] overflow-y-auto divide-y divide-[var(--border-faint)]">
            {rows.map((row) => (
              <div
                key={row.ticker}
                className="px-5 py-2.5 grid grid-cols-[2rem_1fr_auto] gap-3 items-center hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <span className="pulse-number text-xs text-[var(--text-disabled)] text-right tabular-nums">{row.rank}</span>
                <div className="flex items-center gap-2.5 min-w-0">
                  <a
                    href={tvUrl(row.ticker)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pulse-number text-sm font-semibold inline-flex items-center gap-1 transition-colors"
                    style={{ color: 'var(--accent)' }}
                  >
                    {row.ticker}
                    <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                  </a>
                  <span className="text-xs text-[var(--text-tertiary)] truncate">{row.sector ?? row.industry ?? ''}</span>
                </div>
                <div className="grid grid-flow-col auto-cols-fr gap-3">
                  {cols.map((c, i) => (
                    <span key={i} className="pulse-number text-sm font-medium w-14 text-right tabular-nums" style={{ color: c.tone(c.get(row)) }}>
                      {c.fmt(c.get(row))}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-2.5 text-[11px] text-[var(--text-tertiary)] border-t border-[var(--border-faint)] flex justify-between">
          <span>Source · Finviz Elite · Click ticker for chart</span>
          <span>Top 50 by rank</span>
        </div>
      </div>
    </div>
  );
}

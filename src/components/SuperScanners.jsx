import { useEffect, useState, useMemo } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

const SCANNERS = [
  {
    id: 'minervini',
    label: 'MINERVINI',
    subtitle: 'Trend Template',
    description: 'Strict trend stocks: > SMA20/50/200, SMA50 > SMA200, RSI ≥ 70, within 25% of 52w high.',
  },
  {
    id: 'qullamaggie',
    label: 'QULLAMAGGIE',
    subtitle: 'Episodic Pivot',
    description: 'Today\'s gap-ups ≥ 10% with relative volume ≥ 2x. Fresh breakouts.',
  },
  {
    id: 'canslim',
    label: 'CANSLIM',
    subtitle: 'O\'Neil Growth',
    description: 'EPS growth (year + qtr) ≥ 25%, ROE ≥ 15%, net margin ≥ 10%.',
  },
  {
    id: 'liquid_etfs',
    label: 'LIQUID ETFs',
    subtitle: 'Top by Volume',
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

function fmtVolMillions(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString('en-US');
}

function changeColor(v) {
  if (v == null) return 'text-zinc-600';
  const n = Number(v);
  if (n > 0) return 'text-emerald-400';
  if (n < 0) return 'text-red-400';
  return 'text-zinc-500';
}

function tvUrl(ticker) {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}`;
}

function ScannerRow({ row, columns }) {
  return (
    <div className="px-3 py-1.5 border-b border-zinc-900 flex items-center justify-between gap-2 hover:bg-zinc-900/30 transition-colors">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-[10px] text-zinc-700 tabular-nums w-5 text-right">{row.rank}</span>
        <a
          href={tvUrl(row.ticker)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] font-bold tracking-wide text-cyan-400 hover:text-cyan-300 w-14 inline-flex items-center gap-1"
        >
          {row.ticker}
          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
        </a>
        <span className="text-[10px] text-zinc-600 truncate hidden sm:inline">{row.sector ?? row.industry ?? ''}</span>
      </div>
      <div className="flex items-center gap-2 tabular-nums text-[11px]">
        {columns.map((col, i) => (
          <span key={i} className={`${col.width} text-right ${col.toneFn ? col.toneFn(col.value(row)) : 'text-zinc-300'}`}>
            {col.format(col.value(row))}
          </span>
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="px-3 py-2 border-b border-zinc-900">
          <div className="h-3 bg-zinc-900 rounded w-3/4"></div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ label }) {
  return (
    <div className="px-3 py-8 text-center text-[10px] tracking-[0.2em] text-zinc-700">
      NO {label.toUpperCase()} RESULTS TODAY
    </div>
  );
}

const COLUMN_SETS = {
  minervini: [
    { value: (r) => r.price,        format: fmtPrice, width: 'w-16', toneFn: () => 'text-zinc-300' },
    { value: (r) => r.perf_quarter, format: fmtPct,   width: 'w-16', toneFn: changeColor },
    { value: (r) => r.perf_year,    format: fmtPct,   width: 'w-16', toneFn: changeColor },
    { value: (r) => r.rsi14,        format: (v) => v == null ? '—' : Number(v).toFixed(0), width: 'w-10', toneFn: () => 'text-amber-400' },
  ],
  qullamaggie: [
    { value: (r) => r.price,                       format: fmtPrice, width: 'w-16', toneFn: () => 'text-zinc-300' },
    { value: (r) => r.extras?.gap_pct,             format: fmtPct,   width: 'w-16', toneFn: changeColor },
    { value: (r) => r.extras?.rel_volume,          format: (v) => v == null ? '—' : `${Number(v).toFixed(1)}x`, width: 'w-12', toneFn: () => 'text-cyan-400' },
    { value: (r) => r.perf_day,                    format: fmtPct,   width: 'w-16', toneFn: changeColor },
  ],
  canslim: [
    { value: (r) => r.price,        format: fmtPrice, width: 'w-16', toneFn: () => 'text-zinc-300' },
    { value: (r) => r.perf_quarter, format: fmtPct,   width: 'w-16', toneFn: changeColor },
    { value: (r) => r.perf_year,    format: fmtPct,   width: 'w-16', toneFn: changeColor },
    { value: (r) => r.rsi14,        format: (v) => v == null ? '—' : Number(v).toFixed(0), width: 'w-10', toneFn: () => 'text-amber-400' },
  ],
  liquid_etfs: [
    { value: (r) => r.price,        format: fmtPrice,        width: 'w-16', toneFn: () => 'text-zinc-300' },
    { value: (r) => r.perf_day,     format: fmtPct,          width: 'w-16', toneFn: changeColor },
    { value: (r) => r.perf_year,    format: fmtPct,          width: 'w-16', toneFn: changeColor },
    { value: (r) => r.avg_volume,   format: fmtVolMillions,  width: 'w-12', toneFn: () => 'text-zinc-500' },
  ],
};

const COLUMN_HEADERS = {
  minervini:  ['PRICE', 'QTR', 'YEAR', 'RSI'],
  qullamaggie:['PRICE', 'GAP', 'RVOL', 'DAY'],
  canslim:    ['PRICE', 'QTR', 'YEAR', 'RSI'],
  liquid_etfs:['PRICE', 'DAY', 'YEAR', 'VOL'],
};

const COLUMN_WIDTHS = ['w-16', 'w-16', 'w-16', 'w-10'];
const COLUMN_WIDTHS_QULL = ['w-16', 'w-16', 'w-12', 'w-16'];

function HeaderRow({ scannerId }) {
  const headers = COLUMN_HEADERS[scannerId];
  const widths = scannerId === 'qullamaggie' || scannerId === 'liquid_etfs'
    ? (scannerId === 'qullamaggie' ? COLUMN_WIDTHS_QULL : ['w-16','w-16','w-16','w-12'])
    : COLUMN_WIDTHS;
  return (
    <div className="px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 flex-1">
        <span className="text-[9px] font-bold tracking-[0.25em] text-zinc-600 w-5 text-right">#</span>
        <span className="text-[9px] font-bold tracking-[0.25em] text-zinc-600 w-14">TICKER</span>
        <span className="text-[9px] font-bold tracking-[0.25em] text-zinc-600 hidden sm:inline">SECTOR</span>
      </div>
      <div className="flex items-center gap-2">
        {headers.map((h, i) => (
          <span key={h} className={`${widths[i]} text-right text-[9px] font-bold tracking-[0.25em] text-zinc-600`}>
            {h}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function SuperScanners() {
  const [active, setActive] = useState('minervini');
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState({});
  const [error, setError] = useState(null);

  // Load summary once for the tab counts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('scanner_summary_v').select('*');
      if (cancelled) return;
      if (!error && data) {
        const map = {};
        for (const r of data) map[r.scanner_id] = r;
        setSummary(map);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load results for the active tab
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
  const columns = COLUMN_SETS[active];

  return (
    <div>
      {/* Tab strip */}
      <div className="flex border-b border-zinc-800 overflow-x-auto">
        {SCANNERS.map((s) => {
          const isActive = s.id === active;
          const count = summary[s.id]?.result_count;
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`flex-shrink-0 px-3 py-2 border-r border-zinc-800 transition-colors leading-tight text-left ${
                isActive ? 'bg-zinc-900 border-b-2 border-b-cyan-400' : 'bg-zinc-950 hover:bg-zinc-900/50'
              }`}
            >
              <div className={`text-[10px] font-bold tracking-[0.25em] ${isActive ? 'text-zinc-100' : 'text-zinc-500'}`}>
                {s.label}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] tracking-wider text-zinc-600">{s.subtitle}</span>
                {count != null && (
                  <span className="text-[9px] tabular-nums text-cyan-400 font-semibold">{count}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Description strip */}
      <div className="px-3 py-1.5 border-b border-zinc-800 bg-zinc-950/60 text-[9px] tracking-wider text-zinc-600 leading-relaxed">
        {activeMeta?.description}
      </div>

      {/* Column headers */}
      <HeaderRow scannerId={active} />

      {/* Body */}
      {error ? (
        <div className="px-3 py-4 flex items-start gap-2 text-red-400 text-[11px] tracking-wider">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold mb-1">FAILED TO LOAD SCANNER</div>
            <div className="text-zinc-500">{error}</div>
          </div>
        </div>
      ) : rows === null ? (
        <LoadingSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState label={activeMeta?.label ?? 'scanner'} />
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          {rows.map((row) => (
            <ScannerRow key={row.ticker} row={row} columns={columns} />
          ))}
        </div>
      )}

      <div className="px-3 py-2 border-t border-zinc-800 text-[9px] tracking-[0.2em] text-zinc-600 flex justify-between">
        <span>SOURCE · FINVIZ ELITE · CLICK TICKER FOR CHART</span>
        <span>RANK · TOP 50</span>
      </div>
    </div>
  );
}

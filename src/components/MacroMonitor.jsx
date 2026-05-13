import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CATEGORY_ORDER = ['inflation', 'employment', 'rates', 'commodities'];

const CATEGORY_LABEL = {
  inflation: 'INFLATION',
  employment: 'EMPLOYMENT',
  rates: 'RATES',
  commodities: 'COMMODITIES',
};

function formatMonthYear(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00Z');
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${month} '${yy}`;
}

function formatDayMonthYear(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00Z');
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${month} ${day} '${yy}`;
}

function fmtPct(n, sign = true) {
  if (n == null) return '—';
  const v = Number(n);
  const s = sign && v > 0 ? '+' : '';
  return `${s}${v.toFixed(2)}%`;
}

function fmtLevel(n, units) {
  if (n == null) return '—';
  const v = Number(n);
  if (units === '$/bbl') return `$${v.toFixed(2)}`;
  if (units === 'Percent') return `${v.toFixed(2)}%`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtMomDelta(n) {
  if (n == null) return '—';
  const v = Number(n);
  const sign = v > 0 ? '+' : '';
  // PAYEMS is in thousands; show "+115K"
  return `${sign}${Math.round(v).toLocaleString('en-US')}K`;
}

function DirectionIcon({ direction }) {
  if (direction === 'up') return <ArrowUp className="w-3 h-3" strokeWidth={2.5} />;
  if (direction === 'down') return <ArrowDown className="w-3 h-3" strokeWidth={2.5} />;
  return <ArrowRight className="w-3 h-3" strokeWidth={2.5} />;
}

function directionTone(direction) {
  if (direction === 'up') return 'text-emerald-400';
  if (direction === 'down') return 'text-red-400';
  return 'text-amber-400';
}

function HeadlineValue({ row }) {
  // The "primary" number per series:
  //   yoy_pct transform → show yoy_pct + ' YoY'
  //   mom_delta transform → show mom_delta
  //   level transform → show the level
  if (row.transform === 'yoy_pct') {
    return (
      <span className="text-cyan-400 tabular-nums font-semibold">
        {fmtPct(row.yoy_pct)} <span className="text-zinc-600 font-normal text-[10px] tracking-wider">YoY</span>
      </span>
    );
  }
  if (row.transform === 'mom_delta') {
    return (
      <span className="text-cyan-400 tabular-nums font-semibold">
        {fmtMomDelta(row.mom_delta)} <span className="text-zinc-600 font-normal text-[10px] tracking-wider">MoM</span>
      </span>
    );
  }
  return (
    <span className="text-cyan-400 tabular-nums font-semibold">
      {fmtLevel(row.latest_value, row.units)}
    </span>
  );
}

function SubLine({ row }) {
  // Smaller line under the headline: shows the raw level for yoy_pct/mom_delta series,
  // and just the date for level series.
  const date =
    row.frequency === 'daily' ? formatDayMonthYear(row.latest_date) : formatMonthYear(row.latest_date);
  if (row.transform === 'yoy_pct') {
    return (
      <span className="text-zinc-600 tabular-nums">
        {fmtLevel(row.latest_value, row.units)} <span className="text-zinc-700">·</span> {date}
      </span>
    );
  }
  if (row.transform === 'mom_delta') {
    return (
      <span className="text-zinc-600 tabular-nums">
        Total {Math.round(Number(row.latest_value) / 1000)}M <span className="text-zinc-700">·</span> {date}
      </span>
    );
  }
  return <span className="text-zinc-600 tabular-nums">{date}</span>;
}

function Row({ row }) {
  const tone = directionTone(row.direction);
  return (
    <div className="px-3 py-2 border-b border-zinc-900 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-zinc-100 tracking-wide">{row.display_name}</span>
        <div className="flex items-center gap-1.5">
          <HeadlineValue row={row} />
          <span className={tone}>
            <DirectionIcon direction={row.direction} />
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] tracking-wider mt-0.5">
        <span className="text-zinc-700 uppercase">{row.series_id}</span>
        <SubLine row={row} />
      </div>
    </div>
  );
}

function CategoryBlock({ label, rows }) {
  if (!rows.length) return null;
  return (
    <div className="mb-2 last:mb-0">
      <div className="px-3 py-1.5 bg-zinc-900/40 border-b border-zinc-800 text-[9px] font-bold tracking-[0.3em] text-zinc-500">
        {label}
      </div>
      {rows.map((r) => (
        <Row key={r.series_id} row={r} />
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="px-3 py-2 border-b border-zinc-900">
          <div className="h-3 bg-zinc-900 rounded w-1/2 mb-1.5"></div>
          <div className="h-2 bg-zinc-900 rounded w-1/3"></div>
        </div>
      ))}
    </div>
  );
}

export default function MacroMonitor() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('macro_monitor_v')
        .select('*')
        .order('display_order');
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="px-3 py-4 flex items-start gap-2 text-red-400 text-[11px] tracking-wider">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-bold mb-1">FAILED TO LOAD MACRO DATA</div>
          <div className="text-zinc-500">{error}</div>
        </div>
      </div>
    );
  }

  if (rows === null) return <LoadingSkeleton />;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    label: CATEGORY_LABEL[cat],
    rows: rows.filter((r) => r.category === cat),
  }));

  // Derive freshest date for the widget footer
  const freshest = rows
    .map((r) => r.latest_date)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div>
      {grouped.map((g) => (
        <CategoryBlock key={g.label} label={g.label} rows={g.rows} />
      ))}
      <div className="px-3 py-2 border-t border-zinc-800 text-[9px] tracking-[0.2em] text-zinc-600 flex justify-between">
        <span>SOURCE · FRED</span>
        <span>LAST OBSERVATION · {formatDayMonthYear(freshest)}</span>
      </div>
    </div>
  );
}

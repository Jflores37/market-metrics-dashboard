import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Equal } from 'lucide-react';
import { supabase } from '../lib/supabase';

const UNIVERSE_ORDER = ['sp500', 'cap1b_plus'];

function toneForPct(pct) {
  // % of stocks in a bullish condition — higher is bullish.
  if (pct == null) return 'text-zinc-600';
  const v = Number(pct);
  if (v >= 60) return 'text-emerald-400';
  if (v >= 50) return 'text-emerald-300';
  if (v >= 40) return 'text-amber-400';
  if (v >= 30) return 'text-amber-500';
  return 'text-red-400';
}

function fmtPct(v) {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)}%`;
}

function fmtCount(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString('en-US');
}

function fmtDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00Z');
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const day = d.getUTCDate();
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${month} ${day} '${yy}`;
}

function MetricRow({ label, hint, values, formatter, toneFn }) {
  return (
    <div className="px-3 py-1.5 border-b border-zinc-900 flex items-center justify-between gap-2">
      <div className="leading-tight">
        <div className="text-[11px] text-zinc-300 tracking-wide">{label}</div>
        {hint && <div className="text-[9px] tracking-wider text-zinc-700 uppercase">{hint}</div>}
      </div>
      <div className="flex items-center gap-3 tabular-nums">
        {values.map((v, i) => (
          <div key={i} className={`w-16 text-right text-[12px] font-semibold ${toneFn(v)}`}>
            {formatter(v)}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeaderRow({ rows }) {
  return (
    <div className="px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between gap-2">
      <div className="text-[9px] font-bold tracking-[0.3em] text-zinc-500">UNIVERSE</div>
      <div className="flex items-center gap-3">
        {rows.map((r) => (
          <div key={r.universe_id} className="w-16 text-right leading-tight">
            <div className="text-[10px] font-bold tracking-[0.2em] text-zinc-100">
              {r.universe_label}
            </div>
            <div className="text-[9px] tracking-wider text-zinc-600 tabular-nums">
              [{Number(r.total_count).toLocaleString('en-US')}]
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div className="px-3 py-1 border-b border-zinc-900 bg-zinc-950 text-[9px] font-bold tracking-[0.3em] text-zinc-600 uppercase">
      {label}
    </div>
  );
}

function neutralTone() {
  return 'text-zinc-100';
}
function bullishTone(v) {
  return Number(v) > 0 ? 'text-emerald-400' : 'text-zinc-700';
}
function bearishTone(v) {
  return Number(v) > 0 ? 'text-red-400' : 'text-zinc-700';
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="px-3 py-2 border-b border-zinc-900">
          <div className="h-3 bg-zinc-900 rounded w-1/2"></div>
        </div>
      ))}
    </div>
  );
}

export default function BreadthMetrics() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('breadth_metrics_v')
        .select('*');
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
          <div className="font-bold mb-1">FAILED TO LOAD BREADTH</div>
          <div className="text-zinc-500">{error}</div>
        </div>
      </div>
    );
  }

  if (rows === null) return <LoadingSkeleton />;
  if (rows.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-[10px] tracking-[0.2em] text-zinc-700">
        NO DATA YET — WAITING FOR FIRST EOD PULL
      </div>
    );
  }

  // Order universes as SP500 then $1B+
  const byId = new Map(rows.map((r) => [r.universe_id, r]));
  const ordered = UNIVERSE_ORDER.map((id) => byId.get(id)).filter(Boolean);

  // Pull values per universe
  const pick = (key) => ordered.map((r) => r?.[key]);

  const snapshotDate = ordered[0]?.snapshot_date;

  return (
    <div>
      <HeaderRow rows={ordered} />

      <SectionDivider label="ABOVE MOVING AVERAGES" />
      <MetricRow label="> SMA 20"  hint="20d trend" values={pick('pct_above_sma20')}  formatter={fmtPct} toneFn={toneForPct} />
      <MetricRow label="> SMA 50"  hint="50d trend" values={pick('pct_above_sma50')}  formatter={fmtPct} toneFn={toneForPct} />
      <MetricRow label="> SMA 200" hint="200d trend" values={pick('pct_above_sma200')} formatter={fmtPct} toneFn={toneForPct} />
      <MetricRow label="Aligned ↑" hint="px > all 3 MAs" values={pick('pct_aligned_bullish')} formatter={fmtPct} toneFn={toneForPct} />

      <SectionDivider label="52-WEEK EXTREMES" />
      <MetricRow label="New 52W H" hint="within 1% of high" values={pick('new_52w_highs')} formatter={fmtCount} toneFn={bullishTone} />
      <MetricRow label="New 52W L" hint="within 1% of low"  values={pick('new_52w_lows')}  formatter={fmtCount} toneFn={bearishTone} />

      <SectionDivider label="TODAY'S BREADTH" />
      <MetricRow label="Up ≥4%"   hint="4%+ daily gainers" values={pick('up_4pct')}   formatter={fmtCount} toneFn={bullishTone} />
      <MetricRow label="Down ≥4%" hint="4%+ daily losers"  values={pick('down_4pct')} formatter={fmtCount} toneFn={bearishTone} />
      <MetricRow label="Advancers" hint="" values={pick('advancers')} formatter={fmtCount} toneFn={bullishTone} />
      <MetricRow label="Decliners" hint="" values={pick('decliners')} formatter={fmtCount} toneFn={bearishTone} />

      <div className="px-3 py-2 border-t border-zinc-800 text-[9px] tracking-[0.2em] text-zinc-600 flex justify-between">
        <span>SOURCE · FINVIZ ELITE</span>
        <span>SNAPSHOT · {fmtDate(snapshotDate)}</span>
      </div>
    </div>
  );
}

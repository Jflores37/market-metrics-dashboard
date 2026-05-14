import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const UNIVERSE_ORDER = ['sp500', 'cap1b_plus'];

function toneForPct(pct) {
  if (pct == null) return 'var(--text-tertiary)';
  const v = Number(pct);
  if (v >= 60) return 'var(--bull)';
  if (v >= 50) return '#4ade80';
  if (v >= 40) return 'var(--warn)';
  if (v >= 30) return '#fb923c';
  return 'var(--bear)';
}

function fmtPct(v) {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)}%`;
}

function fmtCount(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString('en-US');
}

function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00Z');
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' });
}

function MetricRow({ label, hint, values, formatter, tones }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-center py-2.5 border-b border-[var(--border-faint)] last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
        {hint && <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{hint}</div>}
      </div>
      {values.map((v, i) => (
        <div
          key={i}
          className="pulse-number text-sm font-semibold w-16 text-right"
          style={{ color: tones[i] }}
        >
          {formatter(v)}
        </div>
      ))}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <section>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[10px] tracking-wider uppercase font-semibold text-[var(--text-tertiary)]">
          {label}
        </span>
        <div className="flex-1 h-px bg-[var(--border-faint)]" />
      </div>
      {children}
    </section>
  );
}

function bullishTone(v) { return Number(v) > 0 ? 'var(--bull)' : 'var(--text-disabled)'; }
function bearishTone(v) { return Number(v) > 0 ? 'var(--bear)' : 'var(--text-disabled)'; }

function LoadingSkeleton() {
  return (
    <div className="pulse-card p-5 space-y-3">
      {[...Array(6)].map((_, i) => <div key={i} className="pulse-shimmer h-6" />)}
    </div>
  );
}

export default function BreadthMetrics() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from('breadth_metrics_v').select('*');
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
          <div className="font-semibold mb-1" style={{ color: 'var(--bear)' }}>Failed to load breadth</div>
          <div className="text-sm text-[var(--text-secondary)]">{error}</div>
        </div>
      </div>
    );
  }

  if (rows === null) return <LoadingSkeleton />;
  if (rows.length === 0) {
    return <div className="pulse-card p-8 text-center text-sm text-[var(--text-tertiary)]">No breadth data yet</div>;
  }

  const byId = new Map(rows.map((r) => [r.universe_id, r]));
  const ordered = UNIVERSE_ORDER.map((id) => byId.get(id)).filter(Boolean);
  const pick = (key) => ordered.map((r) => r?.[key]);
  const snapshotDate = ordered[0]?.snapshot_date;

  // Build per-row tones — colors depend on value semantics
  const pctTones = (key) => pick(key).map(toneForPct);
  const bullTones = (key) => pick(key).map(bullishTone);
  const bearTones = (key) => pick(key).map(bearishTone);

  return (
    <div className="pulse-card p-5">
      {/* Header */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end pb-3 mb-4 border-b border-[var(--border-default)]">
        <div className="text-[10px] tracking-wider uppercase font-semibold text-[var(--text-tertiary)]">
          Universe
        </div>
        {ordered.map((r) => (
          <div key={r.universe_id} className="w-16 text-right">
            <div className="text-[11px] font-bold tracking-wider uppercase text-[var(--text-primary)]">
              {r.universe_label}
            </div>
            <div className="pulse-number text-[10px] text-[var(--text-tertiary)] mt-0.5">
              {Number(r.total_count).toLocaleString('en-US')}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        <Section label="Above moving averages">
          <MetricRow label="> SMA 20"  hint="Short-term trend"  values={pick('pct_above_sma20')}      formatter={fmtPct} tones={pctTones('pct_above_sma20')} />
          <MetricRow label="> SMA 50"  hint="Intermediate trend" values={pick('pct_above_sma50')}      formatter={fmtPct} tones={pctTones('pct_above_sma50')} />
          <MetricRow label="> SMA 200" hint="Long-term trend"    values={pick('pct_above_sma200')}     formatter={fmtPct} tones={pctTones('pct_above_sma200')} />
          <MetricRow label="Aligned ↑" hint="Above all three MAs" values={pick('pct_aligned_bullish')} formatter={fmtPct} tones={pctTones('pct_aligned_bullish')} />
        </Section>

        <Section label="52-week extremes">
          <MetricRow label="New 52w highs" hint="Within 1% of high" values={pick('new_52w_highs')} formatter={fmtCount} tones={bullTones('new_52w_highs')} />
          <MetricRow label="New 52w lows"  hint="Within 1% of low"  values={pick('new_52w_lows')}  formatter={fmtCount} tones={bearTones('new_52w_lows')} />
        </Section>

        <Section label="Today's breadth">
          <MetricRow label="Up ≥ 4%"   hint="Daily gainers"  values={pick('up_4pct')}    formatter={fmtCount} tones={bullTones('up_4pct')} />
          <MetricRow label="Down ≥ 4%" hint="Daily losers"   values={pick('down_4pct')}  formatter={fmtCount} tones={bearTones('down_4pct')} />
          <MetricRow label="Advancers" hint=""               values={pick('advancers')}  formatter={fmtCount} tones={bullTones('advancers')} />
          <MetricRow label="Decliners" hint=""               values={pick('decliners')}  formatter={fmtCount} tones={bearTones('decliners')} />
        </Section>
      </div>

      <div className="flex justify-between text-[11px] text-[var(--text-tertiary)] mt-4 pt-3 border-t border-[var(--border-faint)]">
        <span>Source · Finviz Elite</span>
        <span>Snapshot · {fmtDate(snapshotDate)}</span>
      </div>
    </div>
  );
}

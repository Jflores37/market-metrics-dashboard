import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CATEGORY_ORDER = ['inflation', 'employment', 'rates', 'commodities'];
const CATEGORY_LABEL = {
  inflation: 'Inflation',
  employment: 'Employment',
  rates: 'Rates',
  commodities: 'Commodities',
};

function formatMonthYear(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00Z');
  return date.toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function formatDayMonthYear(d) {
  if (!d) return '';
  const date = new Date(d + 'T00:00:00Z');
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC' });
}

function fmtPct(n, signed = true) {
  if (n == null) return '—';
  const v = Number(n);
  const s = signed && v > 0 ? '+' : '';
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
  return `${sign}${Math.round(v).toLocaleString('en-US')}K`;
}

function directionStyle(d) {
  if (d === 'up') return { color: 'var(--bull)', icon: ArrowUp };
  if (d === 'down') return { color: 'var(--bear)', icon: ArrowDown };
  return { color: 'var(--text-tertiary)', icon: ArrowRight };
}

function KpiCard({ row }) {
  const dir = directionStyle(row.direction);
  const Icon = dir.icon;

  let primary, secondary;
  if (row.transform === 'yoy_pct') {
    primary = fmtPct(row.yoy_pct);
    secondary = `${fmtLevel(row.latest_value, row.units)} · ${row.frequency === 'daily' ? formatDayMonthYear(row.latest_date) : formatMonthYear(row.latest_date)}`;
  } else if (row.transform === 'mom_delta') {
    primary = fmtMomDelta(row.mom_delta);
    secondary = `Total ${Math.round(Number(row.latest_value) / 1000)}M · ${formatMonthYear(row.latest_date)}`;
  } else {
    primary = fmtLevel(row.latest_value, row.units);
    secondary = row.frequency === 'daily' ? formatDayMonthYear(row.latest_date) : formatMonthYear(row.latest_date);
  }

  const primaryColor =
    row.transform === 'yoy_pct' || row.transform === 'mom_delta' ? dir.color : 'var(--text-primary)';

  return (
    <div className="pulse-card p-4 hover:border-[var(--border-default)] transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-sm font-semibold text-[var(--text-primary)]">{row.display_name}</div>
          <div className="text-[10px] tracking-wider text-[var(--text-tertiary)] uppercase mt-0.5">
            {row.series_id}
          </div>
        </div>
        <Icon className="w-4 h-4" strokeWidth={2.5} style={{ color: dir.color }} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="pulse-number text-2xl font-bold" style={{ color: primaryColor }}>
          {primary}
        </span>
        {row.transform === 'yoy_pct' && (
          <span className="text-[10px] tracking-wider uppercase text-[var(--text-tertiary)]">YoY</span>
        )}
        {row.transform === 'mom_delta' && (
          <span className="text-[10px] tracking-wider uppercase text-[var(--text-tertiary)]">MoM</span>
        )}
      </div>
      <div className="text-xs text-[var(--text-tertiary)] mt-1.5">{secondary}</div>
    </div>
  );
}

function CategorySection({ label, rows }) {
  if (!rows.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">{label}</h2>
        <div className="flex-1 h-px bg-[var(--border-faint)]" />
        <span className="text-[10px] tracking-wider uppercase text-[var(--text-tertiary)]">
          {rows.length} {rows.length === 1 ? 'series' : 'series'}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((r) => (
          <KpiCard key={r.series_id} row={r} />
        ))}
      </div>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(2)].map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="pulse-shimmer h-5 w-32" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="pulse-shimmer h-24" />
            ))}
          </div>
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
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="pulse-card p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--bear)' }} />
        <div>
          <div className="font-semibold mb-1" style={{ color: 'var(--bear)' }}>Failed to load macro data</div>
          <div className="text-sm text-[var(--text-secondary)]">{error}</div>
        </div>
      </div>
    );
  }

  if (rows === null) return <LoadingSkeleton />;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    label: CATEGORY_LABEL[cat],
    rows: rows.filter((r) => r.category === cat),
  }));

  const freshest = rows.map((r) => r.latest_date).filter(Boolean).sort().at(-1);

  return (
    <div className="space-y-6 pulse-stagger">
      {grouped.map((g) => (
        <CategorySection key={g.label} label={g.label} rows={g.rows} />
      ))}
      <div className="pulse-card px-4 py-3 flex justify-between items-center text-xs text-[var(--text-tertiary)]">
        <span>Source · FRED</span>
        <span>Last observation · {formatDayMonthYear(freshest)}</span>
      </div>
    </div>
  );
}

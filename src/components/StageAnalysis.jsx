import { useEffect, useState } from 'react';
import { AlertTriangle, TrendingUp, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';

const STAGE_STYLES = {
  1: { color: 'var(--text-secondary)', bg: '#475569',          label: 'Base' },
  2: { color: 'var(--bull)',           bg: 'var(--bull)',      label: 'Uptrend' },
  3: { color: 'var(--warn)',           bg: 'var(--warn)',      label: 'Topping' },
  4: { color: 'var(--bear)',           bg: 'var(--bear)',      label: 'Downtrend' },
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

function tvUrl(t) { return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(t)}`; }

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="pulse-card p-5">
        <div className="pulse-shimmer h-2 w-full mb-4" />
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="pulse-shimmer h-6" />)}</div>
      </div>
      <div className="pulse-card p-5"><div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="pulse-shimmer h-5" />)}</div></div>
    </div>
  );
}

export default function StageAnalysis() {
  const [stages, setStages] = useState(null);
  const [leaders, setLeaders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [stagesRes, leadersRes] = await Promise.all([
        supabase.from('stage_analysis_v').select('*').order('stage'),
        supabase.from('stage2_leaders_v').select('*'),
      ]);
      if (cancelled) return;
      if (stagesRes.error) setError(stagesRes.error.message);
      else if (leadersRes.error) setError(leadersRes.error.message);
      else {
        setStages(stagesRes.data ?? []);
        setLeaders(leadersRes.data ?? []);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="pulse-card p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--bear)' }} />
        <div>
          <div className="font-semibold mb-1" style={{ color: 'var(--bear)' }}>Failed to load stages</div>
          <div className="text-sm text-[var(--text-secondary)]">{error}</div>
        </div>
      </div>
    );
  }

  if (stages === null || leaders === null) return <LoadingSkeleton />;

  const total = stages.reduce((s, x) => s + Number(x.count), 0);

  return (
    <div className="space-y-4">
      {/* Distribution card */}
      <div className="pulse-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] tracking-wider uppercase font-semibold text-[var(--text-tertiary)]">
            $1B+ Universe
          </div>
          <div className="pulse-number text-xs text-[var(--text-secondary)]">
            {total.toLocaleString('en-US')} stocks
          </div>
        </div>

        {/* Stacked bar */}
        <div className="flex h-2.5 rounded-full overflow-hidden mb-4" style={{ background: 'var(--bg-elevated)' }}>
          {stages.map((s) => {
            const w = total ? (Number(s.count) / total) * 100 : 0;
            const tone = STAGE_STYLES[s.stage];
            return <div key={s.stage} style={{ width: `${w}%`, background: tone.bg }} />;
          })}
        </div>

        {/* Rows */}
        <div className="space-y-2">
          {stages.map((s) => {
            const tone = STAGE_STYLES[s.stage];
            return (
              <div key={s.stage} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: tone.bg }} />
                  <span className="text-sm font-medium" style={{ color: tone.color }}>
                    Stage {s.stage} · {tone.label}
                  </span>
                </div>
                <div className="flex items-center gap-4 pulse-number">
                  <span className="text-sm text-[var(--text-secondary)] tabular-nums">
                    {Number(s.count).toLocaleString('en-US')}
                  </span>
                  <span className="text-base font-semibold w-14 text-right tabular-nums" style={{ color: tone.color }}>
                    {Number(s.pct).toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stage 2 leaders */}
      <div className="pulse-card">
        <div className="px-5 py-3 border-b border-[var(--border-faint)] flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: 'var(--bull)' }} strokeWidth={2.5} />
          <span className="text-sm font-semibold text-[var(--text-primary)]">Top Stage 2 Leaders</span>
          <span className="text-[11px] text-[var(--text-tertiary)] ml-auto">Ranked by quarter</span>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-faint)]">
          {leaders.slice(0, 15).map((l) => (
            <div key={l.ticker} className="px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-[var(--bg-elevated)] transition-colors">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <a
                  href={tvUrl(l.ticker)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pulse-number text-sm font-semibold w-16 inline-flex items-center gap-1 transition-colors"
                  style={{ color: 'var(--accent)' }}
                >
                  {l.ticker}
                  <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                </a>
                <span className="text-xs text-[var(--text-tertiary)] truncate">{l.sector}</span>
              </div>
              <div className="flex items-center gap-3 pulse-number text-sm">
                <span className="w-16 text-right tabular-nums" style={{ color: changeColor(l.perf_quarter) }}>{fmtPct(l.perf_quarter)}</span>
                <span className="w-16 text-right tabular-nums" style={{ color: changeColor(l.perf_year) }}>{fmtPct(l.perf_year)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-2.5 text-[11px] text-[var(--text-tertiary)] border-t border-[var(--border-faint)] flex justify-between">
          <span>Weinstein stages · derived from SMA20/50/200</span>
          <span>QTR · YR</span>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

const STAGE_TONE = {
  1: { text: 'text-zinc-400',   bg: 'bg-zinc-600',     bar: 'bg-zinc-600' },
  2: { text: 'text-emerald-400', bg: 'bg-emerald-500', bar: 'bg-emerald-500' },
  3: { text: 'text-amber-400',   bg: 'bg-amber-500',   bar: 'bg-amber-500' },
  4: { text: 'text-red-400',     bg: 'bg-red-500',     bar: 'bg-red-500' },
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

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="px-3 py-4 border-b border-zinc-900">
        <div className="h-3 bg-zinc-900 rounded w-2/3"></div>
      </div>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="px-3 py-2 border-b border-zinc-900">
          <div className="h-3 bg-zinc-900 rounded w-1/2"></div>
        </div>
      ))}
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
      <div className="px-3 py-4 flex items-start gap-2 text-red-400 text-[11px] tracking-wider">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-bold mb-1">FAILED TO LOAD STAGES</div>
          <div className="text-zinc-500">{error}</div>
        </div>
      </div>
    );
  }

  if (stages === null || leaders === null) return <LoadingSkeleton />;

  const total = stages.reduce((sum, s) => sum + Number(s.count), 0);

  return (
    <div>
      {/* Stacked distribution bar */}
      <div className="px-3 pt-3 pb-2 border-b border-zinc-800">
        <div className="flex h-2 rounded-sm overflow-hidden bg-zinc-900 mb-2">
          {stages.map((s) => {
            const w = total ? (Number(s.count) / total) * 100 : 0;
            const tone = STAGE_TONE[s.stage]?.bar ?? 'bg-zinc-700';
            return <div key={s.stage} className={tone} style={{ width: `${w}%` }} />;
          })}
        </div>
        <div className="flex justify-between text-[9px] tracking-wider text-zinc-600">
          <span>$1B+ UNIVERSE</span>
          <span className="tabular-nums">{total.toLocaleString('en-US')} STOCKS</span>
        </div>
      </div>

      {/* Stage rows */}
      {stages.map((s) => {
        const tone = STAGE_TONE[s.stage] ?? STAGE_TONE[1];
        return (
          <div key={s.stage} className="px-3 py-1.5 border-b border-zinc-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-sm ${tone.bg}`}></span>
              <span className={`text-[11px] tracking-wide ${tone.text}`}>
                Stage {s.stage} — {s.stage_label}
              </span>
            </div>
            <div className="flex items-center gap-3 tabular-nums">
              <span className="text-[11px] text-zinc-500">{Number(s.count).toLocaleString('en-US')}</span>
              <span className={`text-[12px] font-semibold w-12 text-right ${tone.text}`}>
                {Number(s.pct).toFixed(1)}%
              </span>
            </div>
          </div>
        );
      })}

      {/* Stage 2 leaders */}
      <div className="px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/40 flex items-center gap-2">
        <TrendingUp className="w-3 h-3 text-emerald-400" strokeWidth={2.5} />
        <span className="text-[9px] font-bold tracking-[0.3em] text-zinc-400">
          TOP STAGE 2 LEADERS · QTR%
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {leaders.slice(0, 12).map((l) => (
          <div key={l.ticker} className="px-3 py-1.5 border-b border-zinc-900 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[12px] font-bold tracking-wide text-zinc-100 w-14">{l.ticker}</span>
              <span className="text-[10px] text-zinc-600 truncate">{l.sector}</span>
            </div>
            <div className="flex items-center gap-3 tabular-nums text-[11px]">
              <span className={`w-14 text-right ${changeColor(l.perf_quarter)}`}>{fmtPct(l.perf_quarter)}</span>
              <span className={`w-14 text-right ${changeColor(l.perf_year)}`}>{fmtPct(l.perf_year)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 py-2 border-t border-zinc-800 text-[9px] tracking-[0.2em] text-zinc-600 flex justify-between">
        <span>WEINSTEIN STAGES · DERIVED FROM SMA20/50/200</span>
        <span>QTR · YR</span>
      </div>
    </div>
  );
}

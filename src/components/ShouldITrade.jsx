import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

function gradeTone(grade) {
  switch (grade) {
    case 'A': return 'text-emerald-400';
    case 'B': return 'text-emerald-300';
    case 'C': return 'text-amber-400';
    case 'D': return 'text-amber-500';
    case 'F': return 'text-red-400';
    default:  return 'text-zinc-500';
  }
}

function signalTone(signal) {
  if (signal === 'TRADE') return 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10';
  if (signal === 'CAUTION') return 'text-amber-400 border-amber-400/40 bg-amber-400/10';
  return 'text-red-400 border-red-400/40 bg-red-400/10';
}

function scoreTone(score) {
  if (score == null) return 'text-zinc-500';
  const v = Number(score);
  if (v >= 70) return 'text-emerald-400';
  if (v >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function ComponentBar({ label, score, weight }) {
  const v = score == null ? 0 : Math.max(0, Math.min(100, Number(score)));
  const tone = scoreTone(score);
  const barColor = v >= 70 ? 'bg-emerald-400' : v >= 50 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="px-3 py-2 border-b border-zinc-900">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] tracking-wide text-zinc-300">{label}</span>
          <span className="text-[9px] tracking-wider text-zinc-700">WEIGHT {weight}%</span>
        </div>
        <span className={`text-[12px] font-semibold tabular-nums ${tone}`}>
          {score == null ? '—' : Number(score).toFixed(1)}
        </span>
      </div>
      <div className="h-1 bg-zinc-900 rounded-sm overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="px-4 py-6 border-b border-zinc-900">
        <div className="h-16 bg-zinc-900 rounded mb-2"></div>
        <div className="h-3 bg-zinc-900 rounded w-1/3"></div>
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="px-3 py-3 border-b border-zinc-900">
          <div className="h-3 bg-zinc-900 rounded w-1/2 mb-2"></div>
          <div className="h-1 bg-zinc-900 rounded"></div>
        </div>
      ))}
    </div>
  );
}

export default function ShouldITrade() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('should_i_trade_v')
        .select('*')
        .maybeSingle();
      if (cancelled) return;
      if (error) setError(error.message);
      else setData(data);
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="px-3 py-4 flex items-start gap-2 text-red-400 text-[11px] tracking-wider">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-bold mb-1">FAILED TO LOAD SCORE</div>
          <div className="text-zinc-500">{error}</div>
        </div>
      </div>
    );
  }

  if (data === null) return <LoadingSkeleton />;

  const composite = data?.composite_score;
  const grade = data?.grade;
  const signal = data?.signal;

  return (
    <div>
      {/* Hero: big composite score + grade + signal */}
      <div className="px-4 py-4 border-b border-zinc-800">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[9px] font-bold tracking-[0.3em] text-zinc-600 mb-1">COMPOSITE SCORE</div>
            <div className="flex items-baseline gap-3">
              <span className={`text-5xl font-bold tabular-nums leading-none ${scoreTone(composite)}`}>
                {composite == null ? '—' : Number(composite).toFixed(1)}
              </span>
              <span className={`text-3xl font-bold ${gradeTone(grade)} leading-none`}>
                {grade ?? '—'}
              </span>
            </div>
          </div>
          <div className={`px-3 py-2 border text-[11px] font-bold tracking-[0.3em] ${signalTone(signal)}`}>
            {signal ?? '—'}
          </div>
        </div>
      </div>

      <ComponentBar label="Trend"     score={data?.trend_score}    weight={35} />
      <ComponentBar label="Breadth"   score={data?.breadth_score}  weight={25} />
      <ComponentBar label="Momentum"  score={data?.momentum_score} weight={25} />
      <ComponentBar label="Rotation"  score={data?.rotation_score} weight={15} />

      <div className="px-3 py-2 border-t border-zinc-800 text-[9px] tracking-[0.2em] text-zinc-600 leading-relaxed">
        TREND · % &gt; SMA200 ($1B+)  ·  BREADTH · ADV/DEC RATIO  ·  MOMENTUM · % &gt; SMA20  ·  ROTATION · % LEADING/IMPROVING SECTORS
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';

const COMPONENTS = [
  { key: 'trend_score',    label: 'Trend',    weight: 35, hint: '% of stocks above SMA200' },
  { key: 'breadth_score',  label: 'Breadth',  weight: 25, hint: 'Advancer / decliner ratio' },
  { key: 'momentum_score', label: 'Momentum', weight: 25, hint: '% of stocks above SMA20' },
  { key: 'rotation_score', label: 'Rotation', weight: 15, hint: '% of sectors leading or improving' },
];

function scoreTone(score) {
  if (score == null) return 'var(--text-secondary)';
  const v = Number(score);
  if (v >= 70) return 'var(--bull)';
  if (v >= 50) return 'var(--warn)';
  return 'var(--bear)';
}

function gradeTone(grade) {
  switch (grade) {
    case 'A': return { color: 'var(--bull)', bg: 'var(--bull-bg)', border: 'rgba(34, 197, 94, 0.35)' };
    case 'B': return { color: '#4ade80',     bg: 'var(--bull-bg)', border: 'rgba(34, 197, 94, 0.25)' };
    case 'C': return { color: 'var(--warn)', bg: 'var(--warn-bg)', border: 'rgba(245, 158, 11, 0.35)' };
    case 'D': return { color: '#fb923c',     bg: 'var(--warn-bg)', border: 'rgba(245, 158, 11, 0.25)' };
    case 'F': return { color: 'var(--bear)', bg: 'var(--bear-bg)', border: 'rgba(239, 68, 68, 0.35)' };
    default:  return { color: 'var(--text-secondary)', bg: 'transparent', border: 'var(--border-default)' };
  }
}

function signalStyle(signal) {
  if (signal === 'TRADE')
    return { color: 'var(--bull)', borderColor: 'rgba(34, 197, 94, 0.35)', background: 'var(--bull-bg)' };
  if (signal === 'CAUTION')
    return { color: 'var(--warn)', borderColor: 'rgba(245, 158, 11, 0.35)', background: 'var(--warn-bg)' };
  return { color: 'var(--bear)', borderColor: 'rgba(239, 68, 68, 0.35)', background: 'var(--bear-bg)' };
}

// Count-up animation for the composite score
function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target == null) return;
    let frame;
    const start = performance.now();
    const from = 0;
    const to = Number(target);
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

function ComponentBar({ label, hint, score, weight, delay = 0 }) {
  const v = score == null ? 0 : Math.max(0, Math.min(100, Number(score)));
  const tone = scoreTone(score);
  const [animatedWidth, setAnimatedWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimatedWidth(v), delay);
    return () => clearTimeout(t);
  }, [v, delay]);

  return (
    <div className="py-3 sm:py-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-baseline gap-2.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
          <span className="text-[10px] tracking-wider text-[var(--text-tertiary)] uppercase">
            Weight {weight}%
          </span>
        </div>
        <span
          className="pulse-number text-base font-semibold tabular-nums"
          style={{ color: tone }}
        >
          {score == null ? '—' : Number(score).toFixed(1)}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
        <div
          className="h-full rounded-full transition-all duration-[800ms]"
          style={{
            width: `${animatedWidth}%`,
            background: tone,
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--text-tertiary)]">{hint}</div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="pulse-shimmer h-20 w-full" />
      <div className="pulse-shimmer h-1 w-full" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="pulse-shimmer h-3 w-1/3" />
          <div className="pulse-shimmer h-1.5 w-full" />
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

  const composite = data?.composite_score;
  const grade = data?.grade;
  const signal = data?.signal;
  const gTone = gradeTone(grade);
  const sigStyle = signalStyle(signal);
  const animated = useCountUp(composite);

  if (error) {
    return (
      <div className="pulse-card p-5 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--bear)' }} />
        <div>
          <div className="font-semibold mb-1" style={{ color: 'var(--bear)' }}>Failed to load score</div>
          <div className="text-sm text-[var(--text-secondary)]">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero card */}
      <div className="pulse-card-hero p-6 sm:p-8 pulse-fade-in">
        {data === null ? (
          <LoadingSkeleton />
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 mb-1">
              <div>
                <div className="pulse-label mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" strokeWidth={2.5} />
                  Market Quality Score
                </div>
                <div className="flex items-baseline gap-4">
                  <span
                    className="pulse-number font-bold leading-none"
                    style={{ color: scoreTone(composite), fontSize: 'clamp(48px, 10vw, 72px)' }}
                  >
                    {composite == null ? '—' : animated.toFixed(1)}
                  </span>
                  <span
                    className="pulse-grade pulse-number"
                    style={{
                      color: gTone.color,
                      background: gTone.bg,
                      border: `1px solid ${gTone.border}`,
                      width: '48px',
                      height: '48px',
                      fontSize: '22px',
                    }}
                  >
                    {grade ?? '—'}
                  </span>
                </div>
              </div>
              {signal && (
                <span className="pulse-signal" style={{ ...sigStyle, padding: '8px 14px', fontSize: '12px' }}>
                  {signal}
                </span>
              )}
            </div>
            <div className="mt-3 text-sm text-[var(--text-secondary)] max-w-2xl">
              Composite of trend, breadth, momentum and sector rotation.
              {composite != null && composite < 50 && ' Conditions are weak — capital preservation mode.'}
              {composite != null && composite >= 50 && composite < 70 && ' Mixed signals — size positions carefully.'}
              {composite != null && composite >= 70 && ' Conditions are constructive — selective opportunities likely.'}
            </div>
          </>
        )}
      </div>

      {/* Component breakdown */}
      <div className="pulse-card p-6 sm:p-7">
        <div className="pulse-label mb-1">Components</div>
        <div className="text-xs text-[var(--text-tertiary)] mb-2">
          Weighted contribution to the composite score
        </div>
        {data === null ? (
          <LoadingSkeleton />
        ) : (
          <div className="divide-y divide-[var(--border-faint)]">
            {COMPONENTS.map((c, i) => (
              <ComponentBar
                key={c.key}
                label={c.label}
                hint={c.hint}
                score={data?.[c.key]}
                weight={c.weight}
                delay={120 + i * 80}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

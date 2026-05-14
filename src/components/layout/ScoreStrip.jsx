import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

function scoreTone(score) {
  if (score == null) return { text: 'var(--text-secondary)', accent: 'var(--text-tertiary)' };
  const v = Number(score);
  if (v >= 70) return { text: 'var(--bull)', accent: 'var(--bull)' };
  if (v >= 50) return { text: 'var(--warn)', accent: 'var(--warn)' };
  return { text: 'var(--bear)', accent: 'var(--bear)' };
}

function signalStyle(signal) {
  if (signal === 'TRADE')
    return { color: 'var(--bull)', borderColor: 'rgba(34, 197, 94, 0.35)', background: 'var(--bull-bg)' };
  if (signal === 'CAUTION')
    return { color: 'var(--warn)', borderColor: 'rgba(245, 158, 11, 0.35)', background: 'var(--warn-bg)' };
  return { color: 'var(--bear)', borderColor: 'rgba(239, 68, 68, 0.35)', background: 'var(--bear-bg)' };
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function marketSession(d) {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return { label: 'CLOSED · WEEKEND', color: 'var(--text-tertiary)' };
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (minutes >= 13 * 60 + 30 && minutes < 20 * 60)
    return { label: 'OPEN', color: 'var(--bull)' };
  if (minutes >= 9 * 60 && minutes < 13 * 60 + 30)
    return { label: 'PRE-MARKET', color: 'var(--warn)' };
  if (minutes >= 20 * 60 || minutes < 1 * 60)
    return { label: 'AFTER-HOURS', color: 'var(--warn)' };
  return { label: 'CLOSED', color: 'var(--text-tertiary)' };
}

export function ScoreStrip({ onClickScore }) {
  const [data, setData] = useState(null);
  const now = useNow();
  const session = marketSession(now);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('should_i_trade_v')
        .select('*')
        .maybeSingle();
      if (!cancelled && !error) setData(data);
    })();
    return () => { cancelled = true; };
  }, []);

  const composite = data?.composite_score;
  const grade = data?.grade;
  const signal = data?.signal;
  const tone = scoreTone(composite);
  const sigStyle = signalStyle(signal);

  return (
    <div className="border-b border-[var(--border-faint)] bg-[var(--bg-base)]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Left: score + grade + signal */}
        <button
          type="button"
          onClick={onClickScore}
          className="flex items-center gap-3 sm:gap-4 group cursor-pointer"
          aria-label="View Should I Trade details"
        >
          <div className="leading-tight text-left">
            <div className="pulse-label mb-0.5">MQS</div>
            <div className="flex items-baseline gap-2">
              <span
                className="pulse-number text-2xl sm:text-3xl font-bold leading-none transition-colors"
                style={{ color: tone.text }}
              >
                {data === null ? '—' : composite == null ? '—' : Number(composite).toFixed(1)}
              </span>
              <span
                className="pulse-grade"
                style={{
                  color: tone.text,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tone.text}33`,
                  width: '28px',
                  height: '28px',
                  fontSize: '14px',
                }}
              >
                {grade ?? '—'}
              </span>
            </div>
          </div>
          {signal && (
            <span className="pulse-signal hidden sm:inline-flex" style={sigStyle}>
              {signal}
            </span>
          )}
        </button>

        {/* Right: market session + clock */}
        <div className="flex items-center gap-4 sm:gap-5">
          <div className="hidden sm:flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full pulse-brand-dot"
              style={{ background: session.color }}
            />
            <span
              className="text-[11px] font-semibold tracking-[0.15em] uppercase"
              style={{ color: session.color }}
            >
              {session.label}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
            <Clock className="w-3 h-3" strokeWidth={2} />
            <span className="pulse-number text-xs">{now.toISOString().slice(11, 19)} UTC</span>
          </div>
        </div>
      </div>

      {/* Mobile signal pill (shown below the main row on small screens) */}
      {signal && (
        <div className="sm:hidden px-4 pb-3">
          <span className="pulse-signal" style={sigStyle}>{signal}</span>
        </div>
      )}
    </div>
  );
}

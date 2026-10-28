-- 20261028_380_classify_stage_bands.sql
-- Findings: pages-mm-macro-2 + db-logic-08 (above SMA50 and EMA10 but below
-- SMA20 fell through to '1A Basing'), pages-mm-macro-3 (2B/4B bands were only
-- 1 point wide).
-- =============================================================================
-- User decisions (2026-10-28):
--   bands  2A 0-5%, 2B 5-15%, 2C >15% above SMA50; 4A/4B/4C mirror below SMA50.
--   The mixed-MA case gets an explicit rule instead of defaulting to 1A:
--   above SMA50 with EMA10 holding but price under SMA20 = '2A' (pullback to
--   SMA20 inside an advance). sma50_pct = 0 counts as "at/above".
-- Signature, volatility and grants unchanged; stage_analysis_v picks it up.
--
--   null inputs                          -> 1A (no data)
--   sma50 >= 0:
--     e10 >= 0 and s20 >  0              -> <5: 2A | <15: 2B | else 2C
--     e10 >= 0 and s20 <= 0              -> 2A   (pullback rule)
--     e10 <  0                           -> s20 < 0 ? 3B : 3A
--   sma50 < 0:
--     e10 <  0 and s20 < 0               -> >-5: 4A | >-15: 4B | else 4C
--     e10 >  0 and s20 > 0               -> 1B
--     otherwise                          -> 1A
-- =============================================================================

CREATE OR REPLACE FUNCTION public.classify_stage(sma20_pct numeric, sma50_pct numeric, ema10_pct numeric DEFAULT NULL::numeric)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  e10 numeric := coalesce(ema10_pct, sma20_pct);
  s20 numeric := coalesce(sma20_pct, ema10_pct);
begin
  if sma50_pct is null or e10 is null or s20 is null then return '1A'; end if;

  if sma50_pct >= 0 then
    -- Stage 2: advancing, price above its averages
    if e10 >= 0 and s20 > 0 then
      if sma50_pct < 5 then return '2A';
      elsif sma50_pct < 15 then return '2B';
      else return '2C';
      end if;
    end if;
    -- Explicit: above SMA50 and EMA10, dipped under SMA20 = pullback inside an advance
    if e10 >= 0 and s20 <= 0 then return '2A'; end if;
    -- Stage 3: still above SMA50 but short-term momentum rolling over (e10 < 0)
    if s20 < 0 then return '3B'; else return '3A'; end if;
  end if;

  -- sma50_pct < 0
  -- Stage 4: declining, price below its averages
  if e10 < 0 and s20 < 0 then
    if sma50_pct > -5 then return '4A';
    elsif sma50_pct > -15 then return '4B';
    else return '4C';
    end if;
  end if;
  -- Stage 1: basing below SMA50
  if e10 > 0 and s20 > 0 then return '1B'; end if;
  return '1A';
end;
$function$;

GRANT EXECUTE ON FUNCTION public.classify_stage(numeric, numeric, numeric) TO anon, authenticated;

-- Rollback:
--   Re-run the classify_stage block from 20261028_320_live_schema_baseline.sql
--   (old bands 2A <6, 2B 6-7, 2C >=7; mirror for stage 4; fall-through '1A').

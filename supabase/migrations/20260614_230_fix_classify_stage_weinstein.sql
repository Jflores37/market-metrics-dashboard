-- 20260614_230_fix_classify_stage_weinstein.sql
-- =============================================================================
-- classify_stage mislabeled the two "shallow" fall-through cases, contradicting
-- Weinstein stage analysis:
--   * price ABOVE all 3 MAs but <5% over SMA50  -> returned '1B' (Basing high)
--     when a name above rising MAs is Stage 2 (advancing), not Stage 1.
--   * price BELOW all 3 MAs but >-5% under SMA50 -> returned '3B' (Topping)
--     when a name below all MAs is Stage 4 (declining), not Stage 3.
-- On 2026-06-13 this put 971 of 1002 "1B" names and 362 of 380 "3B" names in
-- the wrong stage (~1,333 total), badly skewing the Stage Analysis breadth card.
--
-- Fix: route "above all MAs" -> Stage 2 and "below all MAs" -> Stage 4, and give
-- the freed 1B / 3B substages meaningful transition homes (1B = firming base that
-- reclaimed the short MAs from below; 3B = distribution that has lost SMA20 too).
-- Substage strength thresholds (7/6/5) are unchanged.
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
  if sma50_pct is null then return '1A'; end if;
  if e10 is null or s20 is null then return '1A'; end if;

  -- Stage 2 -- price ABOVE all moving averages = advancing uptrend (never "basing")
  if e10 > 0 and s20 > 0 and sma50_pct > 0 then
    if sma50_pct >= 7 then return '2C';
    elsif sma50_pct >= 6 then return '2B';
    else return '2A';            -- early advance (0-6% over SMA50); was wrongly '1B'
    end if;
  end if;

  -- Stage 4 -- price BELOW all moving averages = decline (never "topping")
  if e10 < 0 and s20 < 0 and sma50_pct < 0 then
    if sma50_pct <= -7 then return '4C';
    elsif sma50_pct <= -6 then return '4B';
    else return '4A';            -- early decline (0 to -6% under SMA50); was wrongly '3B'
    end if;
  end if;

  -- Stage 3 -- topping: still above SMA50 but momentum rolling over
  if sma50_pct > 0 and e10 < 0 then
    if s20 < 0 then return '3B'; else return '3A'; end if;
  end if;

  -- Stage 1 -- basing: below SMA50
  if sma50_pct < 0 then
    if e10 > 0 and s20 > 0 then return '1B'; else return '1A'; end if;
  end if;

  return '1A';
end;
$function$;

-- 20260614_250_macro_deficit_signal_neutral.sql
-- =============================================================================
-- macro_classify_signal classified the federal 'deficit' KPI as 'tightening',
-- which is backwards: a federal deficit is fiscal EXPANSION, not a restrictive
-- (tightening) stance. It polluted the Signal Balance donut and the Bottom Line
-- narrative with an inverted reading. A fiscal level isn't a clean hawk/dove
-- monetary signal, so classify it 'neutral' (the 'tightening' bucket now
-- reflects only restrictive monetary policy, i.e. fed_funds > 4).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.macro_classify_signal(metric_id text, val numeric, trend text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO ''
AS $function$
begin
  if val is null then return 'neutral'; end if;
  if metric_id = 'fed_funds' then
    return case when val > 4.0 then 'tightening' else 'neutral' end;
  end if;
  if metric_id = 'dgs10' then
    return case when val > 4.5 then 'hawkish' when val < 3.5 then 'dovish' else 'neutral' end;
  end if;
  if metric_id in ('cpi_yoy', 'core_cpi_yoy', 'ppi_yoy', 'pce_yoy', 'core_pce_yoy') then
    return case when val > 3.0 then 'hawkish' when val < 2.0 then 'dovish' else 'neutral' end;
  end if;
  if metric_id = 'unemployment' then
    return case when val > 5.0 then 'dovish' when val < 4.0 then 'hawkish' else 'neutral' end;
  end if;
  if metric_id = 'nfp' then
    return case when val < 0 then 'dovish' when val > 200 then 'hawkish' else 'neutral' end;
  end if;
  if metric_id = 'brent' then
    return case when val > 90 then 'hawkish' else 'neutral' end;
  end if;
  if metric_id = 'sp500' then
    return case when trend = 'down' then 'dovish' when trend = 'up' then 'hawkish' else 'neutral' end;
  end if;
  if metric_id = 'sentiment' then
    return case when val < 70 then 'dovish' when val > 95 then 'hawkish' else 'neutral' end;
  end if;
  -- 'deficit' is a fiscal level, not a monetary stance (was wrongly 'tightening').
  if metric_id = 'deficit' then
    return 'neutral';
  end if;
  return 'neutral';
end;
$function$;

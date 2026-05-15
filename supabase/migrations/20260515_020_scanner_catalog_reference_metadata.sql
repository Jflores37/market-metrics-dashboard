-- Phase 4: Sync scanner_catalog labels, descriptions, sorts, caps, and
-- FinViz Elite export URLs from the reference repo (screeners.py +
-- constants.py FINVIZ_EXPORT_URLS, finviz-elite branch). Adds three new
-- scanners that the current catalog is missing: parabolic_short,
-- qullamaggie_combined, jeff_sun_canslim. Reference Day% sort = perf_day DESC.
-- max_rows = NULL means "show all matching rows" (uncapped).

-- ---------------------------------------------------------------------------
-- Existing scanners: update label/description/sort/url to match reference.
-- ---------------------------------------------------------------------------

UPDATE public.scanner_catalog SET
  label = 'Minervini Trend Template',
  description = 'Full Minervini SEPA template: price > SMA50 > SMA150 > SMA200, 200 SMA rising, >=30% above 52w low, <=25% below 52w high, RSI(14) >= 70.',
  default_sort_column = 'perf_day', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=sh_avgvol_o1000,sh_price_o1,ta_sma200_pa,tad_0_sma:150:sma:d|abv:::1|close::close:d,tad_1_sma:200:sma:d|abv:::1|close::close:d,tad_2_sma:200:sma:d|abv:::1|sma:150:sma:d,tad_3_sma:50:sma:d|abv:::|sma:150:sma:d,tad_4_sma:50:sma:d|abv:::|sma:200:sma:d,tad_5_sma:50:sma:d|abv:::1|close::close:d,tad_6_close::close:d|abvpct:30::|hilo:52:low:d,tad_7_close::close:d|blwpct::25:|hilo:52:high:d,tad_8_rsi:14:rsi:d|abveq:::|value:::70&o=-change&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'minervini';

UPDATE public.scanner_catalog SET
  label = 'O''Neil / CANSLIM',
  description = 'EPS YoY >= 25%, EPS forward >= 25%, EPS TTM positive, net margin > 0, ROE > 0. Sorted by Day %.',
  default_sort_column = 'perf_day', default_sort_direction = 'desc', max_rows = NULL,
  source = 'William O''Neil',
  finviz_url = 'https://elite.finviz.com/export.ashx?v=161&f=fa_epsyoy_o25,fa_epsyoy1_o25,fa_epsyoyttm_pos,fa_netmargin_pos,fa_roe_pos&o=-change&ft=2&c=1,32,40,47,61,62,63,64,65'
WHERE scanner_id = 'canslim';

UPDATE public.scanner_catalog SET
  label = 'High ADR% Hottest Stocks (Jeff Sun)',
  description = 'Mid+ cap, weekly volatility > 10%, rel vol >= 2x, current vol > 2M.',
  default_sort_column = 'perf_day', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=cap_midover,sh_avgvol_500to,sh_curvol_o2000,sh_relvol_o2,ta_volatility_wo10&ft=4&o=-change&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'high_adr';

UPDATE public.scanner_catalog SET
  label = 'Extended Bases / Prolonged Consolidations (Jeff Sun)',
  description = 'Small+ cap, near highs (<=30% from 52w high, <=5% from 50d high), YTD down, SMA200 +/-20%, weekly vol > 4%, institutional buying.',
  default_sort_column = 'perf_day', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o1000,sh_curvol_o1000,sh_insttrans_pos,sh_price_o1,ta_alltime_b70h,ta_highlow50d_a15h,ta_highlow52w_b30h,ta_perf_ytddown,ta_sma200_-20to20-a,ta_volatility_wo4&ft=4&o=-change&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'extended_bases';

UPDATE public.scanner_catalog SET
  label = 'Strongest Stocks (Julian Komar)',
  description = 'Small+ stocks only, avg vol > 100K, price > $7, within 30% of 52w high, above SMA50. Sorted by 52w-low distance.',
  default_sort_column = 'dist_52w_high_pct', default_sort_direction = 'asc', max_rows = NULL,
  source = 'Julian Komar',
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,ind_stocksonly,sh_avgvol_o100,sh_price_o7,ta_highlow52w_a70h,ta_sma50_pa&ft=4&o=-low52w&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'julian_strongest';

UPDATE public.scanner_catalog SET
  label = 'Qullamaggie Episodic Pivot (EP)',
  description = 'Gap up >= 10%, rel vol >= 2x, price > $1, avg vol > 1M. Tagged "EP".',
  default_sort_column = 'perf_day', default_sort_direction = 'desc', max_rows = NULL,
  source = 'Qullamaggie',
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=ta_gap_u10,sh_relvol_o2,sh_price_o1,sh_avgvol_o1000&o=-change&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'qullamaggie';

UPDATE public.scanner_catalog SET
  label = 'Qullamaggie Breakouts (BO)',
  description = 'Within 25% of 52w high, 30d perf within +/-4-week window, price >= 10% above SMA20, price > $1, avg vol > 1M. Tagged "BO".',
  default_sort_column = 'perf_day', default_sort_direction = 'desc', max_rows = NULL,
  source = 'Qullamaggie',
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=sh_avgvol_o1000,sh_price_o1,ta_highlow52w_0to25-bhx,ta_perf_30to-4w,tad_0_close::close:d|abvpct::10:|sma:20:sma:d&o=-change&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'qullamaggie_breakout';

UPDATE public.scanner_catalog SET
  label = '1-Week 20%+ Mover (Jeff Sun)',
  description = 'Small+ cap, avg vol > 300K, current vol > 100K, weekly perf > 20%, weekly vol > 4%.',
  default_sort_column = 'market_cap_millions', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_1w20o,ta_volatility_wo4&ft=4&o=-marketcap&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'perf_1w20';

UPDATE public.scanner_catalog SET
  label = '4-Week 30%+ Mover (Jeff Sun)',
  description = 'Small+ cap, avg vol > 300K, current vol > 100K, 4-week perf > 30%, monthly vol > 5%.',
  default_sort_column = 'market_cap_millions', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_4w30o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'perf_4w30';

UPDATE public.scanner_catalog SET
  label = '4-Week 50%+ Mover (Jeff Sun)',
  description = 'Small+ cap, avg vol > 300K, current vol > 100K, 4-week perf > 50%, monthly vol > 5%.',
  default_sort_column = 'market_cap_millions', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_4w50o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'perf_4w50';

UPDATE public.scanner_catalog SET
  label = '13-Week 50%+ Mover (Jeff Sun)',
  description = 'Small+ cap, avg vol > 300K, current vol > 100K, 13-week perf > 50%, monthly vol > 5%.',
  default_sort_column = 'market_cap_millions', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_13w50o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'perf_13w50';

UPDATE public.scanner_catalog SET
  label = '26-Week 100%+ Mover (Jeff Sun)',
  description = 'Small+ cap, avg vol > 300K, current vol > 100K, 26-week perf > 100%, monthly vol > 5%.',
  default_sort_column = 'market_cap_millions', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=cap_smallover,sh_avgvol_o300,sh_curvol_o100,ta_perf_26w100o,ta_volatility_mo5&ft=4&o=-marketcap&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'perf_26w100';

UPDATE public.scanner_catalog SET
  label = '4% Daily Movers',
  description = 'Stocks moving >= 4% today, avg vol > 1M, price > $1. Sorted by Day %.',
  default_sort_column = 'perf_day', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=sh_avgvol_o1000,sh_price_o1,ta_perf_4to-d&o=-change&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'up4_daily';

UPDATE public.scanner_catalog SET
  label = 'IPOs Previous Year (Jeff Sun)',
  description = 'Mid+ cap IPOs from previous year, EPS YoY > 0, avg vol > 1M. Ordered by industry.',
  default_sort_column = 'industry', default_sort_direction = 'asc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=cap_midover,fa_epsyoy1_pos,ipodate_prevyear,sh_avgvol_o1000&ft=4&o=industry&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'ipo_thisweek';

UPDATE public.scanner_catalog SET
  label = 'High Short Float (Jeff Sun)',
  description = 'Stocks only, small+ cap, float < 100M, short float > 30%, avg vol > 1M.',
  default_sort_column = 'perf_day', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=131&f=cap_smallover,ind_stocksonly,sh_avgvol_o1000,sh_float_u100,sh_short_o30&ft=4&c=1,32,47,61,62,63,64,65'
WHERE scanner_id = 'high_short';

UPDATE public.scanner_catalog SET
  label = 'Liquid ETFs (Jeff Sun)',
  description = 'ETFs with weekly vol > 3%, avg vol > 1M. Sorted by daily volume.',
  default_sort_column = 'volume', default_sort_direction = 'desc', max_rows = NULL,
  finviz_url = 'https://elite.finviz.com/export.ashx?v=111&f=ind_exchangetradedfund,sh_avgvol_o1000,ta_volatility_wo3&ft=4&o=-volume&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'liquid_etfs';

-- Repurpose qullamaggie_continuation -> Parabolic Short (PS).
-- Keeps existing display slot in the perf group; renames + redefines.
UPDATE public.scanner_catalog SET
  scanner_id = 'parabolic_short',
  label = 'Qullamaggie Parabolic Short (PS)',
  description = 'Parabolic Short setup. Large cap with month perf >= 50%, plus small cap with 300%+ in 4 weeks and 100%+ in 1 week. Tagged "PS".',
  default_sort_column = 'perf_day', default_sort_direction = 'desc', max_rows = NULL,
  source = 'Qullamaggie',
  finviz_url = 'https://elite.finviz.com/export.ashx?v=141&f=cap_largeover,ta_perf_50to-4w&o=-change&c=1,47,61,62,63,64,65 |  https://elite.finviz.com/export.ashx?v=141&f=cap_to9,ta_perf_300to-4w,ta_perf2_100to-1w&ft=4&o=-change&c=1,47,61,62,63,64,65'
WHERE scanner_id = 'qullamaggie_continuation';

UPDATE public.scanner_results SET scanner_id = 'parabolic_short'
WHERE scanner_id = 'qullamaggie_continuation';

-- ---------------------------------------------------------------------------
-- New scanners: Qullamaggie Combined rollup + Jeff Sun CANSLIM.
-- ---------------------------------------------------------------------------

INSERT INTO public.scanner_catalog
  (scanner_id, label, description, group_tab, display_order, source,
   default_sort_column, default_sort_direction, max_rows, finviz_url)
VALUES
  ('qullamaggie_combined',
   'Qullamaggie Combined (EP / PS / BO)',
   'Union of Qullamaggie Episodic Pivot, Parabolic Short, and Breakouts. Each row tagged with the originating sub-scan(s).',
   'perf', 105, 'Qullamaggie',
   'perf_day', 'desc', NULL,
   'composite: qulla_episodic + qulla_ps_large + qulla_ps_small + qulla_breakouts'),
  ('jeff_sun_canslim',
   'CANSLIM (Jeff Sun)',
   'Mid+ cap, high sales QoQ + YoYTTM, avg vol 500K-, current vol > 2M, institutional buying, near 20d/50d highs, weekly vol > 4%.',
   'trend', 25, 'Jeff Sun',
   'perf_day', 'desc', NULL,
   'https://elite.finviz.com/export.ashx?v=141&f=cap_midover,fa_salesqoq_high,fa_salesyoyttm_high,sh_avgvol_500to,sh_curvol_o2000,sh_insttrans_pos,ta_highlow20d_a5h,ta_highlow50d_a5h,ta_volatility_wo4&ft=4&o=-change&c=1,47,61,62,63,64,65')
ON CONFLICT (scanner_id) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  group_tab = EXCLUDED.group_tab,
  display_order = EXCLUDED.display_order,
  source = EXCLUDED.source,
  default_sort_column = EXCLUDED.default_sort_column,
  default_sort_direction = EXCLUDED.default_sort_direction,
  max_rows = EXCLUDED.max_rows,
  finviz_url = EXCLUDED.finviz_url;

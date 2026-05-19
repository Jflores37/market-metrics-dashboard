-- Super Scanner titles should open the *viewable* FinViz screener page with
-- the preset filters. scanner_catalog.finviz_url was seeded with CSV
-- export.ashx URLs (clicking downloaded a CSV) plus one malformed
-- double-URL (parabolic_short). Convert single export URLs -> screener
-- URLs (drop the &c= export columns and any &auth=); point parabolic_short
-- at its primary large-cap leg. True composites (qullamaggie_combined,
-- weekly_20pct) and earnings_thisweek stay non-URL so the UI shows no link.

update public.scanner_catalog
set finviz_url = regexp_replace(
                   regexp_replace(
                     replace(finviz_url, 'export.ashx', 'screener.ashx'),
                     '&c=[^&]*', '', 'g'),
                   '&auth=[^&]*', '', 'g')
where finviz_url like 'https://%export.ashx?%'
  and finviz_url not like '% | %';

update public.scanner_catalog
set finviz_url = 'https://elite.finviz.com/screener.ashx?v=141&f=cap_largeover,ta_perf_50to-4w&o=-change'
where scanner_id = 'parabolic_short';

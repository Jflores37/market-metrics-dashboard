-- 20261028_480_drop_dead_views.sql
-- Findings: db-logic-16 (legacy should_i_trade_v scoring and sector_pulse_v's
-- second RRG definition contradict what the UI shows), pages-mm-macro-4 DB side
-- (user decision: remove the "Thematics - by Theme" card, a duplicate of
-- Leading Industries; its view thematics_by_theme_v goes with it).
-- =============================================================================
-- APPLY ONLY AFTER THE FRONTEND DEPLOY that removes ThematicsByThemeTable.
-- None of the three views is read by src/ or by any edge function, and no other
-- view depends on them (should_i_trade_v depends on sector_pulse_v and
-- breadth_metrics_v; both drops are in one statement). No CASCADE, so the drop
-- fails loudly if something new started depending on them.
-- =============================================================================

DROP VIEW IF EXISTS public.thematics_by_theme_v, public.should_i_trade_v, public.sector_pulse_v;

-- Rollback:
--   Re-run the sector_pulse_v, should_i_trade_v and thematics_by_theme_v blocks
--   (in that order) from 20261028_320_live_schema_baseline.sql, including their
--   GRANT SELECT ... TO anon, authenticated lines and WITH (security_invoker = ...) options.

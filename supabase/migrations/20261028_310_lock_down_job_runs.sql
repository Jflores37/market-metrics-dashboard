-- 20261028_310_lock_down_job_runs.sql
-- job_runs.error / .summary can contain upstream error text. It was readable by
-- anon through the "public read job runs" policy (USING true). The only public
-- consumer is FreshnessBanner -> pipeline_failures_v, which selects just
-- job_name/status/started_at. So: run the view with its owner's rights (it
-- exposes no error text), then remove anon/authenticated access to the table.
-- The service role (edge functions) and postgres (pg_cron / check_pipeline_health)
-- are unaffected. No frontend change needed.

-- 1) View must stop being security_invoker, or it would lose access below.
ALTER VIEW public.pipeline_failures_v SET (security_invoker = off);

-- 2) Close the table to the public API.
DROP POLICY IF EXISTS "public read job runs" ON public.job_runs;
REVOKE ALL ON public.job_runs FROM anon, authenticated;

-- Rollback:
--   ALTER VIEW public.pipeline_failures_v SET (security_invoker = on);
--   GRANT SELECT ON public.job_runs TO anon, authenticated;
--   CREATE POLICY "public read job runs" ON public.job_runs FOR SELECT TO anon, authenticated USING (true);

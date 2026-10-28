-- 20261028_340_job_runs_partial_and_invoke_edge.sql
-- Findings: edge-a-5 / edge-b-08 (SQL side: cron-only auth), prerequisite for
-- edge-b-04, db-logic-13, ops-security-live-9/10 (cron rewrite in 350).
-- =============================================================================
-- 1. job_runs.status gains 'partial' (FIX_CONTRACT 1.2): running|ok|partial|error.
-- 2. Vault 'anon_key': harvested from an existing cron command (same technique
--    as migration 220) when absent. The JWT's role claim must be 'anon'. No key
--    is written in this file.
-- 3. ABORTS if Vault 'cron_secret' does not exist, so 350 never rewrites cron
--    before the secret is in place. Create it first (same value as the edge
--    secret CRON_SECRET):  select vault.create_secret('<value>', 'cron_secret');
-- 4. public.invoke_edge(fn, query, timeout_ms): the only way cron calls an
--    edge function. Sends Content-Type, Authorization: Bearer <Vault anon_key>
--    and x-cron-secret: <Vault cron_secret>. Raises if either secret is
--    missing, so a run shows 'failed' in cron.job_run_details instead of
--    firing an unauthenticated call. SECURITY DEFINER; EXECUTE revoked from
--    PUBLIC/anon/authenticated (pg_cron runs as postgres, the owner).
-- =============================================================================

-- 3) Fail fast before changing anything.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    RAISE EXCEPTION 'Vault secret cron_secret is missing. Create it (same value as edge secret CRON_SECRET) and re-run this migration.';
  END IF;
END $$;

-- 1) status values
ALTER TABLE public.job_runs DROP CONSTRAINT IF EXISTS job_runs_status_check;
ALTER TABLE public.job_runs ADD CONSTRAINT job_runs_status_check
  CHECK (status = ANY (ARRAY['running'::text, 'ok'::text, 'partial'::text, 'error'::text]));

-- 2) anon key into Vault (only if absent)
DO $$
DECLARE
  tok  text;
  pl   text;
  v_role text;
BEGIN
  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'anon_key') THEN
    RETURN;
  END IF;

  SELECT substring(command from 'Bearer ([A-Za-z0-9._-]+)')
    INTO tok
  FROM cron.job
  WHERE command ILIKE '%functions/v1/%' AND command ILIKE '%Bearer %'
  ORDER BY jobid
  LIMIT 1;

  IF tok IS NULL OR length(tok) < 100 THEN
    RAISE EXCEPTION 'No Bearer token found on an existing cron job. Create Vault secret anon_key (the project anon key) and re-run.';
  END IF;

  -- Refuse anything that is not the anon key (e.g. a service_role key).
  pl := split_part(tok, '.', 2);
  pl := translate(pl, '-_', '+/') || repeat('=', (4 - length(pl) % 4) % 4);
  v_role := convert_from(decode(pl, 'base64'), 'UTF8')::jsonb ->> 'role';
  IF v_role IS DISTINCT FROM 'anon' THEN
    RAISE EXCEPTION 'Harvested cron Bearer token is not the anon key (role=%). Create Vault secret anon_key by hand.', coalesce(v_role, 'null');
  END IF;

  PERFORM vault.create_secret(tok, 'anon_key', 'Supabase anon key; pg_cron -> edge function Bearer header');
END $$;

-- 4) cron -> edge helper
CREATE OR REPLACE FUNCTION public.invoke_edge(
  p_fn         text,
  p_query      text DEFAULT NULL,
  p_timeout_ms integer DEFAULT 30000
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_anon text := public.get_secret('anon_key');
  v_cron text := public.get_secret('cron_secret');
  v_url  text;
BEGIN
  IF v_anon IS NULL OR v_anon = '' THEN
    RAISE EXCEPTION 'invoke_edge(%): Vault secret anon_key is missing', p_fn;
  END IF;
  IF v_cron IS NULL OR v_cron = '' THEN
    RAISE EXCEPTION 'invoke_edge(%): Vault secret cron_secret is missing', p_fn;
  END IF;
  IF p_fn IS NULL OR p_fn !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'invoke_edge: invalid function name %', p_fn;
  END IF;

  v_url := 'https://xwjjrxdsegakshpxzfhi.supabase.co/functions/v1/' || p_fn
           || CASE WHEN p_query IS NULL OR p_query = '' THEN '' ELSE '?' || p_query END;

  RETURN net.http_post(
    url                  := v_url,
    headers              := jsonb_build_object(
                              'Content-Type',  'application/json',
                              'Authorization', 'Bearer ' || v_anon,
                              'x-cron-secret', v_cron),
    body                 := '{}'::jsonb,
    timeout_milliseconds := coalesce(p_timeout_ms, 30000)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.invoke_edge(text, text, integer) FROM PUBLIC, anon, authenticated;

-- Rollback:
--   (Roll back 350 first so no cron job calls invoke_edge.)
--   DROP FUNCTION IF EXISTS public.invoke_edge(text, text, integer);
--   UPDATE public.job_runs SET status = 'error' WHERE status = 'partial';
--   ALTER TABLE public.job_runs DROP CONSTRAINT IF EXISTS job_runs_status_check;
--   ALTER TABLE public.job_runs ADD CONSTRAINT job_runs_status_check
--     CHECK (status = ANY (ARRAY['running'::text, 'ok'::text, 'error'::text]));
--   Vault anon_key may stay (it is the public anon key); or: DELETE FROM vault.secrets WHERE name = 'anon_key';

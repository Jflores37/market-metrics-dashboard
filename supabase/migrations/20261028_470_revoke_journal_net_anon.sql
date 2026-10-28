-- 20261028_470_revoke_journal_net_anon.sql
-- Findings: ops-security-live-13 (the personal trading journal shares this
-- public-facing project and anon holds full table privileges on journal.*, so
-- RLS was the only barrier; anon can also reach pg_net's request functions and
-- response table).
-- =============================================================================
-- Checked before writing: the Market Metrics frontend never queries the journal
-- schema (no .schema('journal') / journal.* reference in src/), and every
-- journal policy is user_id = auth.uid() (authenticated) or firms_read
-- (authenticated). So anon needs nothing in journal.
-- KEEP: authenticated + service_role grants (RLS-gated), untouched.
--
-- journal: revoke anon on all tables/sequences/functions + schema USAGE, and
-- the default privileges postgres hands anon on future journal objects.
--
-- net (pg_net): its objects are owned by supabase_admin and currently granted
-- to PUBLIC by supabase_admin. postgres (which runs migrations) can only revoke
-- grants it made itself, so these revokes may be no-ops ("no privileges could
-- be revoked" WARNING) on Supabase. They are attempted inside an exception
-- block so the migration never fails on them. The net schema is not in the
-- PostgREST exposed schemas, so there is no API path today. If the revokes
-- don't take, the remaining hardening is a Supabase-support / dashboard item,
-- reported in the rollout notes (NOT a reason to grant anything here).
-- =============================================================================

-- journal (skipped on a fresh rebuild where the journal schema doesn't exist;
-- it is created outside this repo)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'journal') THEN
    REVOKE ALL ON ALL TABLES    IN SCHEMA journal FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA journal FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA journal FROM anon;
    REVOKE USAGE ON SCHEMA journal FROM anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA journal REVOKE ALL ON TABLES    FROM anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA journal REVOKE ALL ON SEQUENCES FROM anon;
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA journal REVOKE ALL ON FUNCTIONS FROM anon;
  END IF;
END $$;

-- net (best effort; see header)
DO $$
BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) FROM anon;
    REVOKE EXECUTE ON FUNCTION net.http_get(text, jsonb, jsonb, integer) FROM anon;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'net function revoke skipped: %', sqlerrm;
  END;
  BEGIN
    REVOKE ALL ON net._http_response FROM anon;
    REVOKE USAGE ON SCHEMA net FROM anon;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'net table/schema revoke skipped: %', sqlerrm;
  END;
END $$;

-- Verify after applying (should return no anon rows for journal):
--   select table_name, privilege_type from information_schema.role_table_grants
--   where table_schema = 'journal' and grantee = 'anon';
--   select has_function_privilege('anon', 'net.http_post(text,jsonb,jsonb,jsonb,integer)', 'execute');
--   (true here means the PUBLIC grant by supabase_admin is still in force; see header.)

-- Rollback:
--   GRANT USAGE ON SCHEMA journal TO anon;
--   GRANT ALL ON ALL TABLES IN SCHEMA journal TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA journal GRANT ALL ON TABLES TO anon;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA journal GRANT ALL ON SEQUENCES TO anon;
--   (net: nothing to restore if the revokes were no-ops.)

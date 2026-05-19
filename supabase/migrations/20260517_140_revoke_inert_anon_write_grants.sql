-- Posture verified before this change: RLS is ON for every public base
-- table and the ONLY policies are SELECT / USING(true). No write policy
-- exists, so anon/authenticated writes were already denied by RLS. The
-- INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grants held by
-- anon/authenticated were therefore inert today — but a latent footgun:
-- the moment any permissive write policy is added they become live.
-- Strip them. SELECT is intentionally left in place (this is a public
-- market-data dashboard: the frontend reads macro_observations directly
-- and everything else via SECURITY DEFINER views).

do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated',
      r.relname
    );
  end loop;
end $$;

-- Internal-only tables: no public read policy exists, so anon/authenticated
-- already get nothing through RLS. Make it explicit and drop them from the
-- auto-exposed (PostgREST / pg_graphql) surface entirely.
revoke all on public.pipeline_health from anon, authenticated;
revoke all on public.app_config     from anon, authenticated;

-- Stop tables created by future migrations (run as this role) from
-- silently re-acquiring the inert write grants via Supabase defaults.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated;

-- Security hardening — the no-breakage subset (from Supabase security advisors).
--
-- Scope deliberately excludes (a) relocating secrets out of app_config and
-- (b) the 40 SECURITY DEFINER data views: the dashboard is an intentionally
-- public, no-auth read surface, so those views are by design and tightening
-- them would break public reads. The genuinely high-severity item — secrets
-- in a table — is handled separately (it requires rewriting + redeploying
-- every edge function and is done with a fallback).
--
-- Everything here is verified safe: the frontend (anon key) references none
-- of these objects, and all writers use service_role / postgres, whose
-- grants are untouched.

-- 1. app_config holds finviz_token + fred_api_key. anon/authenticated had a
--    full DML grant (blanket-grant anti-pattern); only RLS-with-no-policy
--    was standing between the public anon key and the keys. Remove the
--    grant entirely — nothing but service_role (edge functions) and
--    postgres (cron) should touch it.
revoke all on table public.app_config from anon, authenticated;

-- 2. Internal pipeline scratch views were discoverable/SELECTable via the
--    public API. Not referenced by the frontend.
revoke all on table public._phase5b_industry_ranks  from anon, authenticated;
revoke all on table public._phase5b_liquid_universe  from anon, authenticated;

-- 3. Pin search_path on the two flagged helpers. Both are SECURITY INVOKER
--    pure-logic classifiers (no schema objects referenced), so empty
--    search_path is correct and removes the hijack-surface lint.
alter function public.classify_stage(numeric, numeric, numeric)   set search_path = '';
alter function public.macro_classify_signal(text, numeric, text)  set search_path = '';

-- 4. rls_auto_enable() is a DDL event-trigger function (it auto-enables RLS
--    on new public tables — a good control). It is meaningless as a REST
--    RPC; revoke EXECUTE so it is not part of the exposed API.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 5. Performance advisor: drop never-used indexes (write overhead, no reads).
drop index if exists public.idx_cnbc_premarket_fetched;
drop index if exists public.idx_vix_date;
drop index if exists public.idx_industry_date;

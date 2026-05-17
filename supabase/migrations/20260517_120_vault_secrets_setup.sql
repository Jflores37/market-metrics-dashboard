-- Move API secrets into pgsodium-backed Vault (encrypted at rest) and expose
-- them only to service_role via a SECURITY DEFINER accessor. The plaintext
-- public.app_config rows are removed in migration 130 once the consuming
-- edge functions are redeployed + validated reading from Vault.
--
-- Secret values are copied in-SQL from the existing app_config rows so they
-- never leave the database.

do $$
declare v text;
begin
  if not exists (select 1 from vault.secrets where name = 'finviz_token') then
    select value into v from public.app_config where key = 'finviz_token';
    if v is not null and v <> '' then
      perform vault.create_secret(v, 'finviz_token', 'FinViz Elite export auth token');
    end if;
  end if;
  if not exists (select 1 from vault.secrets where name = 'fred_api_key') then
    select value into v from public.app_config where key = 'fred_api_key';
    if v is not null and v <> '' then
      perform vault.create_secret(v, 'fred_api_key', 'FRED API key');
    end if;
  end if;
end $$;

-- service_role-only accessor. SECURITY DEFINER so it can read
-- vault.decrypted_secrets; search_path pinned; NOT exposed to anon/auth.
create or replace function public.get_secret(p_name text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name
$$;

revoke execute on function public.get_secret(text) from public, anon, authenticated;
grant execute on function public.get_secret(text) to service_role;

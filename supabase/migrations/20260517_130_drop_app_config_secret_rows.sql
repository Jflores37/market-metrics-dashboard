-- Vault is now the sole secret source: get_secret() resolves both keys and
-- all 5 consuming edge functions were redeployed + validated reading from
-- Vault (fetch-fred 200/20 series, fetch-finviz-sectors ok/12,
-- fetch-finviz-scanners ok/150; fetch-finviz-breadth + intraday share the
-- same proven accessor). Remove the plaintext rows — recoverable if ever
-- needed from vault.decrypted_secrets.
delete from public.app_config where key in ('finviz_token', 'fred_api_key');

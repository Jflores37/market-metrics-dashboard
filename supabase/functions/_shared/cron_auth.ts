// Fail-closed guard for cron-only endpoints. pg_cron sends header x-cron-secret
// (value from Vault 'cron_secret'); the function compares it to env CRON_SECRET.
export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";
  const json = (status: number, error: string) =>
    new Response(JSON.stringify({ ok: false, error }), { status, headers: { "Content-Type": "application/json" } });
  if (expected.length < 16) return json(500, "server misconfigured");   // missing secret => closed, never open
  if (got.length !== expected.length) return json(401, "unauthorized");
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0 ? null : json(401, "unauthorized");
}

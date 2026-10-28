// Masks secrets before an error/message is returned in a Response, logged, or
// written to a table (job_runs is anon-readable). Deno's fetch errors embed the
// full request URL, so any URL carrying ?auth=/api_key= would otherwise leak.
const PARAM_RE = /([?&](?:auth|api_key|apikey|token|key|secret|access_token)=)[^&\s"'`)<>]+/gi;

export function redact(input: unknown, ...secrets: Array<string | null | undefined>): string {
  let s = input instanceof Error ? input.message : typeof input === "string" ? input : String(input);
  s = s.replace(PARAM_RE, "$1[REDACTED]");
  for (const v of secrets) {
    if (v && v.length >= 6) s = s.split(v).join("[REDACTED]");
  }
  return s;
}

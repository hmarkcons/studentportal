// Who is allowed to trigger a cron route.
//
// All three routes carried `if (process.env.CRON_SECRET && authHeader !== ...)`,
// which authenticates nothing when the variable is unset — and it is unset in
// production. Verified by calling the deadline route from a shell with no
// credentials: it answered, and with ?dry=1 it printed student names and staff
// email addresses to anyone who asked.
//
// Two things follow. A cron endpoint that sends email must not be triggerable
// by the public, and a dry run — which exists to echo exactly who would be
// mailed and about which students — must not be reachable without the secret.
//
// The secret is still optional, because requiring it would silently stop three
// daily jobs the office relies on until somebody set it. Without it, only
// Vercel's own scheduler gets through: it invokes with the user agent
// `vercel-cron/1.0` (documented) and nothing else about the request is
// distinguishable. That is weaker than a shared secret and is why the response
// says so — set CRON_SECRET in the Vercel project and this tightens to the
// header check on its own.

export type CronAuthResult = { ok: true; secretConfigured: boolean } | { ok: false; status: number; error: string };

const VERCEL_CRON_AGENT = "vercel-cron/";

export function checkCronRequest(request: Request, opts: { dryRun?: boolean } = {}): CronAuthResult {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization") ?? "";
  const agent = (request.headers.get("user-agent") ?? "").toLowerCase();

  if (secret) {
    if (authHeader === `Bearer ${secret}`) return { ok: true, secretConfigured: true };
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // A dry run reports names and addresses, so it needs the secret whatever
  // else is true about the caller.
  if (opts.dryRun) {
    return {
      ok: false,
      status: 401,
      error:
        "A dry run reports student names and staff addresses, so it needs CRON_SECRET. Set it in the Vercel project and call this with an Authorization: Bearer header.",
    };
  }

  if (agent.startsWith(VERCEL_CRON_AGENT)) return { ok: true, secretConfigured: false };

  return {
    ok: false,
    status: 401,
    error: "Unauthorized. Set CRON_SECRET in the environment to call this outside the scheduler.",
  };
}

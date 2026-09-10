// Who is allowed to trigger a cron route.
//
// All three routes carried `if (process.env.CRON_SECRET && authHeader !== ...)`,
// which authenticates nothing when the variable is unset — and it is unset in
// production. Verified by calling the deadline route from a shell with no
// credentials: it answered, and with ?dry=1 it printed student names and staff
// email addresses to anyone who asked.
//
// The dry run is the part that leaks, so that is the part this closes outright:
// it exists to echo exactly who would be emailed and about which students, and
// it now needs the secret whatever else is true about the caller.
//
// A plain run is deliberately still allowed when no secret is set. Requiring
// one would mean betting that Vercel's scheduler presents something I can
// recognise, and being wrong would silently stop three daily jobs the office
// depends on — a worse failure than the one being fixed, and a silent one. What
// an unauthenticated run can do is cause the same emails the schedule sends
// anyway; it cannot read anything back. So the response says the route is open
// instead, and setting CRON_SECRET in the Vercel project closes it completely.

export type CronAuthResult =
  | { ok: true; secretConfigured: boolean; warning?: string }
  | { ok: false; status: number; error: string };

/** Shown in every unauthenticated response, so the gap is visible rather than assumed. */
export const CRON_OPEN_WARNING =
  "CRON_SECRET is not set, so this endpoint can be triggered by anyone. Set it in the Vercel project.";

export function checkCronRequest(request: Request, opts: { dryRun?: boolean } = {}): CronAuthResult {
  const secret = process.env.CRON_SECRET?.trim();
  const authHeader = request.headers.get("authorization") ?? "";

  if (secret) {
    if (authHeader === `Bearer ${secret}`) return { ok: true, secretConfigured: true };
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // A dry run reports names and addresses. Nothing else about the caller
  // substitutes for the secret here.
  if (opts.dryRun) {
    return {
      ok: false,
      status: 401,
      error:
        "A dry run reports student names and staff email addresses, so it needs CRON_SECRET. Set it in the Vercel project, then call this with an Authorization: Bearer header.",
    };
  }

  return { ok: true, secretConfigured: false, warning: CRON_OPEN_WARNING };
}

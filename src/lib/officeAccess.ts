/**
 * Who may use the portal from where.
 *
 * The rule the office asked for: on the office network, nothing changes. Off
 * it, a staff member reaches a waiting screen and nothing else until
 * Management or a Super Admin approves them, and that approval lapses.
 *
 * Address matching is Postgres's (`<<=` on cidr) rather than ours — it
 * handles IPv4, IPv6 and ranges without any bit arithmetic here to get wrong.
 * What lives in this file is the part worth reading on its own: which header
 * to believe about who is calling, and which paths a blocked person may still
 * reach.
 */

/** The state staff_access_state returns, as the proxy consumes it. */
export type AccessState = {
  is_staff?: boolean;
  allowed?: boolean;
  gate_configured?: boolean;
  role?: string | null;
  on_office_network?: boolean;
  exempt?: boolean;
  approval_expires_at?: string | null;
};

/** Where a blocked staff member is sent, and the only place they may go. */
export const ACCESS_PENDING_PATH = "/access-pending";

/**
 * Paths a blocked staff member may still reach.
 *
 * The waiting screen itself, the assets it needs to render, and the two ways
 * off it: signing out, and signing in as somebody else.
 *
 * Deliberately NOT all of /api. /api/search answers with student names and
 * universities, and a blocked session that can still call it has not been
 * stopped from reading anything — only from seeing the pages. So the
 * sign-out route is named and nothing else is. The cron routes need no
 * exemption because the proxy returns before this on their paths.
 */
export function isAccessAllowedPath(pathname: string): boolean {
  return (
    pathname === ACCESS_PENDING_PATH ||
    pathname.startsWith(`${ACCESS_PENDING_PATH}/`) ||
    pathname.startsWith("/login") ||
    pathname === "/api/sign-out" ||
    pathname.startsWith("/_next/")
  );
}

/**
 * The caller's public address.
 *
 * Vercel sets x-forwarded-for, whose first entry is the client and whose
 * later entries are the proxies it passed through — taking the last would
 * read our own edge network as the visitor. x-real-ip is Vercel's own single
 * value and is preferred where present because it cannot be spoofed by a
 * client sending its own x-forwarded-for.
 *
 * Null when there is nothing to read. A request whose address cannot be
 * established is treated as off-network, never as an error: the gate may
 * inconvenience somebody, but it must not take the portal down.
 */
export function clientIp(headers: {
  get(name: string): string | null;
}): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return normaliseIp(real);

  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return null;
  const first = forwarded.split(",")[0]?.trim();
  return first ? normaliseIp(first) : null;
}

/**
 * Strips what a header adds and Postgres will not parse.
 *
 * A port on an IPv4 address ("203.0.113.5:54321"), and the brackets IPv6
 * carries when it appears with one ("[2001:db8::1]:443"). An IPv6 address
 * without brackets is left alone — its own colons are not a port.
 */
export function normaliseIp(raw: string): string {
  let ip = raw.trim();

  const bracketed = ip.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) return bracketed[1];

  // IPv4 with a port: exactly one colon, and digits after it.
  const withPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (withPort) return withPort[1];

  // Some proxies prefix IPv4 addresses mapped into IPv6.
  if (ip.toLowerCase().startsWith("::ffff:") && ip.includes(".")) ip = ip.slice(7);

  return ip;
}

/**
 * Whether this request may proceed, and why not if it may not.
 *
 * Kept separate from the database call so the branches can be read and tested
 * without one: the cost of getting this wrong is either a locked-out office
 * or a gate that does nothing.
 */
export function accessVerdict(
  state: AccessState | null,
  pathname: string
): { allow: true } | { allow: false; redirectTo: string } {
  // No answer at all — the function is missing, the query failed, the database
  // is unreachable. Fail open. A gate that locks everybody out when it cannot
  // reach the database is a worse outage than the risk it manages.
  if (!state) return { allow: true };

  if (state.allowed !== false) return { allow: true };

  // Blocked, but already somewhere they are allowed to be.
  if (isAccessAllowedPath(pathname)) return { allow: true };

  return { allow: false, redirectTo: ACCESS_PENDING_PATH };
}

/** How the waiting screen describes the situation. */
export function pendingReason(state: AccessState | null): string {
  if (!state?.gate_configured) {
    return "Your account is not currently allowed to use the portal from this network.";
  }
  return "You are signed in, but you are not on the HMARK office network. Management or a Super Admin has to approve access from here before you can go any further.";
}

/** Default length of an approval, in days, when somebody does not choose one. */
export const DEFAULT_APPROVAL_DAYS = 7;

/** Clamped so a typo cannot grant a decade. */
export function approvalDays(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_APPROVAL_DAYS;
  return Math.min(n, 90);
}

/** When an approval granted now should lapse. */
export function approvalExpiry(days: number, now: Date = new Date()): Date {
  const out = new Date(now.getTime());
  out.setUTCDate(out.getUTCDate() + approvalDays(days));
  return out;
}

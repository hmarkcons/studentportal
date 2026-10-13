// Where signing in lands.
//
// On their own Dashboard — staff, students and partners alike, each sent on
// from "/" — unless the link they opened was to one particular thing, which
// opens instead:
//
//   * a link the portal sent them (an alert, a reminder, a leave or agreement
//     email): marked by sentLink below, whatever it points at;
//   * a page about one record — a student, a task, an application — which
//     names it in its address (a UUID, in the path or the query);
//   * the office QR check-in, which signs them in to check them in.
//
// Anything else — a section's own page, a bookmark, an address the browser
// remembers — goes to the Dashboard. Until 2026-10-08 every staff sign-in
// landed on Reports, so browsers learned portal…/reports as "the portal" and
// offered it from the address bar; opened signed out, the sign-in page then
// took them faithfully back to Reports.
//
// Pure, so the unit tests import it directly (scripts/sign-in-landing-test.mjs).

/** Added to every link the portal emails, so signing in from one opens it. */
export const SENT_PARAM = "via";
export const SENT_VALUE = "email";

/** A link to put in an email: the portal's address, the path, and the mark that it was sent. */
export function sentLink(siteUrl: string, path: string): string {
  const url = new URL(path, `${siteUrl.replace(/\/+$/, "")}/`);
  url.searchParams.set(SENT_PARAM, SENT_VALUE);
  return url.toString();
}

/** Pages that are not somewhere to land. */
const NEVER = ["/login", "/api", "/access-pending"];
/** Pages that only make sense opened from their link. */
const ALWAYS = ["/attendance/checkin"];

const under = (pathname: string, prefixes: readonly string[]) => prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether an address names one record: a UUID among its path segments or its query values. */
function namesOneThing(url: URL): boolean {
  const segments = url.pathname.split("/").map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  return segments.some((s) => UUID.test(s)) || [...url.searchParams.values()].some((v) => UUID.test(v));
}

const BASE = "http://same-origin.invalid";

/**
 * Where to go once signed in, given the sign-in page's ?next=.
 *
 * Only ever a same-origin relative path, never an absolute or
 * protocol-relative one, which would be an open redirect. A plain
 * startsWith("/") check is not enough: browsers read a leading "/\" as "//"
 * (WHATWG URL), so "/\evil.com" would pass it and still leave the site.
 * Parsing with URL and comparing the resolved origin catches that and every
 * other such quirk, and the path is rebuilt from the parsed result rather
 * than trusted as typed.
 */
export function postSignInPath(next: string | null | undefined): string {
  let url: URL;
  try {
    url = new URL(next || "/", BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";
  if (url.pathname === "/" || under(url.pathname, NEVER)) return "/";

  const sent = url.searchParams.get(SENT_PARAM) === SENT_VALUE;
  url.searchParams.delete(SENT_PARAM);
  const path = url.pathname + url.search + url.hash;

  if (sent || under(url.pathname, ALWAYS) || namesOneThing(url)) return path;
  return "/";
}

// "Keep me signed in", unticked: a sign-in that ends when the browser closes.
//
// @supabase/ssr gives every auth cookie a 400-day Max-Age whatever options it
// is handed (cookies.js sets maxAge after spreading the caller's), so the only
// place to make a session cookie is where the cookie is written: the server
// client, the proxy and the browser client each take their auth cookies
// through sessionOnlyCookieOptions while the marker below is present.
//
// The marker is itself a session cookie, set at sign-in when the box is left
// unticked and removed when it is ticked, so it goes when the browser closes
// along with the session it describes. It is readable by the page because the
// browser client needs to see it; it holds nothing but "1".
//
// Pure, so it is unit-tested (scripts/session-cookies-test.mjs).

export const SESSION_ONLY_COOKIE = "hmark-session-only";

type CookieOptionsLike = { maxAge?: number; expires?: Date | number | string } & Record<string, unknown>;

/**
 * The options for writing an auth cookie that lasts only as long as the
 * browser: no Max-Age and no Expires. A deletion — Max-Age 0, or an Expires
 * already passed — is left exactly as it is, or signing out would leave an
 * empty cookie behind instead of removing it.
 */
export function sessionOnlyCookieOptions<T extends CookieOptionsLike>(options: T | undefined, now: number = Date.now()): T | undefined {
  if (!options) return options;
  if (options.maxAge === 0 || (typeof options.maxAge === "number" && options.maxAge < 0)) return options;
  if (options.expires !== undefined && new Date(options.expires).getTime() <= now) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}

/** Whether a cookie header's worth of name=value pairs carries the marker. */
export function hasSessionOnlyMarker(cookieHeader: string): boolean {
  return cookieHeader.split(";").some((part) => part.trim().startsWith(`${SESSION_ONLY_COOKIE}=`));
}

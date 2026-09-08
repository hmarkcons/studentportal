// Formats a date-only ("YYYY-MM-DD") column value for display. Plain
// `new Date(dateStr).toLocaleDateString()` has a real mismatch: a date-only
// string parses as UTC midnight per spec, but toLocaleDateString() renders
// in the viewer's local timezone — for any viewer behind UTC, that shows
// the previous calendar day instead of the one actually stored. Pinning the
// format itself to UTC keeps the displayed date matching the stored one
// regardless of the viewer's timezone. Only use this for genuine `date`
// columns, never `timestamptz` ones (those should keep rendering in the
// viewer's local time, which is correct as-is).
// The locale is pinned too, not just the timezone. Most callers are server
// components that hydrate on the client, and the two sides disagree about
// locale — Vercel is en-US, the browser is whatever the user has set — so an
// implicit locale rendered one date on the server and a differently formatted
// one on the client, which React reports as a hydration mismatch and recovers
// from by throwing away the server HTML.
export function formatDateOnly(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { timeZone: "UTC", ...options });
}

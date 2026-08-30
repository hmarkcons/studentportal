// Formats a date-only ("YYYY-MM-DD") column value for display. Plain
// `new Date(dateStr).toLocaleDateString()` has a real mismatch: a date-only
// string parses as UTC midnight per spec, but toLocaleDateString() renders
// in the viewer's local timezone — for any viewer behind UTC, that shows
// the previous calendar day instead of the one actually stored. Pinning the
// format itself to UTC keeps the displayed date matching the stored one
// regardless of the viewer's timezone. Only use this for genuine `date`
// columns, never `timestamptz` ones (those should keep rendering in the
// viewer's local time, which is correct as-is).
export function formatDateOnly(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { timeZone: "UTC", ...options });
}

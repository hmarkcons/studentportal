// Reading what an open or a click was: which device and mail app, and whether
// a person did it or a machine did.
//
// Opens: Apple Mail Privacy Protection fetches every image as soon as the
// email arrives, and some security gateways do the same, so an "open" may be
// no person at all. One with Apple's bare user agent, or within seconds of
// delivery, is flagged a machine open; Gmail's and Yahoo's image proxies fetch
// when the person opens the email, so theirs count as people.
//
// Clicks: corporate security scanners follow every link as the email arrives.
// A click within seconds of sending, a burst across several links at once, or
// a scanner's user agent is flagged a bot click.
//
// No portal imports, so the unit tests load it under plain Node.

export type Device = "mobile" | "tablet" | "desktop" | "unknown";

export function parseUserAgent(ua: string | null | undefined): { device: Device; client: string } {
  const s = String(ua ?? "");
  if (!s) return { device: "unknown", client: "Unknown" };
  let client = "Web browser";
  if (/GoogleImageProxy|ggpht\.com/i.test(s)) client = "Gmail";
  else if (/YahooMailProxy/i.test(s)) client = "Yahoo Mail";
  else if (/Outlook|Microsoft Office|MSOffice|ms-office/i.test(s)) client = "Outlook";
  else if (/Thunderbird/i.test(s)) client = "Thunderbird";
  else if (s.trim() === "Mozilla/5.0" || /AppleWebKit\/[\d.]+ \(KHTML, like Gecko\)$/i.test(s.trim())) client = "Apple Mail";
  else if (/bot|crawl|spider|scan|curl|python|java\/|go-http|wget|preview/i.test(s)) client = "Robot";
  let device: Device = "desktop";
  if (/iPad|Tablet/i.test(s)) device = "tablet";
  else if (/Mobile|iPhone|Android/i.test(s)) device = "mobile";
  else if (client === "Gmail" || client === "Yahoo Mail" || client === "Apple Mail" || client === "Robot") device = "unknown";
  return { device, client };
}

/** Whether an open was a machine fetching images rather than a person reading. */
export function isMachineOpen({ ua, sentAt, openedAt }: { ua: string | null | undefined; sentAt: string | null; openedAt: Date }): boolean {
  const s = String(ua ?? "").trim();
  if (s === "Mozilla/5.0") return true; // Apple Mail Privacy Protection
  if (/bot|crawl|spider|scan|curl|python|wget|barracuda|proofpoint|mimecast|safelinks/i.test(s)) return true;
  if (sentAt && openedAt.getTime() - new Date(sentAt).getTime() < 20_000) return true;
  return false;
}

/** Whether a click was a security scanner rather than a person. */
export function isBotClick({
  ua,
  sentAt,
  clickedAt,
  clicksInLastFiveSeconds,
}: {
  ua: string | null | undefined;
  sentAt: string | null;
  clickedAt: Date;
  /** This recipient's other clicks, on any link, in the five seconds before this one. */
  clicksInLastFiveSeconds: number;
}): boolean {
  const s = String(ua ?? "");
  if (!s.trim()) return true;
  if (/bot|crawl|spider|scan|curl|python|wget|java\/|go-http|headless|barracuda|proofpoint|mimecast|safelinks|forcepoint|symantec|trendmicro/i.test(s)) return true;
  if (sentAt && clickedAt.getTime() - new Date(sentAt).getTime() < 10_000) return true;
  return clicksInLastFiveSeconds >= 2;
}

const HMARK_SITE = /(^|\.)hmarkconsultants\.com$/i;

export function isHmarkSite(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return HMARK_SITE.test(host) && !/^portal\./i.test(host);
  } catch {
    return false;
  }
}

/**
 * Where a click is sent: the link's own URL, with the campaign's UTM tags
 * (unless the link already carries its own) and, on HMARK's website, the
 * recipient's token as hm_rid so the website script can say who visited.
 */
export function clickDestination(url: string, { utm, slug, recipientToken }: { utm: boolean; slug: string; recipientToken: string }): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (utm && !u.searchParams.has("utm_source")) {
    u.searchParams.set("utm_source", "hmark_portal");
    u.searchParams.set("utm_medium", "email");
    u.searchParams.set("utm_campaign", slug);
  }
  if (isHmarkSite(url)) u.searchParams.set("hm_rid", recipientToken);
  return u.toString();
}

/** A transparent 1×1 GIF, the open pixel. */
export const PIXEL_GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

/** A recipient token from a tracking URL ("abc….gif" or "abc…"), or null. */
export function recipientTokenOf(raw: string): string | null {
  const t = raw.replace(/\.gif$/i, "");
  return /^[0-9a-f]{32}$/.test(t) ? t : null;
}

// Made-up activity for a PRACTICE campaign — one sent with no sending service
// connected, so nothing reached anyone — to try the reports with before the
// service is bought. Rates are about what a good education-sector campaign
// sees; every event is marked simulated, and never touches an address's real
// state. Seeded by the campaign, so running it twice makes the same story.
//
// No portal imports, so the unit tests load it under plain Node.

import { isHmarkSite } from "./tracking.ts";

export type SimRecipient = { id: string; campaignId: string; email: string; sentAt: string };
export type SimLink = { id: string; url: string };

export type SimEvent = {
  campaign_id: string;
  recipient_id: string;
  type: string;
  occurred_at: string;
  link_id?: string | null;
  url?: string | null;
  device?: string | null;
  client?: string | null;
  ip_country?: string | null;
  ip_city?: string | null;
  is_machine?: boolean;
  bounce_type?: string | null;
  bounce_subtype?: string | null;
  diagnostic?: string | null;
  simulated: true;
  meta?: Record<string, unknown>;
};

export type SimUpdate = {
  id: string;
  delivered_at: string | null;
  first_open_at: string | null;
  open_count: number;
  human_open_count: number;
  first_click_at: string | null;
  click_count: number;
  human_click_count: number;
  bounce: "hard" | "soft" | null;
  bounce_reason: string | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
  visited_at: string | null;
  converted_at: string | null;
  last_activity_at: string | null;
  device: string | null;
  client: string | null;
  country: string | null;
  city: string | null;
};

/** A small seeded random number generator (mulberry32), 0 ≤ n < 1. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const pick = <T,>(rnd: () => number, items: [T, number][]): T => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = rnd() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1][0];
};

const CLIENTS: [{ client: string; device: string }, number][] = [
  [{ client: "Gmail", device: "mobile" }, 34],
  [{ client: "Gmail", device: "desktop" }, 22],
  [{ client: "Apple Mail", device: "mobile" }, 17],
  [{ client: "Outlook", device: "desktop" }, 13],
  [{ client: "Yahoo Mail", device: "mobile" }, 6],
  [{ client: "Web browser", device: "desktop" }, 8],
];
const PLACES: [{ country: string; city: string }, number][] = [
  [{ country: "PK", city: "Karachi" }, 52],
  [{ country: "PK", city: "Lahore" }, 12],
  [{ country: "PK", city: "Islamabad" }, 8],
  [{ country: "PK", city: "Hyderabad" }, 6],
  [{ country: "AE", city: "Dubai" }, 5],
  [{ country: "IT", city: "Milan" }, 4],
  [{ country: "DE", city: "Berlin" }, 4],
  [{ country: "GB", city: "London" }, 3],
  [{ country: "SA", city: "Riyadh" }, 3],
  [{ country: "PK", city: "Multan" }, 3],
];
const PAGES = ["/", "/study-in-italy", "/study-in-germany", "/scholarships", "/contact", "/about"];

/** A believable story of what happened to each recipient after it was sent. */
export function simulateActivity(input: { recipients: SimRecipient[]; links: SimLink[]; conversionKeys: string[]; seed: number }): {
  events: SimEvent[];
  updates: SimUpdate[];
} {
  const rnd = seededRandom(input.seed);
  const events: SimEvent[] = [];
  const updates: SimUpdate[] = [];
  const iso = (ms: number) => new Date(ms).toISOString();
  const siteLinks = input.links.filter((l) => isHmarkSite(l.url));

  for (const r of input.recipients) {
    const sent = Date.parse(r.sentAt);
    const u: SimUpdate = {
      id: r.id,
      delivered_at: null,
      first_open_at: null,
      open_count: 0,
      human_open_count: 0,
      first_click_at: null,
      click_count: 0,
      human_click_count: 0,
      bounce: null,
      bounce_reason: null,
      complained_at: null,
      unsubscribed_at: null,
      visited_at: null,
      converted_at: null,
      last_activity_at: null,
      device: null,
      client: null,
      country: null,
      city: null,
    };
    // Every event carries every key: inserted in batches, a key one row lacks is sent as null for it, not its default.
    const ev = (type: string, at: number, extra: Partial<SimEvent> = {}) =>
      events.push({
        campaign_id: r.campaignId,
        recipient_id: r.id,
        type,
        occurred_at: iso(at),
        link_id: null,
        url: null,
        device: null,
        client: null,
        ip_country: null,
        ip_city: null,
        is_machine: false,
        bounce_type: null,
        bounce_subtype: null,
        diagnostic: null,
        meta: {},
        ...extra,
        simulated: true,
      });

    const roll = rnd();
    if (roll < 0.02) {
      u.bounce = "hard";
      u.bounce_reason = "Mailbox does not exist";
      ev("hard_bounce", sent + 30_000, { bounce_type: "Permanent", bounce_subtype: "NoEmail", diagnostic: u.bounce_reason });
      updates.push(u);
      continue;
    }
    if (roll < 0.03) {
      u.bounce = "soft";
      u.bounce_reason = "Mailbox full";
      ev("soft_bounce", sent + 60_000, { bounce_type: "Transient", bounce_subtype: "MailboxFull", diagnostic: u.bounce_reason });
      updates.push(u);
      continue;
    }
    const delivered = sent + 5_000 + Math.floor(rnd() * 60_000);
    u.delivered_at = iso(delivered);
    ev("delivered", delivered);

    const who = pick(rnd, CLIENTS);
    const where = pick(rnd, PLACES);
    // Apple's privacy proxy fetches the pixel as the email lands: an open no one made.
    if (who.client === "Apple Mail" && rnd() < 0.7) {
      u.open_count += 1;
      u.first_open_at = iso(delivered + 3_000);
      ev("opened", delivered + 3_000, { is_machine: true, device: "unknown", client: "Apple Mail" });
    }
    // A security scanner following every link the moment it arrives.
    if (input.links.length && rnd() < 0.04) {
      for (const l of input.links) {
        u.click_count += 1;
        u.first_click_at ??= iso(delivered + 2_000);
        ev("clicked", delivered + 2_000, { link_id: l.id, url: l.url, is_machine: true, client: "Robot", device: "unknown" });
      }
    }
    if (rnd() < 0.42) {
      // Most people open within hours; a long tail over three days.
      const firstOpen = delivered + Math.floor((rnd() < 0.7 ? rnd() * 6 : 6 + rnd() * 66) * 3_600_000);
      const opens = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < opens; i++) {
        const at = firstOpen + i * Math.floor(rnd() * 8 * 3_600_000);
        u.open_count += 1;
        u.human_open_count += 1;
        if (!u.first_open_at || Date.parse(u.first_open_at) > at) u.first_open_at = iso(at);
        u.last_activity_at = iso(Math.max(at, Date.parse(u.last_activity_at ?? iso(0))));
        ev("opened", at, { device: who.device, client: who.client, ip_country: where.country, ip_city: where.city });
      }
      u.device = who.device;
      u.client = who.client;
      u.country = where.country;
      u.city = where.city;

      if (input.links.length && rnd() < 0.28) {
        const link = rnd() < 0.6 && siteLinks.length ? siteLinks[Math.floor(rnd() * siteLinks.length)] : input.links[Math.floor(rnd() * input.links.length)];
        const clickAt = firstOpen + 20_000 + Math.floor(rnd() * 600_000);
        u.click_count += 1;
        u.human_click_count += 1;
        if (!u.first_click_at || Date.parse(u.first_click_at) > clickAt) u.first_click_at = iso(clickAt);
        u.last_activity_at = iso(Math.max(clickAt, Date.parse(u.last_activity_at ?? iso(0))));
        ev("clicked", clickAt, { link_id: link.id, url: link.url, device: who.device, client: who.client, ip_country: where.country, ip_city: where.city });

        if (isHmarkSite(link.url) && rnd() < 0.65) {
          const session = Math.floor(rnd() * 1e9).toString(36);
          const pages = 1 + Math.floor(rnd() * 4);
          let at = clickAt + 2_000;
          for (let p = 0; p < pages; p++) {
            const page = p === 0 ? link.url : `https://hmarkconsultants.com${PAGES[Math.floor(rnd() * PAGES.length)]}`;
            ev("website_visit", at, { url: page, device: who.device, ip_country: where.country, ip_city: where.city, meta: { session } });
            u.visited_at ??= iso(at);
            at += 20_000 + Math.floor(rnd() * 150_000);
          }
          u.last_activity_at = iso(at);
          if (input.conversionKeys.length && rnd() < 0.18) {
            const key = input.conversionKeys[Math.floor(rnd() * input.conversionKeys.length)];
            ev("conversion", at, { url: "https://hmarkconsultants.com/contact", device: who.device, meta: { session, conversion: key } });
            u.converted_at = iso(at);
          }
        }
      }
      if (rnd() < 0.006) {
        const at = firstOpen + 60_000;
        u.unsubscribed_at = iso(at);
        ev("unsubscribed", at);
      }
    }
    if (rnd() < 0.0005) {
      const at = delivered + 3_600_000;
      u.complained_at = iso(at);
      ev("complaint", at);
    }
    updates.push(u);
  }
  return { events, updates };
}

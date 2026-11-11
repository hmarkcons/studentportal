// A campaign's email made ready, then made personal.
//
// Once per campaign (`prepareCampaignHtml`): each web link becomes a numbered
// marker and is listed — a click is redirected to the URL stored for its
// number, never one taken from the click — the open pixel's place is marked,
// and the preview text (preheader) is put at the top, hidden. Per recipient
// (`renderForRecipient`): the markers become that recipient's tracking
// addresses and the merge tags their values — plain string work, so fifty
// thousand emails do not mean parsing the HTML fifty thousand times.
//
// No portal imports, so the unit tests load it under plain Node.

import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { renderMergeTags, type MergeValues } from "./mergeTags.ts";

export type CampaignLink = { position: number; url: string; label: string };

const LINK_MARK = (n: number) => `%%HMARK_LINK_${n}%%`;
const PIXEL_MARK = "%%HMARK_PIXEL%%";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The email as the campaign sends it: tracked links marked, the pixel's place marked, the preheader in. */
export function prepareCampaignHtml(
  html: string,
  { trackClicks, trackOpens, preheader }: { trackClicks: boolean; trackOpens: boolean; preheader?: string | null }
): { html: string; links: CampaignLink[] } {
  const $ = cheerio.load(html);
  const links: CampaignLink[] = [];
  if (trackClicks) {
    $("a[href]").each((_, node) => {
      const el = node as Element;
      const url = el.attribs.href.trim();
      // mailto:, tel:, #anchors and the merge-tag links (unsubscribe, preferences, web version) are left as they are.
      if (!/^https?:\/\//i.test(url) || url.includes("{{")) return;
      const position = links.length + 1;
      links.push({ position, url, label: $(el).text().replace(/\s+/g, " ").trim().slice(0, 200) || $(el).find("img").attr("alt")?.slice(0, 200) || "" });
      $(el).attr("href", LINK_MARK(position));
    });
  }
  if (preheader?.trim()) {
    // Shown as the inbox's preview line, hidden in the email itself; the padding stops the client pulling body text in after it.
    const pad = "&#847;&zwnj;&nbsp;".repeat(40);
    const block = `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader.trim())}${pad}</div>`;
    const body = $("body");
    if (body.length) body.prepend(block);
    else $.root().prepend(block);
  }
  if (trackOpens) {
    const pixel = `<img src="${PIXEL_MARK}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;" />`;
    const body = $("body");
    if (body.length) body.append(pixel);
    else $.root().append(pixel);
  }
  return { html: $.html(), links };
}

export type RecipientLinks = {
  site: string;
  recipientToken: string;
  addressToken: string;
};

/** A recipient's unsubscribe, preferences and web-version links. */
export function recipientLinks({ site, recipientToken, addressToken }: RecipientLinks) {
  return {
    unsubscribe_url: `${site}/email/unsubscribe/${addressToken}?r=${recipientToken}`,
    preferences_url: `${site}/email/preferences/${addressToken}`,
    web_version_url: `${site}/email/view/${recipientToken}`,
  };
}

/** The one-click unsubscribe address for the List-Unsubscribe header (RFC 8058). */
export function oneClickUrl({ site, recipientToken, addressToken }: RecipientLinks): string {
  return `${site}/api/email/unsubscribe/${addressToken}?r=${recipientToken}`;
}

export type RenderedEmail = { html: string; text: string; headers: Record<string, string> };

/** One recipient's email: tracking addresses in, merge tags filled, the headers every campaign email carries. */
export function renderForRecipient(input: {
  preparedHtml: string;
  text: string;
  values: MergeValues;
  links: RecipientLinks;
  campaignId: string;
  recipientId: string;
  /** For the web version: no pixel, so viewing it is not an open. */
  forWeb?: boolean;
}): RenderedEmail {
  const { site, recipientToken } = input.links;
  const values = { ...input.values, ...recipientLinks(input.links) };
  const tracked = input.preparedHtml
    .replace(/%%HMARK_LINK_(\d+)%%/g, (_m, n: string) => `${site}/api/email/c/${recipientToken}?l=${n}`)
    .replace(input.forWeb ? /<img src="%%HMARK_PIXEL%%"[^>]*>/g : /%%HMARK_PIXEL%%/g, input.forWeb ? "" : `${site}/api/email/o/${recipientToken}.gif`);
  return {
    html: renderMergeTags(tracked, values, { html: true }),
    text: renderMergeTags(input.text, values, { html: false }),
    headers: {
      "List-Unsubscribe": `<${oneClickUrl(input.links)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-HMARK-Campaign-ID": input.campaignId,
      "X-HMARK-Recipient-ID": input.recipientId,
    },
  };
}

/** "Italy Scholarships — Nov!" → "italy-scholarships-nov", for utm_campaign. */
export function campaignSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "campaign";
}

/**
 * The click map: the email as sent, every link going nowhere, and beside each
 * tracked link the share of people who clicked it. Shown in a sandboxed frame.
 */
export function clickMapHtml(preparedHtml: string, values: MergeValues, counts: Record<number, { people: number; share: string }>): string {
  const $ = cheerio.load(preparedHtml.replace(/<img src="%%HMARK_PIXEL%%"[^>]*>/g, ""));
  $("a[href]").each((_, node) => {
    const el = node as Element;
    const m = /^%%HMARK_LINK_(\d+)%%$/.exec(el.attribs.href);
    $(el).attr("href", "#").removeAttr("target");
    if (!m) return;
    const c = counts[Number(m[1])];
    const text = c ? `${c.share} · ${c.people.toLocaleString("en-US")}` : "0";
    $(el).after(
      `<span data-click-badge="${m[1]}" style="display:inline-block;margin:0 4px;padding:1px 7px;border-radius:9px;background:#0369A1;color:#ffffff;font:bold 11px/16px Arial,Helvetica,sans-serif;vertical-align:middle;white-space:nowrap;">${escapeHtml(text)}</span>`
    );
  });
  return renderMergeTags($.html(), values, { html: true });
}

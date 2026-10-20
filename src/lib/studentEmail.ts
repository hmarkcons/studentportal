// The house style of every email a registered student receives — the welcome,
// their logins, invoices and receipts, reminders, alerts, invitations — so
// each reads as one HMARK, not as whichever part of the portal sent it.
//
// The frame: the HMARK logo; a banner illustrating what the email is about
// (scripts/email-art.mjs draws them); an eyebrow, a headline and a few lines;
// the email's own content; a sign-off; and the office's details from Setup ›
// Invoice settings at the foot. Built for email clients rather than browsers:
// tables for layout, every style inline, images hosted with the portal and
// described in their alt text, so a client that blocks images still reads in
// full.
//
// Staff and partner emails keep their own plainer look; this is the
// student's.
//
// Pure, so the unit tests import it directly (scripts/student-email-test.mjs).
import { WHATSAPP_DISPLAY, WHATSAPP_LINK } from "./constants.ts";

export type OfficeDetails = {
  name: string;
  address: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  email: string | null;
  /** HMARK's WhatsApp line, as wa.me reads it. */
  whatsappLink: string | null;
  whatsappDisplay: string | null;
};

/** What the office is called and where it is, when nothing more recent has been read (0286's defaults). */
export const DEFAULT_OFFICE: OfficeDetails = {
  name: "HMARK Consultants",
  address: "Suite 101, Dashityar Chambers, University Road, Gulshan-e-Iqbal, Block 13-C\nKarachi, Sindh\nPakistan",
  phone: "+92 213 4999777",
  mobile: "+92 334 3297870",
  website: "www.hmarkconsultants.com",
  email: null,
  whatsappLink: WHATSAPP_LINK,
  whatsappDisplay: WHATSAPP_DISPLAY,
};

export type BannerKind = "hero" | "invoice" | "overdue" | "receipt" | "reminder" | "documents" | "message" | "application" | "interview" | "logins" | "update";

/** What each banner shows, for a client that does not load it. */
const BANNER_ALT: Record<BannerKind, string> = {
  hero: "A plane taking off from Pakistan — K2, Badshahi Mosque, Minar-e-Pakistan, Faisal Mosque and Mazar-e-Quaid — and flying out across the globe",
  invoice: "An invoice and a stack of coins, under a plane crossing the sky",
  overdue: "A calendar and an alarm clock",
  receipt: "A receipt with a green tick",
  reminder: "A calendar and a clock",
  documents: "A folder of documents with an upload arrow",
  message: "Two message bubbles",
  application: "A university building and a graduation cap",
  interview: "A video call on a laptop",
  logins: "A padlock and a key",
  update: "A bell",
};

// ------------------------------------------------------------------ colours

export const INK = "#14151a";
export const BODY = "#4b4d55";
export const FAINT = "#8b8d95";
export const HAIR = "#e3e7e4";
export const PAGE = "#eef3f0";
export const DEEP = "#0a5a42";
export const GREEN = "#157a5b";
export const BRAND = "#14946d";
export const MINT = "#eaf7f0";
export const MINT_EDGE = "#cfe8dc";
export const AMBER = "#a05a20";
export const AMBER_BG = "#fff8e6";
export const AMBER_EDGE = "#f3dfa6";
export const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";
/** Tabular figures, so a column of amounts lines up without a monospace face. */
export const NUM = `${FONT};font-variant-numeric:tabular-nums;font-feature-settings:'tnum'`;

// ------------------------------------------------------------------ words

export function esc(s: string | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A name as a person writes it: "AYESHA KHAN" → "Ayesha Khan"; one already mixed is left alone. */
export function displayName(name: string | null | undefined): string {
  const n = (name ?? "").trim().replace(/\s+/g, " ");
  if (!n) return "";
  if (n !== n.toUpperCase() && n !== n.toLowerCase()) return n;
  return n.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function firstName(name: string | null | undefined): string {
  return displayName(name).split(" ")[0] || "there";
}

// ------------------------------------------------------------------ pieces

export type Images = Partial<Record<BannerKind | "logo" | "qr", string>>;

const site = (siteUrl: string) => siteUrl.replace(/\/+$/, "");

/** Where an image is: hosted with the portal, unless a preview hands its own. */
export function assetUrl(siteUrl: string, key: BannerKind | "logo" | "qr", images?: Images): string {
  if (images?.[key]) return images[key]!;
  const file = key === "hero" ? "welcome-hero.jpg" : key === "logo" ? "hmark-logo.png" : key === "qr" ? "portal-qr.png" : `banner-${key}.jpg`;
  return `${site(siteUrl)}/email/${file}`;
}

/** A small capital label: "PASSENGER", "AMOUNT DUE". */
export const label = (text: string, color = FAINT) =>
  `<div style="font-family:${FONT};font-size:10px;line-height:14px;letter-spacing:1.6px;text-transform:uppercase;color:${color};font-weight:700">${esc(text)}</div>`;

/** A section's heading inside the card. */
export const heading = (text: string, top = 30) =>
  `<div style="font-family:${FONT};font-size:18px;line-height:24px;font-weight:800;color:${INK};margin:${top}px 0 12px">${esc(text)}</div>`;

export const paragraph = (html: string, color = BODY) => `<p style="margin:0 0 12px;font-family:${FONT};font-size:15px;line-height:24px;color:${color}">${html}</p>`;

/** The one thing to press. `label` is HTML (it may carry an arrow). */
export function button(href: string, labelHtml: string, tone: "green" | "amber" = "green") {
  const [from, to] = tone === "amber" ? ["#7a3a0a", "#c4661a"] : [DEEP, BRAND];
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0">
  <tr><td bgcolor="${to}" style="border-radius:10px;background:${to};background-image:linear-gradient(90deg,${from},${to})">
    <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px">${labelHtml}</a>
  </td></tr>
</table>`;
}

/** A tinted note: a word of warning, a reassurance. `html` is already escaped. */
export function callout(html: string, { tone = "amber", icon = "&#128274;" }: { tone?: "amber" | "green"; icon?: string } = {}) {
  const [bg, edge, ink] = tone === "green" ? [MINT, MINT_EDGE, DEEP] : [AMBER_BG, AMBER_EDGE, "#6b5414"];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin-top:20px;background:${bg};border:1px solid ${edge};border-radius:12px"><tr>
  <td width="40" style="vertical-align:top;padding:14px 0 14px 14px;font-size:18px;line-height:20px">${icon}</td>
  <td style="vertical-align:top;padding:14px 16px 14px 8px;font-family:${FONT};font-size:13px;line-height:20px;color:${ink}">${html}</td>
</tr></table>`;
}

/** A white card with a hairline edge, for a block of its own. */
export const card = (inner: string, { tint = false } = {}) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${tint ? MINT : "#ffffff"};border:1px solid ${tint ? MINT_EDGE : HAIR};border-radius:14px"><tr><td style="padding:16px 18px">${inner}</td></tr></table>`;

/**
 * Label and value down a list: "Interview · Thu 23 Oct, 10:00 AM". Values are
 * HTML (they may hold a link); labels are text.
 */
export function rows(pairs: readonly (readonly [string, string])[]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${pairs
    .map(
      ([name, value]) => `<tr>
  <td style="padding:6px 12px 6px 0;vertical-align:top;width:120px;font-family:${FONT};font-size:13px;line-height:20px;color:${FAINT}">${esc(name)}</td>
  <td style="padding:6px 0;vertical-align:top;font-family:${FONT};font-size:14px;line-height:20px;color:${INK};font-weight:600">${value}</td>
</tr>`
    )
    .join("")}</table>`;
}

function footer(office: OfficeDetails, reason: string) {
  const o = office;
  const website = o.website?.trim();
  const webHref = website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null;
  const contacts = [
    o.phone ? `Phone <a href="tel:${esc(o.phone.replace(/[^\d+]/g, ""))}" style="color:${GREEN};text-decoration:none">${esc(o.phone)}</a>` : "",
    o.whatsappLink
      ? `WhatsApp <a href="${esc(o.whatsappLink)}" target="_blank" style="color:${GREEN};text-decoration:none">${esc(o.whatsappDisplay || o.mobile || "Message us")}</a>`
      : "",
    o.email ? `<a href="mailto:${esc(o.email)}" style="color:${GREEN};text-decoration:none">${esc(o.email)}</a>` : "",
    webHref ? `<a href="${esc(webHref)}" target="_blank" style="color:${GREEN};text-decoration:none">${esc(website!.replace(/^https?:\/\//i, ""))}</a>` : "",
  ].filter(Boolean);
  return `<tr><td align="center" class="px" style="padding:26px 28px 8px;font-family:${FONT};font-size:12px;line-height:19px;color:${FAINT}">
  <div style="font-weight:700;color:${BODY};font-size:13px">${esc(o.name)}</div>
  ${o.address ? `<div>${esc(o.address).replace(/\r?\n/g, "<br>")}</div>` : ""}
  ${contacts.length ? `<div style="margin-top:6px">${contacts.join("&nbsp;&nbsp;&middot;&nbsp;&nbsp;")}</div>` : ""}
  <div style="margin-top:14px;color:#a7a9b0">${esc(reason)}</div>
</td></tr>`;
}

/** The office's details as a few plain lines, for the text twin. */
export function footerText(office: OfficeDetails): string[] {
  const o = office;
  const lines = ["—", o.name];
  if (o.address) lines.push(...o.address.split(/\r?\n/));
  const contact = [o.phone && `Phone ${o.phone}`, o.whatsappDisplay && `WhatsApp ${o.whatsappDisplay}`, o.email, o.website].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  return lines;
}

export type FrameInput = {
  subject: string;
  /** What the inbox shows beside the subject. */
  preheader: string;
  banner: BannerKind;
  eyebrow: string;
  /** The eyebrow's colour: green, or amber for what is overdue. */
  eyebrowTone?: "green" | "amber";
  title: string;
  /** Opening lines, already escaped HTML. */
  intro: string[];
  /** The email's own content, as HTML. */
  content: string;
  /** The closing line above the team's name; null for none. */
  signoff?: string | null;
  office: OfficeDetails;
  siteUrl: string;
  /** Why they are getting it, at the foot. */
  reason?: string;
  images?: Images;
};

export function emailFrame(f: FrameInput): string {
  const hero = f.banner === "hero";
  const bannerImg = `<img src="${esc(assetUrl(f.siteUrl, f.banner, f.images))}" width="600" alt="${esc(BANNER_ALT[f.banner])}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:18px 18px 0 0;background:${f.eyebrowTone === "amber" ? "#c4661a" : BRAND}">`;
  const eyebrowColor = f.eyebrowTone === "amber" ? AMBER : BRAND;
  const signoff = f.signoff === undefined ? "Warm regards," : f.signoff;
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(f.subject)}</title>
<style>
  @media (max-width: 620px) {
    .stack { display: block !important; width: 100% !important; padding-left: 0 !important; padding-right: 0 !important; }
    .px { padding-left: 22px !important; padding-right: 22px !important; }
    .px-pass { padding-left: 16px !important; padding-right: 16px !important; }
    .h1 { font-size: 26px !important; line-height: 32px !important; }
    .code { font-size: 34px !important; line-height: 38px !important; }
    .big { font-size: 30px !important; line-height: 36px !important; }
    .hide-sm { display: none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${esc(f.preheader)}${"&#8199;&#65279;&#847;".repeat(24)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE}">
<tr><td align="center" style="padding:24px 10px 30px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
    <tr><td style="padding:0 6px 14px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle"><img src="${esc(assetUrl(f.siteUrl, "logo", f.images))}" width="148" height="55" alt="HMARK Consultants" style="display:block;width:148px;height:auto;border:0"></td>
        <td align="right" style="vertical-align:middle;font-family:${FONT};font-size:12px;line-height:16px;color:${FAINT};font-weight:600;letter-spacing:.5px">Student Portal</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${HAIR};border-radius:18px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="padding:0;line-height:0;font-size:0">${bannerImg}</td></tr>
        <tr><td class="px" style="padding:${hero ? 30 : 26}px 34px 34px">
          <div style="font-family:${FONT};font-size:11px;line-height:16px;letter-spacing:2px;text-transform:uppercase;font-weight:800;color:${eyebrowColor}">${esc(f.eyebrow)}</div>
          <h1 class="h1" style="margin:6px 0 12px;font-family:${FONT};font-size:${hero ? 30 : 26}px;line-height:${hero ? 36 : 32}px;font-weight:800;color:${INK};letter-spacing:-.3px">${esc(f.title)}</h1>
          ${f.intro.map((l) => paragraph(l)).join("")}
          ${f.content}
          ${signoff ? `<p style="margin:24px 0 0;font-family:${FONT};font-size:15px;line-height:24px;color:${BODY}">${signoff}<br><span style="font-weight:700;color:${INK}">The HMARK Consultants team</span></p>` : ""}
        </td></tr>
      </table>
    </td></tr>
    ${footer(f.office, f.reason ?? `You are receiving this because you registered with ${f.office.name}.`)}
  </table>
</td></tr>
</table>
</body>
</html>`;
}

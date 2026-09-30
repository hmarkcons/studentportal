// What the login screen says, where its links go and its colours — the
// defaults are the reference design (reference/Login Page/Split Login.png),
// and a Super Admin changes any of it on Setup → Login screen (0292).
//
// The stored content holds only what differs from these defaults, so an empty
// object is the reference design and a text added to the page later needs no
// migration. A value that fails its rule on the way out is dropped in favour
// of the default: the login page is the one page that must always render.
//
// Pure, so it is unit-tested (scripts/login-screen-test.mjs).

import { WHATSAPP_NUMBER } from "./constants.ts";

/** A WhatsApp link to the office with the message already typed. */
export function whatsappWith(text: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export type LoginScreenContent = {
  eyebrow: string;
  headline: string;
  subheadline: string;
  ctaLabel: string;
  ctaUrl: string;
  portalLabel: string;
  portalTagline: string;
  welcomeTitle: string;
  welcomeText: string;
  forgotUrl: string;
  signupPrompt: string;
  signupLabel: string;
  signupUrl: string;
  footerText: string;
  imageAlt: string;
  accentColor: string;
  headingColor: string;
};

export type LoginScreenKey = keyof LoginScreenContent;

export const LOGIN_SCREEN_DEFAULTS: LoginScreenContent = {
  eyebrow: "Your future, our mission",
  headline: "Your Future Goes Beyond Borders",
  subheadline: "Your journey to a world-class education starts with HMARK Consultants.",
  ctaLabel: "Explore Your Journey",
  ctaUrl: "https://hmarkconsultants.com",
  portalLabel: "Student Portal",
  portalTagline: "Track · Manage · Achieve",
  welcomeTitle: "Welcome back",
  welcomeText: "Sign in to track your applications, documents and visa file.",
  forgotUrl: whatsappWith("Hi HMARK, I have forgotten my portal password. Could you reset it for me?"),
  signupPrompt: "New to HMARK?",
  signupLabel: "Book a free counselling session",
  signupUrl: whatsappWith("Hi HMARK, I would like to book a free counselling session."),
  footerText: "HMARK Consultants · Suite 101, Dashtiyar Chambers, University Road, Karachi",
  imageAlt: "A student with a backpack looking out at Big Ben, the Eiffel Tower, the CN Tower and the Sydney Opera House",
  accentColor: "#0b7a52",
  headingColor: "#0b1733",
};

export type LoginScreenField = {
  key: LoginScreenKey;
  label: string;
  kind: "text" | "textarea" | "url" | "color";
  max: number;
  hint?: string;
};

/** The Setup form's fields, grouped as the page reads: the story, the sign-in, the links, the colours. */
export const LOGIN_SCREEN_GROUPS: { title: string; fields: LoginScreenField[] }[] = [
  {
    title: "The story (left)",
    fields: [
      { key: "eyebrow", label: "Line above the headline", kind: "text", max: 60, hint: "Shown in capitals." },
      { key: "headline", label: "Headline", kind: "text", max: 80 },
      { key: "subheadline", label: "Line under the headline", kind: "textarea", max: 200 },
      { key: "ctaLabel", label: "Button", kind: "text", max: 40 },
      { key: "imageAlt", label: "What the picture shows", kind: "text", max: 160, hint: "Read aloud to anyone who cannot see it." },
    ],
  },
  {
    title: "Signing in (right)",
    fields: [
      { key: "portalLabel", label: "Portal name, top right", kind: "text", max: 30 },
      { key: "portalTagline", label: "Beside it", kind: "text", max: 60 },
      { key: "welcomeTitle", label: "Greeting", kind: "text", max: 40 },
      { key: "welcomeText", label: "Line under the greeting", kind: "textarea", max: 160 },
      { key: "signupPrompt", label: "Under the form", kind: "text", max: 60 },
      { key: "signupLabel", label: "…and its link", kind: "text", max: 60 },
      { key: "footerText", label: "Footer", kind: "text", max: 200, hint: "© and the year are added in front." },
    ],
  },
  {
    title: "Where the links go",
    fields: [
      { key: "ctaUrl", label: "The button", kind: "url", max: 500 },
      { key: "signupUrl", label: "The link under the form", kind: "url", max: 500 },
      { key: "forgotUrl", label: "Forgot password?", kind: "url", max: 500, hint: "HMARK's WhatsApp, with the message typed, until you change it." },
    ],
  },
  {
    title: "Colours",
    fields: [
      { key: "accentColor", label: "Buttons, links and the line above the headline", kind: "color", max: 7 },
      { key: "headingColor", label: "Headline and greeting", kind: "color", max: 7 },
    ],
  },
];

export const LOGIN_SCREEN_FIELDS: LoginScreenField[] = LOGIN_SCREEN_GROUPS.flatMap((g) => g.fields);

/**
 * A link the page may point at: a web address, an email or phone link, or a
 * path on this site. Never a javascript: or data: URL, which would run in the
 * page of everyone who clicked it.
 */
export function isSafeLink(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith("/")) return !v.startsWith("//") && !v.startsWith("/\\");
  if (/^(mailto|tel):[^\s]+$/i.test(v)) return true;
  try {
    const url = new URL(v);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast between two #rrggbb colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Why a value cannot be saved for this field, or null when it can. */
export function fieldProblem(field: LoginScreenField, value: string): string | null {
  const v = value.trim();
  if (v.length > field.max) return `${field.label}: keep it to ${field.max} characters.`;
  if (field.kind === "url" && !isSafeLink(v)) {
    return `${field.label}: give a full web address (https://…), a mailto: or tel: link, or a path on this site such as /register/partner.`;
  }
  if (field.kind === "color") {
    if (!isHexColor(v)) return `${field.label}: pick a colour, written like #0b7a52.`;
    // The Sign in button's text is white on the accent; the headline is the
    // accent's opposite, dark on white. Either too pale cannot be read.
    if (field.key === "accentColor" && contrastRatio(v, "#ffffff") < 3) {
      return `${field.label}: that colour is too light for white text on the Sign in button — choose a darker one.`;
    }
    if (field.key === "headingColor" && contrastRatio(v, "#ffffff") < 4.5) {
      return `${field.label}: that colour is too light to read on the white page — choose a darker one.`;
    }
  }
  return null;
}

/**
 * The stored content laid over the defaults. A value that is missing, blank
 * or fails its rule falls back to the default, so a bad row can never blank
 * the login page or put an unsafe link on it.
 */
export function readLoginScreen(stored: unknown): LoginScreenContent {
  const raw = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const out = { ...LOGIN_SCREEN_DEFAULTS };
  for (const field of LOGIN_SCREEN_FIELDS) {
    const value = raw[field.key];
    if (typeof value !== "string" || !value.trim()) continue;
    if (fieldProblem(field, value) === null) out[field.key] = value.trim();
  }
  return out;
}

/**
 * What the Setup form posted, as the content to store — only the values that
 * differ from the defaults — or the first thing wrong with it. A box left
 * empty means the original wording.
 */
export function parseLoginScreenForm(get: (name: string) => unknown): { content: Partial<LoginScreenContent> } | { error: string } {
  const content: Partial<LoginScreenContent> = {};
  for (const field of LOGIN_SCREEN_FIELDS) {
    const value = String(get(field.key) ?? "").trim();
    if (!value) continue;
    const problem = fieldProblem(field, value);
    if (problem) return { error: problem };
    const normalised = field.kind === "color" ? value.toLowerCase() : value;
    if (normalised !== LOGIN_SCREEN_DEFAULTS[field.key]) content[field.key] = normalised;
  }
  return { content };
}

/** The picture that ships with the app, cut from the reference design. */
export const DEFAULT_LOGIN_PICTURE = "/login/beyond-borders.webp";

/**
 * Where the login picture is served from: an uploaded one from the public
 * site-assets bucket (0292), or the one that ships with the app.
 */
export function loginPictureUrl(imagePath: string | null | undefined, supabaseUrl: string): string {
  if (!imagePath) return DEFAULT_LOGIN_PICTURE;
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/site-assets/${imagePath.split("/").map(encodeURIComponent).join("/")}`;
}

/** The footer as printed: the copyright and the year, then the office's line. */
export function footerLine(content: Pick<LoginScreenContent, "footerText">, year: number): string {
  return `© ${year} ${content.footerText}`;
}

/** An identifier with no @ is a Student ID; one with an @ is an email. */
export function isStudentIdentifier(identifier: string): boolean {
  return !identifier.includes("@");
}

/** A Student ID as the database holds it — HMC-FALL26-IT-0012 — whatever case or spacing it was typed in. */
export function normaliseStudentId(identifier: string): string {
  return identifier.trim().toUpperCase().replace(/\s+/g, "");
}

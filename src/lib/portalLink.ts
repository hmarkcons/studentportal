// The login page beside each saved login — the university portal, the visa
// appointment portal, a scholarship agency's site — so whoever has the login
// is taken straight to the page it opens.
//
// A login is stored encrypted as JSON (encrypted_credentials): the username,
// the password and now the link, kept together so whoever may read one may
// read the others, and nobody else.
//
// Pure, so the unit tests import it directly (scripts/portal-link-test.mjs).

import { linkHref } from "./catalogueText.ts";

export type StoredLogin = { username: string; password: string; link: string | null };

/** The longest link kept: a login page's address, with room for a long query. */
export const PORTAL_LINK_MAX = 2000;

/**
 * A typed link as it is kept: "portal.unipi.it" gets https:// in front; an
 * empty field is no link; anything that is not a web address — words, a
 * "javascript:" link — is refused rather than stored, so a link here can
 * always be opened.
 */
export function parsePortalLink(raw: string | null | undefined): { link: string | null } | { error: string } {
  const text = (raw ?? "").trim();
  if (!text) return { link: null };
  if (text.length > PORTAL_LINK_MAX) return { error: "That login page link is too long." };
  const href = linkHref(text);
  if (!href || /\s/.test(text)) return { error: "The login page link has to be a web address, like https://portal.university.it/login." };
  return { link: href };
}

/** What is stored, read back — including logins saved before they were JSON, or before they had a link. */
export function parseStoredLogin(text: string | null | undefined): StoredLogin {
  if (!text) return { username: "", password: "", link: null };
  try {
    const parsed = JSON.parse(text) as Partial<Record<keyof StoredLogin, unknown>>;
    if (parsed && typeof parsed === "object") {
      const link = typeof parsed.link === "string" ? linkHref(parsed.link) : null;
      return {
        username: typeof parsed.username === "string" ? parsed.username : "",
        password: typeof parsed.password === "string" ? parsed.password : "",
        link,
      };
    }
  } catch {
    // A login saved as plain text, before logins were JSON.
  }
  return { username: String(text), password: "", link: null };
}

/**
 * A save, laid over what is stored. A username or password left blank keeps
 * the one on file — the form starts empty, so a blank means "not changing
 * it", and adding a link must not wipe the password. The link field is shown
 * filled in, so what it holds is what is wanted: emptied, the link goes.
 */
export function mergeLogin(stored: StoredLogin, typed: { username: string; password: string; link?: string | null }): StoredLogin {
  return {
    username: typed.username.trim() || stored.username,
    password: typed.password || stored.password,
    link: typed.link === undefined ? stored.link : typed.link,
  };
}

/** Logins whose page is the same for everyone. */
const KNOWN: Record<string, string> = {
  gmail: "https://mail.google.com/",
};

/** The link offered for a login before one is saved: its known page, or what is on file elsewhere. */
export function suggestedPortalLink(credentialType: string, onFile?: string | null): string | null {
  return linkHref(onFile ?? null) ?? KNOWN[credentialType] ?? null;
}

/** HMARK's own sign-in page — the same for students, staff and universities, and never typed. */
export function hmarkSignInLink(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/login`;
}

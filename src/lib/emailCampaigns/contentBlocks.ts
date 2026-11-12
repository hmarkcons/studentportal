// Content blocks (0361): a header, footer, signature or row of social icons
// kept once and put into any template with {{block:key}}. Expanded when an
// email is previewed, tested or sent — so changing the block changes every
// email that uses it from then on (an email already sent keeps what it had).
//
// No portal imports, so the unit tests load it under plain Node.

import * as cheerio from "cheerio";

const BLOCK_TAG = /\{\{\s*block:([a-z0-9_]{1,40})\s*\}\}/gi;

/** The block keys a template uses, each once, in order of first use. */
export function blocksIn(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(BLOCK_TAG)) {
    const k = m[1].toLowerCase();
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/** Puts each block in; a key with no block is left as it is and listed. One level: a block holds no blocks. */
export function expandBlocks(html: string, blocks: Record<string, string>): { html: string; missing: string[] } {
  const missing: string[] = [];
  const out = html.replace(BLOCK_TAG, (whole, key: string) => {
    const k = key.toLowerCase();
    if (k in blocks) return blocks[k];
    if (!missing.includes(k)) missing.push(k);
    return whole;
  });
  return { html: out, missing };
}

/** "Social icons — Nov" → "social_icons_nov". */
export function blockKeyOf(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * A block's HTML made safe to put into an email: no scripts, frames, forms or
 * event handlers, no javascript: links — what the template processing takes
 * out of a whole email, taken out of a piece of one. Block tags inside a block
 * are dropped, so nothing expands twice.
 */
export function cleanBlockHtml(html: string): { html: string; removed: string[] } {
  const $ = cheerio.load(html, null, false);
  const removed = new Set<string>();
  const drop = (selector: string, what: string) => {
    const found = $(selector);
    if (found.length) {
      removed.add(what);
      found.remove();
    }
  };
  drop("script", "scripts");
  drop("iframe, frame, frameset, object, embed, applet", "embedded frames");
  drop("form, input, select, textarea, button", "forms");
  drop("video, audio", "video and audio");
  $("*").each((_, el) => {
    const attribs = (el as { attribs?: Record<string, string> }).attribs ?? {};
    for (const name of Object.keys(attribs)) {
      if (/^on/i.test(name)) {
        $(el).removeAttr(name);
        removed.add("click and other event handlers");
      } else if (["href", "src", "action"].includes(name.toLowerCase()) && /^\s*javascript:/i.test(attribs[name])) {
        $(el).removeAttr(name);
        removed.add("javascript: links");
      }
    }
  });
  let out = $.html();
  if (blocksIn(out).length) {
    removed.add("a block inside the block");
    out = out.replace(BLOCK_TAG, "");
  }
  return { html: out.trim(), removed: [...removed] };
}

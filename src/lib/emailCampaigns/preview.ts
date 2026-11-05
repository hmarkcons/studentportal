// An email made safe to show inside the portal.
//
// The preview is served with a sandbox policy, so nothing in it could run or
// reach the portal anyway; cleaning it as well means a template that slipped
// past the upload pipeline still shows as harmless markup. Links open in a new
// tab. A dark-mode preview imitates what Gmail and Outlook's apps do to an
// email in dark mode — colours turned round, pictures left alone — which is an
// approximation, said so on the page.
//
// No portal imports, so the unit tests load it under plain Node.

import sanitizeHtml from "sanitize-html";

const TAGS = [
  "html", "head", "body", "title", "meta", "style",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "div", "span", "p", "a", "img", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "b", "strong", "i", "em", "u", "s", "strike", "small", "sup", "sub", "big",
  "center", "font", "blockquote", "pre", "code", "section", "header", "footer", "article", "main", "nav",
  "picture", "source", "figure", "figcaption", "address", "label", "mark", "abbr",
];

const COMMON = [
  "style", "class", "id", "align", "valign", "width", "height", "bgcolor", "background", "border", "cellpadding",
  "cellspacing", "role", "dir", "lang", "title", "color", "face", "size", "colspan", "rowspan", "bordercolor",
  "nowrap", "aria-*", "data-*",
];

/** The email's HTML with anything that could run taken out. */
export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: TAGS,
    allowedAttributes: {
      "*": COMMON,
      a: [...COMMON, "href", "name", "target", "rel"],
      img: [...COMMON, "src", "alt", "srcset", "sizes"],
      source: ["srcset", "media", "type", "sizes"],
      meta: ["charset", "name", "content"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: true,
    // <style> holds the email's media queries; the sandbox keeps it from doing harm.
    allowVulnerableTags: true,
    parseStyleAttributes: false,
  });
}

const DARK_CSS =
  "html{background:#121212 !important;filter:invert(1) hue-rotate(180deg);}" +
  "img,picture,video,[style*='background-image'],[background]{filter:invert(1) hue-rotate(180deg);}";

/**
 * The sanitized email as a page for the preview frame: links open in a new
 * tab, and in dark mode the imitation above is applied.
 */
export function previewDocument(html: string, { dark = false }: { dark?: boolean } = {}): string {
  const clean = sanitizeEmailHtml(html);
  const extra = `<base target="_blank">${dark ? `<style data-preview-dark>${DARK_CSS}</style>` : ""}`;
  if (/<head[^>]*>/i.test(clean)) return clean.replace(/<head([^>]*)>/i, `<head$1>${extra}`);
  if (/<html[^>]*>/i.test(clean)) return clean.replace(/<html([^>]*)>/i, `<html$1><head>${extra}</head>`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${extra}</head><body>${clean}</body></html>`;
}

// Turning an uploaded email into one that can be sent.
//
// An email client is not a browser: it runs no script, loads no relative
// path, drops a <style> block more often than not, and shows no form, frame or
// video. So the upload is made into what a client can show:
//
//   1. Anything a client would block is taken out — scripts, onclick-style
//      handlers, iframes and embeds, forms and their fields, video and audio,
//      javascript: links — and each kind is counted, to be said to the user.
//   2. Every image, background and font the upload carries is pointed at its
//      public address; a local file the upload does not have is listed.
//   3. The CSS is written onto the elements (juice), the zip's own stylesheets
//      included. Media queries stay in a <style> block for the clients that
//      read one.
//   4. If the email has no {{unsubscribe_url}}, a footer is added with the
//      unsubscribe and preferences links and HMARK's address — every campaign
//      email must carry them.
//   5. A plain-text version is made from it, and the links and images are
//      listed for the pre-flight checks.
//
// Merge tags pass through untouched; they are filled per recipient when sent.
// No portal imports, so the unit tests load it under plain Node.

import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import juice from "juice";
import { mergeTagsIn, unknownMergeTags } from "./mergeTags.ts";
import { resolveAssetPath, type TemplateFile } from "./templateFiles.ts";

export type RemovedItem = { what: string; count: number; why: string };

export type ProcessedTemplate = {
  /** Ready to send, merge tags intact. */
  html: string;
  /** The plain-text version, merge tags intact. */
  text: string;
  removed: RemovedItem[];
  /** Web links in the email ("http(s)://…"), each once. */
  links: { url: string; text: string }[];
  /** Images, with their alt text (null when there is none). */
  images: { src: string; alt: string | null }[];
  /** Local files the email points at that the upload does not have. */
  missingAssets: string[];
  /** Images loaded over plain http, which many clients block. */
  insecureImages: string[];
  /** Upload paths of the files the email uses, which are the ones to upload. */
  usedAssets: string[];
  footerAdded: boolean;
  sizeBytes: number;
  mergeTags: string[];
  unknownTags: string[];
  /** How much readable text the email has, for the image-to-text check. */
  textLength: number;
  /** A sentence when the CSS could not be inlined, which leaves it as uploaded. */
  inlineError: string | null;
};

const REMOVALS: { selector: string; what: string; why: string }[] = [
  { selector: "script", what: "Scripts", why: "No email client runs JavaScript; they are removed rather than sent." },
  { selector: "iframe, frame, frameset, object, embed, applet", what: "Frames and embedded content", why: "Email clients do not show frames or embedded content." },
  { selector: "video, audio", what: "Video and audio", why: "Email clients do not play media. Link to the video instead, with a picture of it." },
  { selector: "form, input, select, textarea, button", what: "Forms and form fields", why: "Forms do not work in email. Link to a form on the website instead." },
  { selector: "base, meta[http-equiv='refresh' i]", what: "Page redirects and base links", why: "They would break the email's links." },
];

const URL_ATTRS = ["href", "src", "background", "poster", "action", "formaction", "xlink:href"];

const isWebUrl = (u: string) => /^https?:\/\//i.test(u);
const hasTag = (u: string) => u.includes("{{");

/** The footer added to an email that has no unsubscribe link of its own. */
export function unsubscribeFooter(address: string): string {
  const esc = address.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" data-hmark-footer style="width:100%;">` +
    `<tr><td align="center" style="padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#6b7280;">` +
    `You are receiving this email because you enquired with HMARK Consultants.<br>` +
    `<a href="{{unsubscribe_url}}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> &middot; ` +
    `<a href="{{preferences_url}}" style="color:#6b7280;text-decoration:underline;">Email preferences</a> &middot; ` +
    `<a href="{{web_version_url}}" style="color:#6b7280;text-decoration:underline;">View in browser</a><br>` +
    `HMARK Consultants, ${esc}` +
    `</td></tr></table>`
  );
}

/** Rewrites every url(...) in a piece of CSS through `rewrite`, which returns null to leave one as it is. */
function rewriteCssUrls(css: string, rewrite: (ref: string) => string | null): string {
  return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (whole, quote: string, ref: string) => {
    const next = rewrite(ref.trim());
    return next ? `url(${quote}${next}${quote})` : whole;
  });
}

function isHidden(el: Element): boolean {
  const style = (el.attribs?.style ?? "").replace(/\s+/g, "").toLowerCase();
  return style.includes("display:none") || style.includes("visibility:hidden") || el.attribs?.hidden !== undefined;
}

const BLOCK = new Set([
  "p", "div", "section", "article", "header", "footer", "table", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
  "blockquote", "center", "hr", "main", "aside", "nav", "address", "pre",
]);

/** The plain-text version of an email's HTML: its words in order, links written out. */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("head, style, title, script").remove();
  const out: string[] = [];
  const walk = (node: AnyNode) => {
    if (node.type === "text") {
      out.push((node as unknown as { data: string }).data.replace(/\s+/g, " "));
      return;
    }
    if (node.type !== "tag") return;
    const el = node as Element;
    if (isHidden(el)) return;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      out.push("\n");
      return;
    }
    if (tag === "img") return;
    const block = BLOCK.has(tag);
    if (block) out.push("\n");
    if (/^h[1-3]$/.test(tag)) out.push("\n");
    if (tag === "li") out.push("- ");
    if (tag === "td" || tag === "th") out.push(" ");
    if (tag === "a") {
      const href = (el.attribs.href ?? "").trim();
      const words = $(el).text().replace(/\s+/g, " ").trim();
      if (!href || href.startsWith("#") || /^(mailto|tel):/i.test(href)) {
        out.push(words);
      } else if (!words || words === href) {
        out.push(href);
      } else {
        out.push(`${words} (${href})`);
      }
      return;
    }
    for (const child of el.children) walk(child);
    if (block) out.push("\n");
    if (/^h[1-3]$/.test(tag)) out.push("\n");
  };
  for (const child of $("body").length ? $("body")[0].children : $.root()[0].children) walk(child);
  return out
    .join("")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The web links (each once) and the images in an email, for the checks. */
export function linksAndImages(html: string): Pick<ProcessedTemplate, "links" | "images"> {
  const $ = cheerio.load(html);
  const links: ProcessedTemplate["links"] = [];
  $("a[href]").each((_, node) => {
    const el = node as Element;
    const url = el.attribs.href.trim();
    if (!isWebUrl(url) || hasTag(url) || links.some((l) => l.url === url)) return;
    links.push({ url, text: $(el).text().replace(/\s+/g, " ").trim() });
  });
  const images: ProcessedTemplate["images"] = [];
  $("img").each((_, node) => {
    const el = node as Element;
    images.push({ src: (el.attribs.src ?? "").trim(), alt: el.attribs.alt === undefined ? null : el.attribs.alt.trim() });
  });
  return { links, images };
}

export function processTemplateHtml(input: {
  html: string;
  htmlPath: string;
  files: Map<string, TemplateFile>;
  /** The public address an upload path will have once uploaded. */
  assetUrl: (path: string) => string;
  /** HMARK's address, for the footer added to an email without one. */
  footerAddress: string;
}): ProcessedTemplate {
  const $ = cheerio.load(input.html);
  const removed: RemovedItem[] = [];
  const missing = new Set<string>();
  const used = new Set<string>();

  // 1. What a client would block.
  for (const r of REMOVALS) {
    const found = $(r.selector);
    if (found.length) {
      removed.push({ what: r.what, count: found.length, why: r.why });
      found.remove();
    }
  }
  let handlers = 0;
  let jsLinks = 0;
  $("*").each((_, node) => {
    const el = node as Element;
    for (const name of Object.keys(el.attribs ?? {})) {
      if (/^on/i.test(name)) {
        $(el).removeAttr(name);
        handlers += 1;
      } else if (URL_ATTRS.includes(name.toLowerCase()) && /^\s*(javascript|vbscript):/i.test(el.attribs[name])) {
        $(el).removeAttr(name);
        jsLinks += 1;
      }
    }
  });
  if (handlers) removed.push({ what: "Click and other event handlers", count: handlers, why: "They are JavaScript, which no email client runs." });
  if (jsLinks) removed.push({ what: "javascript: links", count: jsLinks, why: "They are JavaScript, which no email client runs." });

  // 2. Point every local file at its public address.
  const fromPath = (base: string) => (ref: string): string | null => {
    if (!ref || hasTag(ref) || ref.startsWith("#") || /^(data|cid|mailto|tel):/i.test(ref)) return null;
    if (isWebUrl(ref) || ref.startsWith("//")) return null;
    const path = resolveAssetPath(base, ref);
    if (path && input.files.has(path)) {
      used.add(path);
      return input.assetUrl(path);
    }
    missing.add(ref);
    return null;
  };
  const fromHtml = fromPath(input.htmlPath);
  $("img[src], [background], video[poster]").each((_, node) => {
    const el = node as Element;
    for (const attr of ["src", "background"]) {
      const v = el.attribs[attr];
      if (v) {
        const next = fromHtml(v.trim());
        if (next) $(el).attr(attr, next);
      }
    }
  });
  $("img[srcset], source[srcset]").each((_, node) => {
    const el = node as Element;
    const next = el.attribs.srcset
      .split(",")
      .map((part) => {
        const [ref, ...size] = part.trim().split(/\s+/);
        return [fromHtml(ref) ?? ref, ...size].join(" ");
      })
      .join(", ");
    $(el).attr("srcset", next);
  });
  $("[style]").each((_, node) => {
    const el = node as Element;
    $(el).attr("style", rewriteCssUrls(el.attribs.style, fromHtml));
  });
  $("style").each((_, node) => {
    const el = $(node);
    el.text(rewriteCssUrls(el.text(), fromHtml));
  });

  // 3a. The zip's own stylesheets, read in and their link tags taken out.
  let extraCss = "";
  $("link[rel='stylesheet' i][href]").each((_, node) => {
    const el = node as Element;
    const href = el.attribs.href.trim();
    if (isWebUrl(href) || href.startsWith("//")) return; // a web font or the like: left for the clients that load it
    const path = resolveAssetPath(input.htmlPath, href);
    const file = path ? input.files.get(path) : undefined;
    if (file && path) {
      extraCss += "\n" + rewriteCssUrls(new TextDecoder().decode(file.bytes), fromPath(path));
    } else {
      missing.add(href);
    }
    $(el).remove();
  });

  // 4. The unsubscribe footer, when the email has none of its own.
  const footerAdded = !mergeTagsIn(input.html).includes("unsubscribe_url");
  if (footerAdded) {
    const body = $("body");
    if (body.length) body.append(unsubscribeFooter(input.footerAddress));
    else $.root().append(unsubscribeFooter(input.footerAddress));
  }

  // 3b. The CSS onto the elements.
  let html = $.html();
  let inlineError: string | null = null;
  try {
    html = juice(html, {
      extraCss,
      preserveMediaQueries: true,
      preserveFontFaces: true,
      preserveImportant: true,
      removeStyleTags: true,
      applyStyleTags: true,
      insertPreservedExtraCss: true,
    });
  } catch (e) {
    inlineError = `The CSS could not be written onto the email (${e instanceof Error ? e.message : "unknown error"}); it is kept as uploaded.`;
  }

  // 5. What the checks need, read from the finished email.
  const { links, images } = linksAndImages(html);
  const text = htmlToText(html);
  const readable = text.replace(/\(https?:\/\/[^)]*\)/g, "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();

  return {
    html,
    text,
    removed,
    links,
    images,
    missingAssets: [...missing],
    insecureImages: images.map((i) => i.src).filter((s) => /^http:\/\//i.test(s)),
    usedAssets: [...used],
    footerAdded,
    sizeBytes: new TextEncoder().encode(html).byteLength,
    mergeTags: mergeTagsIn(html),
    unknownTags: unknownMergeTags(html),
    textLength: readable.length,
    inlineError,
  };
}

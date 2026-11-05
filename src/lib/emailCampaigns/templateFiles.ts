// Reading an uploaded email template: one .html file, or a .zip holding an
// index.html with its images, stylesheets and fonts.
//
// Everything in a zip is checked before anything is used: no path may climb
// out of the zip ("zip-slip"), nothing executable may be in it at all, the
// whole may not unpack to more than it should (a "zip bomb"), and an image
// must really be an image. Scripts are accepted and set aside — an email
// client would never run them — and said so.
//
// No portal imports, so the unit tests load it under plain Node.

import JSZip from "jszip";

export type TemplateFile = { bytes: Uint8Array; mime: string };

export type TemplateUpload = {
  html: string;
  /** Where the HTML sat in the upload ("index.html", "email/index.html", or the file's own name). */
  htmlPath: string;
  kind: "html" | "zip";
  /** Images, stylesheets and fonts, by their path in the zip ("images/logo.png"). */
  files: Map<string, TemplateFile>;
  /** What was in the zip and is not used, with why. */
  ignored: { path: string; reason: string }[];
};

export const MAX_ZIP_ENTRIES = 500;
/** Unpacked, a zip may hold at most this much — far above any real email, far below a zip bomb. */
export const MAX_UNPACKED_BYTES = 80 * 1024 * 1024;

const EXECUTABLE = new Set([
  "exe", "dll", "bat", "cmd", "com", "msi", "msp", "scr", "ps1", "psm1", "sh", "bash", "vbs", "vbe", "wsf", "wsh", "hta",
  "jar", "app", "apk", "dmg", "iso", "bin", "lnk", "reg", "cpl", "php", "phtml", "py", "pl", "rb", "cgi", "asp", "aspx", "jsp",
]);
const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
};
const FONT_MIME: Record<string, string> = { woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject" };
const JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$|desktop\.ini$)/i;

const extOf = (path: string) => (/\.([A-Za-z0-9]+)$/.exec(path)?.[1] ?? "").toLowerCase();

/** A zip entry's path made safe, or null when it climbs out or is absolute. */
export function safeZipPath(raw: string): string | null {
  const path = raw.replace(/\\/g, "/");
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return null;
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  return parts.length ? parts.join("/") : null;
}

/** What an image's first bytes say it is, or null when it is no image this knows. */
export function sniffImage(bytes: Uint8Array): string | null {
  const b = bytes;
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (starts(0x42, 0x4d)) return "image/bmp";
  if (starts(0x00, 0x00, 0x01, 0x00)) return "image/x-icon";
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

const decode = (bytes: Uint8Array) => new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");

/**
 * The template in an upload, or why it cannot be used. `name` is the file's
 * own name, which says whether it is an HTML file or a zip.
 */
export async function readTemplateUpload(
  name: string,
  bytes: Uint8Array,
  { maxBytes }: { maxBytes: number }
): Promise<TemplateUpload | { error: string }> {
  if (bytes.byteLength === 0) return { error: "That file is empty." };
  if (bytes.byteLength > maxBytes) return { error: `That file is over the ${Math.round(maxBytes / 1024 / 1024)} MB limit.` };
  const ext = extOf(name);

  if (ext === "html" || ext === "htm") {
    return { html: decode(bytes), htmlPath: name, kind: "html", files: new Map(), ignored: [] };
  }
  if (ext !== "zip") return { error: "Upload an .html file, or a .zip holding index.html with its images and stylesheets." };
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) return { error: "That file is not a zip, whatever its name says." };

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return { error: "That zip could not be opened. Zip the folder again and upload it." };
  }

  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > MAX_ZIP_ENTRIES) return { error: `That zip holds ${entries.length} files; an email template needs far fewer (at most ${MAX_ZIP_ENTRIES}).` };

  // Refuse the whole upload for an unsafe path or anything executable, before unpacking.
  // JSZip quietly strips "../" from a name as it reads one and keeps the name
  // as written in unsafeOriginalName — which is the one that says what the zip tried.
  for (const f of entries) {
    const written = (f as JSZip.JSZipObject & { unsafeOriginalName?: string }).unsafeOriginalName ?? f.name;
    if (JUNK.test(written.replace(/\\/g, "/"))) continue;
    if (!safeZipPath(written)) return { error: `The zip has a file whose path leaves the zip (${written}). It was refused for safety.` };
    if (EXECUTABLE.has(extOf(f.name))) return { error: `The zip contains a program or script file (${f.name}). Remove it and upload again.` };
  }

  const files = new Map<string, TemplateFile>();
  const htmls = new Map<string, string>();
  const ignored: TemplateUpload["ignored"] = [];
  let unpacked = 0;

  for (const f of entries) {
    const path = safeZipPath(f.name);
    if (!path || JUNK.test(path)) continue;
    const e = extOf(path);
    if (e === "js" || e === "mjs") {
      ignored.push({ path, reason: "JavaScript never runs in an email, so it was left out." });
      continue;
    }
    const known = e === "html" || e === "htm" || e === "css" || e in IMAGE_MIME || e in FONT_MIME;
    if (!known) {
      ignored.push({ path, reason: "Not used in an email (only HTML, CSS, images and fonts are)." });
      continue;
    }
    const data = await f.async("uint8array");
    unpacked += data.byteLength;
    if (unpacked > MAX_UNPACKED_BYTES) return { error: "That zip unpacks to far more than an email template could need, so it was refused." };

    if (e === "html" || e === "htm") {
      htmls.set(path, decode(data));
    } else if (e === "css") {
      files.set(path, { bytes: data, mime: "text/css" });
    } else if (e in FONT_MIME) {
      files.set(path, { bytes: data, mime: FONT_MIME[e] });
    } else {
      const real = sniffImage(data);
      if (!real) return { error: `${path} is named as an image but is not one. Remove it or replace it, and upload again.` };
      files.set(path, { bytes: data, mime: real });
    }
  }

  if (htmls.size === 0) return { error: "The zip has no HTML file in it. It needs an index.html." };
  let htmlPath: string;
  if (htmls.size === 1) {
    htmlPath = [...htmls.keys()][0];
  } else {
    const index = [...htmls.keys()].filter((p) => /(^|\/)index\.html?$/i.test(p)).sort((a, b) => a.split("/").length - b.split("/").length);
    if (!index.length) return { error: `The zip has ${htmls.size} HTML files and none is called index.html, so it is not clear which is the email.` };
    htmlPath = index[0];
    for (const p of htmls.keys()) if (p !== htmlPath) ignored.push({ path: p, reason: "Another HTML page; the email is index.html." });
  }
  return { html: htmls.get(htmlPath)!, htmlPath, kind: "zip", files, ignored };
}

/** A path in the HTML ("images/logo.png", "./img/a.png", "../x.png") resolved against the HTML's folder in the zip. */
export function resolveAssetPath(htmlPath: string, ref: string): string | null {
  const clean = ref.split(/[?#]/)[0];
  if (!clean || /^[a-z][a-z0-9+.-]*:/i.test(clean) || clean.startsWith("//")) return null;
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    // A stray % stays as it is.
  }
  const base = htmlPath.includes("/") ? htmlPath.slice(0, htmlPath.lastIndexOf("/") + 1) : "";
  const joined = decoded.startsWith("/") ? decoded.slice(1) : base + decoded;
  const parts: string[] = [];
  for (const part of joined.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/") || null;
}

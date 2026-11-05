// The pre-flight checklist an uploaded email is given: what would make it
// arrive broken, clipped, flagged as spam, or unsendable. Each check passes,
// warns, or fails, and says why in words.
//
// The static checks read the processed email; the network checks ask each
// link and each image on the web whether it is there. `fetch` is passed in,
// so the tests run without a network. No portal imports.

import type { ProcessedTemplate } from "./templateHtml.ts";

export type CheckStatus = "pass" | "warn" | "fail";
export type PreflightCheck = { key: string; label: string; status: CheckStatus; detail: string; items?: string[] };

/** Gmail cuts an email off at about 102 KB and hides the rest behind "View entire message". */
export const GMAIL_CLIP_BYTES = 102 * 1024;
export const SIZE_WARN_BYTES = 100 * 1024;

const kb = (n: number) => `${Math.round(n / 102.4) / 10} KB`;

export function staticPreflight(p: ProcessedTemplate): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  checks.push(
    p.sizeBytes > SIZE_WARN_BYTES
      ? {
          key: "size",
          label: "Email size",
          status: "warn",
          detail: `${kb(p.sizeBytes)}. Gmail clips an email over about 102 KB and hides the rest — including the unsubscribe link — behind “View entire message”.`,
        }
      : { key: "size", label: "Email size", status: "pass", detail: `${kb(p.sizeBytes)} — under Gmail's clipping limit.` }
  );

  checks.push(
    p.missingAssets.length
      ? {
          key: "missing_files",
          label: "Images and files",
          status: "fail",
          detail: "The email points at files that are not in the upload. Upload a zip with them, or use full web addresses (https://…).",
          items: p.missingAssets,
        }
      : { key: "missing_files", label: "Images and files", status: "pass", detail: "Every image the email uses is in the upload or on the web." }
  );

  const noAlt = p.images.filter((i) => i.alt === null).map((i) => i.src);
  checks.push(
    noAlt.length
      ? {
          key: "alt",
          label: "Image descriptions (alt text)",
          status: "warn",
          detail: `${noAlt.length} image${noAlt.length === 1 ? " has" : "s have"} no alt text, which is what shows while images are off and what screen readers read.`,
          items: noAlt,
        }
      : { key: "alt", label: "Image descriptions (alt text)", status: "pass", detail: p.images.length ? "Every image has alt text." : "The email has no images." }
  );

  if (p.insecureImages.length) {
    checks.push({
      key: "http_images",
      label: "Secure images",
      status: "warn",
      detail: "These images load over plain http, which many email clients block. Use https addresses.",
      items: p.insecureImages,
    });
  }

  // Mostly pictures and few words reads as spam to filters, and as nothing at all with images off.
  const mostlyImages = p.images.length > 0 && p.textLength < Math.max(200, p.images.length * 60);
  checks.push(
    mostlyImages
      ? {
          key: "image_text",
          label: "Images and text",
          status: "warn",
          detail: `The email is mostly images (${p.images.length} image${p.images.length === 1 ? "" : "s"}, ${p.textLength} characters of text). Spam filters distrust that, and with images off it says nothing. Put the key message in text too.`,
        }
      : { key: "image_text", label: "Images and text", status: "pass", detail: "A healthy balance of text and images." }
  );

  checks.push(
    p.footerAdded
      ? {
          key: "unsubscribe",
          label: "Unsubscribe link",
          status: "pass",
          detail: "The email had no {{unsubscribe_url}}, so a footer was added with the unsubscribe and preferences links and HMARK's address.",
        }
      : { key: "unsubscribe", label: "Unsubscribe link", status: "pass", detail: "The email has its own {{unsubscribe_url}} link." }
  );

  checks.push(
    p.unknownTags.length
      ? {
          key: "merge_tags",
          label: "Personalisation tags",
          status: "warn",
          detail: "These tags are not ones the portal fills in, so they would print blank. Check the spelling against the list of tags.",
          items: p.unknownTags.map((t) => `{{${t}}}`),
        }
      : {
          key: "merge_tags",
          label: "Personalisation tags",
          status: "pass",
          detail: p.mergeTags.length ? `Uses ${p.mergeTags.map((t) => `{{${t}}}`).join(", ")}.` : "No personalisation tags.",
        }
  );

  if (p.removed.length) {
    checks.push({
      key: "removed",
      label: "Removed for email",
      status: "warn",
      detail: "These do not work in email clients and were taken out.",
      items: p.removed.map((r) => `${r.what} (${r.count}): ${r.why}`),
    });
  }
  if (p.inlineError) checks.push({ key: "css", label: "CSS", status: "warn", detail: p.inlineError });

  return checks;
}

/** A host the server must never be pointed at: this machine, or a private network. */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // An IPv6 address: loopback, unspecified, unique-local (fc00::/7) or link-local (fe80::/10).
  if (h.includes(":")) return h === "::1" || h === "::" || /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h);
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

type Probe = { url: string; ok: boolean; status: number | null; contentType: string | null; error?: string };

async function probe(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<Probe> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { url, ok: false, status: null, contentType: null, error: "not a valid web address" };
  }
  if (isPrivateHost(host)) return { url, ok: false, status: null, contentType: null, error: "points at a private address" };
  const attempt = async (method: "HEAD" | "GET") => {
    const res = await fetchImpl(url, {
      method,
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: method === "GET" ? { Range: "bytes=0-0", "User-Agent": "HMARK-Portal-LinkCheck/1.0" } : { "User-Agent": "HMARK-Portal-LinkCheck/1.0" },
    });
    return res;
  };
  try {
    let res = await attempt("HEAD");
    // Plenty of sites refuse HEAD; ask for the first byte instead before calling it broken.
    if ([403, 405, 501].includes(res.status)) res = await attempt("GET");
    return { url, ok: res.status < 400, status: res.status, contentType: res.headers.get("content-type") };
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { url, ok: false, status: null, contentType: null, error: timedOut ? "did not answer in time" : "could not be reached" };
  }
}

async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/**
 * Asks every link and every web image whether it is there. A 404 or a gone
 * page fails; a site that does not answer is a warning, since it may only be
 * slow or unwelcoming to robots. At most `limit` addresses are asked.
 */
export async function networkPreflight(
  p: Pick<ProcessedTemplate, "links" | "images">,
  { fetchImpl = fetch, timeoutMs = 8000, limit = 60, concurrency = 6 }: { fetchImpl?: typeof fetch; timeoutMs?: number; limit?: number; concurrency?: number } = {}
): Promise<PreflightCheck[]> {
  const checks: PreflightCheck[] = [];
  const linkUrls = p.links.map((l) => l.url).slice(0, limit);
  const linkResults = await inBatches(linkUrls, concurrency, (u) => probe(u, fetchImpl, timeoutMs));
  const broken = linkResults.filter((r) => r.status === 404 || r.status === 410 || r.error === "not a valid web address" || r.error === "points at a private address");
  const unsure = linkResults.filter((r) => !r.ok && !broken.includes(r));
  const describe = (r: Probe) => `${r.url} — ${r.status ? `HTTP ${r.status}` : r.error}`;
  checks.push(
    broken.length
      ? { key: "links", label: "Links", status: "fail", detail: `${broken.length} of ${linkUrls.length} links are broken.`, items: [...broken, ...unsure].map(describe) }
      : unsure.length
        ? { key: "links", label: "Links", status: "warn", detail: `${unsure.length} of ${linkUrls.length} links could not be confirmed — open them to check.`, items: unsure.map(describe) }
        : { key: "links", label: "Links", status: "pass", detail: linkUrls.length ? `All ${linkUrls.length} links open.` : "The email has no web links." }
  );

  const imageUrls = [...new Set(p.images.map((i) => i.src).filter((s) => /^https?:\/\//i.test(s) && !s.includes("{{")))].slice(0, limit);
  const imageResults = await inBatches(imageUrls, concurrency, (u) => probe(u, fetchImpl, timeoutMs));
  const badImages = imageResults.filter((r) => !r.ok || (r.contentType !== null && !/^image\//i.test(r.contentType)));
  checks.push(
    badImages.length
      ? {
          key: "images_load",
          label: "Images load",
          status: "fail",
          detail: `${badImages.length} of ${imageUrls.length} images do not load as images.`,
          items: badImages.map((r) => (r.ok ? `${r.url} — not an image (${r.contentType})` : describe(r))),
        }
      : { key: "images_load", label: "Images load", status: "pass", detail: imageUrls.length ? `All ${imageUrls.length} images load.` : "No images to load." }
  );
  return checks;
}

/** The worst status in a checklist, for a badge. */
export function overallStatus(checks: PreflightCheck[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "warn")) return "warn";
  return "pass";
}

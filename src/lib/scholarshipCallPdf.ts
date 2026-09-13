// Fetching an official call document and checking it is what it claims to be.
//
// The guides in this system are HMARK's summary; the call is the document that
// actually governs, and every guide says so in its own footer. Keeping a copy
// against the body means staff and students are reading the same paper, and
// means it is still readable after the region takes last year's PDF down —
// which they all do, usually the week the new one appears.
//
// Nothing here trusts the remote server. A URL that ends in .pdf is not a PDF,
// a Content-Type header is a claim, and a regional site that has quietly
// replaced the call with a login page would otherwise be stored as though it
// were the call.

/** A call document is a few hundred KB; anything far past that is not one. */
export const MAX_CALL_PDF_BYTES = 25 * 1024 * 1024;

/** Regional sites are slow, but not this slow. */
export const CALL_PDF_TIMEOUT_MS = 30_000;

export type FetchedCall =
  | { ok: true; bytes: Uint8Array; contentType: string; filename: string; language: "en" | "it" | "unknown" }
  | { ok: false; error: string };

/** The first bytes of every PDF. The only claim about the format worth believing. */
function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/**
 * Which language the call is in, as far as the URL admits.
 *
 * Most regions publish in Italian only, and a student opening a 40-page bando
 * they cannot read should be told that before they open it rather than after.
 * Guessed from the URL because reading the text to decide would mean parsing
 * the PDF, and a wrong guess there is worse than an honest "unknown".
 */
export function guessLanguage(url: string): "en" | "it" | "unknown" {
  const u = url.toLowerCase();
  if (/\/en\/|[_-]en\.|english|\/eng\/|[_-]eng\./.test(u)) return "en";
  if (/\/it\/|[_-]it\.|italiano|bando/.test(u)) return "it";
  return "unknown";
}

/** A filename that says what it is, rather than "1782713728.pdf". */
export function callFilename(bodyName: string, academicYear: string | null, url: string): string {
  const slug = bodyName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const year = (academicYear ?? "").replace(/[^0-9]/g, "").slice(0, 8);
  const ext = /\.pdf(\?|$)/i.test(url) ? "pdf" : "pdf";
  return [slug || "call", year || null, "call"].filter(Boolean).join("-") + `.${ext}`;
}

/**
 * Downloads a call document.
 *
 * Returns a plain error rather than throwing: every failure here is something
 * a person needs to read and act on — a dead link, a login wall, a page where
 * a PDF was expected — and none of them is exceptional.
 */
export async function fetchCallPdf(url: string, bodyName: string, academicYear: string | null): Promise<FetchedCall> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "That is not a valid URL." };
  }
  // Only the public web. Without this the server could be asked to fetch its
  // own network — a link pointing at an internal address is not a call.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "The call link has to be an http or https address." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_PDF_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Some regional sites serve a different page to a bare fetch.
        "User-Agent": "Mozilla/5.0 (compatible; HMARK-CRM/1.0; scholarship call archive)",
        Accept: "application/pdf,*/*",
      },
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, error: aborted ? "The site took too long to answer." : "Could not reach that address." };
  }
  clearTimeout(timer);

  if (!response.ok) {
    return { ok: false, error: `The site answered ${response.status}${response.status === 404 ? " — the call has probably moved" : ""}.` };
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_CALL_PDF_BYTES) {
    return { ok: false, error: `That file is ${Math.round(declaredLength / 1024 / 1024)}MB, which is larger than a call document should be.` };
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.length === 0) return { ok: false, error: "That address returned an empty file." };
  if (buffer.length > MAX_CALL_PDF_BYTES) {
    return { ok: false, error: "That file is larger than a call document should be." };
  }

  // The header is a claim; the bytes are not. A regional site serving its
  // "page not found" HTML with a 200 is exactly the case this catches.
  if (!looksLikePdf(buffer)) {
    const contentType = response.headers.get("content-type") ?? "";
    return {
      ok: false,
      error: contentType.includes("html")
        ? "That link is a web page, not the PDF itself. Open it and copy the link to the call document."
        : "That file is not a PDF.",
    };
  }

  return {
    ok: true,
    bytes: buffer,
    contentType: "application/pdf",
    filename: callFilename(bodyName, academicYear, parsed.toString()),
    language: guessLanguage(parsed.toString()),
  };
}

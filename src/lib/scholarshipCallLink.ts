/**
 * Where the call for applications actually is, for a given scholarship body.
 *
 * A region publishes its call ("bando") in one of three shapes, and which one
 * you get is nobody's decision but the region's:
 *
 *   - we hold a copy, because somebody pressed Keep a copy in Setup;
 *   - the region links the PDF directly, so the link opens the document;
 *   - the region publishes it on a page, usually with the annexes and the
 *     forms beside it, and there is no single PDF to point at.
 *
 * The stored copy comes first on purpose: every region takes last year's PDF
 * down the week the new one goes up, so a live link stops answering exactly
 * when somebody needs to check what a student was advised from.
 *
 * Both the staff tab and the student's own portal resolve the link through
 * here, so the two can never end up showing different papers.
 */

export type CallLinkSource = {
  /** A signed link to the copy held against the body, made on the server. */
  call_pdf_signed_url?: string | null;
  /** Where the region publishes the PDF itself. */
  call_pdf_url?: string | null;
  /** The page the call sits on, when there is no single PDF to link. */
  call_page_url?: string | null;
  call_pdf_language?: string | null;
  call_status?: string | null;
  call_expected_on?: string | null;
};

export type CallLink = {
  url: string;
  /** stored = our copy, pdf = the region's own PDF, page = the region's page. */
  kind: "stored" | "pdf" | "page";
  /** What to put on the link. */
  label: string;
  /** Said plainly, because most calls are Italian-only. */
  language: "en" | "it" | null;
};

function language(value: string | null | undefined): "en" | "it" | null {
  return value === "en" || value === "it" ? value : null;
}

/** The one link worth showing for a body's call, or null if there is none. */
export function callLink(body: CallLinkSource): CallLink | null {
  const lang = language(body.call_pdf_language);
  const suffix = lang === "it" ? " (Italian)" : lang === "en" ? " (English)" : "";

  const stored = (body.call_pdf_signed_url ?? "").trim();
  if (stored) return { url: stored, kind: "stored", label: `Call for applications${suffix}`, language: lang };

  const pdf = (body.call_pdf_url ?? "").trim();
  if (pdf) return { url: pdf, kind: "pdf", label: `Call for applications${suffix}`, language: lang };

  const page = (body.call_page_url ?? "").trim();
  // No language suffix on a page: call_pdf_language describes the PDF, and a
  // region's page is Italian whatever the PDF turned out to be.
  if (page) return { url: page, kind: "page", label: "Call for applications", language: null };

  return null;
}

/**
 * Why there is no call to show, when there is none.
 *
 * A student who sees nothing assumes the office is sitting on it. "Not
 * published yet, expected in July" is a different sentence from "we have not
 * got round to it", and only the region knows which is true — call_status is
 * how the office records that.
 */
export function callAbsenceNote(body: CallLinkSource): string {
  if (body.call_status === "awaiting") {
    return body.call_expected_on
      ? `The region has not published this year's call yet. It is expected around ${body.call_expected_on}.`
      : "The region has not published this year's call yet.";
  }
  return "The call for applications is not linked here yet — your counsellor can send it to you.";
}

// Personalisation in an email campaign: {{first_name}}, {{counsellor_name}},
// {{first_name|there}} with a fallback for a blank value, and the links every
// campaign email carries ({{unsubscribe_url}} and the rest).
//
// The values come from the contact's own record — a lead, which every student
// also is — so nothing is copied into a separate contacts table.
//
// Pure, with no imports, so the unit tests load it under plain Node.

/** Every merge tag an email may use, with what it stands for. */
export const MERGE_TAGS = [
  { tag: "first_name", label: "First name (the first word of their name)" },
  { tag: "last_name", label: "Last name (the rest of their name)" },
  { tag: "full_name", label: "Full name" },
  { tag: "email", label: "Email address" },
  { tag: "country_of_interest", label: "Country of interest" },
  { tag: "intake", label: "Intake, e.g. September 2027" },
  { tag: "counsellor_name", label: "Their counsellor's name" },
  { tag: "unsubscribe_url", label: "One-click unsubscribe link" },
  { tag: "preferences_url", label: "Email preferences link" },
  { tag: "web_version_url", label: "“View in browser” link" },
] as const;

export type MergeTag = (typeof MERGE_TAGS)[number]["tag"];

const KNOWN = new Set<string>(MERGE_TAGS.map((t) => t.tag));

/** The links, filled per recipient when the email is sent. */
export const LINK_TAGS = ["unsubscribe_url", "preferences_url", "web_version_url"] as const;

// {{ tag }} or {{ tag | fallback }}; a fallback may not contain a brace.
const TAG = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g;

/** The tags a piece of HTML or text uses, each once, in order of first use. */
export function mergeTagsIn(source: string): string[] {
  const seen: string[] = [];
  for (const m of source.matchAll(TAG)) {
    const tag = m[1].toLowerCase();
    if (!seen.includes(tag)) seen.push(tag);
  }
  return seen;
}

/** The tags used that the portal does not know — a typo, or another tool's syntax. */
export function unknownMergeTags(source: string): string[] {
  return mergeTagsIn(source).filter((t) => !KNOWN.has(t));
}

export type MergeValues = Partial<Record<MergeTag, string | null | undefined>>;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * Fills the tags in. A blank value takes the tag's fallback, else nothing; an
 * unknown tag likewise (the pre-flight check has already said so). In HTML
 * every value is escaped — a name is text, never markup — and a link tag is
 * filled as it is, being a URL the portal made.
 */
export function renderMergeTags(source: string, values: MergeValues, { html = true }: { html?: boolean } = {}): string {
  return source.replace(TAG, (_whole, rawTag: string, fallback: string | undefined) => {
    const tag = rawTag.toLowerCase();
    const value = KNOWN.has(tag) ? values[tag as MergeTag] : undefined;
    const text = value != null && String(value).trim() !== "" ? String(value) : (fallback ?? "");
    if (!html) return text;
    return (LINK_TAGS as readonly string[]).includes(tag) && value ? text : escapeHtml(text);
  });
}

/** "Ayesha Khan" → first "Ayesha", last "Khan"; one word is a first name alone. */
export function splitName(fullName: string | null | undefined): { first: string; last: string } {
  const words = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: words[0] ?? "", last: words.slice(1).join(" ") };
}

/** A contact's values, from their lead record and their counsellor's name. */
export function contactMergeValues(
  lead: { full_name?: string | null; email?: string | null; country_of_interest?: string | null; intake?: string | null },
  counsellorName: string | null | undefined,
  links: Partial<Record<(typeof LINK_TAGS)[number], string>> = {}
): MergeValues {
  const { first, last } = splitName(lead.full_name);
  return {
    first_name: first,
    last_name: last,
    full_name: String(lead.full_name ?? "").trim(),
    email: lead.email ?? "",
    country_of_interest: lead.country_of_interest ?? "",
    intake: lead.intake ?? "",
    counsellor_name: counsellorName ?? "",
    ...links,
  };
}

/** The made-up contact a preview shows before anyone is chosen. */
export const SAMPLE_CONTACT: MergeValues = {
  first_name: "Ayesha",
  last_name: "Khan",
  full_name: "Ayesha Khan",
  email: "ayesha.khan@example.com",
  country_of_interest: "Italy",
  intake: "September 2027",
  counsellor_name: "Sara Ahmed",
};

/**
 * What a visa page is made of, once the office can change it.
 *
 * Three rules, and all three exist because the alternative silently loses
 * something somebody wrote:
 *
 *   - a country's decision message overrides the shared one field by field,
 *     not wholesale. An override that only changes the heading must not blank
 *     the body underneath it;
 *   - shared sections come before a country's own, because that is the order
 *     they are read in: the general rule, then "and for Italy specifically";
 *   - a section is addressed to the student, to staff, or to both, and the
 *     student's page must never show one meant for staff.
 */

export type VisaAudience = "student" | "staff" | "both";

export type VisaPageSection = {
  id: string;
  destinationId: string | null;
  title: string;
  body: string | null;
  linkLabel: string | null;
  linkUrl: string | null;
  audience: VisaAudience;
  sortOrder: number;
  status: "active" | "hidden";
};

export type VisaMessageFields = {
  approved_heading: string | null;
  approved_body: string | null;
  approved_signoff: string | null;
  refused_heading: string | null;
  refused_body: string | null;
  refused_signoff: string | null;
};

/**
 * The shared wording with a country's overrides laid on top, field by field.
 *
 * A blank string counts as "not overridden": clearing a box in the builder
 * should fall back to the shared wording rather than publish an empty heading.
 */
export function mergeVisaMessages(
  shared: VisaMessageFields | null,
  override: Partial<VisaMessageFields> | null
): VisaMessageFields | null {
  if (!shared && !override) return null;
  const keys: (keyof VisaMessageFields)[] = [
    "approved_heading",
    "approved_body",
    "approved_signoff",
    "refused_heading",
    "refused_body",
    "refused_signoff",
  ];
  const out = {} as VisaMessageFields;
  for (const k of keys) {
    const o = (override?.[k] ?? "").trim();
    out[k] = o ? o : shared?.[k] ?? null;
  }
  return out;
}

/**
 * The merged wording in the shape visaMessage wants.
 *
 * Null when there is nothing to say at all, so visaMessage falls back to its
 * built-in copy rather than rendering a card of empty headings — which is the
 * behaviour a database predating the visa_messages table already relied on.
 */
export function toMessageTemplates(fields: VisaMessageFields | null): {
  approved_heading: string;
  approved_body: string;
  approved_signoff: string;
  refused_heading: string;
  refused_body: string;
  refused_signoff: string;
} | null {
  if (!fields) return null;
  const values = {
    approved_heading: fields.approved_heading ?? "",
    approved_body: fields.approved_body ?? "",
    approved_signoff: fields.approved_signoff ?? "",
    refused_heading: fields.refused_heading ?? "",
    refused_body: fields.refused_body ?? "",
    refused_signoff: fields.refused_signoff ?? "",
  };
  return Object.values(values).some((v) => v.trim() !== "") ? values : null;
}

/** True where a country has changed anything at all from the shared wording. */
export function hasMessageOverride(override: Partial<VisaMessageFields> | null): boolean {
  if (!override) return false;
  return Object.values(override).some((v) => typeof v === "string" && v.trim() !== "");
}

/**
 * The sections a given reader sees for a given country, in order.
 *
 * Hidden sections are dropped here rather than filtered in the query, so the
 * builder can list them alongside the live ones without a second code path.
 */
export function sectionsFor(
  all: VisaPageSection[],
  destinationId: string | null,
  audience: "student" | "staff"
): VisaPageSection[] {
  const relevant = all.filter(
    (s) =>
      s.status === "active" &&
      (s.audience === "both" || s.audience === audience) &&
      (s.destinationId === null || s.destinationId === destinationId)
  );
  // Shared first, then the country's own; each group by its own order, then
  // by title so two sections left at order 0 do not swap places between loads.
  return relevant.sort((a, b) => {
    const shared = (s: VisaPageSection) => (s.destinationId === null ? 0 : 1);
    return shared(a) - shared(b) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
  });
}

/** Said in the builder, so nobody has to guess who will read a section. */
export function audienceLabel(audience: VisaAudience): string {
  return audience === "both"
    ? "Student and staff"
    : audience === "student"
      ? "Student only"
      : "Staff only";
}

/**
 * Which scholarship text is worth translating, and when it is worth asking.
 *
 * The directory is read by staff in Karachi and by students who mostly do not
 * read Italian, Spanish, Hungarian or Romanian. A deadline copied verbatim
 * from a bando — "scadenza 7 settembre 2026, ore 13:00" — is accurate and
 * useless to the person it is for.
 *
 * Deciding whether to ask the model at all is the part worth keeping honest:
 * a call on every save would cost money on every English edit, and no call at
 * all would leave Italian on the page. The rule below errs towards asking.
 */

/** The fields that carry prose somebody reads. */
export const TRANSLATABLE_FIELDS = [
  "region",
  "application_deadline",
  "document_upload_deadline",
  "courier_deadline",
  "isee_threshold",
  "ispe_threshold",
  "stipend_amount",
  "benefits",
  "call_notes",
] as const;

export type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number];

/**
 * Function words that only really turn up in the languages this directory
 * actually collects. Deliberately short and deliberately not nouns: "Toscana"
 * and "Sorbonne" are names that stay as they are, and a list containing them
 * would ask for a translation of every Italian body's own title.
 */
const NON_ENGLISH_MARKERS = [
  // Italian
  "della", "delle", "degli", "concorso", "bando", "borsa", "studio", "scadenza", "domanda", "iscrizione",
  // Spanish
  "convocatoria", "becas", "solicitud", "plazo", "requisitos", "para el", "del ",
  // French
  "bourse", "candidature", "dossier", "inscription", "date limite", "étudiant",
  // German
  "bewerbung", "stipendium", "bewerbungsfrist", "hochschule", "antrag",
  // Hungarian / Romanian / Nordic
  "ösztöndíj", "jelentkezés", "bursa", "înscriere", "dosar", "ansökan", "stipendium för", "hakemus",
];

/**
 * Whether a set of values is worth sending to be translated.
 *
 * Two triggers, either is enough:
 *   - a letter outside plain ASCII, which English text rarely carries and
 *     every one of these languages does;
 *   - a function word from the list above.
 *
 * A false positive costs one model call that returns the text unchanged. A
 * false negative leaves Italian on a student's screen, so the bias is
 * deliberate.
 */
export function needsTranslation(values: Record<string, unknown>): boolean {
  for (const field of TRANSLATABLE_FIELDS) {
    const raw = values[field];
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (NON_ASCII.test(raw)) return true;
    const lower = raw.toLowerCase();
    if (NON_ENGLISH_MARKERS.some((m) => lower.includes(m))) return true;
  }
  // Guide sections carry the bulk of the prose.
  const sections = values.guide_sections;
  if (Array.isArray(sections)) {
    for (const s of sections) {
      const text = `${(s as { title?: string })?.title ?? ""} ${(s as { body?: string })?.body ?? ""}`;
      if (!text.trim()) continue;
      if (NON_ASCII.test(text)) return true;
      const lower = text.toLowerCase();
      if (NON_ENGLISH_MARKERS.some((m) => lower.includes(m))) return true;
    }
  }
  return false;
}

/** Any character outside printable ASCII — every language here uses some. */
const NON_ASCII = /[^ -~]/;

/** Just the parts worth sending, so the model is not paid to read URLs. */
export function translatablePayload(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of TRANSLATABLE_FIELDS) {
    const raw = values[field];
    if (typeof raw === "string" && raw.trim()) out[field] = raw;
  }
  if (Array.isArray(values.guide_sections) && values.guide_sections.length > 0) {
    out.guide_sections = values.guide_sections;
  }
  return out;
}

/**
 * Lays a translation over the original, keeping anything the model did not
 * return or mangled.
 *
 * Strict on purpose. A translation step that can drop a deadline because the
 * model answered oddly is worse than no translation at all, so every value is
 * checked to be a non-empty string of the same shape before it replaces
 * anything, and guide sections must come back with the same count.
 */
export function applyTranslation(
  original: Record<string, unknown>,
  translated: Record<string, unknown> | null
): { values: Record<string, unknown>; changed: string[] } {
  if (!translated) return { values: original, changed: [] };

  const values = { ...original };
  const changed: string[] = [];

  for (const field of TRANSLATABLE_FIELDS) {
    const before = original[field];
    const after = translated[field];
    if (typeof before !== "string" || typeof after !== "string") continue;
    if (!after.trim() || after === before) continue;
    values[field] = after;
    changed.push(field);
  }

  const beforeSections = original.guide_sections;
  const afterSections = translated.guide_sections;
  if (
    Array.isArray(beforeSections) &&
    Array.isArray(afterSections) &&
    beforeSections.length === afterSections.length &&
    beforeSections.length > 0
  ) {
    const merged = beforeSections.map((s, i) => {
      const src = s as { title?: string; body?: string };
      const dst = afterSections[i] as { title?: string; body?: string };
      return {
        ...src,
        title: typeof dst?.title === "string" && dst.title.trim() ? dst.title : src.title,
        body: typeof dst?.body === "string" && dst.body.trim() ? dst.body : src.body,
      };
    });
    if (JSON.stringify(merged) !== JSON.stringify(beforeSections)) {
      values.guide_sections = merged;
      changed.push("guide_sections");
    }
  }

  return { values, changed };
}

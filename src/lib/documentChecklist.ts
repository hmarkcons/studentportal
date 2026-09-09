// What a given student is actually asked for, and what a given destination's
// checklist contains.
//
// Two shifts from the old model, both from the brief:
//
// 1. The Admission section no longer asks for a fixed list of academic
//    documents. It asks for the qualifications and test scores the student
//    entered in their profile — so a student with one bachelors and an IELTS is
//    asked for exactly those, not for "Associate degree transcript (if
//    applicable)" and a generic "Language certificate". Travel and visa
//    history likewise drive two rows in the Visa section. Everything else in
//    every section still comes from the destination's checklist.
//
// 2. A destination's checklist is its own items plus the shared
//    ("All destinations") items, minus any shared item that destination has
//    explicitly dropped. Sections are data, so a destination can carry a
//    section with no items yet, and a new section can be created without a
//    code change.

import { QUALIFICATION_TYPE_LABELS, type QualificationType } from "./qualifications.ts";
import { testLabel } from "./testScores.ts";

export type SectionRow = { key: string; label: string; is_predefined?: boolean; sort_order?: number };
export type DestinationSectionRow = { destination_id: string | null; section_key: string; sort_order: number };

export type TemplateRow = {
  id: string;
  destination_id: string | null;
  category: string;
  name: string;
  description?: string | null;
  required: boolean;
  level: string;
  sort_order: number;
};

export type ChecklistItem = TemplateRow & {
  /** True when it comes from the All-destinations list rather than this one. */
  isShared: boolean;
};

export type ChecklistSection = {
  key: string;
  label: string;
  sortOrder: number;
  items: ChecklistItem[];
};

/**
 * The sections and items one destination's checklist holds, in display order.
 *
 * `destinationId` of null builds the All-destinations checklist itself, which
 * the builder edits as an entry of its own — editing a shared item there
 * reaches every country, which is the point.
 */
export function resolveChecklist(input: {
  destinationId: string | null;
  sections: SectionRow[];
  destinationSections: DestinationSectionRow[];
  templates: TemplateRow[];
  /** template_ids this destination has dropped from the shared list. */
  excludedTemplateIds?: string[];
}): ChecklistSection[] {
  const { destinationId, sections, destinationSections, templates } = input;
  const excluded = new Set(input.excludedTemplateIds ?? []);
  const labelOf = new Map(sections.map((s) => [s.key, s.label]));

  const mine = destinationSections
    .filter((ds) => ds.destination_id === destinationId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const applicable = templates.filter((t) => {
    if (t.destination_id === destinationId) return true;
    // The All-destinations checklist shows only its own items; a country's
    // also shows the shared ones it has not dropped.
    if (destinationId === null) return false;
    return t.destination_id === null && !excluded.has(t.id);
  });

  return mine.map((ds) => ({
    key: ds.section_key,
    label: labelOf.get(ds.section_key) ?? ds.section_key,
    sortOrder: ds.sort_order,
    items: applicable
      .filter((t) => t.category === ds.section_key)
      .map((t) => ({ ...t, isShared: t.destination_id === null && destinationId !== null }))
      // Own items and shared items interleave by sort_order, so a country can
      // slot its own requirement between two inherited ones.
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
  }));
}

// ------------------------------------------------------------- derived rows

export type DerivedRequirement = {
  /** Stable identity, so re-seeding never duplicates and a row can be found again. */
  derivedKey: string;
  category: string;
  name: string;
  required: boolean;
};

export type QualificationRow = {
  id: string;
  qualification_type: string;
  qualification_name?: string | null;
};

export type TestScoreRow = {
  id: string;
  test_type: string;
  custom_test_name?: string | null;
};

/**
 * One row per document, as instructed: a qualification is asked for its
 * certificate and its transcript separately, so the two can be chased and
 * verified independently. A test score asks for its scorecard.
 */
const QUALIFICATION_DOCUMENTS = [
  { suffix: "certificate", label: "certificate" },
  { suffix: "transcript", label: "transcript / marksheet" },
] as const;

function qualificationLabel(q: QualificationRow): string {
  const typed = (q.qualification_name ?? "").trim();
  return QUALIFICATION_TYPE_LABELS[q.qualification_type as QualificationType] ?? (typed || q.qualification_type);
}

/**
 * The requirements that come from the student's own profile rather than from
 * any destination's checklist.
 *
 * Travel and visa history each contribute a single row, and only when there is
 * history to evidence — a student who has never travelled should not be asked
 * for stamps they cannot produce.
 */
export function profileDerivedRequirements(input: {
  qualifications: QualificationRow[];
  testScores: TestScoreRow[];
  travelHistoryCount: number;
  visaHistoryCount: number;
}): DerivedRequirement[] {
  const out: DerivedRequirement[] = [];

  for (const q of input.qualifications) {
    const label = qualificationLabel(q);
    for (const doc of QUALIFICATION_DOCUMENTS) {
      out.push({
        derivedKey: `qualification:${q.id}:${doc.suffix}`,
        category: "admission",
        name: `${label} — ${doc.label}`,
        required: true,
      });
    }
  }

  for (const t of input.testScores) {
    out.push({
      derivedKey: `test:${t.id}:scorecard`,
      category: "admission",
      name: `${testLabel(t.test_type, t.custom_test_name)} — scorecard`,
      required: true,
    });
  }

  if (input.travelHistoryCount > 0) {
    out.push({
      derivedKey: "profile:travel_history",
      category: "visa",
      name: "Previous travel history — visas & stamps",
      required: true,
    });
  }

  if (input.visaHistoryCount > 0) {
    out.push({
      derivedKey: "profile:visa_refusals",
      category: "visa",
      name: "Previous refusal / deportation papers",
      required: true,
    });
  }

  return out;
}

/**
 * Which derived rows to create and which to retire, given what is already on
 * file.
 *
 * A row whose profile entry has gone is only removed when nothing has been
 * uploaded against it. One carrying a file is kept: the student sent that
 * document in, and deleting the row would take the file out of reach — a
 * qualification edited or retyped in the profile must not destroy evidence.
 */
export function reconcileDerived(
  wanted: DerivedRequirement[],
  existing: { id: string; derived_key: string | null; file_path: string | null }[]
): { toInsert: DerivedRequirement[]; toDeleteIds: string[]; keptWithFileIds: string[] } {
  const wantedKeys = new Set(wanted.map((w) => w.derivedKey));
  const existingKeys = new Set(existing.map((e) => e.derived_key).filter((k): k is string => Boolean(k)));

  const stale = existing.filter((e) => e.derived_key && !wantedKeys.has(e.derived_key));

  return {
    toInsert: wanted.filter((w) => !existingKeys.has(w.derivedKey)),
    toDeleteIds: stale.filter((e) => !e.file_path).map((e) => e.id),
    keptWithFileIds: stale.filter((e) => e.file_path).map((e) => e.id),
  };
}

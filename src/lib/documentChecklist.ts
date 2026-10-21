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
//    history likewise drive the Visa section: a row for the travel history,
//    and a letter for each refusal or deportation. Everything else in every
//    section still comes from the destination's checklist.
//
// 2. A destination's checklist is its own items plus the shared
//    ("All destinations") items, minus any shared item that destination has
//    explicitly dropped. Sections are data, so a destination can carry a
//    section with no items yet, and a new section can be created without a
//    code change.

import { QUALIFICATION_TYPE_LABELS, type QualificationType } from "./qualifications.ts";
import { needsCustomName, testLabel } from "./testScores.ts";
import { visaTypeShort } from "./visaTypes.ts";

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
  renew_each_intake?: boolean;
  /** Not asked of a visa-only client (0280). */
  skip_for_visa_only?: boolean;
  /** 'all', or only for a student on the 'public' or 'private' track (0337). */
  university_track?: string;
};

// ------------------------------------------------------- university track

export type UniversityTrack = "public" | "private";
export type TrackScope = "all" | UniversityTrack;

/** What a requirement can be limited to, as the builder offers it. */
export const TRACK_SCOPES: readonly { value: TrackScope; label: string; badge: string | null }[] = [
  { value: "all", label: "Public and private", badge: null },
  { value: "public", label: "Public only", badge: "public universities only" },
  { value: "private", label: "Private only", badge: "private universities only" },
];

export function isTrackScope(value: unknown): value is TrackScope {
  return TRACK_SCOPES.some((s) => s.value === value);
}

/** An application at one of these stages no longer asks for anything. */
const CLOSED_STAGES = new Set(["rejected", "declined", "withdrawn"]);

const asTrack = (v: string | null | undefined): UniversityTrack | null => (v === "public" || v === "private" ? v : null);

export type StudentTracks = {
  /** Per destination the student is pursuing. */
  byDestination: Map<string, Set<UniversityTrack>>;
  /** Every track the student is on, for a requirement shared by all destinations. */
  any: Set<UniversityTrack>;
};

/**
 * Which tracks a student is on — public, private, or both.
 *
 * A destination's track is that of the universities the student is applying
 * to there: a student applying to Bocconi, a private university, under Italy
 * (Public) is on the private track there, and one applying to a public and a
 * private university is on both. Until they have an application there, the
 * destination's own track stands in for it — it is what they registered for.
 * An application rejected, declined or withdrawn no longer counts.
 */
export function studentTracks(input: {
  destinations: readonly { id: string; track: string | null }[];
  /** The student's applications in this intake, with their university's type and destination. */
  applications: readonly { destinationId: string | null; type: string | null; stage?: string | null }[];
}): StudentTracks {
  const live = input.applications.filter((a) => !CLOSED_STAGES.has(a.stage ?? "") && asTrack(a.type));
  const byDestination = new Map<string, Set<UniversityTrack>>();
  for (const d of input.destinations) {
    const there = live.filter((a) => a.destinationId === d.id).map((a) => asTrack(a.type)!);
    const own = asTrack(d.track);
    byDestination.set(d.id, new Set(there.length > 0 ? there : own ? [own] : []));
  }
  const any = new Set<UniversityTrack>([...byDestination.values()].flatMap((s) => [...s]));
  // An application in a country the student has not listed still says which kind of university they are applying to.
  for (const a of live) if (!a.destinationId || !byDestination.has(a.destinationId)) any.add(asTrack(a.type)!);
  return { byDestination, any };
}

/** Whether a requirement limited to a track is one this student is asked for. */
export function trackFits(scope: string | null | undefined, destinationId: string | null, tracks: StudentTracks): boolean {
  const track = asTrack(scope);
  if (!track) return true;
  const set = destinationId ? tracks.byDestination.get(destinationId) : tracks.any;
  return Boolean(set?.has(track));
}

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

// ------------------------------------------------------- seeding templates

export type SeedCandidate = {
  id: string;
  destination_id: string | null;
  category: string;
  name: string;
  sort_order: number;
};

/**
 * One document is one requirement, however many countries ask for it.
 *
 * A student pursuing two destinations was asked for the same document once
 * per destination, because each destination's checklist carries its own copy
 * of it: Germany and Italy both ask for the HEC attestation, and the student
 * got two rows for the single piece of paper they will send in. Same for the
 * IBCC attestation, the O/A-Level equivalency and travel insurance.
 *
 * Matching is on section AND name, never name alone: the Visa section has its
 * own "Photo" alongside Admission's "Passport-size photographs", and a photo
 * for the consulate is not the photo for the university.
 */
function seedKey(category: string, name: string) {
  return `${category} ${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

/**
 * Which of the applicable templates should actually be seeded, given what the
 * student is already asked for.
 *
 * Where several candidates collide, the shared (All-destinations) copy wins:
 * it stays applicable even if the student later drops one of their
 * destinations, whereas a destination-specific row would then be a leftover
 * from a country nobody is applying to.
 */
export function templatesToSeed(
  candidates: SeedCandidate[],
  alreadyAsked: { category: string | null; label: string | null }[]
): SeedCandidate[] {
  const covered = new Set(
    alreadyAsked
      .filter((r) => r.category && r.label)
      .map((r) => seedKey(r.category!, r.label!))
  );

  const ordered = [...candidates].sort(
    (a, b) =>
      Number(a.destination_id !== null) - Number(b.destination_id !== null) ||
      a.sort_order - b.sort_order ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id)
  );

  const out: SeedCandidate[] = [];
  for (const c of ordered) {
    const key = seedKey(c.category, c.name);
    if (covered.has(key)) continue;
    covered.add(key);
    out.push(c);
  }
  return out;
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
  /** The school, college or university the qualification is from. */
  institution_name?: string | null;
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
 * The name of the school, college or university the document comes from.
 *
 * A requirement reading "Secondary School — certificate" says what kind of
 * document is wanted and nothing about which one: a student holds one matric
 * certificate from one school, and neither they nor the officer chasing it
 * should have to open the profile to remember whose. The profile has always
 * carried institution_name — it simply was not used here.
 *
 * Appended rather than woven in, so the existing wording stays intact as a
 * prefix and a row is still recognisable to anyone who knew it before.
 */
function withInstitution(label: string, q: QualificationRow): string {
  const institution = (q.institution_name ?? "").trim();
  return institution ? `${label} — ${institution}` : label;
}

/** One row of student_profiles.visa_refusal_history, as the Travel & visa history form writes it. */
export type VisaRefusalRow = {
  id?: string | null;
  country?: string | null;
  /** 'refusal' or 'deportation'. */
  type?: string | null;
  /** The kind of visa refused (visaTypes.ts); 'other' names it in visa_type_other. */
  visa_type?: string | null;
  visa_type_other?: string | null;
  /** YYYY-MM-DD, from a date input. */
  date?: string | null;
};

/** One row of student_profiles.travel_history, as the Travel & visa history form writes it. */
export type TravelRow = {
  id?: string | null;
  country?: string | null;
  /** The kind of visa the trip was on (visaTypes.ts); 'other' names it in visa_type_other. */
  visa_type?: string | null;
  visa_type_other?: string | null;
  /** YYYY-MM-DD, from date inputs. */
  from_date?: string | null;
  to_date?: string | null;
};

/** Every refusal letter's key starts with this; the rest is the refusal's own id. */
export const VISA_REFUSAL_KEY_PREFIX = "visa_refusal:";
/** Every previous visa's key starts with this; the rest is the trip's own id. */
export const PREVIOUS_VISA_KEY_PREFIX = "previous_visa:";

export function isVisaRefusalKey(derivedKey: string | null | undefined): boolean {
  return Boolean(derivedKey?.startsWith(VISA_REFUSAL_KEY_PREFIX));
}

export function isPreviousVisaKey(derivedKey: string | null | undefined): boolean {
  return Boolean(derivedKey?.startsWith(PREVIOUS_VISA_KEY_PREFIX));
}

/**
 * A document of the student's past — a trip's visa, a refusal's letter — sits
 * with the visa papers but is the same piece of paper whichever intake asks
 * for it, so once approved it stays approved in the next one.
 */
export function isHistoryDocumentKey(derivedKey: string | null | undefined): boolean {
  return isVisaRefusalKey(derivedKey) || isPreviousVisaKey(derivedKey);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Ymd = { y: string; m: string; d: number };

function readDate(date: string | null | undefined): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[3]) < 1 || Number(m[3]) > 31) return null;
  return { y: m[1], m: MONTHS[Number(m[2]) - 1], d: Number(m[3]) };
}

/** "15 Aug 2025" — written out by hand, so the server and the tests cannot word it differently. */
function refusalDate(date: string | null | undefined): string | null {
  const d = readDate(date);
  return d ? `${d.d} ${d.m} ${d.y}` : null;
}

/**
 * When a trip was, as briefly as it can be said: "4–20 Aug 2026",
 * "28 Jul – 3 Aug 2026", "28 Dec 2025 – 3 Jan 2026", "from 4 Aug 2026",
 * "until 20 Aug 2026", or nothing when neither date is on file.
 */
export function tripDates(from: string | null | undefined, to: string | null | undefined): string | null {
  const a = readDate(from);
  const b = readDate(to);
  const full = (x: Ymd) => `${x.d} ${x.m} ${x.y}`;
  if (a && b) {
    if (a.y === b.y && a.m === b.m) return a.d === b.d ? full(a) : `${a.d}–${b.d} ${a.m} ${a.y}`;
    if (a.y === b.y) return `${a.d} ${a.m} – ${full(b)}`;
    return `${full(a)} – ${full(b)}`;
  }
  if (a) return `from ${full(a)}`;
  if (b) return `until ${full(b)}`;
  return null;
}

/**
 * "Previous visa — UAE, 4–20 Aug 2026": which trip the visa and its stamps are
 * for, so two trips to one country are two things to find, each named.
 */
export function previousVisaRequirementName(t: TravelRow): string {
  const country = (t.country ?? "").trim();
  const visa = visaTypeShort(t.visa_type, t.visa_type_other);
  // "Previous visa — UAE (Student), 4–20 Aug 2026": the country carries the
  // kind of visa, then the dates.
  const place = country && visa ? `${country} (${visa})` : country;
  const which = [place, tripDates(t.from_date, t.to_date)].filter(Boolean).join(", ");
  return which ? `Previous visa — ${which}` : "Previous visa";
}

/**
 * "Visa refusal letter — UK, 12 Mar 2024", or "Deportation papers — UAE":
 * which refusal the letter is for, so the student knows which piece of paper
 * to find and the officer which one is still missing.
 */
export function visaRefusalRequirementName(r: VisaRefusalRow): string {
  const visa = visaTypeShort(r.visa_type, r.visa_type_other);
  // The visa named leads a refusal letter ("Student visa refusal letter"), so
  // the officer knows which one to collect; a deportation's papers are not a
  // visa, so the kind is left to the profile.
  const what = r.type === "deportation" ? "Deportation papers" : visa ? `${visa} visa refusal letter` : "Visa refusal letter";
  const which = [(r.country ?? "").trim(), refusalDate(r.date)].filter(Boolean).join(", ");
  return which ? `${what} — ${which}` : what;
}

/**
 * The requirements that come from the student's own profile rather than from
 * any destination's checklist.
 *
 * Each trip on the travel history asks for its visa and stamps, and each
 * refusal or deportation for its own letter, named by country and date, so
 * each can be chased and approved on its own — and a student who has never
 * travelled is asked for nothing they cannot produce.
 */
export function profileDerivedRequirements(input: {
  qualifications: QualificationRow[];
  testScores: TestScoreRow[];
  /** Tests ticked in the documentation tracker (trackerSelectedTests): asked for as soon as ticked. */
  trackerTests?: readonly { type: string; name?: string | null }[];
  /** Tests the destination's own checklist already asks for by name (CEnT-S…): not asked twice. */
  coveredTestTypes?: ReadonlySet<string>;
  /** student_profiles.travel_history. */
  travel?: readonly TravelRow[];
  /** student_profiles.visa_refusal_history. */
  visaRefusals?: readonly VisaRefusalRow[];
}): DerivedRequirement[] {
  const out: DerivedRequirement[] = [];

  for (const q of input.qualifications) {
    const label = qualificationLabel(q);
    for (const doc of QUALIFICATION_DOCUMENTS) {
      out.push({
        // Keyed by the qualification's id, never its name, so correcting a
        // school's spelling renames the requirement instead of retiring it and
        // losing the document uploaded against it.
        derivedKey: `qualification:${q.id}:${doc.suffix}`,
        category: "admission",
        name: withInstitution(`${label} — ${doc.label}`, q),
        required: true,
      });
    }
  }

  // One scorecard per test, however it was recorded — ticked in a tracker or
  // entered on the Profile — and however many times it was sat: a retest's
  // scorecard is a second file of the same requirement, not a second
  // requirement. An "Other" test is its own, by the name it goes by.
  const tests = new Map<string, { type: string; name: string | null }>();
  const keyOf = (type: string, name: string | null) => (needsCustomName(type) ? `test:${type}:${(name ?? "").trim().toLowerCase() || "unnamed"}` : `test:${type}`);
  for (const t of input.testScores) tests.set(keyOf(t.test_type, t.custom_test_name ?? null), { type: t.test_type, name: t.custom_test_name ?? null });
  for (const t of input.trackerTests ?? []) {
    // A ticked "Other" with no name yet is the one already named on the Profile, if there is one.
    if (needsCustomName(t.type) && !t.name && [...tests.values()].some((x) => x.type === t.type)) continue;
    const key = keyOf(t.type, t.name ?? null);
    if (!tests.has(key)) tests.set(key, { type: t.type, name: t.name ?? null });
  }
  for (const [derivedKey, t] of tests) {
    if (input.coveredTestTypes?.has(t.type)) continue;
    out.push({
      derivedKey,
      category: "admission",
      name: `${testLabel(t.type, t.name)} — scorecard`,
      required: true,
    });
  }

  // Each keyed by its entry's own id, which the form keeps across saves: a
  // date corrected on the profile renames the requirement and keeps its file.
  const trips = new Map<string, TravelRow>();
  for (const t of input.travel ?? []) {
    const id = (t.id ?? "").trim() || [(t.country ?? "").trim().toLowerCase(), t.from_date ?? "", t.to_date ?? ""].join("|");
    if (!trips.has(id)) trips.set(id, t);
  }
  for (const [id, t] of trips) {
    out.push({
      derivedKey: `${PREVIOUS_VISA_KEY_PREFIX}${id}`,
      category: "visa",
      name: previousVisaRequirementName(t),
      required: true,
    });
  }

  const refusals = new Map<string, VisaRefusalRow>();
  for (const r of input.visaRefusals ?? []) {
    const id = (r.id ?? "").trim() || [(r.country ?? "").trim().toLowerCase(), r.date ?? "", r.type ?? ""].join("|");
    if (!refusals.has(id)) refusals.set(id, r);
  }
  for (const [id, r] of refusals) {
    out.push({
      derivedKey: `${VISA_REFUSAL_KEY_PREFIX}${id}`,
      category: "visa",
      name: visaRefusalRequirementName(r),
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
  existing: { id: string; derived_key: string | null; file_path: string | null; custom_name?: string | null }[]
): {
  toInsert: DerivedRequirement[];
  toDeleteIds: string[];
  keptWithFileIds: string[];
  toRename: { id: string; name: string }[];
} {
  const wantedKeys = new Set(wanted.map((w) => w.derivedKey));
  const existingKeys = new Set(existing.map((e) => e.derived_key).filter((k): k is string => Boolean(k)));

  const stale = existing.filter((e) => e.derived_key && !wantedKeys.has(e.derived_key));

  // The name is written once at insert, so a row created before the profile
  // named its institution — or before this wording existed — would keep the
  // old label for ever. Renaming touches nothing but the label: not the file,
  // not the status, not the review state.
  const wantedByKey = new Map(wanted.map((w) => [w.derivedKey, w]));
  const toRename = existing.flatMap((e) => {
    if (!e.derived_key) return [];
    const want = wantedByKey.get(e.derived_key);
    if (!want || want.name === (e.custom_name ?? "")) return [];
    return [{ id: e.id, name: want.name }];
  });

  return {
    toInsert: wanted.filter((w) => !existingKeys.has(w.derivedKey)),
    toDeleteIds: stale.filter((e) => !e.file_path).map((e) => e.id),
    keptWithFileIds: stale.filter((e) => e.file_path).map((e) => e.id),
    toRename,
  };
}

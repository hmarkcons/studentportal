// Turning a scholarship bodies sheet into what the directory stores, and
// working out what an upload actually changes.
//
// The same rules as the catalogue import (catalogueRows.ts, importMerge.ts),
// because the office uses both and a cell must mean the same thing in each:
//
//   * **An empty cell yields null, never a default**, and null means "the
//     sheet said nothing" — the stored value stays. So a sheet of names and
//     deadlines updates thirty bodies without wiping their guides, thresholds
//     and countries. The import can therefore never clear a field; that is
//     the edit form's job, where you can see what you are removing.
//   * **A cell that cannot be read is reported and treated as blank** — never
//     guessed at, and never sent to Postgres to be refused there.
//   * **A name close to one on file is that body**, updated under its stored
//     name, and listed in the preview so a wrong pairing is seen before
//     anything is written. Close to two, it is held back.
//
// Two cells are lists and replace rather than merge when filled in: the
// countries (the body then serves exactly those) and the universities it
// covers. The guide is a list of sections spread over "Guide N title" /
// "Guide N text" pairs, and follows the same rule — any pair filled in, and
// the guide becomes exactly the filled pairs; none, and it is left alone.
//
// Pure, so the whole plan — which bodies are added, which updated and how —
// is unit-tested from sheet rows (scripts/scholarship-body-rows-test.mjs).
// src/lib/actions/scholarshipBodyImport.ts only sends the writes.

import { parseDay, splitList, type RowProblem } from "./catalogueRows.ts";
import { describeChange, isNearMiss, mergeRow, normalizeName, type Cell } from "./importMerge.ts";
import {
  CALL_STATUSES,
  GUIDE_LIMITS,
  isExampleBodyRow,
  parseGuideKey,
  splitCoversCell,
  EXAMPLE_BODY,
  type CallStatus,
  type GuideSection,
} from "./scholarshipBodySheet.ts";

export type { GuideSection } from "./scholarshipBodySheet.ts";

/** What a sheet says about one body. Null (or an empty list) means "said nothing". */
export type BodyInput = {
  name: string;
  /** The Countries cell as written, one name per entry; null when blank. */
  countries: string[] | null;
  region: string | null;
  covers: string[];
  academic_year: string | null;
  application_deadline: string | null;
  document_upload_deadline: string | null;
  courier_deadline: string | null;
  isee_threshold: string | null;
  ispe_threshold: string | null;
  stipend_amount: string | null;
  benefits: string | null;
  source_url: string | null;
  apply_url: string | null;
  call_status: CallStatus | null;
  call_expected_on: string | null;
  call_pdf_url: string | null;
  call_page_url: string | null;
  call_notes: string | null;
  /** The whole guide the row gives; null leaves the stored guide alone. */
  guide: GuideSection[] | null;
};

/** Trimmed, line endings made \n; null when nothing is left. */
function cleanText(value: string | undefined): string | null {
  const text = (value ?? "").replace(/\r\n?/g, "\n").trim();
  return text === "" ? null : text;
}

/**
 * A web address, or null.
 *
 * Only http and https. These cells become links on staff and student pages,
 * so anything else — a javascript: address above all — is refused rather than
 * stored; and "www.example.org" without its scheme would be a link to a page
 * of the portal itself.
 */
export function parseWebAddress(value: string | undefined, problems: RowProblem[], label: string): string | null {
  const raw = cleanText(value);
  if (raw === null) return null;
  let ok = /^https?:\/\/\S+$/i.test(raw);
  if (ok) {
    try {
      new URL(raw);
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    problems.push(`${label} "${raw}" is not a web address — write it in full, starting https://; left as it is`);
    return null;
  }
  return raw;
}

/** published / awaiting, or null. "Not published yet" is what the edit form calls awaiting, so it is read as that. */
export function parseCallStatus(value: string | undefined, problems: RowProblem[]): CallStatus | null {
  const raw = cleanText(value);
  if (raw === null) return null;
  const word = raw.toLowerCase().replace(/[\s_-]+/g, " ");
  if ((CALL_STATUSES as readonly string[]).includes(word)) return word as CallStatus;
  if (["not published", "not published yet", "not out", "not out yet"].includes(word)) return "awaiting";
  problems.push(`Call status "${raw}" is neither published nor awaiting — left as it is`);
  return null;
}

/**
 * The guide a row gives, from its "Guide N title" / "Guide N text" cells.
 *
 * Every guide cell blank: null, and the stored guide stays. Any filled in: the
 * filled pairs in order of N, which REPLACE the stored guide — so a pair that
 * is only half there (a title with no text, or the reverse) is reported and
 * the whole guide left alone, rather than replaced by a guide one section
 * short. Held to the edit form's limits for the same reason: that form trims
 * an over-long section, and a silent trim here would lose its end.
 */
export function guideFromRow(row: Record<string, string>, problems: RowProblem[]): GuideSection[] | null {
  const pairs = new Map<number, { title: string | null; text: string | null }>();
  for (const [key, value] of Object.entries(row)) {
    const guide = parseGuideKey(key);
    if (!guide) continue;
    const pair = pairs.get(guide.n) ?? { title: null, text: null };
    pair[guide.part] = cleanText(value);
    pairs.set(guide.n, pair);
  }

  const filled = [...pairs.entries()].filter(([, p]) => p.title || p.text).sort((a, b) => a[0] - b[0]);
  if (filled.length === 0) return null;

  const wrong: string[] = [];
  for (const [n, { title, text }] of filled) {
    if (!title) wrong.push(`Guide ${n} has text but no title`);
    else if (!text) wrong.push(`Guide ${n} ("${title}") has a title but no text`);
    if (title && title.length > GUIDE_LIMITS.title) {
      wrong.push(`Guide ${n} title is ${title.length} characters — at most ${GUIDE_LIMITS.title}`);
    }
    if (text && text.length > GUIDE_LIMITS.text) {
      wrong.push(`Guide ${n} text is ${text.length} characters — at most ${GUIDE_LIMITS.text}`);
    }
  }
  if (filled.length > GUIDE_LIMITS.sections) {
    wrong.push(`the guide has ${filled.length} sections — at most ${GUIDE_LIMITS.sections}`);
  }
  if (wrong.length > 0) {
    problems.push(`${wrong.join("; ")} — the guide was left as it is`);
    return null;
  }
  return filled.map(([, p]) => ({ title: p.title!, body: p.text! }));
}

/** Null when the row names no body at all. */
export function bodyFromRow(row: Record<string, string>, problems: RowProblem[]): BodyInput | null {
  const name = cleanText(row.name);
  if (!name) return null;

  const covers = splitCoversCell(row.universities_covered);
  // The edit form asks for the covered universities comma-separated, so a
  // sheet written the same way is likely. It still reads as one entry — some
  // university names carry a comma — but the preview says so.
  if (covers.length === 1 && covers[0].includes(",")) {
    problems.push(
      `Universities covered "${covers[0]}" was read as ONE university — separate universities with semicolons`
    );
  }
  const countries = splitList(row.countries);

  return {
    name,
    countries: countries.length > 0 ? countries : null,
    region: cleanText(row.region),
    covers,
    academic_year: cleanText(row.academic_year),
    application_deadline: cleanText(row.application_deadline),
    document_upload_deadline: cleanText(row.document_upload_deadline),
    courier_deadline: cleanText(row.courier_deadline),
    isee_threshold: cleanText(row.isee_threshold),
    ispe_threshold: cleanText(row.ispe_threshold),
    stipend_amount: cleanText(row.stipend_amount),
    benefits: cleanText(row.benefits),
    source_url: parseWebAddress(row.source_url, problems, "Source URL"),
    apply_url: parseWebAddress(row.apply_url, problems, "Apply URL"),
    call_status: parseCallStatus(row.call_status, problems),
    call_expected_on: parseDay(row.call_expected_on, problems, "Call expected on"),
    call_pdf_url: parseWebAddress(row.call_pdf_url, problems, "Call PDF URL"),
    call_page_url: parseWebAddress(row.call_page_url, problems, "Call page URL"),
    call_notes: cleanText(row.call_notes),
    guide: guideFromRow(row, problems),
  };
}

// ------------------------------------------------------------- countries

/** A destination as the Countries cell is matched against it. */
export type DestinationName = { id: string; display_name: string; country: string; country_code: string | null };

/** Lower case, accents gone, punctuation to spaces: "Italy (Public)" and "italy - public" agree. */
const placeKey = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * The destinations a Countries cell names.
 *
 * Each name is tried as a display name first ("Italy (Public)" — what the
 * export and the Lists sheet write, and the one spelling that is unique by
 * construction), then as a country ("Italy"), then as its code ("IT"). A
 * country or a code means every destination of that country: a body serves
 * the country, not one track of it (0172 linked both Italys for that reason).
 *
 * All or nothing. One name that is not a destination and the whole cell is
 * refused: the countries become exactly the cell, so applying the rest would
 * quietly drop whichever country was misspelt.
 */
export function resolveCountries(
  names: readonly string[],
  destinations: readonly DestinationName[]
): { ids: string[]; error?: undefined } | { error: string; ids?: undefined } {
  const ids = new Set<string>();
  const unknown: string[] = [];
  const ambiguous: string[] = [];

  for (const name of names) {
    const key = placeKey(name);
    if (!key) continue;
    let found = destinations.filter((d) => placeKey(d.display_name) === key);
    if (found.length > 1) {
      ambiguous.push(`"${name}" is the name of ${found.length} destinations`);
      continue;
    }
    if (found.length === 0) found = destinations.filter((d) => placeKey(d.country) === key);
    if (found.length === 0) found = destinations.filter((d) => (d.country_code ?? "").toLowerCase() === key);
    if (found.length === 0) unknown.push(name);
    for (const d of found) ids.add(d.id);
  }

  if (unknown.length > 0 || ambiguous.length > 0) {
    const parts: string[] = [];
    if (unknown.length > 0) {
      const quoted = unknown.map((n) => `"${n}"`).join(", ");
      const comma = unknown.some((n) => n.includes(",")) ? " (separate countries with semicolons, not commas)" : "";
      parts.push(
        unknown.length === 1
          ? `country ${quoted} is not a destination the portal has${comma}`
          : `countries ${quoted} are not destinations the portal has${comma}`
      );
    }
    parts.push(...ambiguous);
    return { error: parts.join("; ") };
  }
  if (ids.size === 0) return { error: "the Countries cell names no country" };
  return { ids: [...ids].sort() };
}

// ------------------------------------------------------------- names

/** Letters and digits only: "ER.GO", "ERGO" and "Er Go" are one body. */
const compactName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Every stored name this one is close to, one per distinct name — never the
 * name itself, which is a match rather than a near miss.
 *
 * isNearMiss, as for universities (a typo, word order, punctuation), and also
 * the same letters with different punctuation or spacing. Body names are
 * mostly acronyms, which isNearMiss reads as separate words: "ERGO" and
 * "ER.GO" are one body the office writes both ways.
 */
export function findSimilarBodyNames(name: string, storedNames: Iterable<string>): string[] {
  const key = normalizeName(name);
  const compact = compactName(name);
  const found = new Map<string, string>();
  for (const candidate of storedNames) {
    const candidateKey = normalizeName(candidate);
    if (candidateKey === key || found.has(candidateKey)) continue;
    if ((compact !== "" && compactName(candidate) === compact) || isNearMiss(name, candidate)) {
      found.set(candidateKey, candidate);
    }
  }
  return [...found.values()];
}

// ------------------------------------------------------------- the guide

/** A stored guide as comparable sections: title and body only, trimmed, \n line endings. */
export function normalizeGuide(value: unknown): GuideSection[] {
  if (!Array.isArray(value)) return [];
  const sections: GuideSection[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const title = cleanText(String((item as { title?: unknown }).title ?? ""));
    const body = cleanText(String((item as { body?: unknown }).body ?? ""));
    if (title && body) sections.push({ title, body });
  }
  return sections;
}

export function sameGuide(a: readonly GuideSection[], b: readonly GuideSection[]): boolean {
  return a.length === b.length && a.every((s, i) => s.title === b[i].title && s.body === b[i].body);
}

const sectionCount = (n: number) => `${n} section${n === 1 ? "" : "s"}`;

function quoteSome(titles: readonly string[]): string {
  const shown = titles.slice(0, 4).map((t) => `"${t}"`).join(", ");
  return titles.length > 4 ? `${shown} and ${titles.length - 4} more` : shown;
}

/**
 * One line for the preview saying what a replaced guide loses and gains.
 *
 * The line that matters most is "removes": a row with one guide pair filled in
 * replaces a ten-section guide with one section, which is what the rule says
 * and is exactly the kind of thing to see before applying.
 */
export function describeGuideChange(before: readonly GuideSection[], after: readonly GuideSection[]): string {
  const beforeTitles = before.map((s) => s.title);
  const afterTitles = after.map((s) => s.title);
  const removed = beforeTitles.filter((t) => !afterTitles.includes(t));
  const added = afterTitles.filter((t) => !beforeTitles.includes(t));
  const rewritten = after
    .filter((s) => {
      const old = before.find((b) => b.title === s.title);
      return old !== undefined && old.body !== s.body;
    })
    .map((s) => s.title);

  const parts = [`${sectionCount(before.length)} → ${sectionCount(after.length)}`];
  if (removed.length > 0) parts.push(`removes ${quoteSome(removed)}`);
  if (added.length > 0) parts.push(`adds ${quoteSome(added)}`);
  if (rewritten.length > 0) parts.push(`rewrites ${quoteSome(rewritten)}`);
  if (removed.length === 0 && added.length === 0 && rewritten.length === 0) parts.push("reorders the sections");
  return `guide replaced: ${parts.join("; ")}`;
}

// ------------------------------------------------------------- stored rows

/** A body as the import reads it back — every column it may change, and the destinations it serves. */
export type StoredBody = {
  id: string;
  name: string;
  region: string | null;
  covers: string[] | null;
  academic_year: string | null;
  application_deadline: string | null;
  document_upload_deadline: string | null;
  courier_deadline: string | null;
  isee_threshold: string | null;
  ispe_threshold: string | null;
  stipend_amount: string | null;
  benefits: string | null;
  source_url: string | null;
  apply_url: string | null;
  call_status: string | null;
  call_expected_on: string | null;
  call_pdf_url: string | null;
  call_page_url: string | null;
  call_notes: string | null;
  guide_sections: unknown;
  destinationIds: string[];
};

/** The select that reads a StoredBody's own columns (its destinations come from the link table). */
export const STORED_BODY_COLUMNS =
  "id, name, region, covers, academic_year, application_deadline, document_upload_deadline, courier_deadline, " +
  "isee_threshold, ispe_threshold, stipend_amount, benefits, source_url, apply_url, call_status, call_expected_on, " +
  "call_pdf_url, call_page_url, call_notes, guide_sections";

/** The columns an import may change, as mergeRow compares them. Name is the key, so it is not among them. */
export function bodyPatchFields(input: BodyInput): Record<string, Cell> {
  return {
    region: input.region,
    covers: input.covers,
    academic_year: input.academic_year,
    application_deadline: input.application_deadline,
    document_upload_deadline: input.document_upload_deadline,
    courier_deadline: input.courier_deadline,
    isee_threshold: input.isee_threshold,
    ispe_threshold: input.ispe_threshold,
    stipend_amount: input.stipend_amount,
    benefits: input.benefits,
    source_url: input.source_url,
    apply_url: input.apply_url,
    call_status: input.call_status,
    call_expected_on: input.call_expected_on,
    call_pdf_url: input.call_pdf_url,
    call_page_url: input.call_page_url,
    call_notes: input.call_notes,
  };
}

/**
 * The stored side of the comparison, trimmed the way a cell is.
 *
 * A value typed in with a trailing space long ago would otherwise differ from
 * the same value read back out of a spreadsheet — which trims — and every
 * clean round trip would "change" it.
 */
function storedCells(stored: StoredBody): Record<string, Cell> {
  const cells: Record<string, Cell> = {};
  for (const [field, value] of Object.entries(stored)) {
    if (field === "guide_sections" || field === "destinationIds") continue;
    cells[field] = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : (value as Cell);
  }
  cells.covers = (stored.covers ?? []).map((c) => c.trim());
  return cells;
}

/**
 * A complete row for a new body — every column, every time.
 *
 * PostgREST sends NULL for any key a row of a multi-row insert is missing, so
 * a column default never applies to a batch whose rows differ in shape (see
 * universityInsertValues). Every "said nothing" is resolved here instead: no
 * guide is an empty one, a call nobody described is published — the column's
 * own defaults — and an expected date survives only beside an awaited call.
 */
export function bodyInsertValues(input: BodyInput) {
  const call_status: CallStatus = input.call_status ?? "published";
  return {
    name: input.name,
    region: input.region,
    covers: input.covers,
    academic_year: input.academic_year ?? "",
    application_deadline: input.application_deadline,
    document_upload_deadline: input.document_upload_deadline,
    courier_deadline: input.courier_deadline,
    isee_threshold: input.isee_threshold,
    ispe_threshold: input.ispe_threshold,
    stipend_amount: input.stipend_amount,
    benefits: input.benefits,
    source_url: input.source_url,
    apply_url: input.apply_url,
    call_status,
    call_expected_on: call_status === "awaiting" ? input.call_expected_on : null,
    call_pdf_url: input.call_pdf_url,
    call_page_url: input.call_page_url,
    call_notes: input.call_notes,
    guide_sections: input.guide ?? [],
  };
}

export type BodyInsert = ReturnType<typeof bodyInsertValues>;

// ------------------------------------------------------------- the plan

export type BodyUpdate = {
  id: string;
  /** The stored name, which an update never changes. */
  name: string;
  /** Columns to write; empty when only the countries change. */
  patch: Record<string, Cell | GuideSection[]>;
  /** One line per changed column, old → new. */
  lines: string[];
  /** Null when the countries stay as they are. */
  countries: { add: string[]; remove: string[]; line: string } | null;
};

export type BodyCreate = { values: BodyInsert; destinationIds: string[]; line: string };

export type BodyPlan = {
  updates: BodyUpdate[];
  creates: BodyCreate[];
  unchanged: number;
  similarMatches: string[];
  heldBack: string[];
  problems: string[];
  /** True when no row named a body at all — the wrong file, most likely. */
  noNames: boolean;
};

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/**
 * Everything an upload would do, decided before anything is written — so the
 * preview and the apply are the same decisions, and differ only in whether
 * the writes are sent.
 *
 * `rows` have their keys normalised already (normalizeBodyRow).
 */
/**
 * The cells the importer checks that a stored value may still fail: the edit
 * form and the research run wrote some bodies before these rules existed.
 */
const CHECKED_URL_CELLS = ["source_url", "apply_url", "call_pdf_url", "call_page_url"] as const;

/**
 * The row with every checked cell that already says what the body on file
 * holds left blank.
 *
 * Blank changes nothing, and so does the same value — so the outcome is the
 * same either way, but only the blank passes the checks. Without this, an
 * untouched export reports every stored value the importer would refuse if
 * it were typed in fresh (a covered university written with commas, an
 * address with a note after it) as something wrong with the sheet, on every
 * round trip, for a cell nobody touched. A value that differs from the stored
 * one is still checked, and still refused.
 */
export function withoutAgreeingCells(row: Record<string, string>, body: StoredBody): Record<string, string> {
  const out = { ...row };
  const covers = (body.covers ?? []).map((c) => c.trim()).filter(Boolean);
  const listed = splitCoversCell(row.universities_covered);
  if (listed.length > 0 && listed.length === covers.length && listed.every((c, i) => c === covers[i])) {
    out.universities_covered = "";
  }
  for (const key of CHECKED_URL_CELLS) {
    const cell = cleanText(row[key]);
    if (cell !== null && cell === cleanText(body[key] ?? undefined)) out[key] = "";
  }
  return out;
}

export function planBodyImport(
  rows: readonly Record<string, string>[],
  { stored, destinations }: { stored: readonly StoredBody[]; destinations: readonly DestinationName[] }
): BodyPlan {
  const plan: BodyPlan = { updates: [], creates: [], unchanged: 0, similarMatches: [], heldBack: [], problems: [], noNames: false };
  const label = new Map(destinations.map((d) => [d.id, d.display_name]));
  const labels = (ids: readonly string[]) => ids.map((id) => label.get(id) ?? "(a destination no longer on file)").sort((a, b) => a.localeCompare(b));

  const byKey = new Map<string, StoredBody[]>();
  for (const body of stored) {
    const key = normalizeName(body.name);
    byKey.set(key, [...(byKey.get(key) ?? []), body]);
  }
  const storedNames = stored.map((b) => b.name);

  // The template's example, if nobody deleted it. Skipped and said so, rather
  // than added as a body called "Example scholarship body".
  const examples = rows.filter(isExampleBodyRow).length;
  if (examples > 0) {
    plan.problems.push(`Skipped ${examples} example row(s) from the template (${EXAMPLE_BODY}) — delete them from the sheet`);
  }

  const seen = new Set<string>();
  const targeted = new Map<string, string>();
  const newNames: string[] = [];
  let named = 0;
  let nameless = 0;

  for (const row of rows) {
    if (isExampleBodyRow(row)) continue;
    // A body on file by exactly this name: cells that repeat it are not checked
    // (withoutAgreeingCells). A merely similar name is somebody's edit, not an
    // untouched export, so every cell of it is.
    const onFile = byKey.get(normalizeName(cleanText(row.name) ?? "")) ?? [];
    const problems: string[] = [];
    const input = bodyFromRow(onFile.length === 1 ? withoutAgreeingCells(row, onFile[0]) : row, problems);
    if (!input) {
      if (Object.values(row).some((v) => (v ?? "").trim() !== "")) nameless += 1;
      continue;
    }
    named += 1;
    /** A problem with one of the row's cells. */
    const say = (problem: string) => plan.problems.push(`${input.name}: ${problem}`);
    /** A problem with the row as a whole. */
    const refuse = (why: string) => plan.problems.push(`"${input.name}" ${why}`);
    for (const problem of problems) say(problem);

    const key = normalizeName(input.name);
    if (seen.has(key)) {
      refuse("is on the sheet more than once — only its first row was read");
      continue;
    }
    seen.add(key);

    let countryIds: string[] | null = null;
    if (input.countries) {
      const resolved = resolveCountries(input.countries, destinations);
      if (resolved.error !== undefined) say(`${resolved.error} — its countries were left as they are`);
      else countryIds = resolved.ids;
    }

    // ------------------------------------------------ which body it is
    let target: StoredBody | undefined;
    const exact = byKey.get(key) ?? [];
    if (exact.length > 1) {
      plan.heldBack.push(
        `"${input.name}" is on file ${exact.length} times, so there is no telling which to change — delete the duplicate, then import again`
      );
      continue;
    }
    if (exact.length === 1) target = exact[0];
    else {
      const near = findSimilarBodyNames(input.name, storedNames);
      if (near.length > 1) {
        plan.heldBack.push(
          `"${input.name}" is close to ${near.map((n) => `"${n}"`).join(" and ")} — make the name match one of them exactly`
        );
        continue;
      }
      if (near.length === 1) {
        const candidates = byKey.get(normalizeName(near[0])) ?? [];
        if (candidates.length > 1) {
          plan.heldBack.push(
            `"${input.name}" is close to "${near[0]}", which is on file ${candidates.length} times — delete the duplicate, then import again`
          );
          continue;
        }
        target = candidates[0];
        plan.similarMatches.push(`"${input.name}" → updates "${target.name}"`);
      }
    }

    if (target) {
      const first = targeted.get(target.id);
      if (first !== undefined) {
        refuse(`is a second row for "${target.name}" (after "${first}") — only the first was read`);
        continue;
      }
      targeted.set(target.id, input.name);
      const update = planUpdate(target, input, countryIds, labels, say);
      if (update) plan.updates.push(update);
      else plan.unchanged += 1;
      continue;
    }

    // ------------------------------------------------ a new body
    // Two spellings of one new body in the same sheet would otherwise be
    // added as two bodies.
    const nearNew = findSimilarBodyNames(input.name, newNames);
    if (nearNew.length > 0) {
      plan.heldBack.push(
        `"${input.name}" is close to ${nearNew.map((n) => `"${n}"`).join(" and ")}, also new in this sheet — make the names match exactly if they are one body, or clearly different if they are two`
      );
      continue;
    }
    newNames.push(input.name);

    const missing: string[] = [];
    if (!input.academic_year) missing.push("an academic year");
    if (!countryIds) missing.push("at least one country");
    if (missing.length > 0) {
      refuse(`is new, and a new scholarship body needs ${missing.join(" and ")} — not added`);
      continue;
    }
    if (input.call_expected_on && input.call_status !== "awaiting") {
      say("Call expected on is only kept for a call that is awaiting — ignored");
    }
    const values = bodyInsertValues(input);
    const guide = values.guide_sections.length > 0 ? `, guide of ${sectionCount(values.guide_sections.length)}` : "";
    plan.creates.push({
      values,
      destinationIds: countryIds!,
      line: `${input.name} — new scholarship body for ${labels(countryIds!).join(", ")}${guide}`,
    });
  }

  if (nameless > 0) plan.problems.push(`${nameless} row(s) have no Name, so they were ignored`);
  plan.noNames = named === 0 && examples === 0;
  return plan;
}

/** What one row changes about one stored body; null when it changes nothing. */
function planUpdate(
  target: StoredBody,
  input: BodyInput,
  countryIds: string[] | null,
  labels: (ids: readonly string[]) => string[],
  say: (problem: string) => void
): BodyUpdate | null {
  const incoming = bodyPatchFields(input);

  // An expected date means something only for a call that is awaited — the
  // row's status if it gives one, else the stored one. The edit form drops it
  // silently; here it is said, since somebody typed it.
  const status = input.call_status ?? target.call_status ?? "published";
  if (input.call_expected_on && status !== "awaiting") {
    say("Call expected on is only kept for a call that is awaiting — ignored");
    incoming.call_expected_on = null;
  }

  const { patch, changes } = mergeRow(storedCells(target), incoming);
  const out: Record<string, Cell | GuideSection[]> = { ...patch };
  const lines = changes.map(describeChange);

  // A call moved to published loses the date it was expected on, as it does
  // in the edit form (readCallStatus): left behind, it reads as a second
  // deadline. Not a blank cell wiping a field — the status cell said so.
  if (patch.call_status === "published" && target.call_expected_on) {
    out.call_expected_on = null;
    lines.push(`call_expected_on ${target.call_expected_on} → — (the call is now published)`);
  }

  if (input.guide) {
    const before = normalizeGuide(target.guide_sections);
    if (!sameGuide(before, input.guide)) {
      out.guide_sections = input.guide;
      lines.push(describeGuideChange(before, input.guide));
    }
  }

  let countries: BodyUpdate["countries"] = null;
  if (countryIds && !sameSet(countryIds, target.destinationIds)) {
    countries = {
      add: countryIds.filter((id) => !target.destinationIds.includes(id)),
      remove: target.destinationIds.filter((id) => !countryIds.includes(id)),
      line: `countries ${labels(target.destinationIds).join("; ") || "—"} → ${labels(countryIds).join("; ")}`,
    };
  }

  if (Object.keys(out).length === 0 && !countries) return null;
  return { id: target.id, name: target.name, patch: out, lines, countries };
}

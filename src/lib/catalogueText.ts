// How the catalogue's free-text fields are read (0304).
//
// A Super Admin may write anything in any field of a university, a programme
// or a scholarship body: several coordinator emails, a level that is not one
// of the three, "Only for non-EU students" for whether there is an interview,
// "see the faculty page" for a link. Nothing is refused for its format. What
// this module decides is how each such value is READ — which parts of an
// email field get a mail link, whether a link field is safe to make a link
// of, which spellings of a level are the three that students are matched by.
//
// Pure, with relative imports only, so the unit tests (scripts/*-test.mjs)
// import it under plain Node and client components can use it too.

/** Room for a level written out in full ("Single-cycle master's degree in Medicine"). */
export const LEVEL_MAX = 80;
/** Room for several addresses and a note. */
export const EMAILS_MAX = 1000;
/** A short name typed in Setup. The automatic one still aims at 32 (finalizedStage.SHORT_NAME_MAX). */
export const TYPED_SHORT_NAME_MAX = 60;
/** A round's start or deadline in words, and a scholarship call's expected date. */
export const DATE_WORDS_MAX = 200;
/** "yes", "no", or a sentence about it. */
export const YES_NO_MAX = 500;

/** Runs of whitespace made one, ends trimmed; null when nothing is left. */
export function cleanLine(value: string | null | undefined): string | null {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

// ------------------------------------------------------------------ levels

/**
 * The three levels a student is matched to programmes by:
 * leads.level_applying_for is one of these, and suggested_programs() and
 * course_interest_options() compare it to programs.level exactly.
 */
export const STANDARD_LEVELS = ["bachelors", "masters", "phd"] as const;

/**
 * Spellings of the three that mean nothing else. A level written any of these
 * ways is stored as the standard one, so "Master's" still finds the students
 * applying for a master's. Ambiguous words — "postgraduate", which is a
 * master's or a doctorate — are left as typed.
 */
const LEVEL_SPELLINGS: [RegExp, (typeof STANDARD_LEVELS)[number]][] = [
  [/^(bachelors?|bachelor's|bachelors'|undergraduate|undergrad|bsc|b\.sc|ba|b\.a|bs|laurea|laurea triennale|first cycle|first-cycle)$/, "bachelors"],
  [/^(masters?|master's|masters'|msc|m\.sc|ma|m\.a|ms|mba|laurea magistrale|second cycle|second-cycle)$/, "masters"],
  [/^(phd|ph\.d|doctorate|doctoral|dottorato|dottorato di ricerca|third cycle|third-cycle)$/, "phd"],
];

/**
 * A level as it is stored: one of the three when it is a spelling of one,
 * otherwise exactly as typed (whitespace tidied). Null when blank.
 */
export function normalizeLevel(raw: string | null | undefined): string | null {
  const text = cleanLine(raw);
  if (text === null) return null;
  const bare = text.toLowerCase().replace(/[’‘`]/g, "'").replace(/\.$/, "").replace(/\s+degree$/, "");
  for (const [pattern, level] of LEVEL_SPELLINGS) if (pattern.test(bare)) return level;
  return text;
}

/** What two levels are compared by: "Foundation" and "foundation" are one level. */
export function levelKey(level: string | null | undefined): string {
  return (normalizeLevel(level) ?? "").toLowerCase();
}

/** Every level a list of programmes has, the three first in their order, the rest alphabetically. */
export function levelsPresent(levels: readonly (string | null | undefined)[]): string[] {
  const byKey = new Map<string, string>();
  for (const l of levels) {
    const level = normalizeLevel(l);
    if (level && !byKey.has(levelKey(level))) byKey.set(levelKey(level), level);
  }
  const standard = STANDARD_LEVELS.filter((l) => byKey.has(l));
  const others = [...byKey.entries()]
    .filter(([key]) => !(STANDARD_LEVELS as readonly string[]).includes(key))
    .map(([, level]) => level)
    .sort((a, b) => a.localeCompare(b));
  return [...standard, ...others];
}

// ----------------------------------------------------------------- yes / no

const YES = new Set(["yes", "y", "true", "1", "required"]);
const NO = new Set(["no", "n", "false", "0", "not required"]);

/**
 * A yes/no field: "yes" or "no" for any of the usual ways of saying so, words
 * as written for anything else ("Only for non-EU students"), null when blank.
 * A boolean — what the column held before 0304 — reads as yes or no.
 */
export function parseYesNoText(raw: string | boolean | null | undefined): string | null {
  if (typeof raw === "boolean") return raw ? "yes" : "no";
  const text = cleanLine(raw);
  if (text === null) return null;
  const lower = text.toLowerCase();
  if (YES.has(lower)) return "yes";
  if (NO.has(lower)) return "no";
  return text;
}

/** "Yes", "No", or the words; null when not known. */
export function yesNoLabel(value: string | boolean | null | undefined): string | null {
  const parsed = parseYesNoText(value);
  if (parsed === "yes") return "Yes";
  if (parsed === "no") return "No";
  return parsed;
}

// ------------------------------------------------------------------ emails

/** The parts of an email field: separated by commas, semicolons or line breaks. */
export function emailParts(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,;\n]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * An email field as it is stored: its parts joined by ", ", whatever
 * separated them — so "a@x.it; b@x.it" and "a@x.it,b@x.it" are stored alike
 * and an import does not see them as a change. Nothing is refused: a part
 * that is not an address ("see the faculty page") is kept as written.
 */
export function normalizeEmails(raw: string | null | undefined): string | null {
  const parts = emailParts(raw);
  return parts.length > 0 ? parts.join(", ") : null;
}

const ADDRESS = /^[^@\s<>"(),;:]+@[^@\s<>"(),;:]+\.[^@\s<>"(),;:]+$/;

/**
 * The address in one part of an email field, when it has one: "a@x.it", or
 * the address inside "Prof. Rossi <a@x.it>". Null for words.
 */
export function addressIn(part: string): string | null {
  const text = part.trim();
  if (ADDRESS.test(text)) return text;
  const bracketed = text.match(/<([^<>\s]+)>/);
  if (bracketed && ADDRESS.test(bracketed[1])) return bracketed[1];
  return null;
}

/** Every address in an email field, in order, for a "mail everyone" link. */
export function addressesIn(value: string | null | undefined): string[] {
  return emailParts(value)
    .map(addressIn)
    .filter((a): a is string => a !== null);
}

// ------------------------------------------------------------------- links

const SCHEMED = /^https?:\/\/[^\s<>"']+$/i;
const DOMAIN = /^(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(?:[/?#][^\s<>"']*)?$/i;

function parses(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Where a link field may safely point, or null when it should be shown as
 * text and not linked.
 *
 * A link field takes anything now (0304), and its value becomes an href on
 * staff and student pages — so this is the only thing that decides what is
 * clickable. Only http and https: a "javascript:" or "data:" value is text,
 * never a link. "www.unipv.it" and "unipv.it/admissions" get https:// in
 * front, because without a scheme a browser resolves them against the
 * portal's own address. Words with an address in them — "Apply at
 * https://x.it by March" — link to that address.
 */
export function linkHref(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (text === "") return null;
  if (SCHEMED.test(text)) return parses(text) ? text : null;
  if (!text.includes("@") && DOMAIN.test(text)) {
    const url = `https://${text}`;
    return parses(url) ? url : null;
  }
  const inside = text.match(/https?:\/\/[^\s<>"']+/i)?.[0].replace(/[.,;:)\]]+$/, "");
  return inside && parses(inside) ? inside : null;
}

// ------------------------------------------------------------------- lists

/**
 * A list typed into one field — intakes, the levels and fields a university
 * offers: separated by semicolons or line breaks, the way the sheets write
 * them. Commas are not separators: "Fall, from 2027" is one intake.
 */
export function splitTypedList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[;\n]+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

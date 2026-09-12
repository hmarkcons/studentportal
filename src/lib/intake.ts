// What "intake" means depends on the country, so the field has to as well.
//
// It was one free text box everywhere, and the two values in the database are
// "Fall 27" and "Fall 2027" — the same intake, typed twice, which no filter or
// report can group. But the right control is different per destination: Italy,
// France and Finland run a single intake a year, so there is nothing to choose
// but the year; Austria, Germany and Turkey run two, and a student is
// sometimes offered both; the UK runs several and the office wants to keep
// writing them out.
//
// So the shape is configured per destination (destinations.intake_mode and
// intake_options, migration 0170) and this module is the only place that knows
// how one is written down and read back. Kept out of the components because
// the register form, the registration edit form and each application all set
// the same field, and three spellings of "Fall 2027" is how it got here.

export type IntakeMode = "single" | "multi" | "free_text";

export function isIntakeMode(value: string): value is IntakeMode {
  return value === "single" || value === "multi" || value === "free_text";
}

/** Seasons in the order the destination lists them, never the tick order. */
function inConfiguredOrder(seasons: string[], options: string[]): string[] {
  return options.filter((o) => seasons.includes(o));
}

/**
 * The stored value: seasons, then the one year they share.
 *
 * "September/Fall 2027", or "Spring/Summer & Fall/Winter 2027" when a student
 * is offered both halves of a cycle. The year is written once because it is
 * one year — the office confirmed both ticked intakes always belong to the
 * same cycle — and repeating it made the value twice as long for no meaning.
 */
export function formatIntake(
  mode: IntakeMode,
  options: string[],
  seasons: string[],
  year: string,
  freeText = ""
): string {
  if (mode === "free_text") return freeText.trim();
  const ordered = inConfiguredOrder(seasons, options);
  if (ordered.length === 0 || !year.trim()) return "";
  return `${ordered.join(" & ")} ${year.trim()}`;
}

/**
 * Reads a stored value back into the widget's state.
 *
 * Lenient on purpose: it has to cope with what is already in the column,
 * typed by hand over the life of the system. Anything it cannot recognise is
 * handed back as free text rather than silently dropped — losing a student's
 * intake because it was spelled unusually would be worse than showing it in a
 * box.
 */
export function parseIntake(value: string | null | undefined, options: string[]): { seasons: string[]; year: string; freeText: string } {
  const raw = (value ?? "").trim();
  if (!raw) return { seasons: [], year: "", freeText: "" };

  const yearMatch = raw.match(/\b(\d{4})\b\s*$/);
  const year = yearMatch ? yearMatch[1] : "";
  const head = yearMatch ? raw.slice(0, yearMatch.index).trim() : raw;

  const parts = head
    .split(/\s*(?:&|,|\+|and)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);

  const matched = parts
    .map((p) => options.find((o) => o.toLowerCase() === p.toLowerCase()))
    .filter((o): o is string => Boolean(o));

  // Every part had to match a configured season, or this is not a value this
  // widget wrote and the text box is the honest place for it.
  if (matched.length > 0 && matched.length === parts.length && year) {
    return { seasons: inConfiguredOrder(matched, options), year, freeText: raw };
  }
  return { seasons: [], year: "", freeText: raw };
}

/** Why this cannot be saved yet, or null. */
export function intakeError(mode: IntakeMode, seasons: string[], year: string, _freeText = ""): string | null {
  if (mode === "free_text") return null;
  if (!year.trim()) return "Choose the intake year.";
  if (!/^\d{4}$/.test(year.trim())) return "The intake year should be four digits, like 2027.";
  if (seasons.length === 0) {
    return mode === "single" ? "This destination's intake is missing — set it up in Setup › Destinations." : "Tick at least one intake.";
  }
  return null;
}

/**
 * The years worth offering.
 *
 * One behind, because a registration is sometimes entered after the fact, and
 * four ahead, because students are signed up well before the cycle they are
 * aiming at.
 */
export function intakeYearChoices(today: Date = new Date()): string[] {
  const thisYear = Number(today.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }).slice(0, 4));
  const years: string[] = [];
  for (let y = thisYear - 1; y <= thisYear + 4; y++) years.push(String(y));
  return years;
}

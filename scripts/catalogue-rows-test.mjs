import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBool,
  parseDay,
  parseMoney,
  parseRoundsCell,
  programFromRow,
  resolveDestination,
  roundsFromRow,
  sameRounds,
  splitList,
  universityFromRow,
  programInsertValues,
  universityInsertValues,
} from "../src/lib/catalogueRows.ts";

const noProblems = () => [];

// ----------------------------------------------------------------- booleans

test("an empty boolean cell is null, not false", () => {
  // The rule the whole merge turns on. If this returns false, every import
  // silently switches interview_required off on every programme it touches.
  assert.equal(parseBool(""), null);
  assert.equal(parseBool(undefined), null);
  assert.equal(parseBool("   "), null);
});

test("yes and no are both opinions", () => {
  assert.equal(parseBool("yes"), true);
  assert.equal(parseBool("Y"), true);
  assert.equal(parseBool("TRUE"), true);
  assert.equal(parseBool("no"), false);
  assert.equal(parseBool("N"), false);
  assert.equal(parseBool("0"), false);
});

test("a word that is neither is not an instruction", () => {
  assert.equal(parseBool("maybe"), null);
  assert.equal(parseBool("tbc"), null);
});

// -------------------------------------------------------------------- money

test("a fee written for a human still parses", () => {
  assert.equal(parseMoney("3000", noProblems(), "fee"), 3000);
  assert.equal(parseMoney("€3,000", noProblems(), "fee"), 3000);
  assert.equal(parseMoney("3 000", noProblems(), "fee"), 3000);
  assert.equal(parseMoney("3000.50", noProblems(), "fee"), 3000.5);
});

test("an empty fee is null and silent", () => {
  const problems = [];
  assert.equal(parseMoney("", problems, "fee"), null);
  assert.deepEqual(problems, []);
});

test("a fee that is not a number is reported, not dropped", () => {
  // Reading "on request" as nothing looks identical to nobody filling it in.
  const problems = [];
  assert.equal(parseMoney("on request", problems, "tuition_fee"), null);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /tuition_fee "on request" is not a number/);
});

// --------------------------------------------------------------------- days

test("a real date passes, a wrong one is reported", () => {
  const problems = [];
  assert.equal(parseDay("2026-09-01", problems, "start_date"), "2026-09-01");
  assert.equal(parseDay("", problems, "start_date"), null);
  assert.deepEqual(problems, []);
  assert.equal(parseDay("01/09/2026", problems, "start_date"), null);
  assert.match(problems[0], /not a date this can read/);
});

// ------------------------------------------------------------------- rounds

test("several rounds in one cell", () => {
  const rounds = parseRoundsCell("Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|2026-09-15");
  assert.equal(rounds.length, 2);
  assert.deepEqual(rounds[0], {
    label: "Round 1", start_date: "2026-09-01", application_deadline: "2026-01-15", sort_order: 1,
  });
  assert.equal(rounds[1].label, "Round 2");
});

test("an unlabelled round is numbered", () => {
  const rounds = parseRoundsCell("|2026-09-01|; |2027-02-01|");
  assert.deepEqual(rounds.map((r) => r.label), ["Round 1", "Round 2"]);
});

test("a round with no dates at all is not a round", () => {
  assert.deepEqual(parseRoundsCell("Round 1||"), []);
  assert.deepEqual(parseRoundsCell(""), []);
});

test("the single-intake columns become Round 1 when rounds is empty", () => {
  const rounds = roundsFromRow({ start_date: "2026-09-01", application_deadline: "2026-01-15" }, []);
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].label, "Round 1");
});

test("rounds wins over the single-intake columns", () => {
  const rounds = roundsFromRow(
    { rounds: "Autumn|2026-09-01|2026-01-15", start_date: "2030-01-01", application_deadline: "2029-01-01" },
    []
  );
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].label, "Autumn");
  assert.equal(rounds[0].start_date, "2026-09-01");
});

test("a row saying nothing about rounds yields none, which means leave them alone", () => {
  assert.deepEqual(roundsFromRow({ name: "Computer Science", level: "bachelors" }, []), []);
});

// --------------------------------------------------------------- university

test("a university row reads its columns", () => {
  const uni = universityFromRow(
    { name: " Sapienza ", city: "Rome", region: "Lazio", type: "PUBLIC", levels_offered: "bachelors; masters", fields_offered: "Engineering" },
    "name",
    []
  );
  assert.equal(uni.name, "Sapienza");
  assert.equal(uni.city, "Rome");
  assert.equal(uni.type, "public");
  assert.deepEqual(uni.levels_offered, ["bachelors", "masters"]);
});

test("a university row with empty cells says nothing about them", () => {
  const uni = universityFromRow({ name: "Sapienza", city: "", type: "" }, "name", []);
  assert.equal(uni.city, null);
  assert.equal(uni.region, null);
  assert.equal(uni.type, null);
  assert.deepEqual(uni.levels_offered, []);
});

test("a nonsense type is reported rather than silently made public", () => {
  const problems = [];
  const uni = universityFromRow({ name: "Sapienza", type: "state-funded" }, "name", problems);
  assert.equal(uni.type, null);
  assert.match(problems[0], /neither public nor private/);
});

test("no name means no university", () => {
  assert.equal(universityFromRow({ name: "  ", city: "Rome" }, "name", []), null);
});

test("the combined sheet uses its own name column", () => {
  const uni = universityFromRow({ university_name: "Politecnico", program_name: "Architecture" }, "university_name", []);
  assert.equal(uni.name, "Politecnico");
});

// ------------------------------------------------------------------ program

test("a programme row reads its columns", () => {
  const program = programFromRow(
    { name: "Computer Science", level: "Bachelors", core_field: "IT/CS", interview_required: "no", tuition_fee: "3000", intake_dates: "Fall;Spring" },
    "name",
    []
  );
  assert.equal(program.name, "Computer Science");
  assert.equal(program.level, "bachelors");
  assert.equal(program.interview_required, false);
  assert.equal(program.tuition_fee, 3000);
  assert.deepEqual(program.intake_dates, ["Fall", "Spring"]);
});

test("a bad level is reported and the row withheld", () => {
  const problems = [];
  assert.equal(programFromRow({ name: "Computer Science", level: "undergrad" }, "name", problems), null);
  assert.match(problems[0], /must be bachelors, masters or phd/);
});

test("a level with no programme name is reported", () => {
  const problems = [];
  assert.equal(programFromRow({ name: "", level: "masters" }, "name", problems), null);
  assert.match(problems[0], /no programme name/);
});

test("a row with neither is simply not a programme, and says nothing", () => {
  // The university-only row of a combined sheet. Not an error.
  const problems = [];
  assert.equal(programFromRow({ university_name: "Sapienza" }, "program_name", problems), null);
  assert.deepEqual(problems, []);
});

// ------------------------------------------------------------ insert shapes

test("a created row carries every column, even the ones the sheet left blank", () => {
  // PostgREST takes the union of keys across a multi-row insert and sends NULL
  // for any a row omits, so column defaults never apply to a batch whose rows
  // differ in shape. A ragged payload put null into levels_offered (NOT NULL)
  // and failed the whole insert; on a nullable column it would have written
  // the nulls silently.
  const sparse = universityFromRow({ name: "Bocconi", city: "Milan" }, "name", []);
  const rich = universityFromRow(
    { name: "Sapienza", city: "Rome", region: "Lazio", type: "public", levels_offered: "bachelors;masters" },
    "name",
    []
  );
  const a = universityInsertValues(sparse, "dest-1", "private");
  const b = universityInsertValues(rich, "dest-1", "private");
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
});

test("a blank list column becomes an empty array, never null", () => {
  const sparse = universityFromRow({ name: "Bocconi", city: "Milan" }, "name", []);
  const row = universityInsertValues(sparse, "dest-1", "private");
  assert.deepEqual(row.levels_offered, []);
  assert.deepEqual(row.fields_offered, []);
});

test("a new university with no type takes the destination's track", () => {
  const sparse = universityFromRow({ name: "Bocconi", city: "Milan" }, "name", []);
  assert.equal(universityInsertValues(sparse, "dest-1", "private").type, "private");
  const stated = universityFromRow({ name: "Bocconi", city: "Milan", type: "public" }, "name", []);
  assert.equal(universityInsertValues(stated, "dest-1", "private").type, "public");
});

test("a created programme is rectangular too, and its booleans settle to no", () => {
  const sparse = programFromRow({ name: "Economics", level: "masters" }, "name", []);
  const rich = programFromRow(
    { name: "Computer Science", level: "bachelors", interview_required: "yes", tuition_fee: "3000" },
    "name",
    []
  );
  const a = programInsertValues(sparse, "uni-1");
  const b = programInsertValues(rich, "uni-1");
  assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
  // not null default false — there is no stored value to preserve on a new row.
  assert.equal(a.interview_required, false);
  assert.equal(a.admission_test_required, false);
  assert.equal(b.interview_required, true);
  assert.deepEqual(a.intake_dates, []);
  assert.equal(a.tuition_fee, null);
});

test("splitList trims and drops empties", () => {
  assert.deepEqual(splitList(" a ; ; b "), ["a", "b"]);
  assert.deepEqual(splitList(undefined), []);
});

// -------------------------------------------------------- rounds comparison

test("rounds that already match are not a change", () => {
  // Replacing rounds is a delete and re-insert, so a re-import of an unchanged
  // sheet would otherwise churn every row and fill the audit log.
  const stored = [
    { label: "Round 1", start_date: "2026-09-01", application_deadline: "2026-01-15" },
    { label: "Round 2", start_date: "2027-02-01", application_deadline: "2026-09-15" },
  ];
  const incoming = parseRoundsCell("Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|2026-09-15");
  assert.ok(sameRounds(stored, incoming));
});

test("order does not matter when comparing rounds", () => {
  const stored = [
    { label: "Round 2", start_date: "2027-02-01", application_deadline: null },
    { label: "Round 1", start_date: "2026-09-01", application_deadline: null },
  ];
  const incoming = parseRoundsCell("Round 1|2026-09-01|; Round 2|2027-02-01|");
  assert.ok(sameRounds(stored, incoming));
});

test("a changed date, a changed label or a different count all count", () => {
  const stored = [{ label: "Round 1", start_date: "2026-09-01", application_deadline: "2026-01-15" }];
  assert.equal(sameRounds(stored, parseRoundsCell("Round 1|2026-09-01|2026-02-15")), false);
  assert.equal(sameRounds(stored, parseRoundsCell("Autumn|2026-09-01|2026-01-15")), false);
  assert.equal(sameRounds(stored, parseRoundsCell("Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|")), false);
  assert.equal(sameRounds(stored, []), false);
});

// ------------------------------------------------------------ destinations

const DESTINATIONS = [
  { id: "it", display_name: "Italy (Public)", country: "Italy", country_code: "IT", track: "public" },
  { id: "uk", display_name: "United Kingdom (Private)", country: "United Kingdom", country_code: "UK", track: "private" },
  { id: "de", display_name: "Germany (Public)", country: "Germany", country_code: "DE", track: "public" },
];

test("a destination is found by its display name, its country or its code", () => {
  assert.equal(resolveDestination("Italy (Public)", DESTINATIONS).destination?.id, "it");
  assert.equal(resolveDestination("italy", DESTINATIONS).destination?.id, "it");
  assert.equal(resolveDestination("IT", DESTINATIONS).destination?.id, "it");
  assert.equal(resolveDestination("  united   kingdom ", DESTINATIONS).destination?.id, "uk");
});

test("the display name is forgiving about punctuation", () => {
  assert.equal(resolveDestination("Italy - Public", DESTINATIONS).destination?.id, "it");
  assert.equal(resolveDestination("ITALY PUBLIC", DESTINATIONS).destination?.id, "it");
});

test("a country that names two destinations is refused with both named, not guessed", () => {
  // Destinations are unique per country AND track. The day Italy gains a
  // private track, "Italy" means two things, and filing a row under the first
  // would put a private university on the public track.
  const both = [...DESTINATIONS, { id: "itp", display_name: "Italy (Private)", country: "Italy", country_code: "IT", track: "private" }];
  const result = resolveDestination("Italy", both);
  assert.equal(result.destination, undefined);
  assert.match(result.error, /"Italy \(Public\)" or "Italy \(Private\)"/);
  // ...while the full name still resolves.
  assert.equal(resolveDestination("Italy (Private)", both).destination?.id, "itp");
});

test("an unknown destination is refused, not silently dropped", () => {
  const result = resolveDestination("Narnia", DESTINATIONS);
  assert.equal(result.destination, undefined);
  assert.match(result.error, /Narnia/);
});

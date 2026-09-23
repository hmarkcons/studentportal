import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBool,
  parseDay,
  parseMoney,
  parseRoundsCell,
  programFromRow,
  roundsFromRow,
  sameRounds,
  splitList,
  universityFromRow,
  withoutBlanks,
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
  assert.match(problems[0], /not a YYYY-MM-DD date/);
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

test("creating a row drops the fields the sheet said nothing about", () => {
  // So the column default applies, instead of an explicit null overriding it.
  const out = withoutBlanks({ name: "X", city: null, region: "", levels_offered: [], type: "public", fee: 0 });
  assert.deepEqual(out, { name: "X", type: "public", fee: 0 });
});

test("false survives into a created row", () => {
  assert.deepEqual(withoutBlanks({ interview_required: false }), { interview_required: false });
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

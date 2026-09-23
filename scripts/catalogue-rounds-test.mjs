// Admission rounds in the catalogue import: the Rounds sheet, merging by name,
// the order the rest of the app depends on, and the export's compression.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRounds, orderRounds, parseDay, roundSpecFromRow } from "../src/lib/catalogueRows.ts";
import { roundRowsForUniversity } from "../src/lib/catalogueSheet.ts";

// -------------------------------------------------------------------- dates

test("a date may be written with its month as a word", () => {
  const problems = [];
  assert.equal(parseDay("15 Mar 2027", problems, "d"), "2027-03-15");
  assert.equal(parseDay("15 March 2027", problems, "d"), "2027-03-15");
  assert.equal(parseDay("March 15, 2027", problems, "d"), "2027-03-15");
  assert.equal(parseDay("1st Sept 2027", problems, "d"), "2027-09-01");
  assert.equal(parseDay("30 june 2027", problems, "d"), "2027-06-30");
  assert.equal(parseDay("2027-3-5", problems, "d"), "2027-03-05");
  assert.deepEqual(problems, []);
});

test("an impossible or ambiguous date is refused, not guessed", () => {
  // 03/04/2027 is the 3rd of April to the office and the 4th of March to an
  // American admissions page; a deadline read the wrong way is a month out
  // without looking wrong.
  const problems = [];
  assert.equal(parseDay("03/04/2027", problems, "d"), null);
  assert.equal(parseDay("03.04.2027", problems, "d"), null);
  assert.equal(parseDay("2027-02-30", problems, "d"), null);
  assert.equal(parseDay("15 Ma 2027", problems, "d"), null);
  assert.equal(problems.length, 4);
});

// ------------------------------------------------------ the Rounds sheet row

test("a Rounds row with no programme is a round for the whole university", () => {
  const problems = [];
  const spec = roundSpecFromRow(
    { university_name: "Sapienza", level: "", program_name: "", round: "1st call", application_deadline: "2027-03-15" },
    problems
  );
  assert.deepEqual(problems, []);
  assert.equal(spec.level, null);
  assert.equal(spec.programName, null);
  assert.deepEqual(spec.round, { label: "1st call", start_date: null, application_deadline: "2027-03-15" });
});

test("a Rounds row can narrow to a level, and leave its name for numbering", () => {
  const spec = roundSpecFromRow({ university_name: "Sapienza", level: "Masters", round: "", start_date: "1 Oct 2027" }, []);
  assert.equal(spec.level, "masters");
  assert.equal(spec.round.label, null);
  assert.equal(spec.round.start_date, "2027-10-01");
});

test("a Rounds row with no date, or a wrong level, is reported and not used", () => {
  const problems = [];
  assert.equal(roundSpecFromRow({ university_name: "Sapienza", round: "1st call" }, problems), null);
  assert.equal(
    roundSpecFromRow({ university_name: "Sapienza", level: "diploma", application_deadline: "2027-01-01" }, problems),
    null
  );
  assert.equal(problems.length, 2);
});

// ------------------------------------------------------------ merging

const TODAY = "2026-09-23";
const onFile = [
  { id: "r-2027", label: "September/Fall 2027", start_date: null, application_deadline: "2027-06-30", sort_order: 1 },
  { id: "r-2026", label: "September/Fall 2026", start_date: null, application_deadline: "2026-06-30", sort_order: 2 },
];

test("rounds that match what is on file change nothing, and keep their stored order", () => {
  const { rounds, changes } = mergeRounds(
    onFile,
    [
      { label: "september/fall 2026", start_date: null, application_deadline: "2026-06-30" },
      { label: "September/Fall 2027", start_date: null, application_deadline: "2027-06-30" },
    ],
    TODAY
  );
  assert.deepEqual(changes, []);
  assert.deepEqual(rounds.map((r) => r.id), ["r-2027", "r-2026"]);
});

test("a named round on file has its date updated and keeps its id", () => {
  // The id is the point: applications record their round, and replacing the
  // row would quietly unlink every one of them.
  const { rounds, changes } = mergeRounds(
    onFile,
    [{ label: "September/Fall 2027", start_date: null, application_deadline: "2027-07-15" }],
    TODAY
  );
  assert.deepEqual(changes, ['round "September/Fall 2027" deadline 2027-06-30 → 2027-07-15']);
  assert.equal(rounds.find((r) => r.id === "r-2027").application_deadline, "2027-07-15");
});

test("an empty date cell leaves the stored date alone", () => {
  const stored = [{ id: "a", label: "Round 1", start_date: "2027-10-01", application_deadline: "2027-03-15", sort_order: 1 }];
  const { rounds, changes } = mergeRounds(
    stored,
    [{ label: "Round 1", start_date: null, application_deadline: "2027-04-01" }],
    TODAY
  );
  assert.equal(changes.length, 1);
  assert.equal(rounds[0].start_date, "2027-10-01");
});

test("a new name is added, and a round the sheet does not mention is kept", () => {
  const { rounds, changes } = mergeRounds(
    onFile,
    [{ label: "1st call", start_date: null, application_deadline: "2027-03-15" }],
    TODAY
  );
  assert.deepEqual(changes, ['added round "1st call" (apply by 2027-03-15)']);
  assert.deepEqual(rounds.map((r) => r.label), ["1st call", "September/Fall 2027", "September/Fall 2026"]);
  assert.deepEqual(rounds.map((r) => r.sort_order), [1, 2, 3]);
  assert.equal(rounds.find((r) => r.label === "September/Fall 2026").id, "r-2026");
});

test("unnamed rounds are numbered in date order, from the first unused number", () => {
  const stored = [{ id: "a", label: "Round 1", start_date: null, application_deadline: "2027-01-15", sort_order: 1 }];
  const { rounds } = mergeRounds(
    stored,
    [
      { label: null, start_date: null, application_deadline: "2027-06-01" },
      { label: null, start_date: null, application_deadline: "2027-03-01" },
    ],
    TODAY
  );
  assert.deepEqual(
    rounds.map((r) => r.label + ":" + r.application_deadline),
    ["Round 1:2027-01-15", "Round 2:2027-03-01", "Round 3:2027-06-01"]
  );
});

test("an unnamed round with the dates of one on file is that round, not a new one", () => {
  const { changes } = mergeRounds(onFile, [{ label: null, start_date: null, application_deadline: "2027-06-30" }], TODAY);
  assert.deepEqual(changes, []);
});

test("one round given twice with different dates keeps the first and says so", () => {
  const { rounds, conflicts } = mergeRounds(
    [],
    [
      { label: "1st call", start_date: null, application_deadline: "2027-03-15" },
      { label: "1st Call", start_date: null, application_deadline: "2027-03-20" },
    ],
    TODAY
  );
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].application_deadline, "2027-03-15");
  assert.equal(conflicts.length, 1);
});

test("the same round from two scopes is one round, not a conflict", () => {
  // A university-wide row and a programme's own row may both name "1st call"
  // with the same date; that is agreement, not a clash.
  const same = { label: "1st call", start_date: null, application_deadline: "2027-03-15" };
  const { rounds, conflicts } = mergeRounds([], [same, { ...same }], TODAY);
  assert.equal(rounds.length, 1);
  assert.deepEqual(conflicts, []);
});

test("open rounds come first, soonest first; closed ones follow, most recent first", () => {
  // The first round is mirrored as the programme's deadline, which reminders
  // and the staff queue read. It must be the next one still open.
  const ordered = orderRounds(
    [
      { label: "old", start_date: null, application_deadline: "2025-06-30" },
      { label: "late", start_date: null, application_deadline: "2027-07-01" },
      { label: "recent", start_date: null, application_deadline: "2026-06-30" },
      { label: "next", start_date: null, application_deadline: "2027-03-15" },
      { label: "start only", start_date: "2027-05-01", application_deadline: null },
    ],
    TODAY
  );
  assert.deepEqual(ordered.map((r) => r.label), ["next", "start only", "late", "recent", "old"]);
});

// ---------------------------------------------------------- the export

const italyRounds = [
  { label: "September/Fall 2027", start_date: null, application_deadline: "2027-06-30", sort_order: 1 },
  { label: "September/Fall 2026", start_date: null, application_deadline: "2026-06-30", sort_order: 2 },
];

test("rounds every programme shares are written once, for the whole university", () => {
  // Italy: 341 programmes, two rounds each. 682 identical rows would bury the
  // one programme that differs.
  const rows = roundRowsForUniversity("Italy (Public)", "Sapienza", [
    { program: { level: "bachelors", name: "A" }, rounds: italyRounds },
    { program: { level: "masters", name: "B" }, rounds: italyRounds },
  ]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.level === "" && r.program_name === ""));
  assert.deepEqual(rows.map((r) => r.round), ["September/Fall 2027", "September/Fall 2026"]);
});

test("rounds shared within a level are written per level; the rest per programme", () => {
  const own = [{ label: "Late", start_date: null, application_deadline: "2027-08-31", sort_order: 1 }];
  const rows = roundRowsForUniversity("Italy (Public)", "Sapienza", [
    { program: { level: "masters", name: "B" }, rounds: italyRounds },
    { program: { level: "masters", name: "C" }, rounds: italyRounds },
    { program: { level: "bachelors", name: "A" }, rounds: own },
    { program: { level: "bachelors", name: "Z" }, rounds: italyRounds },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.level, r.program_name, r.round].join("/")),
    [
      "bachelors/A/Late",
      "bachelors/Z/September/Fall 2027",
      "bachelors/Z/September/Fall 2026",
      "masters//September/Fall 2027",
      "masters//September/Fall 2026",
    ]
  );
});

test("a programme with no rounds stops a university-wide row, so a round trip cannot hand it some", () => {
  const rows = roundRowsForUniversity("Italy (Public)", "Sapienza", [
    { program: { level: "masters", name: "B" }, rounds: italyRounds },
    { program: { level: "masters", name: "C" }, rounds: [] },
  ]);
  assert.ok(rows.length > 0 && rows.every((r) => r.program_name === "B"));
});

test("exported Rounds rows read back as rounds that change nothing", () => {
  // The round-trip property, for rounds: export, upload untouched, no-op.
  const rows = roundRowsForUniversity("Italy (Public)", "Sapienza", [
    { program: { level: "masters", name: "B" }, rounds: italyRounds },
  ]);
  const incoming = rows.map((r) => roundSpecFromRow(r, []).round);
  const stored = italyRounds.map((r, i) => ({ ...r, id: "r" + i }));
  assert.deepEqual(mergeRounds(stored, incoming, TODAY).changes, []);
});

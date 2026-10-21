import { test } from "node:test";
import assert from "node:assert/strict";
import { groupSuggestedProgrammes, countSuggested } from "../src/lib/suggestedGrouping.ts";

const p = (over) => ({
  program_id: over.program_id ?? `${over.university_id}-${over.program_name}`,
  program_name: over.program_name,
  level: over.level ?? "masters",
  core_field: over.core_field ?? null,
  field_group_name: over.field_group_name ?? "Engineering",
  university_id: over.university_id,
  university_name: over.university_name,
  destination_name: over.destination_name,
  is_backup: over.is_backup ?? false,
  matched_specific: over.matched_specific ?? false,
});

const SUGGESTIONS = [
  p({ university_id: "polimi", university_name: "Politecnico di Milano", program_name: "Data Science", destination_name: "Italy (Public)" }),
  p({ university_id: "polimi", university_name: "Politecnico di Milano", program_name: "Computer Science", destination_name: "Italy (Public)", matched_specific: true }),
  p({ university_id: "sapienza", university_name: "Sapienza University of Rome", program_name: "Computer Science", destination_name: "Italy (Public)" }),
  p({ university_id: "tum", university_name: "TU Munich", program_name: "Informatics", destination_name: "Germany (Public)" }),
  p({ university_id: "sorbonne", university_name: "Sorbonne", program_name: "Maths", destination_name: "France (Public)", is_backup: true }),
];
const REGISTERED = [
  { name: "Italy (Public)", isBackup: false },
  { name: "Germany (Public)", isBackup: false },
  { name: "France (Public)", isBackup: true },
];

test("one section per registered country, in the given order, primaries before the backup", () => {
  const groups = groupSuggestedProgrammes(SUGGESTIONS, REGISTERED);
  assert.deepEqual(groups.map((c) => [c.name, c.isBackup, c.count]), [
    ["Italy (Public)", false, 3],
    ["Germany (Public)", false, 1],
    ["France (Public)", true, 1],
  ]);
  assert.equal(countSuggested(groups), 5);
});

test("inside a country: universities alphabetical, a university's programmes kept together", () => {
  const italy = groupSuggestedProgrammes(SUGGESTIONS, REGISTERED)[0];
  assert.deepEqual(italy.universities.map((u) => u.name), ["Politecnico di Milano", "Sapienza University of Rome"]);
  assert.equal(italy.universities[0].programmes.length, 2);
  assert.equal(italy.universities[1].programmes.length, 1);
});

test("within a university, a specific-field match comes before a broader one, then by name", () => {
  const polimi = groupSuggestedProgrammes(SUGGESTIONS, REGISTERED)[0].universities[0];
  assert.deepEqual(
    polimi.programmes.map((p) => [p.program_name, p.matched_specific]),
    [["Computer Science", true], ["Data Science", false]]
  );
});

test("a registered country with no matches is still a section, empty, so it reads as considered", () => {
  const groups = groupSuggestedProgrammes(SUGGESTIONS, [...REGISTERED, { name: "Spain (Public)", isBackup: false }]);
  const spain = groups.find((c) => c.name === "Spain (Public)");
  assert.ok(spain);
  assert.equal(spain.count, 0);
  assert.deepEqual(spain.universities, []);
});

test("nothing at all suggested: every registered country shows as an empty section", () => {
  const groups = groupSuggestedProgrammes([], REGISTERED);
  assert.equal(groups.length, 3);
  assert.ok(groups.every((c) => c.count === 0 && c.universities.length === 0));
  assert.equal(countSuggested(groups), 0);
});

test("a suggestion for a country not on the registered list is shown last, never dropped", () => {
  const extra = p({ university_id: "uoa", university_name: "Athens", program_name: "Physics", destination_name: "Greece (Public)" });
  const groups = groupSuggestedProgrammes([...SUGGESTIONS, extra], REGISTERED);
  assert.equal(groups.at(-1).name, "Greece (Public)");
  assert.equal(groups.at(-1).count, 1);
  assert.equal(countSuggested(groups), 6);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChecklist, profileDerivedRequirements, reconcileDerived, templatesToSeed } from "../src/lib/documentChecklist.ts";
import { testLabel, needsCustomName, TEST_TYPE_LABELS } from "../src/lib/testScores.ts";

const SECTIONS = [
  { key: "admission", label: "Admission Documents" },
  { key: "attestation", label: "Attestation" },
  { key: "visa", label: "Visa Application Requirements" },
];

const DEST_SECTIONS = [
  { destination_id: null, section_key: "admission", sort_order: 10 },
  { destination_id: null, section_key: "visa", sort_order: 40 },
  { destination_id: "IT", section_key: "admission", sort_order: 10 },
  { destination_id: "IT", section_key: "attestation", sort_order: 30 },
  { destination_id: "IT", section_key: "visa", sort_order: 40 },
];

const tpl = (o) => ({
  id: o.id,
  destination_id: o.dest ?? null,
  category: o.cat,
  name: o.name,
  required: true,
  level: "all",
  sort_order: o.sort ?? 0,
});

const TEMPLATES = [
  tpl({ id: "s1", cat: "admission", name: "Passport copy", sort: 1 }),
  tpl({ id: "s2", cat: "visa", name: "Bank statement", sort: 1 }),
  tpl({ id: "i1", dest: "IT", cat: "attestation", name: "HEC attestation", sort: 1 }),
  tpl({ id: "i2", dest: "IT", cat: "admission", name: "Declaration of Value", sort: 2 }),
  tpl({ id: "o1", dest: "UK", cat: "visa", name: "TB certificate", sort: 1 }),
];

test("a destination checklist is its own items plus the shared ones", () => {
  const out = resolveChecklist({
    destinationId: "IT",
    sections: SECTIONS,
    destinationSections: DEST_SECTIONS,
    templates: TEMPLATES,
  });
  const admission = out.find((s) => s.key === "admission");
  assert.deepEqual(admission.items.map((i) => i.name), ["Passport copy", "Declaration of Value"]);
  // Another country's item never leaks in.
  assert.ok(!out.some((s) => s.items.some((i) => i.name === "TB certificate")));
});

test("shared items are marked as shared, own items are not", () => {
  const out = resolveChecklist({
    destinationId: "IT",
    sections: SECTIONS,
    destinationSections: DEST_SECTIONS,
    templates: TEMPLATES,
  });
  const admission = out.find((s) => s.key === "admission");
  assert.equal(admission.items.find((i) => i.name === "Passport copy").isShared, true);
  assert.equal(admission.items.find((i) => i.name === "Declaration of Value").isShared, false);
});

test("a destination can drop a shared item without affecting others", () => {
  const it = resolveChecklist({
    destinationId: "IT",
    sections: SECTIONS,
    destinationSections: DEST_SECTIONS,
    templates: TEMPLATES,
    excludedTemplateIds: ["s1"],
  });
  assert.ok(!it.find((s) => s.key === "admission").items.some((i) => i.id === "s1"));

  const uk = resolveChecklist({
    destinationId: "UK",
    sections: SECTIONS,
    destinationSections: [...DEST_SECTIONS, { destination_id: "UK", section_key: "admission", sort_order: 10 }],
    templates: TEMPLATES,
  });
  assert.ok(uk.find((s) => s.key === "admission").items.some((i) => i.id === "s1"), "UK still asks for it");
});

test("the All-destinations checklist shows only shared items", () => {
  const out = resolveChecklist({
    destinationId: null,
    sections: SECTIONS,
    destinationSections: DEST_SECTIONS,
    templates: TEMPLATES,
  });
  const names = out.flatMap((s) => s.items.map((i) => i.name)).sort();
  assert.deepEqual(names, ["Bank statement", "Passport copy"]);
  assert.ok(!out.some((s) => s.items.some((i) => i.isShared)), "nothing is inherited on the shared list itself");
});

test("a section with no items still appears, so items can be added to it", () => {
  const out = resolveChecklist({
    destinationId: "IT",
    sections: SECTIONS,
    destinationSections: [...DEST_SECTIONS, { destination_id: "IT", section_key: "scholarship_documents", sort_order: 50 }],
    templates: TEMPLATES,
  });
  const empty = out.find((s) => s.key === "scholarship_documents");
  assert.ok(empty, "an empty section is where the first item gets dropped");
  assert.deepEqual(empty.items, []);
});

test("sections come back in their configured order", () => {
  const out = resolveChecklist({
    destinationId: "IT",
    sections: SECTIONS,
    destinationSections: DEST_SECTIONS,
    templates: TEMPLATES,
  });
  assert.deepEqual(out.map((s) => s.key), ["admission", "attestation", "visa"]);
});

test("items honour sort_order, so an own item can sit between inherited ones", () => {
  const templates = [
    tpl({ id: "s1", cat: "admission", name: "Shared first", sort: 1 }),
    tpl({ id: "s2", cat: "admission", name: "Shared third", sort: 3 }),
    tpl({ id: "m1", dest: "IT", cat: "admission", name: "Mine second", sort: 2 }),
  ];
  const out = resolveChecklist({
    destinationId: "IT",
    sections: SECTIONS,
    destinationSections: DEST_SECTIONS,
    templates,
  });
  assert.deepEqual(out.find((s) => s.key === "admission").items.map((i) => i.name), [
    "Shared first",
    "Mine second",
    "Shared third",
  ]);
});

test("an unknown section key still renders rather than vanishing", () => {
  const out = resolveChecklist({
    destinationId: "IT",
    sections: [],
    destinationSections: [{ destination_id: "IT", section_key: "mystery", sort_order: 1 }],
    templates: [],
  });
  assert.equal(out[0].label, "mystery");
});

// --------------------------------------------------------- profile-derived

const QUALS = [
  { id: "q1", qualification_type: "high_school" },
  { id: "q2", qualification_type: "bachelors_4yr" },
];
const TESTS = [
  { id: "t1", test_type: "ielts" },
  { id: "t2", test_type: "other", custom_test_name: "NTS GAT" },
];

test("each qualification asks for its certificate and transcript separately", () => {
  const out = profileDerivedRequirements({
    qualifications: QUALS,
    testScores: [],
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  assert.deepEqual(out.map((r) => r.name), [
    "High School — certificate",
    "High School — transcript / marksheet",
    "Bachelors (4 years) — certificate",
    "Bachelors (4 years) — transcript / marksheet",
  ]);
  assert.ok(out.every((r) => r.category === "admission"));
});

test("each test score asks for its scorecard, named by the test", () => {
  const out = profileDerivedRequirements({
    qualifications: [],
    testScores: TESTS,
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  assert.deepEqual(out.map((r) => r.name), ["IELTS — scorecard", "NTS GAT — scorecard"]);
});

test("a student with nothing in their profile is asked for nothing derived", () => {
  const out = profileDerivedRequirements({
    qualifications: [],
    testScores: [],
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  assert.deepEqual(out, []);
});

test("travel and refusal history each add one row, and only when there is history", () => {
  const none = profileDerivedRequirements({
    qualifications: [],
    testScores: [],
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  assert.ok(!none.some((r) => r.category === "visa"), "never travelled means no stamps to ask for");

  const both = profileDerivedRequirements({
    qualifications: [],
    testScores: [],
    travelHistoryCount: 3,
    visaHistoryCount: 2,
  });
  assert.deepEqual(both.map((r) => r.name), [
    "Previous travel history — visas & stamps",
    "Previous refusal / deportation papers",
  ]);
  assert.ok(both.every((r) => r.category === "visa"));
  // Three trips is one row, not three.
  assert.equal(both.filter((r) => r.derivedKey === "profile:travel_history").length, 1);
});

test("derived keys are stable and unique, so re-seeding cannot duplicate", () => {
  const args = { qualifications: QUALS, testScores: TESTS, travelHistoryCount: 1, visaHistoryCount: 1 };
  const a = profileDerivedRequirements(args);
  const b = profileDerivedRequirements(args);
  assert.deepEqual(a.map((r) => r.derivedKey), b.map((r) => r.derivedKey));
  assert.equal(new Set(a.map((r) => r.derivedKey)).size, a.length);
});

// -------------------------------------------------------------- reconcile

test("only missing rows are inserted", () => {
  const wanted = profileDerivedRequirements({
    qualifications: QUALS,
    testScores: [],
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  const existing = [{ id: "d1", derived_key: "qualification:q1:certificate", file_path: null }];
  const { toInsert } = reconcileDerived(wanted, existing);
  assert.equal(toInsert.length, wanted.length - 1);
  assert.ok(!toInsert.some((r) => r.derivedKey === "qualification:q1:certificate"));
});

test("a requirement for a deleted qualification is removed when nothing was uploaded", () => {
  const existing = [{ id: "d1", derived_key: "qualification:gone:certificate", file_path: null }];
  assert.deepEqual(reconcileDerived([], existing).toDeleteIds, ["d1"]);
});

test("but a requirement carrying an uploaded file is never deleted", () => {
  // The student sent that document in; removing the row puts the file out of
  // reach. Editing a qualification must not destroy evidence.
  const existing = [{ id: "d1", derived_key: "qualification:gone:certificate", file_path: "abc/def.pdf" }];
  const { toDeleteIds, keptWithFileIds } = reconcileDerived([], existing);
  assert.deepEqual(toDeleteIds, []);
  assert.deepEqual(keptWithFileIds, ["d1"]);
});

test("rows that are not derived at all are left completely alone", () => {
  // Manually added requirements and template-backed ones carry no derived_key.
  const existing = [{ id: "m1", derived_key: null, file_path: null }];
  const { toInsert, toDeleteIds } = reconcileDerived([], existing);
  assert.deepEqual(toDeleteIds, []);
  assert.deepEqual(toInsert, []);
});

// ------------------------------------------------------------- test types

test("CEnT-S and GMAT are offered", () => {
  assert.equal(TEST_TYPE_LABELS.cent_s, "CEnT-S");
  assert.equal(TEST_TYPE_LABELS.gmat, "GMAT");
});

test("only 'other' asks for a test name", () => {
  assert.equal(needsCustomName("other"), true);
  for (const t of ["ielts", "gmat", "cent_s", "sat", "toefl"]) assert.equal(needsCustomName(t), false, t);
});

test("an other test is labelled by what staff typed, never as the word Other", () => {
  assert.equal(testLabel("other", "NTS GAT"), "NTS GAT");
  assert.equal(testLabel("other", "  "), "Other test", "a blank name must not produce an unnamed requirement");
  assert.equal(testLabel("other", null), "Other test");
  assert.equal(testLabel("ielts"), "IELTS");
});

// --------------------------------------------------- cross-country repeats

const seed = (o) => ({
  id: o.id,
  destination_id: o.dest ?? null,
  category: o.cat,
  name: o.name,
  sort_order: o.sort ?? 0,
});

test("a document two countries both ask for is seeded once", () => {
  // Germany and Italy each carry their own HEC attestation row; the student
  // hands in one piece of paper.
  const out = templatesToSeed(
    [
      seed({ id: "de", dest: "DE", cat: "attestation", name: "Bachelor's degree and transcript attested from HEC Pakistan" }),
      seed({ id: "it", dest: "IT", cat: "attestation", name: "Bachelor's degree and transcript attested from HEC Pakistan" }),
    ],
    []
  );
  assert.equal(out.length, 1);
});

test("the shared copy wins over a destination's own", () => {
  const out = templatesToSeed(
    [
      seed({ id: "it", dest: "IT", cat: "visa", name: "Visa application form", sort: 1 }),
      seed({ id: "shared", cat: "visa", name: "Visa application form", sort: 9 }),
    ],
    []
  );
  // Even though the destination copy sorts first, the shared row is the one
  // that stays applicable if the student drops that destination.
  assert.deepEqual(out.map((o) => o.id), ["shared"]);
});

test("the same name in a different section is NOT a repeat", () => {
  // The Visa section has its own Photo alongside Admission's photographs: a
  // photo for the consulate is not the photo for the university.
  const out = templatesToSeed(
    [
      seed({ id: "a", cat: "admission", name: "Photo" }),
      seed({ id: "v", cat: "visa", name: "Photo" }),
    ],
    []
  );
  assert.equal(out.length, 2);
});

test("nothing is seeded for a document the student is already asked for", () => {
  const out = templatesToSeed(
    [seed({ id: "de", dest: "DE", cat: "attestation", name: "IBCC attestation" })],
    [{ category: "attestation", label: "IBCC attestation" }]
  );
  assert.deepEqual(out, []);
});

test("a manually added requirement counts as already asked", () => {
  // Staff typed it in by hand; seeding must not add the template copy beside it.
  const out = templatesToSeed(
    [seed({ id: "t", cat: "visa", name: "Travel insurance" })],
    [{ category: "visa", label: "Travel insurance" }]
  );
  assert.deepEqual(out, []);
});

test("matching ignores case and stray whitespace", () => {
  const out = templatesToSeed(
    [seed({ id: "t", cat: "visa", name: "  travel   INSURANCE " })],
    [{ category: "visa", label: "Travel insurance" }]
  );
  assert.deepEqual(out, []);
});

test("genuinely different documents in one section all get seeded", () => {
  const out = templatesToSeed(
    [
      seed({ id: "1", cat: "visa", name: "Travel insurance", sort: 1 }),
      seed({ id: "2", cat: "visa", name: "Bank statement", sort: 2 }),
      seed({ id: "3", cat: "visa", name: "Police clearance", sort: 3 }),
    ],
    []
  );
  assert.deepEqual(out.map((o) => o.id), ["1", "2", "3"]);
});

test("rows with no name cannot suppress a real requirement", () => {
  // A nameless row (none should exist now) must not match everything.
  const out = templatesToSeed(
    [seed({ id: "t", cat: "visa", name: "Travel insurance" })],
    [{ category: "visa", label: null }, { category: null, label: null }]
  );
  assert.equal(out.length, 1);
});

test("the choice is deterministic, whatever order the templates arrive in", () => {
  const a = [
    seed({ id: "x", dest: "DE", cat: "attestation", name: "IBCC attestation", sort: 2 }),
    seed({ id: "y", dest: "IT", cat: "attestation", name: "IBCC attestation", sort: 1 }),
  ];
  const first = templatesToSeed(a, []);
  const second = templatesToSeed([...a].reverse(), []);
  assert.deepEqual(first.map((o) => o.id), second.map((o) => o.id));
});

// ------------------------------------------ the institution on the label
test("a qualification's document names the school it is from", () => {
  // "Secondary School — certificate" says what kind of document is wanted and
  // nothing about which one. The profile has always carried institution_name;
  // it simply was not used here.
  const wanted = profileDerivedRequirements({
    qualifications: [
      { id: "q1", qualification_type: "secondary_school", institution_name: "Beaconhouse School System" },
      { id: "q2", qualification_type: "high_school", institution_name: "Punjab College" },
      { id: "q3", qualification_type: "bachelors_4yr", institution_name: "University of the Punjab" },
    ],
    testScores: [],
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  const names = wanted.map((w) => w.name);
  assert.ok(names.includes("Secondary School — certificate — Beaconhouse School System"), names.join(" | "));
  assert.ok(names.includes("High School — transcript / marksheet — Punjab College"));
  assert.ok(names.includes("Bachelors (4 years) — certificate — University of the Punjab"));
});

test("a qualification with no institution recorded keeps its old wording", () => {
  const wanted = profileDerivedRequirements({
    qualifications: [{ id: "q1", qualification_type: "secondary_school", institution_name: "   " }],
    testScores: [],
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  assert.deepEqual(
    wanted.map((w) => w.name),
    ["Secondary School — certificate", "Secondary School — transcript / marksheet"]
  );
});

test("a test scorecard is not given an institution", () => {
  // A scorecard comes from the test board, not a school.
  const wanted = profileDerivedRequirements({
    qualifications: [],
    testScores: [{ id: "t1", test_type: "ielts" }],
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  assert.equal(wanted.length, 1);
  assert.ok(!wanted[0].name.includes(" — ") || wanted[0].name.endsWith("scorecard"), wanted[0].name);
});

test("renaming the school renames the requirement instead of retiring it", () => {
  // The key is the qualification's id, so correcting a spelling must not
  // retire the row and take the uploaded certificate out of reach.
  const before = profileDerivedRequirements({
    qualifications: [{ id: "q1", qualification_type: "secondary_school", institution_name: "Beconhouse" }],
    testScores: [],
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  const after = profileDerivedRequirements({
    qualifications: [{ id: "q1", qualification_type: "secondary_school", institution_name: "Beaconhouse" }],
    testScores: [],
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  assert.deepEqual(
    before.map((b) => b.derivedKey),
    after.map((a) => a.derivedKey),
    "the identity must not depend on the name"
  );

  const existing = before.map((b, i) => ({
    id: `d${i}`,
    derived_key: b.derivedKey,
    file_path: "s/cert.pdf",
    custom_name: b.name,
  }));
  const result = reconcileDerived(after, existing);
  assert.equal(result.toDeleteIds.length, 0, "nothing is retired");
  assert.equal(result.toInsert.length, 0, "nothing is duplicated");
  assert.deepEqual(
    result.toRename.map((r) => r.name),
    after.map((a) => a.name)
  );
});

test("a row whose label already matches is left alone", () => {
  const wanted = profileDerivedRequirements({
    qualifications: [{ id: "q1", qualification_type: "secondary_school", institution_name: "Beaconhouse" }],
    testScores: [],
    travelHistoryCount: 0,
    visaHistoryCount: 0,
  });
  const existing = wanted.map((w, i) => ({
    id: `d${i}`,
    derived_key: w.derivedKey,
    file_path: null,
    custom_name: w.name,
  }));
  assert.deepEqual(reconcileDerived(wanted, existing).toRename, []);
});

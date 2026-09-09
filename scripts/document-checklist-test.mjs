import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChecklist, profileDerivedRequirements, reconcileDerived } from "../src/lib/documentChecklist.ts";
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

import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChecklist, profileDerivedRequirements, reconcileDerived, templatesToSeed, visaRefusalRequirementName, isVisaRefusalKey, isPreviousVisaKey, isHistoryDocumentKey, previousVisaRequirementName, tripDates, studentTracks, trackFits, isTrackScope, TRACK_SCOPES } from "../src/lib/documentChecklist.ts";
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
    travel: [],
    visaRefusals: [],
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
    travel: [],
    visaRefusals: [],
  });
  assert.deepEqual(out.map((r) => r.name), ["IELTS — scorecard", "NTS GAT — scorecard"]);
});

test("a student with nothing in their profile is asked for nothing derived", () => {
  const out = profileDerivedRequirements({
    qualifications: [],
    testScores: [],
    travel: [],
    visaRefusals: [],
  });
  assert.deepEqual(out, []);
});

const REFUSALS = [
  { id: "r-uk", country: "UK", type: "refusal", date: "2024-03-12", reason: "Funds not shown" },
  { id: "r-it", country: "Italy", type: "refusal", date: "2025-08-15", reason: null },
  { id: "r-ae", country: "UAE", type: "deportation", date: null, reason: null },
];

const TRIPS = [
  { id: "t-ae1", country: "UAE", purpose: "Tourism", from_date: "2026-08-04", to_date: "2026-08-20" },
  { id: "t-ae2", country: "UAE", purpose: "Family", from_date: "2025-01-02", to_date: "2025-01-09" },
  { id: "t-th", country: "Thailand", purpose: null, from_date: "2026-10-15", to_date: "2026-10-19" },
  { id: "t-tr", country: "Turkey", purpose: "Tourism", from_date: null, to_date: null },
];

test("a student who never travelled and was never refused is asked for nothing of the kind", () => {
  const none = profileDerivedRequirements({ qualifications: [], testScores: [], travel: [], visaRefusals: [] });
  assert.ok(!none.some((r) => r.category === "visa"));
});

test("each trip asks for its own visa in the visa section, named by country and dates, two trips to one country as two", () => {
  const out = profileDerivedRequirements({ qualifications: [], testScores: [], travel: TRIPS, visaRefusals: [] });
  assert.deepEqual(out.map((r) => [r.derivedKey, r.name]), [
    ["previous_visa:t-ae1", "Previous visa — UAE, 4–20 Aug 2026"],
    ["previous_visa:t-ae2", "Previous visa — UAE, 2–9 Jan 2025"],
    ["previous_visa:t-th", "Previous visa — Thailand, 15–19 Oct 2026"],
    ["previous_visa:t-tr", "Previous visa — Turkey"],
  ]);
  assert.ok(out.every((r) => r.category === "visa" && r.required && isPreviousVisaKey(r.derivedKey) && isHistoryDocumentKey(r.derivedKey)));
});

test("a trip's dates are said as briefly as they can be, and a date that cannot be read is left out", () => {
  assert.equal(tripDates("2026-08-04", "2026-08-20"), "4–20 Aug 2026");
  assert.equal(tripDates("2026-07-28", "2026-08-03"), "28 Jul – 3 Aug 2026");
  assert.equal(tripDates("2025-12-28", "2026-01-03"), "28 Dec 2025 – 3 Jan 2026");
  assert.equal(tripDates("2026-08-04", "2026-08-04"), "4 Aug 2026");
  assert.equal(tripDates("2026-08-04", null), "from 4 Aug 2026");
  assert.equal(tripDates("", "2026-08-20"), "until 20 Aug 2026");
  assert.equal(tripDates("2026-13-01", "soon"), null);
  assert.equal(previousVisaRequirementName({ country: "  Saudi Arabia ", from_date: "2024-03-01", to_date: "2024-03-15" }), "Previous visa — Saudi Arabia, 1–15 Mar 2024");
  assert.equal(previousVisaRequirementName({ country: "", from_date: "2024-03-01", to_date: null }), "Previous visa — from 1 Mar 2024");
  assert.equal(previousVisaRequirementName({ country: null }), "Previous visa");
  // The visa type rides with the country, in brackets.
  assert.equal(previousVisaRequirementName({ country: "UAE", visa_type: "student", from_date: "2026-08-04", to_date: "2026-08-20" }), "Previous visa — UAE (Student), 4–20 Aug 2026");
  assert.equal(previousVisaRequirementName({ country: "Turkey", visa_type: "tourist" }), "Previous visa — Turkey (Tourist)");
  // Other is named from visa_type_other; a blank name falls back to the country alone.
  assert.equal(previousVisaRequirementName({ country: "France", visa_type: "other", visa_type_other: "Schengen C" }), "Previous visa — France (Schengen C)");
  assert.equal(previousVisaRequirementName({ country: "France", visa_type: "other", visa_type_other: "  " }), "Previous visa — France");
  // No visa type at all: the pre-visa-type wording stands.
  assert.equal(previousVisaRequirementName({ country: "UAE", from_date: "2026-08-04", to_date: "2026-08-20" }), "Previous visa — UAE, 4–20 Aug 2026");
});

test("a trip corrected on the profile renames its visa and keeps it; one taken off goes only if nothing was sent", () => {
  const before = [
    { id: "d-ae1", derived_key: "previous_visa:t-ae1", file_path: "s/d-ae1/visa.pdf", custom_name: "Previous visa — UAE, 4–20 Aug 2026" },
    { id: "d-th", derived_key: "previous_visa:t-th", file_path: null, custom_name: "Previous visa — Thailand, 15–19 Oct 2026" },
    // The one row the travel history used to raise, still empty: it goes.
    { id: "d-old", derived_key: "profile:travel_history", file_path: null, custom_name: "Previous travel history — visas & stamps" },
  ];
  const wanted = profileDerivedRequirements({
    qualifications: [],
    testScores: [],
    travel: [{ ...TRIPS[0], to_date: "2026-08-22" }, TRIPS[1]],
    visaRefusals: [],
  });
  const r = reconcileDerived(wanted, before);
  assert.deepEqual(r.toInsert.map((x) => x.derivedKey), ["previous_visa:t-ae2"]);
  assert.deepEqual(r.toRename, [{ id: "d-ae1", name: "Previous visa — UAE, 4–22 Aug 2026" }]);
  assert.deepEqual(r.toDeleteIds.sort(), ["d-old", "d-th"]);
});

test("each refusal or deportation asks for its own letter in the visa section, named by country and date", () => {
  const out = profileDerivedRequirements({ qualifications: [], testScores: [], travel: [TRIPS[3]], visaRefusals: REFUSALS });
  assert.deepEqual(out.map((r) => [r.derivedKey, r.name]), [
    ["previous_visa:t-tr", "Previous visa — Turkey"],
    ["visa_refusal:r-uk", "Visa refusal letter — UK, 12 Mar 2024"],
    ["visa_refusal:r-it", "Visa refusal letter — Italy, 15 Aug 2025"],
    ["visa_refusal:r-ae", "Deportation papers — UAE"],
  ]);
  assert.ok(out.every((r) => r.category === "visa" && r.required));
  assert.ok(out.slice(1).every((r) => isVisaRefusalKey(r.derivedKey) && isHistoryDocumentKey(r.derivedKey)) && !isVisaRefusalKey("previous_visa:t-tr"));
});

test("a refusal's letter is named with what is known, and never prints a date it cannot read", () => {
  assert.equal(visaRefusalRequirementName({ country: "  Schengen (France) ", type: "refusal", date: "2023-01-05" }), "Visa refusal letter — Schengen (France), 5 Jan 2023");
  assert.equal(visaRefusalRequirementName({ country: "", type: "refusal", date: "2023-01-05" }), "Visa refusal letter — 5 Jan 2023");
  assert.equal(visaRefusalRequirementName({ country: null, type: null, date: null }), "Visa refusal letter");
  assert.equal(visaRefusalRequirementName({ country: "UK", type: "refusal", date: "2023-13-05" }), "Visa refusal letter — UK");
  assert.equal(visaRefusalRequirementName({ country: "UK", type: "refusal", date: "last year" }), "Visa refusal letter — UK");
  assert.equal(visaRefusalRequirementName({ country: "Canada", type: "deportation", date: "2019-11-30" }), "Deportation papers — Canada, 30 Nov 2019");
  // The visa type leads the refusal letter, so staff know which one to chase.
  assert.equal(visaRefusalRequirementName({ country: "UK", type: "refusal", visa_type: "student", date: "2024-03-12" }), "Student visa refusal letter — UK, 12 Mar 2024");
  assert.equal(visaRefusalRequirementName({ country: "Italy", type: "refusal", visa_type: "work" }), "Work visa refusal letter — Italy");
  assert.equal(visaRefusalRequirementName({ country: "France", type: "refusal", visa_type: "other", visa_type_other: "Schengen C" }), "Schengen C visa refusal letter — France");
  // A blank Other name falls back to the plain wording.
  assert.equal(visaRefusalRequirementName({ country: "France", type: "refusal", visa_type: "other", visa_type_other: "" }), "Visa refusal letter — France");
  // A deportation is not a visa, so its type never leads the papers.
  assert.equal(visaRefusalRequirementName({ country: "UAE", type: "deportation", visa_type: "work" }), "Deportation papers — UAE");
});

test("one refusal listed twice is one letter, and a refusal with no id still has a key of its own", () => {
  const out = profileDerivedRequirements({
    qualifications: [],
    testScores: [],
    travel: [],
    visaRefusals: [REFUSALS[0], { ...REFUSALS[0] }, { country: "Spain", type: "refusal", date: "2022-06-01" }, { country: "Spain", type: "refusal", date: "2022-06-01" }],
  });
  assert.equal(out.length, 2);
  assert.equal(new Set(out.map((r) => r.derivedKey)).size, 2);
});

test("a refusal corrected on the profile renames its letter and keeps it; one taken off goes only if nothing was sent", () => {
  const before = [
    { id: "d-uk", derived_key: "visa_refusal:r-uk", file_path: "s/d-uk/letter.pdf", custom_name: "Visa refusal letter — UK, 12 Mar 2024" },
    { id: "d-it", derived_key: "visa_refusal:r-it", file_path: null, custom_name: "Visa refusal letter — Italy, 15 Aug 2025" },
    { id: "d-ae", derived_key: "visa_refusal:r-ae", file_path: "s/d-ae/papers.pdf", custom_name: "Deportation papers — UAE" },
  ];
  // The UK date corrected; Italy and UAE taken off the profile.
  const wanted = profileDerivedRequirements({
    qualifications: [],
    testScores: [],
    travel: [],
    visaRefusals: [{ ...REFUSALS[0], date: "2024-03-21" }],
  });
  const r = reconcileDerived(wanted, before);
  assert.deepEqual(r.toInsert, []);
  assert.deepEqual(r.toRename, [{ id: "d-uk", name: "Visa refusal letter — UK, 21 Mar 2024" }]);
  assert.deepEqual(r.toDeleteIds, ["d-it"]);
  assert.deepEqual(r.keptWithFileIds, ["d-ae"]);
});

test("derived keys are stable and unique, so re-seeding cannot duplicate", () => {
  const args = { qualifications: QUALS, testScores: TESTS, travel: TRIPS, visaRefusals: REFUSALS };
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
    travel: [],
    visaRefusals: [],
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
    travel: [],
    visaRefusals: [],
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
    travel: [],
    visaRefusals: [],
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
    travel: [],
    visaRefusals: [],
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
    travel: [],
    visaRefusals: [],
  });
  const after = profileDerivedRequirements({
    qualifications: [{ id: "q1", qualification_type: "secondary_school", institution_name: "Beaconhouse" }],
    testScores: [],
    travel: [],
    visaRefusals: [],
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
    travel: [],
    visaRefusals: [],
  });
  const existing = wanted.map((w, i) => ({
    id: `d${i}`,
    derived_key: w.derivedKey,
    file_path: null,
    custom_name: w.name,
  }));
  assert.deepEqual(reconcileDerived(wanted, existing).toRename, []);
});

// -------------------------------------------------------- university track

const ITALY = { id: "it", track: "public" };
const UK = { id: "uk", track: "private" };

test("before any application, a country's own track is the student's track there", () => {
  const tracks = studentTracks({ destinations: [ITALY, UK], applications: [] });
  assert.deepEqual([...tracks.byDestination.get("it")], ["public"]);
  assert.deepEqual([...tracks.byDestination.get("uk")], ["private"]);
  assert.deepEqual([...tracks.any].sort(), ["private", "public"]);
});

test("a private university under Italy (Public) puts the student on Italy's private track, and only that", () => {
  const tracks = studentTracks({ destinations: [ITALY], applications: [{ destinationId: "it", type: "private", stage: "documents_pending" }] });
  assert.ok(trackFits("private", "it", tracks), "Bocconi's deposit is asked for");
  assert.ok(!trackFits("public", "it", tracks), "no public university in sight");
  assert.ok(trackFits("all", "it", tracks) && trackFits(undefined, "it", tracks) && trackFits(null, "it", tracks));
});

test("applying to a public and a private university is both tracks", () => {
  const tracks = studentTracks({
    destinations: [ITALY],
    applications: [
      { destinationId: "it", type: "public", stage: "application_submitted" },
      { destinationId: "it", type: "private", stage: "documents_pending" },
    ],
  });
  assert.ok(trackFits("public", "it", tracks) && trackFits("private", "it", tracks));
});

test("a rejected, declined or withdrawn application no longer counts, and the country's track stands again", () => {
  for (const stage of ["rejected", "declined", "withdrawn"]) {
    const tracks = studentTracks({ destinations: [ITALY], applications: [{ destinationId: "it", type: "private", stage }] });
    assert.ok(!trackFits("private", "it", tracks), stage);
    assert.ok(trackFits("public", "it", tracks), stage);
  }
});

test("each country is on its own track: a private application in the UK says nothing about Italy", () => {
  const tracks = studentTracks({ destinations: [ITALY, UK], applications: [{ destinationId: "uk", type: "private" }] });
  assert.ok(!trackFits("private", "it", tracks));
  assert.ok(trackFits("public", "it", tracks));
  assert.ok(trackFits("private", "uk", tracks) && !trackFits("public", "uk", tracks));
  // A shared requirement asks whether the student is on that track anywhere.
  assert.ok(trackFits("private", null, tracks) && trackFits("public", null, tracks));
});

test("a shared requirement counts an application in a country the student has not listed", () => {
  const tracks = studentTracks({ destinations: [ITALY], applications: [{ destinationId: "fr", type: "private" }] });
  assert.ok(trackFits("private", null, tracks));
  assert.ok(!trackFits("private", "it", tracks));
  assert.ok(!trackFits("private", "fr", tracks), "a country not on their checklist asks nothing of them");
});

test("a student with no country and no application is asked only what is for both", () => {
  const tracks = studentTracks({ destinations: [], applications: [] });
  assert.ok(trackFits("all", null, tracks));
  assert.ok(!trackFits("public", null, tracks) && !trackFits("private", null, tracks));
});

test("an application whose university has no type known adds no track", () => {
  const tracks = studentTracks({ destinations: [ITALY], applications: [{ destinationId: "it", type: null }] });
  assert.deepEqual([...tracks.byDestination.get("it")], ["public"]);
});

test("the builder offers exactly both, public and private, and accepts nothing else", () => {
  assert.deepEqual(TRACK_SCOPES.map((s) => s.value), ["all", "public", "private"]);
  assert.equal(TRACK_SCOPES[0].label, "Public and private");
  assert.equal(TRACK_SCOPES[0].badge, null, "a requirement for both is not labelled");
  assert.ok(isTrackScope("all") && isTrackScope("public") && isTrackScope("private"));
  assert.ok(!isTrackScope("Private") && !isTrackScope("") && !isTrackScope(null) && !isTrackScope("both"));
});

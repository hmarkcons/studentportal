// The accompanying family (0350): who comes with the student, their fees, how
// registration reads them, what an agreement takes, and how the payment chart
// shows them.
import test from "node:test";
import assert from "node:assert/strict";
import {
  agreementFamily,
  familyFee,
  familyForAgreement,
  familyKindOf,
  familyWords,
  parseFamily,
} from "../src/lib/accompanyingFamily.ts";
import { REFERENCE_THEME, familyFeeParts, themedFeeRows } from "../src/lib/pdf/agreementTheme.ts";

const form = (fields) => {
  const m = new Map(Object.entries(fields));
  return { has: (k) => m.has(k), get: (k) => (m.has(k) ? m.get(k) : null) };
};

// ------------------------------------------------------------------ arithmetic and words

test("the family's fee is each spouse and each child at their fee", () => {
  assert.equal(familyFee({ spouses: 1, children: 2, spouseFee: 500, childFee: 250 }), 1000);
  assert.equal(familyFee({ spouses: 2, children: 0, spouseFee: 500, childFee: 250 }), 1000);
  assert.equal(familyFee(null), 0);
});

test("the family in words, and its kind", () => {
  assert.equal(familyWords({ spouses: 1, children: 2 }), "1 spouse and 2 children");
  assert.equal(familyWords({ spouses: 2, children: 0 }), "2 spouses");
  assert.equal(familyWords({ spouses: 0, children: 1 }), "1 child");
  assert.equal(familyWords({ spouses: 0, children: 0 }), "");
  assert.deepEqual([familyKindOf(0, 0), familyKindOf(1, 0), familyKindOf(1, 3), familyKindOf(0, 2)], ["none", "spouse", "spouse_children", "children"]);
});

// ------------------------------------------------------------------ registration

test("registration: no family fields posted leaves what is on file alone", () => {
  assert.equal(parseFamily(form({ discount_amount: "0" })), null);
});

test("registration: each kind reads only its own counts and fees", () => {
  assert.deepEqual(parseFamily(form({ family_kind: "none", spouse_count: "2" })), { spouse_count: 0, children_count: 0, spouse_fee: null, child_fee: null });
  assert.deepEqual(parseFamily(form({ family_kind: "spouse", spouse_count: "1", spouse_fee: "", children_count: "3" })), {
    spouse_count: 1,
    children_count: 0,
    spouse_fee: null,
    child_fee: null,
  });
  assert.deepEqual(parseFamily(form({ family_kind: "spouse_children", spouse_count: "1", spouse_fee: "450", children_count: "2", child_fee: "200.5" })), {
    spouse_count: 1,
    children_count: 2,
    spouse_fee: 450,
    child_fee: 200.5,
  });
  assert.deepEqual(parseFamily(form({ family_kind: "children", children_count: "3", spouse_count: "2" })), {
    spouse_count: 0,
    children_count: 3,
    spouse_fee: null,
    child_fee: null,
  });
});

test("registration: counts out of range, half a child or a negative fee are refused", () => {
  for (const bad of [
    { family_kind: "spouse", spouse_count: "0" },
    { family_kind: "spouse", spouse_count: "5" },
    { family_kind: "children", children_count: "1.5" },
    { family_kind: "children", children_count: "11" },
    { family_kind: "spouse", spouse_count: "1", spouse_fee: "-1" },
    { family_kind: "cousins" },
  ]) {
    assert.ok("error" in parseFamily(form(bad)), JSON.stringify(bad));
  }
});

// ------------------------------------------------------------------ the agreement takes it

const SWEDEN = { allows_dependants: true, spouse_fee: 500, child_fee: 250 };

test("an agreement takes the family with the student's own fee, else the country's", () => {
  assert.deepEqual(familyForAgreement({ spouse_count: 1, children_count: 2, spouse_fee: null, child_fee: 200 }, SWEDEN), {
    spouse_count: 1,
    children_count: 2,
    spouse_fee: 500,
    child_fee: 200,
  });
});

test("no family on an agreement for a country without it, a backup country's, or a visa-only one", () => {
  const lead = { spouse_count: 1, children_count: 1 };
  const none = { spouse_count: 0, children_count: 0, spouse_fee: null, child_fee: null };
  assert.deepEqual(familyForAgreement(lead, { allows_dependants: false, spouse_fee: 500, child_fee: 250 }), none);
  assert.deepEqual(familyForAgreement(lead, SWEDEN, { isBackup: true }), none);
  assert.deepEqual(familyForAgreement(lead, SWEDEN, { visaOnly: true }), none);
  assert.deepEqual(familyForAgreement({ spouse_count: 0, children_count: 0 }, SWEDEN), none);
});

test("an agreement's family read back; none when it carries nobody", () => {
  assert.deepEqual(agreementFamily({ spouse_count: 2, children_count: 0, spouse_fee: "500.00", child_fee: null }), { spouses: 2, children: 0, spouseFee: 500, childFee: 250 });
  assert.equal(agreementFamily({ spouse_count: 0, children_count: 0 }), null);
  assert.equal(agreementFamily(null), null);
});

// ------------------------------------------------------------------ the payment chart

const family = { spouses: 1, children: 2, spouseFee: 500, childFee: 250 };
const fee = (over) => ({ currencySymbol: "€", adminCharge: 300, consultancyFee: 1800, discount: 0, isBackup: false, destinationLabel: "Sweden (Public)", ...over });

test("chart, one payment: the student's fee and a row per family fee, adding up to the total", () => {
  // 1800 for the student + 1000 for the family, in one payment; 300 admin.
  const rows = themedFeeRows(fee({ installmentAmounts: [2800], total: 3100, family }), REFERENCE_THEME.fee);
  const values = rows.filter((r) => !r.total).map((r) => r.value);
  assert.deepEqual(values, [300, 1800, 500, 500]);
  assert.equal(values.reduce((a, b) => a + b, 0), rows.at(-1).value, "the rows add up to the total");
  assert.ok(rows.some((r) => /Spouse \(1 × (€500|500 €)\)/.test(r.label)), "the spouse row, in the theme's money format");
  assert.ok(rows.some((r) => /Children \(2 × (€250|250 €)\)/.test(r.label)));
});

test("chart, instalments: the family is inside them and said on the total, not counted twice", () => {
  const rows = themedFeeRows(fee({ installmentAmounts: [1400, 1400], total: 3100, family }), REFERENCE_THEME.fee);
  const values = rows.filter((r) => !r.total).map((r) => r.value);
  assert.deepEqual(values, [300, 1400, 1400]);
  assert.equal(values.reduce((a, b) => a + b, 0), rows.at(-1).value);
  assert.match(rows.at(-1).note, /accompanying 1 spouse \(1 × (€500|500 €)\) and 2 children \(2 × (€250|250 €)\), spread over the instalments/);
});

test("chart: a discount and the family are both said on the total", () => {
  const rows = themedFeeRows(fee({ installmentAmounts: [1300, 1300], discount: 200, total: 2900, family }), REFERENCE_THEME.fee);
  assert.match(rows.at(-1).note, /discount of (€200|200 €).*\. Includes the consultancy fee for the accompanying/);
});

test("chart: no family, no change — and a backup or visa-only agreement never shows one", () => {
  assert.deepEqual(familyFeeParts(fee({ installmentAmounts: [1800], total: 2100 }), String), { studentFee: null, rows: [], note: null });
  assert.deepEqual(familyFeeParts(fee({ installmentAmounts: [0], total: 300, isBackup: true, family }), String), { studentFee: null, rows: [], note: null });
  assert.deepEqual(familyFeeParts(fee({ installmentAmounts: [500], total: 500, isVisaOnly: true, family }), String), { studentFee: null, rows: [], note: null });
});

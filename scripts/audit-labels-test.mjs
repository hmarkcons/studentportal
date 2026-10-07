// The audit log (0322) as it reads: what a table and a field are called, what
// a record is called, how a value shows, and one event's fields before, after
// and now — with what has changed again since, and which button it offers.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  auditTab,
  actionWord,
  changedFields,
  eventActions,
  eventFields,
  fieldLabel,
  formatValue,
  idsIn,
  recordLabel,
  sameValue,
  tableLabel,
} from "../src/lib/auditLabels.ts";

test("a table is named as one of its records, and an unknown one is spelled from its name", () => {
  assert.equal(tableLabel("leads"), "Student");
  assert.equal(tableLabel("invoice_installments"), "Installment");
  assert.equal(tableLabel("some_new_table"), "Some new table");
});

test("a field reads as words: ids, stamps and files lose their suffix, acronyms stay capitals", () => {
  assert.equal(fieldLabel("assigned_counselor_id"), "Counsellor");
  assert.equal(fieldLabel("university_id"), "University");
  assert.equal(fieldLabel("verified_at"), "Verified");
  assert.equal(fieldLabel("verified_by"), "Verified by");
  assert.equal(fieldLabel("cnic"), "CNIC");
  assert.equal(fieldLabel("pkr_per_eur"), "PKR per EUR");
  assert.equal(fieldLabel("is_current"), "Current");
  assert.equal(fieldLabel("proof_of_payment_path"), "Proof of payment (file)");
  assert.equal(fieldLabel("student_code"), "Student ID");
});

test("a record is called by its name, title or subject — or, with none, by what it is", () => {
  assert.equal(recordLabel("leads", { full_name: "Ayesha Khan", email: "a@x.pk" }), "Ayesha Khan");
  assert.equal(recordLabel("student_documents", { custom_name: null, category: "passport" }), "passport");
  assert.equal(recordLabel("invoice_installments", { installment_no: 2, amount: 500 }), "Installment 2");
  assert.equal(recordLabel("agreements", { version: 3 }), "Agreement v3");
  assert.equal(recordLabel("student_travel_checks", { student_id: "x", item_id: "y" }), "Travel checklist tick");
  assert.equal(recordLabel("lead_remarks", { body: "x".repeat(200) }).length, 78, "a long remark is cut");
  assert.equal(recordLabel("leads", null), "Student");
});

test("a value shows as a person reads it", () => {
  assert.equal(formatValue(null), "—");
  assert.equal(formatValue(""), "—");
  assert.equal(formatValue(true), "Yes");
  assert.equal(formatValue(false), "No");
  assert.equal(formatValue(["counselor", "admin"]), "counselor, admin");
  assert.equal(formatValue([]), "—");
  assert.equal(formatValue("2026-10-08"), "Oct 8, 2026", "a date stays the day stored, whatever the timezone");
  assert.equal(formatValue("2026-10-08T07:30:00+00:00"), "Oct 8, 2026, 12:30 PM", "a timestamp in Karachi");
  assert.equal(formatValue({ a: 1 }), '{\n  "a": 1\n}');
  const names = new Map([["0b1c2d3e-0000-4000-8000-000000000001", "Ayesha Khan"]]);
  assert.equal(formatValue("0b1c2d3e-0000-4000-8000-000000000001", names), "Ayesha Khan", "an id is named");
  assert.equal(formatValue("words", names), "words");
});

test("JSON is compared by content, not by the order of its keys", () => {
  assert.ok(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }));
  assert.ok(!sameValue({ a: 1 }, { a: 2 }));
  assert.ok(sameValue(null, undefined), "absent and null are the same nothing");
  assert.ok(!sameValue("1", 1));
});

test("an edit's fields: as recorded, or worked out for one logged before they were", () => {
  assert.deepEqual(changedFields({ a: 1 }, { a: 2 }, ["a", "updated_at"]), ["a"]);
  assert.deepEqual(changedFields({ a: 1, b: 1, updated_at: "x" }, { a: 1, b: 2, updated_at: "y" }, null), ["b"]);
  assert.deepEqual(changedFields(null, { a: 1 }, null), []);
});

const before = { id: "r1", full_name: "Old Name", status: "new", phone: "1", updated_at: "a" };
const after = { id: "r1", full_name: "New Name", status: "contacted", phone: "1", updated_at: "b" };

test("an edit shows what it changed: before, after and now — and what has changed again since", () => {
  const now = { ...after, status: "registered" };
  const rows = eventFields({ action: "UPDATE", before, after, now, changed: ["full_name", "status"] });
  assert.deepEqual(rows.map((r) => r.key), ["full_name", "status"]);
  const status = rows.find((r) => r.key === "status");
  assert.equal(status.before, "new");
  assert.equal(status.after, "contacted");
  assert.equal(status.now, "registered");
  assert.equal(status.changedSince, true, "changed again since: reverting would undo that too");
  assert.equal(rows.find((r) => r.key === "full_name").changedSince, false);

  const every = eventFields({ action: "UPDATE", before, after, now, changed: ["full_name", "status"], all: true });
  assert.deepEqual(every.map((r) => r.key), ["id", "full_name", "status", "phone"], "every field, without the clock");
  assert.equal(every.find((r) => r.key === "phone").changed, false);
});

test("a deletion shows the record as it was; once it is back, how it compares", () => {
  const gone = eventFields({ action: "DELETE", before, after: null, now: null });
  assert.deepEqual(gone.map((r) => r.key), ["id", "full_name", "status", "phone"]);
  assert.ok(gone.every((r) => r.now === undefined && !r.changedSince), "nothing to compare with while it is gone");
  const back = eventFields({ action: "DELETE", before, after: null, now: { ...before, phone: "2" } });
  assert.equal(back.find((r) => r.key === "phone").changedSince, true);
});

test("a column added since the event is shown too, as it is now", () => {
  const rows = eventFields({ action: "INSERT", before: null, after: { id: "r1", name: "A" }, now: { id: "r1", name: "A", short_name: "AU" } });
  assert.deepEqual(rows.map((r) => r.key), ["id", "name", "short_name"]);
});

test("each event offers the one way back that fits where its record is now", () => {
  assert.deepEqual(eventActions("UPDATE", true, true), { revert: true, restore: false, remove: false });
  assert.deepEqual(eventActions("UPDATE", false, true), { revert: false, restore: false, remove: false }, "deleted since: restore first");
  assert.deepEqual(eventActions("DELETE", false, true), { revert: false, restore: true, remove: false });
  assert.deepEqual(eventActions("DELETE", true, true), { revert: false, restore: false, remove: false }, "already back");
  assert.deepEqual(eventActions("INSERT", true, true), { revert: false, restore: false, remove: true });
  assert.deepEqual(eventActions("RESTORE", true, true), { revert: false, restore: false, remove: true });
  assert.deepEqual(eventActions("DELETE", false, false), { revert: false, restore: false, remove: false }, "logged before keys were kept");
});

test("a revert and a taking-back say so", () => {
  assert.equal(actionWord("UPDATE"), "Edited");
  assert.equal(actionWord("UPDATE", "e1"), "Reverted");
  assert.equal(actionWord("DELETE", "e1"), "Taken back");
  assert.equal(actionWord("RESTORE", "e1"), "Restored");
});

test("ids in a record are found for naming, its own id left alone", () => {
  const u = "0b1c2d3e-0000-4000-8000-000000000001";
  const v = "0b1c2d3e-0000-4000-8000-000000000002";
  assert.deepEqual(idsIn([{ id: "0b1c2d3e-0000-4000-8000-000000000009", assigned_counselor_id: u, tags: [v, "x"], n: 3 }, null]), [u, v]);
});

test("an unknown tab is the first", () => {
  assert.equal(auditTab("staff").kind, "staff");
  assert.equal(auditTab("nonsense").key, "students");
  assert.equal(auditTab(undefined).key, "students");
});

test("one action is one line, led by the person's own record", async () => {
  const { groupByChange, countsByKind } = await import("../src/lib/auditLabels.ts");
  const rows = [
    { id: "d1", action_type: "DELETE", entity_type: "student_documents", txid: 7 },
    { id: "d2", action_type: "DELETE", entity_type: "student_documents", txid: 7 },
    { id: "l", action_type: "DELETE", entity_type: "leads", txid: 7 },
    { id: "a", action_type: "DELETE", entity_type: "applications", txid: 7 },
    { id: "u", action_type: "UPDATE", entity_type: "leads", txid: 6 },
    { id: "o1", action_type: "UPDATE", entity_type: "applications", txid: null },
    { id: "o2", action_type: "UPDATE", entity_type: "applications", txid: null },
  ];
  const groups = groupByChange(rows);
  assert.deepEqual(groups.map((g) => g.main.id), ["l", "u", "o1", "o2"], "a logged-before-txid row stands alone");
  assert.deepEqual(groups[0].rest.map((r) => r.id), ["d1", "d2", "a"]);
  assert.equal(countsByKind(["Document", "Application", "Document", "Intake cycle", "Document"]), "Document × 3, Application, Intake cycle");
});

// The remark on a lead (0306): how it is stored, when saving changes nothing,
// and how an import's column is read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REMARK_MAX, normalizeRemark, remarkChanged, remarkError, remarkFromRow, remarkWhen } from "../src/lib/leadRemarks.ts";

test("a remark is stored with its ends trimmed and its line breaks made one kind", () => {
  assert.equal(normalizeRemark("  Wants Italy\r\nCall after Eid  "), "Wants Italy\nCall after Eid");
  assert.equal(normalizeRemark(null), "");
});

test("the same words again are not a new version; clearing one is", () => {
  assert.equal(remarkChanged("Wants Italy", " Wants Italy \n"), false);
  assert.equal(remarkChanged("Wants Italy", "Wants Italy, budget tight"), true);
  assert.equal(remarkChanged("Wants Italy", ""), true, "clearing it is a version of its own");
  assert.equal(remarkChanged(null, ""), false, "an empty box over no remark writes nothing");
});

test("a remark longer than the database holds is refused, saying by how much", () => {
  assert.equal(remarkError("x".repeat(REMARK_MAX)), null);
  assert.match(remarkError("x".repeat(REMARK_MAX + 1)) ?? "", /4,001 characters — keep it to 4,000/);
});

test("an import's remark is read from a column called remarks, remark, notes or comments", () => {
  assert.equal(remarkFromRow({ full_name: "Ali", remarks: " Wants Italy " }), "Wants Italy");
  assert.equal(remarkFromRow({ full_name: "Ali", Remark: "Call later" }), "Call later");
  assert.equal(remarkFromRow({ full_name: "Ali", Notes: "Budget tight" }), "Budget tight");
  assert.equal(remarkFromRow({ full_name: "Ali" }), "");
  assert.equal(remarkFromRow({ remarks: "x".repeat(REMARK_MAX + 50) }).length, REMARK_MAX);
});

test("when a version was written reads in Karachi's time", () => {
  assert.equal(remarkWhen("2026-10-02T10:15:00Z"), "2 Oct 2026, 3:15 pm");
});

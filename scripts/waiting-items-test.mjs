// Waiting on you, one item at a time: how items are counted, ordered,
// grouped by student and filtered, and where a document is opened.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ago,
  countLine,
  daysLate,
  documentTargetHref,
  filterItems,
  groupByStudent,
  kindCounts,
  lateText,
  openDocumentHref,
  parseKind,
  sortItems,
} from "../src/lib/waitingItems.ts";

const item = (over) => ({
  kind: "document",
  id: "d1",
  studentId: "s1",
  studentName: "Ali Raza",
  title: "Passport",
  detail: null,
  since: "2026-10-01T08:00:00Z",
  href: "/x",
  urgent: false,
  mine: false,
  ...over,
});

test("a line counts its items in words", () => {
  assert.equal(countLine("document", 1), "1 document to review");
  assert.equal(countLine("document", 3), "3 documents to review");
  assert.equal(countLine("task", 2), "2 tasks past their due date");
  assert.equal(countLine("message", 1), "1 student awaiting a reply");
});

test("only a known kind is read from a URL", () => {
  assert.equal(parseKind("document"), "document");
  assert.equal(parseKind("documents"), null);
  assert.equal(parseKind(undefined), null);
});

test("urgent first, then whatever has waited longest", () => {
  const sorted = sortItems([
    item({ id: "new", since: "2026-10-01T10:00:00Z" }),
    item({ id: "old", since: "2026-09-28T10:00:00Z" }),
    item({ id: "urgent", since: "2026-10-01T11:00:00Z", urgent: true }),
    item({ id: "never", since: null }),
  ]);
  assert.deepEqual(sorted.map((i) => i.id), ["urgent", "old", "new", "never"]);
});

test("items are gathered under their student, the most pressing student first", () => {
  const groups = groupByStudent([
    item({ id: "a1", studentId: "a", studentName: "Ali", since: "2026-10-01T09:00:00Z" }),
    item({ id: "b1", studentId: "b", studentName: "Bilal", since: "2026-09-20T09:00:00Z" }),
    item({ id: "a2", studentId: "a", studentName: "Ali", kind: "task", urgent: true, since: "2026-09-30T00:00:00Z" }),
    item({ id: "inv", kind: "inventory", studentId: null, studentName: null, title: "Paper × 5" }),
  ]);
  // Ali has something urgent; Bilal has waited longer but nothing urgent; the
  // request about no student comes last, under its own heading.
  assert.deepEqual(groups.map((g) => g.studentName), ["Ali", "Bilal", "Not about one student"]);
  assert.deepEqual(groups[0].items.map((i) => i.id), ["a2", "a1"]);
  assert.equal(groups[2].studentId, null);
});

test("the list narrows to a kind, to the viewer's own, or both", () => {
  const items = [item({ id: "1", mine: true }), item({ id: "2" }), item({ id: "3", kind: "task", mine: true })];
  assert.deepEqual(filterItems(items, { kind: "document" }).map((i) => i.id), ["1", "2"]);
  assert.deepEqual(filterItems(items, { mine: true }).map((i) => i.id), ["1", "3"]);
  assert.deepEqual(filterItems(items, { kind: "document", mine: true }).map((i) => i.id), ["1"]);
  assert.deepEqual(kindCounts(items), [
    { kind: "task", short: "Tasks", count: 1 },
    { kind: "document", short: "Documents", count: 2 },
  ]);
});

test("how long ago, read at a glance", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");
  assert.equal(ago("2026-10-01T11:59:40Z", now), "just now");
  assert.equal(ago("2026-10-01T11:45:00Z", now), "15 min ago");
  assert.equal(ago("2026-10-01T09:00:00Z", now), "3 h ago");
  assert.equal(ago("2026-09-30T11:00:00Z", now), "yesterday");
  assert.equal(ago("2026-09-26T12:00:00Z", now), "5 days ago");
  assert.equal(ago(null, now), null);
});

test("how late, in Karachi's whole days", () => {
  assert.equal(daysLate("2026-09-29", "2026-10-01"), 2);
  assert.equal(lateText(1), "1 day late");
  assert.equal(lateText(12), "12 days late");
});

test("a document is opened through the route that marks it seen, and lands on its own row", () => {
  assert.equal(openDocumentHref("d1"), "/waiting/open/document/d1");
  assert.equal(documentTargetHref("s1", "d1", null), "/students/s1/documents?doc=d1#doc-d1");
  assert.equal(documentTargetHref("s1", "d1", "c2"), "/students/s1/documents?doc=d1&cycle=c2#doc-d1");
});

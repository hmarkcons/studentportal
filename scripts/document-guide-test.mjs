// A document's guide (src/lib/documentGuide.ts): the formatting staff write,
// what it becomes on a student's page, and which guide and notes apply.
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyGuideFormat,
  guideVideo,
  hasFullGuide,
  hasGuide,
  notesForStudent,
  parseGuide,
  parseInline,
  profileGuideKind,
  safeHref,
} from "../src/lib/documentGuide.ts";

test("steps, bullets, a heading and a paragraph, in the order written", () => {
  const blocks = parseGuide(
    "## Where to get it\nApply at your district police office.\n\n1. Fill in the form\n2) Pay the fee\n\n- Covers five years\n• Apostilled\n"
  );
  assert.deepEqual(blocks.map((b) => b.kind), ["heading", "paragraph", "steps", "bullets"]);
  assert.equal(blocks[2].items.length, 2);
  assert.deepEqual(blocks[2].items[1], [{ kind: "text", text: "Pay the fee" }]);
  assert.equal(blocks[3].items.length, 2);
});

test("lines of one paragraph stay one paragraph; a blank line starts the next", () => {
  const blocks = parseGuide("First line\nsecond line\n\nNext paragraph");
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].lines.length, 2);
});

test("windows line endings and trailing blank lines change nothing", () => {
  assert.deepEqual(parseGuide("1. One\r\n2. Two\r\n\r\n\r\n"), parseGuide("1. One\n2. Two"));
  assert.deepEqual(parseGuide(""), []);
  assert.deepEqual(parseGuide(null), []);
});

test("bold, a named link and a bare address", () => {
  assert.deepEqual(parseInline("Bring **the original** to [the office](https://mofa.gov.pk/attestation)."), [
    { kind: "text", text: "Bring " },
    { kind: "bold", text: "the original" },
    { kind: "text", text: " to " },
    { kind: "link", text: "the office", href: "https://mofa.gov.pk/attestation" },
    { kind: "text", text: "." },
  ]);
  // The full stop after a bare address is not part of it.
  assert.deepEqual(parseInline("See https://hec.gov.pk/degree."), [
    { kind: "text", text: "See " },
    { kind: "link", text: "https://hec.gov.pk/degree", href: "https://hec.gov.pk/degree" },
    { kind: "text", text: "." },
  ]);
});

test("a link to anything but a web page, mail or phone is words, not a link", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,hi", "vbscript:x", "file:///etc/passwd"]) {
    assert.equal(safeHref(bad), null, bad);
    const inline = parseInline(`[click](${bad})`);
    assert.ok(inline.every((i) => i.kind !== "link"), bad);
  }
  assert.equal(safeHref("mailto:visa@hmark.pk"), "mailto:visa@hmark.pk");
  assert.equal(safeHref("tel:+923001234567"), "tel:+923001234567");
});

test("markup is text: nothing in a guide becomes an element but what the format says", () => {
  const blocks = parseGuide("<script>alert(1)</script>\n<img src=x onerror=alert(1)>");
  const words = blocks.flatMap((b) => b.lines ?? b.items ?? [b.text]).flat();
  assert.ok(words.every((w) => w.kind === "text"));
  assert.match(words.map((w) => w.text).join(" "), /<script>alert\(1\)<\/script>/);
});

test("an unclosed ** is left as written", () => {
  assert.deepEqual(parseInline("2 ** 3"), [{ kind: "text", text: "2 ** 3" }]);
});

test("the toolbar numbers every line it touches, from one", () => {
  const text = "Fill the form\nPay the fee\nCollect it";
  const r = applyGuideFormat(text, 3, text.length - 2, "steps");
  assert.equal(r.text, "1. Fill the form\n2. Pay the fee\n3. Collect it");
  // Bullets over steps replace the numbers rather than stacking marks.
  assert.equal(applyGuideFormat(r.text, 0, r.text.length, "bullets").text, "- Fill the form\n- Pay the fee\n- Collect it");
  assert.equal(applyGuideFormat("Where to get it", 0, 0, "heading").text, "## Where to get it");
});

test("the toolbar's bold and link wrap the selection, or a placeholder", () => {
  const bold = applyGuideFormat("Bring the original", 6, 18, "bold");
  assert.equal(bold.text, "Bring **the original**");
  assert.equal(bold.text.slice(bold.start, bold.end), "the original");
  const link = applyGuideFormat("Apply online", 6, 12, "link");
  assert.equal(link.text, "Apply [online](https://)");
  // The address is selected, so typing replaces it.
  assert.equal(link.text.slice(link.start, link.end), "https://");
  assert.equal(applyGuideFormat("", 0, 0, "bold").text, "**important words**");
});

test("a profile document reads the guide of its kind, whichever qualification it is", () => {
  assert.equal(profileGuideKind("qualification:0766a5f0-707f-42ea-bd99-e63063af5cbf:certificate"), "qualification:certificate");
  assert.equal(profileGuideKind("qualification:172ef950-9dee-44c8-b6ac-27c68b595520:transcript"), "qualification:transcript");
  assert.equal(profileGuideKind("test:abc:scorecard"), "test:scorecard");
  assert.equal(profileGuideKind("profile:travel_history"), "profile:travel_history");
  assert.equal(profileGuideKind("profile:something_new"), null);
  assert.equal(profileGuideKind(null), null);
});

test("country notes: a shared document shows each of the student's countries, primary first", () => {
  const notes = [
    { destinationId: "es", note: "Spain: apostilled" },
    { destinationId: "it", note: "Italy: translated" },
    { destinationId: "fr", note: "France: not this student's" },
  ];
  const countries = [{ id: "it", name: "Italy (Public)" }, { id: "es", name: "Spain (Public)" }];
  assert.deepEqual(notesForStudent(notes, countries, null).map((n) => n.destinationName), ["Italy (Public)", "Spain (Public)"]);
  // An application's own document: only its country's note.
  assert.deepEqual(notesForStudent(notes, countries, "es").map((n) => n.note), ["Spain: apostilled"]);
  assert.deepEqual(notesForStudent([{ destinationId: "it", note: "  " }], countries, null), []);
});

test("what counts as a guide", () => {
  const empty = { description: null, guide_body: " ", sample_file_path: null, sample_file_name: null, guide_video_provider: null, guide_video_id: null };
  assert.equal(hasGuide(empty), false);
  assert.equal(hasGuide({ ...empty, description: "Colour scan" }), true);
  // A note alone is shown under the name; there is nothing to open.
  assert.equal(hasFullGuide({ ...empty, description: "Colour scan" }), false);
  assert.equal(hasFullGuide({ ...empty, sample_file_path: "document-guides/x/a.pdf" }), true);
  assert.equal(hasFullGuide(empty, 1), true);
});

test("the video is composed from what is stored, never a pasted address", () => {
  const v = guideVideo({ guide_video_provider: "youtube", guide_video_id: "dQw4w9WgXcQ" });
  assert.equal(v.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(v.watchUrl, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(guideVideo({ guide_video_provider: "vimeo", guide_video_id: "76979871" }).embedUrl, "https://player.vimeo.com/video/76979871");
  assert.equal(guideVideo({ guide_video_provider: "youtube", guide_video_id: "bad id!" }), null);
  assert.equal(guideVideo({ guide_video_provider: null, guide_video_id: null }), null);
});

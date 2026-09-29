import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BODY_COLUMNS,
  BODY_KNOWN_HEADERS,
  EXAMPLE_BODY,
  EXAMPLE_BODY_ROW,
  TEMPLATE_GUIDE_PAIRS,
  bodyColumnIndex,
  bodyHeaderKey,
  bodyHelpRows,
  bodySheetColumns,
  bodySheetRow,
  coversCell,
  guidePairsFor,
  isExampleBodyRow,
  normalizeBodyRow,
  parseGuideKey,
  splitCoversCell,
  unreadBodyColumns,
} from "../src/lib/scholarshipBodySheet.ts";
import { normalizeHeader } from "../src/lib/catalogueSheet.ts";

// The scholarship bodies sheet: one definition shared by the blank template,
// the export and the importer. These pin the parts that fail silently — a
// header the importer reads as some other column, a guide column the export
// leaves off, a cell written in a form the importer reads differently.

const body = {
  name: "DSU Toscana",
  countries: ["Italy (Public)", "Italy (Private)"],
  region: "Tuscany",
  covers: ["University of Florence", "University of Pisa"],
  academic_year: "2026/2027",
  application_deadline: "2 September 2026, 12:00",
  document_upload_deadline: null,
  courier_deadline: null,
  isee_threshold: "≤€27,948.60",
  ispe_threshold: null,
  stipend_amount: "Up to €7,000",
  benefits: null,
  source_url: "https://www.dsu.toscana.it",
  apply_url: null,
  call_status: "published",
  call_expected_on: null,
  call_pdf_url: null,
  call_page_url: null,
  call_notes: null,
  guide_sections: [
    { title: "Important dates", body: "Apply by 2 September." },
    { title: "Documents", body: "Passport\nISEE" },
  ],
};

// ------------------------------------------------------------ headers

test("every header, as written for people, is read as its own column", () => {
  // The sheet says "Universities covered" and "Source URL"; the importer
  // reads keys. If the two stopped agreeing, a whole column of an untouched
  // export would be read as nothing and the round trip would look clean.
  for (const column of BODY_COLUMNS) {
    assert.equal(normalizeHeader(column.header), column.key, column.header);
    assert.equal(bodyHeaderKey(column.header), column.key, column.header);
  }
  for (const column of bodySheetColumns(3)) assert.equal(bodyHeaderKey(column.header), column.key, column.header);
});

test("the snake_case spelling a CSV might use is the same column", () => {
  assert.equal(bodyHeaderKey("universities_covered"), "universities_covered");
  assert.equal(bodyHeaderKey("guide_1_title"), "guide_1_title");
  assert.equal(bodyHeaderKey("CALL-STATUS"), "call_status");
});

test("the obvious other names for a column are read as it", () => {
  assert.equal(bodyHeaderKey("Covers"), "universities_covered");
  assert.equal(bodyHeaderKey("Country"), "countries");
  assert.equal(bodyHeaderKey("Destinations"), "countries");
  assert.equal(bodyHeaderKey("Stipend"), "stipend_amount");
});

test("a guide column is recognised however its pair is spelt", () => {
  assert.equal(bodyHeaderKey("Guide 3 Title"), "guide_3_title");
  assert.equal(bodyHeaderKey("guide3_heading"), "guide_3_title");
  assert.equal(bodyHeaderKey("Guide 2 body"), "guide_2_text");
  assert.equal(bodyHeaderKey("Guide 14 text"), "guide_14_text");
  assert.deepEqual(parseGuideKey("guide_7_text"), { n: 7, part: "text" });
  assert.equal(parseGuideKey("guide_0_title"), null);
  assert.equal(parseGuideKey("guide_title"), null);
});

test("columns the upload does not read are named, and guide columns past the template's twelve are read", () => {
  const unread = unreadBodyColumns(["Name", "Notes", "Guide 13 title", "Guide 13 text", " ", "Owner"]);
  assert.equal(unread.length, 2);
  assert.match(unread[0], /column "Notes" is not one this upload reads/);
  assert.match(unread[1], /"Owner"/);
});

test("two spellings of one column: the filled cell wins", () => {
  assert.deepEqual(normalizeBodyRow({ Region: "", region: "Tuscany" }), { region: "Tuscany" });
  assert.deepEqual(normalizeBodyRow({ Covers: "Pisa", "Universities covered": "" }), { universities_covered: "Pisa" });
});

test("the data sheet is recognised by headers the Lists sheet does not have", () => {
  // parseXlsx falls back to the first sheet carrying a known header when the
  // data sheet has been renamed; the Lists sheet is headed Countries and Call
  // status, and picking it would import the destinations as bodies.
  for (const h of BODY_KNOWN_HEADERS) assert.ok(!["countries", "call status"].includes(h), h);
});

// ------------------------------------------------------------ layout

test("the body's columns come first, then title/text pairs in order", () => {
  const columns = bodySheetColumns(TEMPLATE_GUIDE_PAIRS);
  assert.equal(columns.length, BODY_COLUMNS.length + 2 * TEMPLATE_GUIDE_PAIRS);
  assert.equal(columns[0].key, "name");
  assert.equal(columns[BODY_COLUMNS.length].header, "Guide 1 title");
  assert.equal(columns[BODY_COLUMNS.length + 1].header, "Guide 1 text");
  assert.equal(columns.at(-1).header, `Guide ${TEMPLATE_GUIDE_PAIRS} text`);
  assert.equal(bodyColumnIndex("name"), 1);
  assert.equal(columns[bodyColumnIndex("call_status") - 1].key, "call_status");
});

test("the export carries every guide in full, however long", () => {
  // Stopping at twelve would hand back a thirteen-section guide as twelve —
  // and re-importing it would REPLACE the guide and lose the thirteenth.
  assert.equal(guidePairsFor([]), TEMPLATE_GUIDE_PAIRS);
  assert.equal(guidePairsFor([3, 10]), TEMPLATE_GUIDE_PAIRS);
  assert.equal(guidePairsFor([3, 17]), 17);
  assert.equal(guidePairsFor([41]), 41);
});

// ------------------------------------------------------------ writing a body

test("a body is one row with every column, list cells semicolon-separated", () => {
  const row = bodySheetRow(body, 3);
  assert.deepEqual(Object.keys(row).sort(), bodySheetColumns(3).map((c) => c.key).sort());
  assert.equal(row.countries, "Italy (Private); Italy (Public)");
  assert.equal(row.universities_covered, "University of Florence; University of Pisa");
  assert.equal(row.guide_1_title, "Important dates");
  assert.equal(row.guide_2_text, "Passport\nISEE");
  assert.equal(row.guide_3_title, "");
  assert.equal(row.ispe_threshold, "");
});

test("an expected date is written only beside a call that is awaiting", () => {
  assert.equal(bodySheetRow({ ...body, call_status: "awaiting", call_expected_on: "2027-03-01" }, 1).call_expected_on, "2027-03-01");
  // Left over from when it was awaited; the importer would ignore it there
  // and say so on every clean round trip.
  assert.equal(bodySheetRow({ ...body, call_status: "published", call_expected_on: "2027-03-01" }, 1).call_expected_on, "");
});

test("the template's example is one complete row the importer skips", () => {
  assert.deepEqual(Object.keys(EXAMPLE_BODY_ROW).sort(), bodySheetColumns().map((c) => c.key).sort());
  assert.equal(EXAMPLE_BODY_ROW.name, EXAMPLE_BODY);
  assert.ok(isExampleBodyRow(EXAMPLE_BODY_ROW));
  assert.ok(!isExampleBodyRow({ name: "DSU Toscana" }));
  assert.ok(EXAMPLE_BODY_ROW.guide_1_title && EXAMPLE_BODY_ROW.guide_1_text);
});

test("the How to fill sheet has a line for every column", () => {
  const lines = bodyHelpRows();
  for (const column of BODY_COLUMNS) {
    const line = lines.find((l) => l.column === column.header);
    assert.ok(line && line.note.length > 0, column.header);
  }
  assert.ok(lines.some((l) => /Guide 1 title/.test(l.column) && /removed/.test(l.note)));
});

test("covered universities go one per line only when an entry has a semicolon of its own", () => {
  assert.equal(coversCell(["Florence", "Pisa"]), "Florence; Pisa");
  assert.equal(coversCell(null), "");
  const notes = ["Ca' Foscari – housing only; the grant is the university's", "IUAV"];
  assert.equal(coversCell(notes), notes.join("\n"));
  // And back: what the export writes is the list it came from.
  assert.deepEqual(splitCoversCell(coversCell(notes)), notes);
  assert.deepEqual(splitCoversCell(coversCell(["Florence", "Pisa"])), ["Florence", "Pisa"]);
});

test("a covers cell is split by lines when it has any, else by semicolons", () => {
  assert.deepEqual(splitCoversCell("Florence; Pisa"), ["Florence", "Pisa"]);
  assert.deepEqual(splitCoversCell("Florence\r\nPisa; Siena\n\n"), ["Florence", "Pisa; Siena"]);
  assert.deepEqual(splitCoversCell(undefined), []);
  assert.deepEqual(splitCoversCell("  ;  "), []);
});

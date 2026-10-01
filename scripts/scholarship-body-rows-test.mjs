import { test } from "node:test";
import assert from "node:assert/strict";
import writeXlsxFile from "write-excel-file/node";
import {
  bodyFromRow,
  bodyInsertValues,
  describeGuideChange,
  findSimilarBodyNames,
  guideFromRow,
  normalizeGuide,
  parseCallStatus,
  parseWebAddress,
  planBodyImport,
  resolveCountries,
} from "../src/lib/scholarshipBodyRows.ts";
import {
  BODY_KNOWN_HEADERS,
  BODY_SHEET,
  BODY_TEXT_LIMITS,
  overLongBodyField,
  EXAMPLE_BODY_ROW,
  bodySheetColumns,
  bodySheetRow,
  guidePairsFor,
  normalizeBodyRow,
} from "../src/lib/scholarshipBodySheet.ts";
import { scholarshipBodyWorkbook } from "../src/lib/scholarshipBodyWorkbook.ts";
import { parseXlsx } from "../src/lib/spreadsheet.ts";

// What a scholarship bodies sheet does to the directory, decided from sheet
// rows alone. The rules under test are the ones that fail without a sound:
// a blank cell must never erase, a filled list replaces, a half-written guide
// must not replace a whole one, a misspelt country must not quietly drop the
// one it was meant to be, and an untouched export must change nothing.

// ------------------------------------------------------------ fixtures

const DESTINATIONS = [
  { id: "d-it-pub", display_name: "Italy (Public)", country: "Italy", country_code: "IT" },
  { id: "d-it-pri", display_name: "Italy (Private)", country: "Italy", country_code: "IT" },
  { id: "d-de", display_name: "Germany (Public)", country: "Germany", country_code: "DE" },
  { id: "d-fr", display_name: "France (Public)", country: "France", country_code: "FR" },
];

const GUIDE = [
  { title: "Important dates", body: "Apply by 2 September.\nUpload by 30 September." },
  { title: "Documents", body: "Passport\n\nISEE — translated" },
  { title: "Where to apply", body: "Online, on the DSU portal." },
];

function stored(over = {}) {
  return {
    id: "b-toscana",
    name: "DSU Toscana",
    region: "Tuscany",
    covers: ["University of Florence", "University of Pisa"],
    academic_year: "2026/2027",
    application_deadline: "2 September 2026, 12:00",
    document_upload_deadline: "30 September 2026",
    courier_deadline: null,
    isee_threshold: "≤€27,948.60",
    ispe_threshold: "≤€60,757.87",
    stipend_amount: "Up to €7,000",
    benefits: "Free meals",
    source_url: "https://www.dsu.toscana.it",
    apply_url: "https://apply.dsu.toscana.it",
    call_status: "published",
    call_expected_on: null,
    call_pdf_url: null,
    call_page_url: "https://www.dsu.toscana.it/bando",
    call_notes: "Second call in January.",
    guide_sections: GUIDE,
    destinationIds: ["d-it-pub", "d-it-pri"],
    ...over,
  };
}

const plan = (rows, bodies = [stored()]) =>
  planBodyImport(rows.map(normalizeBodyRow), { stored: bodies, destinations: DESTINATIONS });

// ------------------------------------------------------------ cells

test("a row with only a name says nothing about anything else", () => {
  const problems = [];
  const input = bodyFromRow({ name: "DSU Toscana" }, problems);
  assert.deepEqual(problems, []);
  assert.equal(input.name, "DSU Toscana");
  assert.equal(input.countries, null);
  assert.deepEqual(input.covers, []);
  assert.equal(input.guide, null);
  for (const field of ["region", "academic_year", "stipend_amount", "call_status", "call_expected_on", "source_url", "call_notes"]) {
    assert.equal(input[field], null, field);
  }
});

test("a stipend in words and figures is kept exactly as written, line breaks and all", () => {
  const problems = [];
  const stipend = "Up to €7,171.11 a year living away from home\n€4,190.71 commuting · €2,890.16 at home";
  assert.equal(bodyFromRow({ name: "DSU Toscana", stipend_amount: stipend }, problems).stipend_amount, stipend);
  assert.deepEqual(problems, []);
});

test("free text longer than the edit form allows is reported and left as it is, not cut", () => {
  const problems = [];
  const input = bodyFromRow(
    { name: "DSU Toscana", stipend_amount: "x".repeat(1001), isee_threshold: "y".repeat(501), benefits: "z".repeat(1000) },
    problems
  );
  assert.equal(input.stipend_amount, null, "null is \"said nothing\": the stored stipend stays");
  assert.equal(input.isee_threshold, null);
  assert.equal(input.benefits.length, 1000, "exactly at the limit is fine");
  assert.match(problems.join("\n"), /Stipend amount is 1001 characters — at most 1000; left as it is/);
  assert.match(problems.join("\n"), /ISEE threshold is 501 characters — at most 500; left as it is/);
  assert.equal(problems.length, 2);
});

test("the edit form's limits hold everything on file, and a field past one is found", () => {
  // The longest values on file when the limits were set. Below any of these
  // and that body cannot be edited without cutting its text.
  const longestOnFile = { stipend_amount: 381, benefits: 666, isee_threshold: 450, ispe_threshold: 285, application_deadline: 293, call_notes: 271, region: 83 };
  for (const [field, length] of Object.entries(longestOnFile)) assert.ok(BODY_TEXT_LIMITS[field] >= length, field);
  assert.equal(overLongBodyField({ stipend_amount: "x".repeat(1000), benefits: null }), null);
  assert.deepEqual(overLongBodyField({ region: "ok", stipend_amount: "x".repeat(1001) }), { field: "stipend_amount", length: 1001, max: 1000 });
});

test("a row with no name is not a body", () => {
  assert.equal(bodyFromRow({ region: "Tuscany" }, []), null);
  assert.equal(bodyFromRow({ name: "   " }, []), null);
});

test("only a full http or https address is taken as a link", () => {
  const problems = [];
  assert.equal(parseWebAddress("https://www.dsu.toscana.it/bando", problems, "Source URL"), "https://www.dsu.toscana.it/bando");
  assert.equal(parseWebAddress("", problems, "Source URL"), null);
  assert.deepEqual(problems, []);
  // These become links on staff and student pages.
  assert.equal(parseWebAddress("javascript:alert(1)", problems, "Apply URL"), null);
  assert.equal(parseWebAddress("www.dsu.toscana.it", problems, "Source URL"), null);
  assert.equal(problems.length, 2);
  assert.match(problems[0], /Apply URL "javascript:alert\(1\)" is not a web address/);
});

test("the call status is published or awaiting, and the edit form's wording for awaiting is understood", () => {
  const problems = [];
  assert.equal(parseCallStatus("Published", problems), "published");
  assert.equal(parseCallStatus("awaiting", problems), "awaiting");
  assert.equal(parseCallStatus("Not published yet", problems), "awaiting");
  assert.equal(parseCallStatus("", problems), null);
  assert.deepEqual(problems, []);
  assert.equal(parseCallStatus("maybe", problems), null);
  assert.match(problems[0], /Call status "maybe" is neither published nor awaiting/);
});

test("the expected date is read like every other date in the imports", () => {
  const problems = [];
  assert.equal(bodyFromRow({ name: "X", call_expected_on: "15 Mar 2027" }, problems).call_expected_on, "2027-03-15");
  assert.equal(bodyFromRow({ name: "X", call_expected_on: "03/04/2027" }, problems).call_expected_on, null);
  assert.match(problems[0], /"03\/04\/2027" is not a date/);
});

test("universities written with commas are still one entry, but the preview says so", () => {
  const problems = [];
  const input = bodyFromRow({ name: "X", universities_covered: "Perugia, Terni" }, problems);
  assert.deepEqual(input.covers, ["Perugia, Terni"]);
  assert.match(problems[0], /read as ONE university — separate universities with semicolons/);
  assert.deepEqual(bodyFromRow({ name: "X", universities_covered: "Perugia; Terni" }, []).covers, ["Perugia", "Terni"]);
});

// ------------------------------------------------------------ the guide

test("every guide cell blank leaves the guide alone", () => {
  assert.equal(guideFromRow({ name: "X", guide_1_title: "", guide_1_text: " " }, []), null);
  assert.equal(guideFromRow({ name: "X" }, []), null);
});

test("filled pairs become the guide in order, skipping empty pairs", () => {
  const problems = [];
  const guide = guideFromRow(
    { guide_3_title: "Third", guide_3_text: "C", guide_1_title: "First", guide_1_text: "A\r\nB", guide_2_title: "", guide_2_text: "" },
    problems
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(guide, [
    { title: "First", body: "A\nB" },
    { title: "Third", body: "C" },
  ]);
});

test("half a pair holds the whole guide back rather than replacing it one section short", () => {
  const problems = [];
  assert.equal(guideFromRow({ guide_1_title: "Dates", guide_1_text: "Soon", guide_2_title: "Documents" }, problems), null);
  assert.match(problems[0], /Guide 2 \("Documents"\) has a title but no text — the guide was left as it is/);
  const reverse = [];
  assert.equal(guideFromRow({ guide_1_text: "Orphan" }, reverse), null);
  assert.match(reverse[0], /Guide 1 has text but no title/);
});

test("the edit form's limits hold, refused rather than trimmed", () => {
  const problems = [];
  assert.equal(guideFromRow({ guide_1_title: "T".repeat(121), guide_1_text: "ok" }, problems), null);
  assert.match(problems[0], /Guide 1 title is 121 characters — at most 120/);
  const long = [];
  assert.equal(guideFromRow({ guide_1_title: "T", guide_1_text: "x".repeat(8001) }, long), null);
  assert.match(long[0], /at most 8000/);
  const many = {};
  for (let n = 1; n <= 41; n++) Object.assign(many, { [`guide_${n}_title`]: `S${n}`, [`guide_${n}_text`]: "x" });
  const tooMany = [];
  assert.equal(guideFromRow(many, tooMany), null);
  assert.match(tooMany[0], /41 sections — at most 40/);
  const forty = {};
  for (let n = 1; n <= 40; n++) Object.assign(forty, { [`guide_${n}_title`]: `S${n}`, [`guide_${n}_text`]: "x" });
  assert.equal(guideFromRow(forty, []).length, 40);
});

test("a replaced guide says what it removes", () => {
  const line = describeGuideChange(GUIDE, [{ title: "Important dates", body: "Changed." }]);
  assert.match(line, /3 sections → 1 section/);
  assert.match(line, /removes "Documents", "Where to apply"/);
  assert.match(line, /rewrites "Important dates"/);
  assert.match(describeGuideChange(GUIDE, [GUIDE[1], GUIDE[0], GUIDE[2]]), /reorders the sections/);
});

test("a stored guide is compared on its title and text alone", () => {
  assert.deepEqual(normalizeGuide([{ title: " Dates ", body: "A\r\nB ", extra: 1 }, "junk", { title: "", body: "x" }]), [
    { title: "Dates", body: "A\nB" },
  ]);
  assert.deepEqual(normalizeGuide(null), []);
});

// ------------------------------------------------------------ countries

test("a country is found by its display name, its own name or its code", () => {
  assert.deepEqual(resolveCountries(["Germany (Public)"], DESTINATIONS), { ids: ["d-de"] });
  assert.deepEqual(resolveCountries(["italy - public"], DESTINATIONS), { ids: ["d-it-pub"] });
  // A body serves the country, so the country's name means every track of it.
  assert.deepEqual(resolveCountries(["Italy"], DESTINATIONS), { ids: ["d-it-pri", "d-it-pub"] });
  assert.deepEqual(resolveCountries(["FR", "Germany"], DESTINATIONS), { ids: ["d-de", "d-fr"] });
});

test("one unknown country refuses the whole cell, and names it", () => {
  const result = resolveCountries(["Italy (Public)", "Narnia"], DESTINATIONS);
  assert.equal(result.ids, undefined);
  assert.match(result.error, /country "Narnia" is not a destination the portal has/);
  assert.match(resolveCountries(["Italy (Public), Germany (Public)"], DESTINATIONS).error, /semicolons, not commas/);
  const twins = [...DESTINATIONS, { id: "d-x", display_name: "Germany (Public)", country: "Germany", country_code: "DE" }];
  assert.match(resolveCountries(["Germany (Public)"], twins).error, /is the name of 2 destinations/);
});

// ------------------------------------------------------------ names

test("a similar name is found, including the same letters punctuated differently", () => {
  assert.deepEqual(findSimilarBodyNames("ERGO", ["ER.GO", "DSU Toscana"]), ["ER.GO"]);
  assert.deepEqual(findSimilarBodyNames("DSU Toscano", ["DSU Toscana"]), ["DSU Toscana"]);
  assert.deepEqual(findSimilarBodyNames("ADISU Umbria", ["ADiSU Puglia"]), []);
  // The same name is a match, not a near miss.
  assert.deepEqual(findSimilarBodyNames("dsu  toscana", ["DSU Toscana"]), []);
});

// ------------------------------------------------------------ the plan

test("a new body is added with its countries and guide", () => {
  const result = plan([
    {
      Name: "ER.GO",
      Countries: "Italy (Public); Italy (Private)",
      "Academic year": "2026/2027",
      "Universities covered": "University of Bologna; University of Parma",
      "Guide 1 title": "Dates",
      "Guide 1 text": "Apply by July.",
    },
  ]);
  assert.deepEqual(result.problems, []);
  assert.equal(result.creates.length, 1);
  const [create] = result.creates;
  assert.deepEqual(create.destinationIds.sort(), ["d-it-pri", "d-it-pub"]);
  assert.deepEqual(create.values.guide_sections, [{ title: "Dates", body: "Apply by July." }]);
  assert.deepEqual(create.values.covers, ["University of Bologna", "University of Parma"]);
  assert.equal(create.values.call_status, "published");
  assert.match(create.line, /ER\.GO — new scholarship body for Italy \(Private\), Italy \(Public\), guide of 1 section/);
});

test("a new body needs an academic year and a country, and one without is not added", () => {
  const result = plan([
    { Name: "No Year", Countries: "Germany (Public)" },
    { Name: "No Country", "Academic year": "2026/2027" },
  ]);
  assert.equal(result.creates.length, 0);
  assert.ok(result.problems.some((p) => /"No Year" is new, and a new scholarship body needs an academic year — not added/.test(p)));
  assert.ok(result.problems.some((p) => /"No Country" is new, .* at least one country — not added/.test(p)));
});

test("an unknown country is reported, and a new body naming it is not added", () => {
  const result = plan([{ Name: "Narnia Grants", Countries: "Narnia", "Academic year": "2026/2027" }]);
  assert.equal(result.creates.length, 0);
  assert.equal(result.updates.length, 0);
  assert.ok(result.problems.some((p) => /Narnia Grants: country "Narnia" is not a destination the portal has — its countries were left as they are/.test(p)));
});

test("a row matching a stored body exactly, with nothing different, changes nothing", () => {
  const result = plan([{ Name: "DSU Toscana", Region: "Tuscany", "Stipend amount": "Up to €7,000" }]);
  assert.equal(result.updates.length, 0);
  assert.equal(result.unchanged, 1);
});

test("a blank cell never erases, and a filled one overwrites only itself", () => {
  const result = plan([{ Name: "dsu toscana", "Stipend amount": "Up to €7,500", Region: "", Countries: "", "Guide 1 title": "" }]);
  assert.equal(result.updates.length, 1);
  const [update] = result.updates;
  assert.equal(update.name, "DSU Toscana");
  assert.deepEqual(update.patch, { stipend_amount: "Up to €7,500" });
  assert.equal(update.countries, null);
  assert.deepEqual(update.lines, ["stipend_amount Up to €7,000 → Up to €7,500"]);
});

test("a filled guide replaces the stored one, and says what it removes", () => {
  const result = plan([{ Name: "DSU Toscana", "Guide 1 title": "Only section", "Guide 1 text": "Everything." }]);
  const [update] = result.updates;
  assert.deepEqual(update.patch.guide_sections, [{ title: "Only section", body: "Everything." }]);
  assert.match(update.lines[0], /guide replaced: 3 sections → 1 section; removes "Important dates", "Documents", "Where to apply"/);
});

test("the same guide written again, line endings and all, is not a change", () => {
  const row = { Name: "DSU Toscana" };
  GUIDE.forEach((s, i) => Object.assign(row, { [`Guide ${i + 1} title`]: s.title, [`Guide ${i + 1} text`]: s.body.replace(/\n/g, "\r\n") }));
  assert.equal(plan([row]).updates.length, 0);
});

test("a filled Countries cell becomes exactly the body's countries", () => {
  const [update] = plan([{ Name: "DSU Toscana", Countries: "Italy (Public); Germany (Public)" }]).updates;
  assert.deepEqual(update.patch, {});
  assert.deepEqual(update.countries.add, ["d-de"]);
  assert.deepEqual(update.countries.remove, ["d-it-pri"]);
  assert.equal(update.countries.line, "countries Italy (Private); Italy (Public) → Germany (Public); Italy (Public)");
});

test("an unknown country leaves the countries alone but not the rest of the row", () => {
  const result = plan([{ Name: "DSU Toscana", Countries: "Italy (Public); Narnia", Region: "Toscana" }]);
  const [update] = result.updates;
  assert.equal(update.countries, null);
  assert.deepEqual(update.patch, { region: "Toscana" });
  assert.ok(result.problems.some((p) => /"Narnia"/.test(p)));
});

test("a similar name updates the body it resembles and keeps the stored name", () => {
  const result = plan([{ Name: "DSU Toscano", Region: "Toscana" }]);
  assert.deepEqual(result.similarMatches, ['"DSU Toscano" → updates "DSU Toscana"']);
  assert.equal(result.updates[0].id, "b-toscana");
  assert.equal(result.updates[0].name, "DSU Toscana");
  assert.equal(result.creates.length, 0);
  assert.equal("name" in result.updates[0].patch, false);
});

test("a name close to two bodies is held back and touches neither", () => {
  const bodies = [stored(), stored({ id: "b-2", name: "DSU Toscanu" })];
  const result = plan([{ Name: "DSU Toscano", Region: "Elsewhere" }], bodies);
  assert.equal(result.updates.length + result.creates.length, 0);
  assert.match(result.heldBack[0], /"DSU Toscano" is close to "DSU Toscana" and "DSU Toscanu"/);
});

test("a body on file twice is never paired with an arbitrary copy", () => {
  const result = plan([{ Name: "DSU Toscana", Region: "Elsewhere" }], [stored(), stored({ id: "b-copy" })]);
  assert.equal(result.updates.length, 0);
  assert.match(result.heldBack[0], /on file 2 times/);
});

test("a body listed twice in one sheet is read once", () => {
  const result = plan([
    { Name: "DSU Toscana", Region: "First" },
    { Name: "DSU  Toscana", Region: "Second" },
    { Name: "DSU Toscano", Region: "Third" },
  ]);
  assert.equal(result.updates.length, 1);
  assert.deepEqual(result.updates[0].patch, { region: "First" });
  assert.ok(result.problems.some((p) => /"DSU  Toscana" is on the sheet more than once/.test(p)));
  assert.ok(result.problems.some((p) => /"DSU Toscano" is a second row for "DSU Toscana"/.test(p)));
});

test("two spellings of one new body in a sheet add one body, not two", () => {
  const row = { Countries: "France (Public)", "Academic year": "2026/2027" };
  const result = plan([{ ...row, Name: "Campus France Grants" }, { ...row, Name: "Campus-France Grants" }]);
  assert.equal(result.creates.length, 1);
  assert.match(result.heldBack[0], /also new in this sheet/);
});

test("the template's example row is skipped and said so", () => {
  const result = plan([EXAMPLE_BODY_ROW]);
  assert.equal(result.creates.length, 0);
  assert.match(result.problems[0], /Skipped 1 example row/);
  assert.equal(result.noNames, false);
});

test("a sheet with no names at all is flagged as the wrong file", () => {
  assert.equal(plan([{ Region: "Tuscany" }]).noNames, true);
});

test("a call set to published loses the date it was expected on", () => {
  const [update] = plan([{ Name: "DSU Toscana", "Call status": "published" }], [
    stored({ call_status: "awaiting", call_expected_on: "2027-03-01" }),
  ]).updates;
  assert.equal(update.patch.call_status, "published");
  assert.equal(update.patch.call_expected_on, null);
  assert.ok(update.lines.some((l) => /call_expected_on 2027-03-01 → — \(the call is now published\)/.test(l)));
});

test("an expected date beside a published call is ignored and said so", () => {
  const result = plan([{ Name: "DSU Toscana", "Call expected on": "2027-03-01" }]);
  assert.equal(result.updates.length, 0);
  assert.ok(result.problems.some((p) => /only kept for a call that is awaiting — ignored/.test(p)));
  const awaiting = plan([{ Name: "DSU Toscana", "Call status": "awaiting", "Call expected on": "2027-03-01" }]).updates[0];
  assert.deepEqual(awaiting.patch, { call_status: "awaiting", call_expected_on: "2027-03-01" });
});

test("new bodies are inserted as rows of one shape", () => {
  // PostgREST sends NULL for any key a row of a batch is missing, so a
  // default never applies to a batch of mixed shapes.
  const rows = [
    { Name: "A", Countries: "France (Public)", "Academic year": "2026/2027" },
    { Name: "Bee Grants", Countries: "Germany (Public)", "Academic year": "2026/2027", Region: "Bavaria", "Call status": "awaiting",
      "Call expected on": "2027-01-10", "Guide 1 title": "T", "Guide 1 text": "B", "Universities covered": "TUM" },
  ];
  const creates = plan(rows).creates;
  assert.equal(creates.length, 2);
  const keys = creates.map((c) => Object.keys(c.values).sort().join(","));
  assert.equal(keys[0], keys[1]);
  for (const c of creates) for (const [k, v] of Object.entries(c.values)) assert.notEqual(v, undefined, k);
  assert.deepEqual(creates[0].values.covers, []);
  assert.deepEqual(creates[0].values.guide_sections, []);
  assert.equal(creates[1].values.call_expected_on, "2027-01-10");
  assert.equal(bodyInsertValues({ ...bodyFromRow({ name: "Z", call_expected_on: "2027-01-10" }, []) }).call_expected_on, null);
});

// ------------------------------------------------------------ the round trip

const directory = [
  stored(),
  stored({
    id: "b-ergo",
    name: "ER.GO",
    region: "Emilia-Romagna ",
    covers: ["University of Bologna"],
    call_status: "awaiting",
    call_expected_on: "2027-06-15",
    guide_sections: [],
    destinationIds: ["d-it-pub"],
  }),
  // A published call with a stale expected date, which the export leaves out.
  stored({ id: "b-daad", name: "DAAD", call_expected_on: "2026-01-01", covers: [], destinationIds: ["d-de"], guide_sections: GUIDE.slice(0, 1) }),
  // Covered universities with notes that hold semicolons, as ESU Venezia's
  // do in production: joined by "; " they read back as three entries.
  stored({
    id: "b-esu",
    name: "ESU Venezia",
    covers: ["Ca' Foscari – ESU runs the housing call only; the university pays the grant", "IUAV – same as above; the grant is IUAV's"],
    destinationIds: ["d-it-pub"],
  }),
];

function exportRows(bodies) {
  const label = new Map(DESTINATIONS.map((d) => [d.id, d.display_name]));
  const exported = bodies.map((b) => ({ ...b, countries: b.destinationIds.map((id) => label.get(id)), guide_sections: normalizeGuide(b.guide_sections) }));
  const pairs = guidePairsFor(exported.map((b) => b.guide_sections.length));
  return { pairs, rows: exported.map((b) => bodySheetRow(b, pairs)) };
}

function assertNoOp(result, count) {
  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.creates, []);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.similarMatches, []);
  assert.deepEqual(result.heldBack, []);
  assert.equal(result.unchanged, count);
}

test("re-importing an untouched export changes nothing", () => {
  const { pairs, rows } = exportRows(directory);
  // Keyed by the headers a person sees, as a CSV of the export would be.
  const columns = bodySheetColumns(pairs);
  const asRead = rows.map((row) => Object.fromEntries(columns.map((c) => [c.header, row[c.key]])));
  assertNoOp(plan(asRead, directory), directory.length);
});

test("re-importing an untouched export WORKBOOK changes nothing — dates, line breaks and all", async () => {
  // The real thing: the workbook the export route builds, written by
  // write-excel-file and read back by the same parser an upload goes through.
  const { pairs, rows } = exportRows(directory);
  const { sheets, options, finish } = scholarshipBodyWorkbook(rows, {
    destinations: DESTINATIONS.map((d) => d.display_name),
    guidePairs: pairs,
  });
  const bytes = finish(await writeXlsxFile(sheets, options).toBuffer());
  const file = new File([bytes], "scholarship-bodies.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const read = await parseXlsx(file, { sheet: BODY_SHEET, knownHeaders: BODY_KNOWN_HEADERS });
  assert.equal(read.length, directory.length);
  const ergo = read.map(normalizeBodyRow).find((r) => r.name === "ER.GO");
  assert.equal(ergo.call_expected_on, "2027-06-15");
  assertNoOp(plan(read, directory), directory.length);
});

test("the blank template's workbook reads back as its example, and is skipped", async () => {
  const { sheets, options, finish } = scholarshipBodyWorkbook([EXAMPLE_BODY_ROW], {
    italic: true,
    destinations: DESTINATIONS.map((d) => d.display_name),
    guidePairs: 12,
  });
  const bytes = finish(await writeXlsxFile(sheets, options).toBuffer());
  const read = await parseXlsx(new File([bytes], "template.xlsx"), { sheet: BODY_SHEET, knownHeaders: BODY_KNOWN_HEADERS });
  assert.equal(read.length, 1);
  const result = plan(read, directory);
  assert.equal(result.creates.length + result.updates.length, 0);
  assert.match(result.problems[0], /Skipped 1 example row/);
});

test("a stored value the importer would refuse fresh is not reported when the cell repeats it", () => {
  // As production has them: one covered entry with commas in it, and an
  // address with a note after it, both written before these checks existed.
  const body = stored({
    covers: ["L'Aquila (University, Academy of Fine Arts, Conservatory)"],
    apply_url: "https://www.ardis.fvg.it (Servizi On Line, SPID)",
  });
  const untouched = {
    Name: body.name,
    "Universities covered": body.covers[0],
    "Apply URL": body.apply_url,
  };
  const result = plan([untouched], [body]);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.updates, []);
  assert.equal(result.unchanged, 1);
});

test("...but a changed value is still checked, and refused", () => {
  const body = stored({ apply_url: "https://www.ardis.fvg.it (Servizi On Line, SPID)" });
  const edited = { Name: body.name, "Apply URL": "www.ardis.fvg.it", "Universities covered": "Perugia, Terni" };
  const result = plan([edited], [body]);
  assert.ok(result.problems.some((p) => /Apply URL "www.ardis.fvg.it" is not a web address/.test(p)), result.problems.join(" | "));
  assert.ok(result.problems.some((p) => /read as ONE university/.test(p)), result.problems.join(" | "));
});

test("...and a similar name is checked in full, since it is somebody's edit", () => {
  const body = stored({ apply_url: "https://www.ardis.fvg.it (Servizi On Line, SPID)" });
  const result = plan([{ Name: "DSU Toscano", "Apply URL": body.apply_url }], [body]);
  assert.ok(result.problems.some((p) => /is not a web address/.test(p)), result.problems.join(" | "));
});

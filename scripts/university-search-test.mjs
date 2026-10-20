import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filtersQuery,
  fold,
  highlightRanges,
  isFiltered,
  matchCounts,
  readFilters,
  searchCatalogue,
  searchWords,
} from "../src/lib/universitySearch.ts";

const IT = "dest-it";
const DE = "dest-de";
const DEST_TEXT = new Map([
  [IT, "Italy (Public) Italy"],
  [DE, "Germany (Public) Germany"],
]);

const UNIS = [
  { id: "polimi", name: "Politecnico di Milano", short_name: "PoliMi", city: "Milan", region: "Lombardy", type: "public", destination_id: IT },
  { id: "bocconi", name: "Università Bocconi", short_name: null, city: "Milan", region: "Lombardy", type: "private", destination_id: IT },
  { id: "pavia", name: "Università di Pavia", short_name: null, city: "Pavia", region: "Lombardy", type: "public", destination_id: IT },
  { id: "stgallen", name: "St. Gallen Institute", short_name: null, city: null, region: null, type: "private", destination_id: DE },
  { id: "tum", name: "Technical University of Munich", short_name: "TUM", city: "Munich", region: "Bavaria", type: "public", destination_id: DE },
];

const PROGS = [
  { university_id: "polimi", name: "Computer Science and Engineering", level: "masters", fields: "IT/CS" },
  { university_id: "polimi", name: "Architecture", level: "bachelors", fields: "Design" },
  { university_id: "polimi", name: "Computer Engineering", level: "Bachelors", fields: "IT/CS" },
  { university_id: "bocconi", name: "Economics and Management", level: "masters", fields: "Business" },
  { university_id: "bocconi", name: "Data Science", level: "masters", fields: "IT/CS" },
  { university_id: "pavia", name: "Medicine", level: "Single-cycle master's", fields: "Health" },
  { university_id: "tum", name: "Informatics", level: "PhD", fields: "IT/CS / Computer science" },
];

const ids = (matches) => matches.map((m) => m.university.id);
const names = (match) => match.programmes.map((p) => p.name);

test("no search and no filters shows every university, each with all its programmes", () => {
  const all = searchCatalogue(UNIS, PROGS, {}, DEST_TEXT);
  assert.deepEqual(ids(all), ["polimi", "bocconi", "pavia", "stgallen", "tum"]);
  assert.ok(all.every((m) => m.matchedBy === "all"));
  assert.equal(all[0].programmes.length, 3);
  assert.deepEqual(matchCounts(all), { universities: 5, programmes: 7 });
});

test("accents, case and punctuation do not matter", () => {
  assert.equal(fold("Università  di Pavia!"), " universita di pavia ");
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { q: "universita" }, DEST_TEXT)), ["bocconi", "pavia"]);
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { q: "UNIVERSITÀ pav" }, DEST_TEXT)), ["pavia"]);
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { q: "st gallen" }, DEST_TEXT)), ["stgallen"]);
  assert.deepEqual(searchWords("  St.  Gallen, "), ["st", "gallen"]);
});

test("a university found by its own name, short name, city, region or country brings all its programmes", () => {
  const byCity = searchCatalogue(UNIS, PROGS, { q: "milan" }, DEST_TEXT);
  assert.deepEqual(ids(byCity), ["polimi", "bocconi"]);
  assert.ok(byCity.every((m) => m.matchedBy === "university"));
  assert.equal(byCity[0].programmes.length, 3, "every Politecnico programme comes with it");
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { q: "tum" }, DEST_TEXT)), ["tum"]);
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { q: "lombardy" }, DEST_TEXT)), ["polimi", "bocconi", "pavia"]);
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { q: "germany" }, DEST_TEXT)), ["stgallen", "tum"]);
});

test("a university found only through some programmes brings just those", () => {
  const cs = searchCatalogue(UNIS, PROGS, { q: "computer" }, DEST_TEXT);
  assert.deepEqual(ids(cs), ["polimi", "tum"]);
  assert.equal(cs[0].matchedBy, "programmes");
  assert.deepEqual(names(cs[0]), ["Computer Science and Engineering", "Computer Engineering"]);
  assert.deepEqual(names(cs[1]), ["Informatics"], "found by its fields");
  assert.equal(cs[0].programmesAtLevel, 3);
  assert.deepEqual(matchCounts(cs), { universities: 2, programmes: 3 });
});

test("every word must be found, across the university and the programme", () => {
  const milanCs = searchCatalogue(UNIS, PROGS, { q: "milan computer" }, DEST_TEXT);
  assert.deepEqual(ids(milanCs), ["polimi"], "Bocconi is in Milan but teaches no computer programme");
  assert.deepEqual(names(milanCs[0]), ["Computer Science and Engineering", "Computer Engineering"]);
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { q: "milan medicine" }, DEST_TEXT)), [], "medicine is in Pavia");
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { q: "computer architecture" }, DEST_TEXT)), [], "no one programme is both");
});

test("a level shows only universities teaching at it, with only those programmes, however the level is spelled", () => {
  const bachelors = searchCatalogue(UNIS, PROGS, { level: "bachelors" }, DEST_TEXT);
  assert.deepEqual(ids(bachelors), ["polimi"]);
  assert.deepEqual(names(bachelors[0]), ["Architecture", "Computer Engineering"], "'Bachelors' is bachelors");
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { level: "phd" }, DEST_TEXT)), ["tum"], "'PhD' is phd");
  // A level of the university's own is not one of the three, and not found by them.
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { level: "masters" }, DEST_TEXT)), ["polimi", "bocconi"]);
  // With a search: the level narrows what the search found.
  const milanMasters = searchCatalogue(UNIS, PROGS, { q: "milan", level: "masters" }, DEST_TEXT);
  assert.deepEqual(milanMasters.map((m) => [m.university.id, names(m)]), [
    ["polimi", ["Computer Science and Engineering"]],
    ["bocconi", ["Economics and Management", "Data Science"]],
  ]);
});

test("type and destination narrow the list", () => {
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { type: "private" }, DEST_TEXT)), ["bocconi", "stgallen"]);
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { destination: DE }, DEST_TEXT)), ["stgallen", "tum"]);
  assert.deepEqual(ids(searchCatalogue(UNIS, PROGS, { destination: IT, type: "private", q: "data" }, DEST_TEXT)), ["bocconi"]);
});

test("the filters go into the address and come back out, and anything unknown is no filter", () => {
  const f = { q: " computer sci ", destination: IT, type: "private", level: "masters" };
  const qs = filtersQuery(f);
  assert.equal(qs, `q=computer+sci&destination=${IT}&type=private&level=masters`);
  assert.deepEqual(readFilters(new URLSearchParams(qs)), { q: "computer sci", destination: IT, type: "private", level: "masters" });
  assert.deepEqual(readFilters(new URLSearchParams("destination=all&type=Private&level=diploma")), { q: null, destination: null, type: null, level: null });
  assert.equal(filtersQuery({}), "");
  assert.equal(isFiltered({ q: "  " }), false);
  assert.equal(isFiltered({ level: "phd" }), true);
});

test("the search's words are marked where they are, accents and all", () => {
  assert.deepEqual(highlightRanges("Università di Pavia", ["universita"]), [[0, 10]]);
  assert.deepEqual(highlightRanges("Computer Science and Engineering", ["sci", "comp"]), [[0, 4], [9, 12]]);
  assert.deepEqual(highlightRanges("St. Gallen", ["gallen"]), [[4, 10]]);
  assert.deepEqual(highlightRanges("Anything", []), []);
  // Overlapping words are one mark.
  assert.deepEqual(highlightRanges("Engineering", ["engine", "gineer"]), [[0, 8]]);
});

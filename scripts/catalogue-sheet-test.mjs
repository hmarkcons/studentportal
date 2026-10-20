import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGUE_COLUMNS,
  catalogueColumnIndex,
  catalogueRowsForUniversity,
  compareProgrammes,
  roundsCell,
  normalizeHeader,
  unreadColumns,
  CATALOGUE_SHEET_READS,
  UNIVERSITY_SHEET_HEADERS,
  roundRowsForUniversity,
  universitySheetRow,
} from "../src/lib/catalogueSheet.ts";
import {
  programFromRow,
  roundsFromRow,
  resolveDestination,
  universityFromRow,
} from "../src/lib/catalogueRows.ts";

const university = {
  name: "Università di Pavia",
  city: "Pavia",
  region: "Lombardy",
  type: "public",
  levels_offered: ["bachelors", "masters"],
  fields_offered: ["Engineering", "IT/CS"],
  contact_email: "admissions@unipv.it",
};

const programme = {
  level: "masters",
  name: "Computer Engineering",
  core_field: "IT/CS",
  sub_field: "Software",
  tuition_fee: "3000.00",
  duration: "2 years",
  language_requirement: "B2 English",
  intake_dates: ["Fall", "Spring"],
  interview_required: false,
  interview_details: null,
  admission_test_required: true,
  admission_test_type: "TOLC",
  application_portal_name: "Universitaly",
  application_portal_link: "https://universitaly.it",
  page_link: "https://unipv.it/ce",
};

const rounds = [
  { label: "Round 2", start_date: "2027-02-01", application_deadline: "2026-09-15", sort_order: 2 },
  { label: "Round 1", start_date: "2026-09-01", application_deadline: "2026-01-15", sort_order: 1 },
];

test("every column is written on every row", () => {
  const [row] = catalogueRowsForUniversity(university, [{ program: programme, rounds }]);
  assert.deepEqual(Object.keys(row).sort(), CATALOGUE_COLUMNS.map((c) => c.header).sort());
});

test("a university with no programmes is still one row", () => {
  const rows = catalogueRowsForUniversity(university, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].university_name, "Università di Pavia");
  assert.equal(rows[0].program_name, "");
  assert.equal(rows[0].level, "");
});

test("the university columns repeat on every programme row", () => {
  const rows = catalogueRowsForUniversity(university, [
    { program: programme, rounds: [] },
    { program: { ...programme, name: "Data Science" }, rounds: [] },
  ]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.university_name === "Università di Pavia" && r.city === "Pavia"));
});

test("rounds serialise in sort order, not the order they came back", () => {
  assert.equal(
    roundsCell(rounds),
    "Round 1|2026-09-01|2026-01-15; Round 2|2027-02-01|2026-09-15"
  );
});

test("a round with no dates at all is not written", () => {
  assert.equal(roundsCell([{ label: "Empty", start_date: null, application_deadline: null }]), "");
  assert.equal(roundsCell([]), "");
});

test("rounds are not on the Catalogue sheet any more — they have a sheet of their own", () => {
  const [row] = catalogueRowsForUniversity(university, [{ program: programme, rounds }]);
  assert.equal("rounds" in row, false);
  assert.equal("start_date" in row, false);
  assert.equal("application_deadline" in row, false);
});

test("a fee loses the trailing zeros numeric(12,2) adds", () => {
  // "3000.00" read back and compared against 3000 is equal numerically, but
  // the cell should not look like somebody edited it either.
  const [row] = catalogueRowsForUniversity(university, [{ program: programme, rounds: [] }]);
  assert.equal(row.tuition_fee, "3000");
});

test("a false boolean writes 'no', a null writes nothing", () => {
  const [row] = catalogueRowsForUniversity(university, [{ program: programme, rounds: [] }]);
  assert.equal(row.interview_required, "no");
  assert.equal(row.admission_test_required, "yes");
  const [unknown] = catalogueRowsForUniversity(university, [
    { program: { ...programme, interview_required: null }, rounds: [] },
  ]);
  assert.equal(unknown.interview_required, "");
});

// ---------------------------------------------------------- the round trip

test("an exported row parses back into exactly what was exported", () => {
  // The property the whole export exists for: export, change nothing, upload,
  // and the import must find nothing to do. If serialisation and parsing ever
  // drift, this is where it shows.
  const [row] = catalogueRowsForUniversity(university, [{ program: programme, rounds }]);

  const backUniversity = universityFromRow(row, "university_name", []);
  assert.equal(backUniversity.name, university.name);
  assert.equal(backUniversity.city, university.city);
  assert.equal(backUniversity.region, university.region);
  assert.equal(backUniversity.type, university.type);
  assert.deepEqual(backUniversity.levels_offered, university.levels_offered);
  assert.deepEqual(backUniversity.fields_offered, university.fields_offered);
  assert.equal(backUniversity.contact_email, university.contact_email);

  const backProgram = programFromRow(row, "program_name", []);
  assert.equal(backProgram.level, programme.level);
  assert.equal(backProgram.name, programme.name);
  assert.equal(backProgram.core_field, programme.core_field);
  assert.equal(backProgram.sub_field, programme.sub_field);
  assert.equal(backProgram.tuition_fee, "3000");
  assert.equal(backProgram.duration, programme.duration);
  assert.equal(backProgram.language_requirement, programme.language_requirement);
  assert.deepEqual(backProgram.intake_dates, programme.intake_dates);
  assert.equal(backProgram.interview_required, "no");
  assert.equal(backProgram.admission_test_required, "yes");
  assert.equal(backProgram.admission_test_type, programme.admission_test_type);
  assert.equal(backProgram.page_link, programme.page_link);

  // The catalogue row says nothing about rounds — the Rounds sheet carries
  // them — and "nothing" must read back as nothing, never as "no rounds".
  assert.deepEqual(roundsFromRow(row, []), []);
});

test("a university with nothing recorded round-trips as all-blank, not as nulls", () => {
  // The Italy case: 26 of 28 have no city and none has a region. Those cells
  // must come back as "said nothing" so re-importing does not try to write
  // empty strings over them.
  const bare = {
    name: "Politecnico di Torino",
    city: null, region: null, type: "public",
    levels_offered: [], fields_offered: [], contact_email: null,
  };
  const [row] = catalogueRowsForUniversity(bare, []);
  const back = universityFromRow(row, "university_name", []);
  assert.equal(back.city, null);
  assert.equal(back.region, null);
  assert.equal(back.contact_email, null);
  assert.deepEqual(back.levels_offered, []);
});

test("programmes are ordered bachelors, masters, phd, then by name", () => {
  const order = [
    { level: "phd", name: "Zoology" },
    { level: "bachelors", name: "Physics" },
    { level: "masters", name: "Architecture" },
    { level: "bachelors", name: "Architecture" },
  ].sort(compareProgrammes);
  assert.deepEqual(
    order.map((p) => `${p.level}:${p.name}`),
    ["bachelors:Architecture", "bachelors:Physics", "masters:Architecture", "phd:Zoology"]
  );
});

test("column indexes are 1-based, as a validation range needs", () => {
  assert.equal(catalogueColumnIndex("destination"), 1);
  assert.equal(catalogueColumnIndex("university_name"), 2);
  assert.equal(catalogueColumnIndex("page_link"), CATALOGUE_COLUMNS.length);
});

test("an exported row names its destination, and that name resolves back to it", () => {
  // The all-destinations export only round-trips if the cell it writes is one
  // the importer maps back to the same destination and no other.
  const destinations = [
    { id: "it", display_name: "Italy (Public)", country: "Italy", country_code: "IT", track: "public" },
    { id: "de", display_name: "Germany (Public)", country: "Germany", country_code: "DE", track: "public" },
  ];
  const [row] = catalogueRowsForUniversity({ ...university, destination: "Italy (Public)" }, []);
  assert.equal(row.destination, "Italy (Public)");
  assert.equal(resolveDestination(row.destination, destinations).destination?.id, "it");
});

test("a row built without a destination leaves the cell blank for the form's fallback", () => {
  const [row] = catalogueRowsForUniversity(university, []);
  assert.equal(row.destination, "");
});

// ------------------------------- application fee, coordinator, DSU body (0287)

test("a fee and a tuition in words go out and come back as written (0303)", () => {
  const worded = { ...university, application_fee: "Free for EU students", application_fee_currency: "EUR" };
  const own = { ...programme, tuition_fee: "€3,000 per year", application_fee: "€30 (EU) / €50 (non-EU)", application_fee_currency: "EUR" };
  const [row] = catalogueRowsForUniversity(worded, [{ program: own, rounds: [] }]);
  assert.equal(row.university_application_fee, "Free for EU students");
  assert.equal(row.tuition_fee, "€3,000 per year");
  assert.equal(row.program_application_fee, "€30 (EU) / €50 (non-EU)");
  assert.equal(universityFromRow(row, "university_name", []).application_fee, "Free for EU students");
  const p = programFromRow(row, "program_name", []);
  assert.equal(p.tuition_fee, "€3,000 per year");
  assert.equal(p.application_fee, "€30 (EU) / €50 (non-EU)");
});

test("the new columns round-trip: an untouched export changes nothing", () => {
  const withFees = { ...university, application_fee: "30.00", application_fee_currency: "EUR", dsu_body: "EDiSU Pavia" };
  const own = { ...programme, application_fee: "45.50", application_fee_currency: "GBP", coordinator_email: "ce@unipv.it" };
  const [row] = catalogueRowsForUniversity(withFees, [{ program: own, rounds: [] }]);
  assert.equal(row.university_application_fee, "30");
  assert.equal(row.university_application_fee_currency, "EUR");
  assert.equal(row.dsu_body, "EDiSU Pavia");
  assert.equal(row.program_application_fee, "45.5");
  assert.equal(row.program_application_fee_currency, "GBP");
  assert.equal(row.coordinator_email, "ce@unipv.it");

  const u = universityFromRow(row, "university_name", []);
  assert.equal(u.application_fee, "30");
  assert.equal(u.application_fee_currency, "EUR");
  assert.equal(u.dsu_body, "EDiSU Pavia");
  const p = programFromRow(row, "program_name", []);
  assert.equal(p.application_fee, "45.50");
  assert.equal(p.application_fee_currency, "GBP");
  assert.equal(p.coordinator_email, "ce@unipv.it");
});

test("a currency is written only beside a fee", () => {
  // The database keeps a currency after its fee is cleared. Written out, it
  // would read as a fee somebody charges; blank reads back as "said nothing".
  const cleared = { ...university, application_fee: null, application_fee_currency: "EUR" };
  const inherits = { ...programme, application_fee: null, application_fee_currency: "GBP" };
  const [row] = catalogueRowsForUniversity(cleared, [{ program: inherits, rounds: [] }]);
  assert.equal(row.university_application_fee, "");
  assert.equal(row.university_application_fee_currency, "");
  assert.equal(row.program_application_fee, "");
  assert.equal(row.program_application_fee_currency, "");
  assert.equal(universityFromRow(row, "university_name", []).application_fee_currency, null);
});

test("a free application exports as 0, not as blank", () => {
  const [row] = catalogueRowsForUniversity({ ...university, application_fee: 0, application_fee_currency: "EUR" }, []);
  assert.equal(row.university_application_fee, "0");
  assert.equal(row.university_application_fee_currency, "EUR");
});

test("each fee column sits in its own group, and page_link is still last", () => {
  const group = (h) => CATALOGUE_COLUMNS.find((c) => c.header === h)?.group;
  for (const h of ["university_application_fee", "university_application_fee_currency", "dsu_body"]) assert.equal(group(h), "university");
  for (const h of ["program_application_fee", "program_application_fee_currency", "coordinator_email"]) assert.equal(group(h), "programme");
  assert.equal(CATALOGUE_COLUMNS.at(-1).header, "page_link");
});

// ---------------------------------------------------------- column names

test("a renamed header still reaches its column", () => {
  // A filled Italy sheet came back with "DSU Body" and "Region": the upload
  // read neither, and said nothing.
  assert.equal(normalizeHeader("DSU Body"), "dsu_body");
  assert.equal(normalizeHeader(" Region "), "region");
  assert.equal(normalizeHeader("university-application-fee"), "university_application_fee");
  assert.equal(normalizeHeader("Program  Name"), "program_name");
});

test("a column the upload does not read is named, not dropped in silence", () => {
  const unread = unreadColumns(["university_name", "DSU Body", "Region", "Notes", "  "], CATALOGUE_SHEET_READS);
  assert.equal(unread.length, 1, unread.join(" / "));
  assert.match(unread[0], /column "Notes" is not one this upload reads/);
});

test("a bare application_fee on the combined sheet says which fee columns it has", () => {
  const [line] = unreadColumns(["application_fee"], CATALOGUE_SHEET_READS);
  assert.match(line, /university_application_fee .* or program_application_fee/);
  // On the universities sheet it is the column itself.
  assert.deepEqual(unreadColumns(["Application Fee"], UNIVERSITY_SHEET_HEADERS), []);
});

test("every column the template writes is one the upload reads", () => {
  assert.deepEqual(unreadColumns(CATALOGUE_COLUMNS.map((c) => c.header), CATALOGUE_SHEET_READS), []);
});

test("a yes/no in words, a level of its own and several emails go out and come back as written (0304)", () => {
  const own = {
    ...programme,
    level: "Single-cycle master's",
    interview_required: "Only for non-EU students",
    admission_test_required: "no",
    coordinator_email: "a@unipv.it, b@unipv.it",
  };
  const [row] = catalogueRowsForUniversity({ ...university, contact_email: "admissions@unipv.it, see the faculty page" }, [{ program: own, rounds: [] }]);
  assert.equal(row.level, "Single-cycle master's");
  assert.equal(row.interview_required, "Only for non-EU students");
  const back = programFromRow(row, "program_name", []);
  assert.equal(back.level, "Single-cycle master's");
  assert.equal(back.interview_required, "Only for non-EU students");
  assert.equal(back.admission_test_required, "no");
  assert.equal(back.coordinator_email, "a@unipv.it, b@unipv.it");
  assert.equal(universityFromRow(row, "university_name", []).contact_email, "admissions@unipv.it, see the faculty page");
});

// ------------------------------------------------- a search's export (0338)

const shared = [{ label: "1st call", start_date: "2026-02-01", application_deadline: "2026-03-01", sort_order: 1 }];
const p = (name, level = "masters") => ({ program: { name, level }, rounds: shared });

test("a whole university's shared rounds are written once, for every programme", () => {
  const all = [p("Computer Science"), p("Data Science"), p("Physics", "bachelors")];
  const rows = roundRowsForUniversity("Italy (Public)", "Università di Pavia", all);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].level, "");
  assert.equal(rows[0].program_name, "");
});

test("a search's export of some programmes writes each one's rounds, never a row reaching the rest", () => {
  // Imported, a row with no programme named reaches every programme the
  // university has: folded from the two exported, it would add the round to
  // Physics, which was not in the file.
  const every = [p("Computer Science"), p("Data Science"), p("Physics", "bachelors")];
  const rows = roundRowsForUniversity("Italy (Public)", "Università di Pavia", every.slice(0, 2), every);
  assert.deepEqual(
    rows.map((r) => [r.level, r.program_name, r.round]),
    [
      ["masters", "", "1st call"],
    ],
    "both masters programmes are all of its masters: one row for the level is still exact"
  );

  const oneOfTwo = roundRowsForUniversity("Italy (Public)", "Università di Pavia", every.slice(0, 1), every);
  assert.deepEqual(oneOfTwo.map((r) => [r.level, r.program_name]), [["masters", "Computer Science"]], "one of two masters: named");
});

test("rounds written for a level only when the export holds that level's every programme", () => {
  const every = [p("Computer Science"), p("Data Science"), p("Architecture", "bachelors"), p("Physics", "bachelors")];
  const some = [every[0], every[2], every[3]];
  const rows = roundRowsForUniversity("Italy (Public)", "Università di Pavia", some, every);
  assert.deepEqual(
    rows.map((r) => [r.level, r.program_name]),
    [
      ["bachelors", ""],
      ["masters", "Computer Science"],
    ]
  );
});

test("a universities-sheet row has the sheet's own columns and parses back into exactly what was exported", () => {
  const full = { ...university, destination: "Italy (Public)", short_name: "UniPV", application_fee: "30", application_fee_currency: "EUR", dsu_body: "EDiSU Pavia" };
  const row = universitySheetRow(full);
  assert.deepEqual(Object.keys(row), [...UNIVERSITY_SHEET_HEADERS]);
  assert.equal(row.name, "Università di Pavia");
  assert.equal(row.application_fee, "30");
  assert.equal(row.application_fee_currency, "EUR");

  const back = universityFromRow(row, "name", []);
  const [catalogueRow] = catalogueRowsForUniversity(full, []);
  // The same university as the catalogue's own columns describe it.
  assert.deepEqual(back, universityFromRow(catalogueRow, "university_name", []));
  assert.equal(back.short_name, "UniPV");
  assert.equal(back.dsu_body, "EDiSU Pavia");
  assert.deepEqual(back.levels_offered, university.levels_offered);
});

test("a universities-sheet row of a university with nothing on file is all blank, never null", () => {
  const row = universitySheetRow({ name: "Bare", city: null, region: null, type: null, levels_offered: null, fields_offered: null, contact_email: null });
  assert.ok(Object.values(row).every((v) => typeof v === "string"));
  assert.equal(Object.values(row).filter(Boolean).length, 1);
});


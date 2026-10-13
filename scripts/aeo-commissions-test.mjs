// AEO Pakistan: reading the office's sheet, planning an import, the totals and
// the export (src/lib/aeoCommissions.ts, src/lib/aeoWorkbook.ts, 0335).
import { test } from "node:test";
import assert from "node:assert/strict";
import writeXlsxFile from "write-excel-file/node";
import readXlsxFile from "read-excel-file/node";
import {
  parseDay,
  parseAmount,
  parseStatus,
  keyedRow,
  looksLikeAeoSheet,
  readRow,
  planAeoImport,
  aeoTotals,
  formatPkr,
  matchesFilter,
  challanYears,
  compareRecords,
  readForm,
  dmy,
} from "../src/lib/aeoCommissions.ts";
import { aeoWorkbook, AEO_SHEET } from "../src/lib/aeoWorkbook.ts";

// Rows as the office's sheet has them, its headers spelt as it spells them.
const HEADERS = ["Sr. #", "Candidate's Name", "Challan Number", "challan creat date ", "Test date", "Commission's Amount", "Payment Status"];
const sheet = (rows) => rows.map((r) => keyedRow(Object.fromEntries(HEADERS.map((h, i) => [h.trim().toLowerCase(), r[i] === undefined ? "" : String(r[i])]))));
const OFFICE = sheet([
  [1, "BABAR ALI KHAN", 85456, "001/8/2022", "(06/08/2022) ( ACADEMIC ) ( Computer Based ) (\nIELTS (IOC) )", 3000, "Unpaid"],
  [2, "SYEDA AMNA BATOOL NAQVI", 92621, "27/09/2022", "(05/10/2022) ( ACADEMIC ) ( Computer Based ) (\nIELTS FOR UKVI (IOC) )", 1200, "Unpaid"],
  [8, "MOHAMMAD MAIR BAIG", 110557, "2023-02-02", "(25/02/2023) ( ACADEMIC ) ( Paper Based ) ( IELTS\n(PB) )", 1200, "Unpaid"],
  [24, "SUFYAN AHMED", 213726, "2025-03-14", "(22/03/2025) ( ACADEMIC ) ( Computer Based )(IELTS (IOC) )", 2000, "Unpaid"],
  [33, "SUFYAN AHMED", 217936, "2025-06-18", "(25/06/2025) ( ACADEMIC ) ( Computer Based ) (IELTS (IOC) ", 2000, "Unpaid"],
  ["", "", "", "", "Total", 9400, ""],
]);

const stored = (over = {}) => ({
  id: "r1",
  sr_no: 1,
  candidate_name: "BABAR ALI KHAN",
  challan_number: "85456",
  challan_date: "2022-08-01",
  test_details: "(06/08/2022) ( ACADEMIC ) ( Computer Based ) (\nIELTS (IOC) )",
  commission_amount: 3000,
  payment_status: "unpaid",
  paid_on: null,
  payment_reference: null,
  notes: null,
  ...over,
});

test("the office's dates are read day first, however they were typed", () => {
  assert.deepEqual(parseDay("001/8/2022"), { day: "2022-08-01" }, "a stray zero before the day");
  assert.deepEqual(parseDay("27/09/2022"), { day: "2022-09-27" });
  assert.deepEqual(parseDay("005/1/2023"), { day: "2023-01-05" });
  assert.deepEqual(parseDay("7-1-25"), { day: "2025-01-07" });
  assert.deepEqual(parseDay("2023-02-02"), { day: "2023-02-02" }, "a real date cell");
  assert.deepEqual(parseDay("2022/08/01"), { day: "2022-08-01" }, "year first");
  assert.deepEqual(parseDay("44958"), { day: "2023-02-01" }, "Excel's day number");
  assert.deepEqual(parseDay(""), { day: null });
  assert.ok("error" in parseDay("31/02/2023"), "no 31st of February");
  assert.ok("error" in parseDay("next week"));
});

test("an amount may carry rupees and commas; a status is Paid or Unpaid", () => {
  assert.deepEqual(parseAmount("3,300"), { amount: 3300 });
  assert.deepEqual(parseAmount("Rs. 1,200"), { amount: 1200 });
  assert.deepEqual(parseAmount("PKR 2500.50"), { amount: 2500.5 });
  assert.ok("error" in parseAmount("-100"));
  assert.ok("error" in parseAmount("three thousand"));
  assert.deepEqual(parseStatus(" paid "), { status: "paid" });
  assert.deepEqual(parseStatus("UNPAID"), { status: "unpaid" });
  assert.ok("error" in parseStatus("maybe"));
});

test("the office's headers are recognised, typo and all", () => {
  assert.ok(looksLikeAeoSheet(HEADERS));
  assert.equal(looksLikeAeoSheet(["Payment Status"]), false, "a list of statuses is not the register");
  assert.equal(OFFICE[0].challan_date, "001/8/2022");
  assert.equal(OFFICE[0].commission_amount, "3000");
});

test("a row reads as the table holds it; the Total row is passed over", () => {
  const read = readRow(OFFICE[0], 2);
  assert.equal(read.row.challan_number, "85456");
  assert.equal(read.row.challan_date, "2022-08-01");
  assert.equal(read.row.payment_status, "unpaid");
  assert.ok(read.row.test_details.includes("IELTS (IOC)"), "the test as typed");
  assert.deepEqual(readRow(OFFICE[5], 7), { skip: true });
  const crlf = readRow({ candidate_name: "A", challan_number: "1", test_details: "(06/08/2022) (\r\nIELTS (IOC) )" }, 2);
  assert.equal(crlf.row.test_details, "(06/08/2022) (\nIELTS (IOC) )", "a Windows line break reads as a plain one");
});

test("a row it cannot use says why and which", () => {
  assert.match(readRow({ candidate_name: "ALI" }, 4).error, /Row 4 \(ALI\): no challan number/);
  assert.match(
    readRow({ candidate_name: "ALI", challan_number: "9", challan_date: "33/1/2024" }, 5).error,
    /Row 5 \(challan 9\): "33\/1\/2024" is not a real date/,
  );
  assert.match(
    readRow({ candidate_name: "ALI", challan_number: "9", payment_status: "Unpaid", paid_on: "01/01/2025" }, 6).error,
    /says Unpaid but has a date paid/,
  );
});

test("the office's sheet, imported into an empty table, adds every registration", () => {
  const plan = planAeoImport(OFFICE, []);
  assert.equal(plan.creates.length, 5);
  assert.deepEqual(plan.problems, []);
  assert.equal(plan.creates[0].sr_no, 1);
  assert.equal(plan.creates[2].challan_date, "2023-02-02");
  assert.equal(plan.creates.filter((c) => c.candidate_name === "SUFYAN AHMED").length, 2, "one candidate, two challans");
  // Every row carries every column: a batch insert takes the union of the keys.
  const shapes = new Set(plan.creates.map((c) => Object.keys(c).sort().join(",")));
  assert.equal(shapes.size, 1);
  assert.match(plan.additions[0], /Challan 85456 · BABAR ALI KHAN — PKR 3,000, unpaid/);
});

test("a challan already on file is updated field by field; a blank cell changes nothing", () => {
  const plan = planAeoImport(sheet([[1, "BABAR ALI KHAN", 85456, "", "", 3500, ""]]), [stored()]);
  assert.equal(plan.creates.length, 0);
  assert.deepEqual(plan.updates[0].values, { commission_amount: 3500 });
  assert.deepEqual(plan.updates[0].lines, ["Challan 85456 · commission PKR 3,000 → PKR 3,500"]);
  const same = planAeoImport(sheet([[1, "BABAR ALI KHAN", " 85456 ", "001/8/2022", "", 3000, "Unpaid"]]), [stored()]);
  assert.equal(same.unchanged, 1, "matched by challan, spaces aside");
  assert.equal(same.updates.length, 0);
});

test("paid in the sheet with a date and reference; unpaid again takes them off", () => {
  const cells = keyedRow({ "challan number": "85456", "payment status": "Paid", "paid on": "10/10/2026", "payment reference": "TRX-77" });
  const plan = planAeoImport([cells], [stored()]);
  assert.deepEqual(plan.updates[0].values, { payment_status: "paid", paid_on: "2026-10-10", payment_reference: "TRX-77" });
  const dated = planAeoImport([keyedRow({ "challan number": "85456", "paid on": "10/10/2026" })], [stored()]);
  assert.equal(dated.updates[0].values.payment_status, "paid", "a date paid means paid");
  const back = planAeoImport(
    [keyedRow({ "challan number": "85456", "payment status": "Unpaid" })],
    [stored({ payment_status: "paid", paid_on: "2026-10-10", payment_reference: "TRX-77" })],
  );
  assert.deepEqual(back.updates[0].values, { payment_status: "unpaid", paid_on: null, payment_reference: null });
});

test("the same challan twice in one sheet is used once and reported", () => {
  const plan = planAeoImport(
    sheet([
      [1, "A", 5, "", "", 100, ""],
      [2, "B", 5, "", "", 200, ""],
    ]),
    [],
  );
  assert.equal(plan.creates.length, 1);
  assert.match(plan.problems[0], /Row 3 \(challan 5\): the same challan is on row 2/);
});

test("a new row with no Sr. # is numbered after the highest", () => {
  const plan = planAeoImport(sheet([["", "NEW", 999, "", "", 100, ""]]), [stored({ sr_no: 35 })]);
  assert.equal(plan.creates[0].sr_no, 36);
});

test("totals: earned, paid and outstanding, counted", () => {
  const t = aeoTotals([
    { commission_amount: 3000, payment_status: "paid" },
    { commission_amount: 1200, payment_status: "unpaid" },
    { commission_amount: "0.1", payment_status: "unpaid" },
    { commission_amount: "0.2", payment_status: "unpaid" },
  ]);
  assert.deepEqual(t, { count: 4, earned: 4200.3, paid: 3000, outstanding: 1200.3, paidCount: 1, unpaidCount: 3 });
  assert.equal(formatPkr(65300), "PKR 65,300");
  assert.equal(formatPkr(2500.5), "PKR 2,500.50");
});

test("search, status and year filter as the page does; the sheet's order is the challan date", () => {
  const a = stored();
  const b = stored({
    id: "r2",
    candidate_name: "SUFYAN AHMED",
    challan_number: "213726",
    challan_date: "2025-03-14",
    payment_status: "paid",
    paid_on: "2025-04-01",
    payment_reference: "CHQ 55",
  });
  assert.equal(matchesFilter(b, { q: "sufyan" }), true);
  assert.equal(matchesFilter(b, { q: "chq 55" }), true, "the reference is searched");
  assert.equal(matchesFilter(a, { status: "paid" }), false);
  assert.equal(matchesFilter(b, { year: "2025" }), true);
  assert.deepEqual(challanYears([a, b]), ["2025", "2022"]);
  assert.deepEqual(
    [b, a].sort(compareRecords).map((r) => r.id),
    ["r1", "r2"],
  );
  assert.equal(dmy("2025-03-14"), "14/03/2025");
});

test("the form reads one record; Unpaid drops a payment's details it still held", () => {
  const form = {
    candidate_name: "ALI",
    challan_number: "77",
    challan_date: "2025-01-05",
    commission_amount: "2,000",
    payment_status: "unpaid",
    paid_on: "2025-02-01",
    payment_reference: "X",
  };
  const read = readForm((k) => form[k] ?? "");
  assert.equal(read.values.paid_on, null);
  assert.equal(read.values.payment_reference, null);
  assert.equal(read.values.commission_amount, 2000);
  assert.match(readForm((k) => ({ challan_number: "1" })[k] ?? "").error, /name/);
  assert.match(readForm((k) => ({ candidate_name: "A", challan_number: "1", commission_amount: "lots" })[k] ?? "").error, /not an amount/);
});

test("an export opens as the office's sheet and imports back changing nothing", async () => {
  const records = [
    stored(),
    stored({
      id: "r2",
      sr_no: 2,
      candidate_name: "SYEDA AMNA BATOOL NAQVI",
      challan_number: "092621",
      challan_date: "2022-09-27",
      commission_amount: 1200.5,
      payment_status: "paid",
      paid_on: "2026-10-10",
      payment_reference: "TRX-77",
      notes: "Paid with the October batch",
    }),
  ];
  const { sheets, options, finish } = aeoWorkbook(records);
  const bytes = finish(await writeXlsxFile(sheets, options).toBuffer());
  const read = await readXlsxFile(Buffer.from(bytes));
  const main = read.find((s) => s.sheet === AEO_SHEET);
  assert.ok(main, "the data sheet");
  const [head, ...data] = main.data;
  assert.deepEqual(head.slice(0, 7), [
    "Sr. #",
    "Candidate's Name",
    "Challan Number",
    "Challan create date",
    "Test date",
    "Commission's Amount",
    "Payment Status",
  ]);
  const text = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? "" : String(v));
  const cells = data.map((row) => keyedRow(Object.fromEntries(head.map((h, i) => [String(h).toLowerCase(), text(row[i])]))));
  assert.equal(cells[1].challan_number, "092621", "a challan with a leading zero stays text");
  assert.equal(cells[0].challan_number, "85456");
  const totalRow = data.find((row) => row.includes("Total"));
  assert.ok(totalRow, "the Total row is under the amounts");
  const plan = planAeoImport(cells, records);
  assert.deepEqual(plan.problems, []);
  assert.equal(plan.creates.length, 0);
  assert.equal(plan.updates.length, 0, JSON.stringify(plan.updates));
  assert.equal(plan.unchanged, 2);
});

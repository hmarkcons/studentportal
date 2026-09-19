import { test } from "node:test";
import assert from "node:assert/strict";
import writeXlsxFile from "write-excel-file/node";
import { unzipSync, strFromU8 } from "fflate";
import {
  addDropdownsAndHideSheets,
  columnLetter,
  listRange,
} from "../src/lib/xlsxDropdowns.ts";

// The registered-student import template's dropdowns and hidden list sheet are
// raw OOXML written by hand, because neither write-excel-file nor
// read-excel-file has an API for data validation. That makes this the riskiest
// code in the spreadsheet path and the part with the least margin: a wrong
// element order or an unescaped quote does not fail loudly, it produces a file
// Excel offers to "repair", usually by discarding whatever it could not parse.
//
// scripts/check-xlsx-in-excel.ps1 is the final word on that, but it needs a
// Windows machine with Excel on it. These cover the same ground in CI terms.

const COUNSELLORS = ["Muhammad Usman", "Sohaib Ur Rehman"];
const COUNTRIES = ["Germany (Public)", "Hungary (Public)", "Italy (Public)"];

/** A two-sheet workbook shaped like the template, before any dropdowns. */
async function baseWorkbook() {
  const students = [
    [
      { value: "full_name", type: String },
      { value: "country_of_interest", type: String },
      { value: "assigned_counselor", type: String },
    ],
    [
      { value: "Jane Doe", type: String },
      { value: "Italy", type: String },
      { value: COUNSELLORS[0], type: String },
    ],
  ];
  const lists = [[{ value: "Counsellors", type: String }, { value: "Countries", type: String }]];
  for (let i = 0; i < Math.max(COUNSELLORS.length, COUNTRIES.length); i++) {
    lists.push([
      { value: COUNSELLORS[i], type: String },
      { value: COUNTRIES[i], type: String },
    ]);
  }
  return await writeXlsxFile(
    [
      { data: students, sheet: "Students" },
      { data: lists, sheet: "Lists" },
    ],
    {}
  ).toBuffer();
}

const sheetXml = (buffer) => strFromU8(unzipSync(buffer)["xl/worksheets/sheet1.xml"]);
const workbookXml = (buffer) => strFromU8(unzipSync(buffer)["xl/workbook.xml"]);

const dropdown = (over) => ({
  column: 2,
  fromRow: 2,
  toRow: 301,
  range: listRange("Lists", "B", COUNTRIES.length),
  errorTitle: "Not a destination",
  errorMessage: "Choose a country from the list.",
  ...over,
});

// --------------------------------------------------------------- the helpers
test("a column number becomes its spreadsheet letter", () => {
  assert.equal(columnLetter(1), "A");
  assert.equal(columnLetter(26), "Z");
  assert.equal(columnLetter(27), "AA");
  assert.equal(columnLetter(52), "AZ");
  assert.equal(columnLetter(53), "BA");
});

test("there is no column zero", () => {
  assert.throws(() => columnLetter(0), /start at 1/);
  assert.throws(() => columnLetter(-3), /start at 1/);
});

test("a list range skips the title row", () => {
  assert.equal(listRange("Lists", "B", 17), "Lists!$B$2:$B$18");
});

test("an empty list still yields a range Excel accepts", () => {
  // "Lists!$A$2:$A$1" is backwards and would be rejected; a single blank cell
  // reads as an empty dropdown instead.
  assert.equal(listRange("Lists", "A", 0), "Lists!$A$2");
});

// ------------------------------------------------------------- the injection
test("a dropdown is written as a list validation over the given range", async () => {
  const xml = sheetXml(addDropdownsAndHideSheets(await baseWorkbook(), {
    sheet: "Students",
    dropdowns: [dropdown()],
  }));
  assert.match(xml, /<dataValidations count="1">/);
  assert.match(xml, /type="list"/);
  assert.match(xml, /sqref="B2:B301"/);
  assert.match(xml, /<formula1>Lists!\$B\$2:\$B\$4<\/formula1>/);
});

test("it warns rather than blocks", () => {
  // A country typed by hand that the importer can still resolve ("UK",
  // "Italy") must reach the resolver rather than being refused by the
  // spreadsheet, so the alert is a warning and blanks stay allowed.
  return baseWorkbook().then((wb) => {
    const xml = sheetXml(addDropdownsAndHideSheets(wb, { sheet: "Students", dropdowns: [dropdown()] }));
    assert.match(xml, /errorStyle="warning"/);
    assert.match(xml, /allowBlank="1"/);
  });
});

test("the block sits after sheetData, where CT_Worksheet requires it", async () => {
  const xml = sheetXml(addDropdownsAndHideSheets(await baseWorkbook(), {
    sheet: "Students",
    dropdowns: [dropdown()],
  }));
  // CT_Worksheet is a sequence, not a set. Out of order, Excel rejects the
  // whole file -- and every reader in this repo would still parse it happily,
  // which is why this is asserted rather than assumed.
  assert.ok(xml.indexOf("</sheetData>") < xml.indexOf("<dataValidations"));
  assert.ok(xml.indexOf("<dataValidations") < xml.indexOf("</worksheet>"));
});

test("several dropdowns go in one block", async () => {
  const xml = sheetXml(addDropdownsAndHideSheets(await baseWorkbook(), {
    sheet: "Students",
    dropdowns: [dropdown(), dropdown({ column: 3, range: listRange("Lists", "A", 2) })],
  }));
  assert.match(xml, /<dataValidations count="2">/);
  assert.match(xml, /sqref="C2:C301"/);
});

test("XML-special characters in a message cannot break the file", async () => {
  const xml = sheetXml(addDropdownsAndHideSheets(await baseWorkbook(), {
    sheet: "Students",
    dropdowns: [dropdown({ errorTitle: 'He said "no" & <stop>', errorMessage: "a < b" })],
  }));
  assert.match(xml, /errorTitle="He said &quot;no&quot; &amp; &lt;stop&gt;"/);
  assert.match(xml, /error="a &lt; b"/);
  assert.doesNotMatch(xml, /errorTitle="He said "no"/);
});

// ------------------------------------------------------------- hidden sheets
test("a helper sheet is hidden past the tab bar, not merely hidden", async () => {
  const wb = addDropdownsAndHideSheets(await baseWorkbook(), {
    sheet: "Students",
    dropdowns: [],
    hideSheets: ["Lists"],
  });
  // "hidden" is one right-click away from being shown; veryHidden is not.
  assert.match(workbookXml(wb), /<sheet[^>]*name="Lists"[^>]*state="veryHidden"/);
  assert.doesNotMatch(workbookXml(wb), /<sheet[^>]*name="Students"[^>]*state=/);
});

// --------------------------------------------------------------- the guards
test("an unknown sheet is refused, rather than quietly doing nothing", async () => {
  const wb = await baseWorkbook();
  assert.throws(
    () => addDropdownsAndHideSheets(wb, { sheet: "Nope", dropdowns: [dropdown()] }),
    /No sheet named "Nope"/
  );
  assert.throws(
    () => addDropdownsAndHideSheets(wb, { sheet: "Students", dropdowns: [], hideSheets: ["Ghost"] }),
    /No sheet named "Ghost"/
  );
});

test("it refuses to add a second validation block", async () => {
  const once = addDropdownsAndHideSheets(await baseWorkbook(), {
    sheet: "Students",
    dropdowns: [dropdown()],
  });
  // Two <dataValidations> in one worksheet is invalid, and the second would be
  // the one silently discarded.
  assert.throws(
    () => addDropdownsAndHideSheets(once, { sheet: "Students", dropdowns: [dropdown()] }),
    /already has dataValidations/
  );
});

test("a backwards or zero row range is refused", async () => {
  const wb = await baseWorkbook();
  assert.throws(
    () => addDropdownsAndHideSheets(wb, { sheet: "Students", dropdowns: [dropdown({ fromRow: 5, toRow: 2 })] }),
    /ends before it starts/
  );
  assert.throws(
    () => addDropdownsAndHideSheets(wb, { sheet: "Students", dropdowns: [dropdown({ fromRow: 0 })] }),
    /rows start at 1/
  );
});

test("asking for no dropdowns leaves the sheet alone", async () => {
  const before = await baseWorkbook();
  const after = addDropdownsAndHideSheets(before, { sheet: "Students", dropdowns: [] });
  assert.doesNotMatch(sheetXml(after), /<dataValidations/);
});

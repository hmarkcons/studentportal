import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

/**
 * Adds dropdowns, and hides helper sheets, in a workbook already written by
 * write-excel-file.
 *
 * write-excel-file covers everything else the import template needs — sheets,
 * column widths, a frozen header, bold and italic styling — but has no API for
 * data validation or for a hidden sheet. Those are the two reasons the template
 * is an .xlsx at all: the dropdown stops the counsellor and country columns
 * being mistyped, and the list of allowed values has to live somewhere out of
 * sight.
 *
 * So both are written here as OOXML into the workbook write-excel-file has
 * already made valid. That is a far smaller thing to own than a whole workbook
 * writer, and it is why exceljs is gone: exceljs could do this, but it has not
 * been released since Oct 2023, and its own fix for a uuid advisory was a
 * downgrade that would have cost these dropdowns.
 *
 * Every assumption about the file is asserted rather than hoped for. If
 * write-excel-file ever changes its output shape, this throws on the spot
 * instead of returning a workbook Excel would refuse to open.
 */

export type Dropdown = {
  /** 1-based column the dropdown applies to. */
  column: number;
  /** First and last data row, 1-based and inclusive of the header offset. */
  fromRow: number;
  toRow: number;
  /** The allowed values, as a formula range like `Lists!$B$2:$B$19`. */
  range: string;
  /** Shown when the typed value is not in the list. */
  errorTitle: string;
  errorMessage: string;
};

/**
 * Elements that must follow dataValidations inside <worksheet>.
 *
 * CT_Worksheet is a sequence, not a set: Excel rejects the whole file if the
 * order is wrong, so the block goes before the first of these that is present
 * rather than simply at the end. Taken from the same ordering table
 * write-excel-file uses internally (xlsx/helpers/orderOfSiblings).
 */
const AFTER_DATA_VALIDATIONS = [
  "hyperlinks",
  "printOptions",
  "pageMargins",
  "pageSetup",
  "headerFooter",
  "rowBreaks",
  "colBreaks",
  "customProperties",
  "cellWatches",
  "ignoredErrors",
  "smartTags",
  "drawing",
  "drawingHF",
  "picture",
  "oleObjects",
  "controls",
  "webPublishItems",
  "tableParts",
  "extLst",
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 1 -> A, 27 -> AA. */
export function columnLetter(column: number): string {
  if (column < 1) throw new Error(`Column numbers start at 1, got ${column}`);
  let out = "";
  let n = column;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    out = String.fromCharCode(65 + remainder) + out;
    n = (n - remainder - 1) / 26;
  }
  return out;
}

/**
 * A formula range over one column of a list sheet, skipping its title row.
 *
 * An empty list still has to produce a valid range — `Lists!$A$2:$A$1` is
 * rejected — so it points at the single blank cell instead, which Excel treats
 * as an empty dropdown rather than a broken one.
 */
export function listRange(sheet: string, column: string, count: number): string {
  return count > 0 ? `${sheet}!$${column}$2:$${column}$${count + 1}` : `${sheet}!$${column}$2`;
}

function dataValidationsXml(dropdowns: Dropdown[]): string {
  const entries = dropdowns.map((d) => {
    const letter = columnLetter(d.column);
    // An inverted or zero range writes something like sqref="D5:D2", which is
    // not a reference Excel accepts. Caught here rather than left for Excel to
    // reject the whole workbook over, since by then the only symptom is a file
    // that will not open.
    if (!Number.isInteger(d.fromRow) || d.fromRow < 1) {
      throw new Error(`Dropdown rows start at 1, got fromRow=${d.fromRow}`);
    }
    if (!Number.isInteger(d.toRow) || d.toRow < d.fromRow) {
      throw new Error(`Dropdown range ends before it starts: ${d.fromRow}..${d.toRow}`);
    }
    return (
      `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1"` +
      // A warning, not a hard stop: a country typed by hand that the importer
      // can still resolve ("UK", "Italy") must not be blocked by the
      // spreadsheet before it ever reaches the resolver.
      ` errorStyle="warning" errorTitle="${escapeXml(d.errorTitle)}" error="${escapeXml(d.errorMessage)}"` +
      ` sqref="${letter}${d.fromRow}:${letter}${d.toRow}">` +
      `<formula1>${escapeXml(d.range)}</formula1>` +
      `</dataValidation>`
    );
  });
  return `<dataValidations count="${entries.length}">${entries.join("")}</dataValidations>`;
}

/**
 * Which worksheet part belongs to a named sheet.
 *
 * workbook.xml lists the sheets in order with an r:id, and workbook.xml.rels
 * maps that id to the part. Matching on order alone would break the moment a
 * sheet is added, so the relationship is followed properly.
 */
function worksheetPathFor(files: Record<string, Uint8Array>, sheetName: string): string {
  const workbook = strFromU8(files["xl/workbook.xml"] ?? new Uint8Array());
  if (!workbook) throw new Error("xl/workbook.xml is missing — not a workbook");

  const escaped = sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sheetTag = workbook.match(new RegExp(`<sheet\\b[^>]*name="${escaped}"[^>]*>`));
  if (!sheetTag) throw new Error(`No sheet named "${sheetName}" in the workbook`);

  const relId = sheetTag[0].match(/r:id="([^"]+)"/)?.[1];
  if (!relId) throw new Error(`Sheet "${sheetName}" has no r:id`);

  const rels = strFromU8(files["xl/_rels/workbook.xml.rels"] ?? new Uint8Array());
  const target = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${relId}"[^>]*>`))?.[0].match(/Target="([^"]+)"/)?.[1];
  if (!target) throw new Error(`No relationship ${relId} for sheet "${sheetName}"`);

  // Targets are relative to xl/, and may or may not be written with a leading
  // slash depending on the writer.
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  if (!files[path]) throw new Error(`Worksheet part ${path} is not in the file`);
  return path;
}

export function addDropdownsAndHideSheets(
  workbook: Uint8Array | ArrayBuffer,
  {
    sheet,
    dropdowns,
    hideSheets = [],
  }: {
    /** The sheet the dropdowns are applied to. */
    sheet: string;
    dropdowns: Dropdown[];
    /** Sheets to mark veryHidden — not merely hidden, which a reader can unhide from the tab bar. */
    hideSheets?: string[];
  }
): Uint8Array {
  const bytes = workbook instanceof Uint8Array ? workbook : new Uint8Array(workbook);
  const files = unzipSync(bytes);

  if (dropdowns.length > 0) {
    const path = worksheetPathFor(files, sheet);
    let xml = strFromU8(files[path]);

    if (xml.includes("<dataValidations")) {
      throw new Error(`${path} already has dataValidations — refusing to add a second block`);
    }

    const anchor = AFTER_DATA_VALIDATIONS.map((name) => xml.indexOf(`<${name}`))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0];
    const at = anchor ?? xml.lastIndexOf("</worksheet>");
    if (at < 0) throw new Error(`${path} has no </worksheet> to insert before`);

    xml = xml.slice(0, at) + dataValidationsXml(dropdowns) + xml.slice(at);
    files[path] = strToU8(xml);
  }

  if (hideSheets.length > 0) {
    let workbookXml = strFromU8(files["xl/workbook.xml"]);
    for (const name of hideSheets) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const tag = new RegExp(`<sheet\\b([^>]*name="${escaped}"[^>]*?)(/?)>`);
      const found = workbookXml.match(tag);
      if (!found) throw new Error(`No sheet named "${name}" to hide`);
      if (found[1].includes("state=")) continue;
      workbookXml = workbookXml.replace(tag, `<sheet$1 state="veryHidden"$2>`);
    }
    files["xl/workbook.xml"] = strToU8(workbookXml);
  }

  return zipSync(files);
}

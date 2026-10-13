// The AEO Pakistan workbook: the office's own sheet, written back (0335).
//
// The same columns in the same order as the sheet the office keeps — Sr. #,
// Candidate's Name, Challan Number, Challan create date, Test date,
// Commission's Amount, Payment Status — then Paid on, Payment reference and
// Notes, and the Total under the amounts, with what is paid and what is still
// owed. So an export opens like their sheet, and imports straight back: every
// row matches its challan and nothing changes.
//
// Relative imports with their extension, not "@/": the unit test writes a real
// workbook through this and reads it back (aeo-commissions-test).
import { addDropdownsAndHideSheets, columnLetter, listRange } from "./xlsxDropdowns.ts";
import { SHEET_COLUMNS, STATUS_LABEL, type AeoRecord } from "./aeoCommissions.ts";

export const AEO_SHEET = "AEO Pakistan";
const LIST_SHEET = "Lists";
/** Rows past the data that still offer the Paid / Unpaid dropdown, for rows typed in later. */
const HEADROOM = 300;

const HEADER_FILL = "#DDEBF7";
const col = (key: (typeof SHEET_COLUMNS)[number]["key"]) => SHEET_COLUMNS.findIndex((c) => c.key === key) + 1;

/** A challan number as a number when it is one, so Excel does not flag "number stored as text". */
function challanCell(challan: string) {
  return /^[1-9]\d{0,14}$/.test(challan) ? { value: Number(challan), type: Number } : { value: challan, type: String };
}

const day = (iso: string | null) => (iso ? { value: new Date(`${iso}T00:00:00Z`), type: Date, format: "dd/mm/yyyy" } : { type: String });

export function aeoWorkbook(records: readonly AeoRecord[]) {
  const header = SHEET_COLUMNS.map((c) => ({ value: c.header, type: String, fontWeight: "bold" as const, backgroundColor: HEADER_FILL }));

  const rows = records.map((r) => [
    r.sr_no ? { value: r.sr_no, type: Number, fontWeight: "bold" as const } : { type: String },
    { value: r.candidate_name, type: String },
    challanCell(r.challan_number),
    day(r.challan_date),
    r.test_details ? { value: r.test_details, type: String, wrap: true } : { type: String },
    { value: Number(r.commission_amount) || 0, type: Number, format: Number.isInteger(Number(r.commission_amount)) ? "#,##0" : "#,##0.00" },
    { value: STATUS_LABEL[r.payment_status], type: String },
    day(r.paid_on),
    r.payment_reference ? { value: r.payment_reference, type: String } : { type: String },
    r.notes ? { value: r.notes, type: String, wrap: true } : { type: String },
  ]);

  // Under the amounts: the Total, as the office's sheet has it, and what is paid and owed.
  // Live formulas, so a row edited in Excel moves them; the import skips these rows,
  // which have no name and no challan.
  const amount = columnLetter(col("commission_amount"));
  const status = columnLetter(col("payment_status"));
  const first = 2;
  const last = Math.max(first, records.length + 1);
  const label = col("test_details") - 1;
  const totals = [
    ["Total", `=SUM(${amount}${first}:${amount}${last})`],
    ["Paid", `=SUMIF(${status}${first}:${status}${last},"Paid",${amount}${first}:${amount}${last})`],
    ["Outstanding", `=SUMIF(${status}${first}:${status}${last},"Unpaid",${amount}${first}:${amount}${last})`],
  ].map(([words, formula]) =>
    SHEET_COLUMNS.map((_, i) => {
      if (i === label) return { value: words, type: String, fontWeight: "bold" as const, align: "right" as const };
      if (i === col("commission_amount") - 1) return { value: formula, type: "Formula" as const, format: "#,##0", fontWeight: "bold" as const };
      return { type: String };
    }),
  );

  const lists = [
    [{ value: "Payment Status", type: String, fontWeight: "bold" as const }],
    [{ value: STATUS_LABEL.unpaid, type: String }],
    [{ value: STATUS_LABEL.paid, type: String }],
  ];

  return {
    sheets: [
      {
        data: [header, ...rows, ...(records.length ? [SHEET_COLUMNS.map(() => null), ...totals] : [])],
        sheet: AEO_SHEET,
        columns: SHEET_COLUMNS.map((c) => ({ width: c.width })),
        stickyRowsCount: 1,
      },
      { data: lists, sheet: LIST_SHEET, columns: [{ width: 16 }] },
    ],
    options: { fontFamily: "Calibri", fontSize: 11 },
    /** Adds the Paid / Unpaid dropdown, which write-excel-file cannot, and hides the list it reads. */
    finish: (written: Uint8Array | ArrayBuffer) =>
      addDropdownsAndHideSheets(written, {
        sheet: AEO_SHEET,
        hideSheets: [LIST_SHEET],
        dropdowns: [
          {
            column: col("payment_status"),
            range: listRange(LIST_SHEET, "A", 2),
            fromRow: 2,
            // Not over the totals: they sit three rows under the data.
            toRow: records.length ? records.length + 1 : HEADROOM,
            errorTitle: "Paid or Unpaid",
            errorMessage: "Write Paid or Unpaid. Left blank, the import leaves the stored status alone.",
          },
        ],
      }),
  };
}

/** "AEO Pakistan IELTS commissions 2026-10-13.xlsx". */
export function aeoFileName(today: string, template = false): string {
  return template ? "AEO Pakistan IELTS commissions - template.xlsx" : `AEO Pakistan IELTS commissions ${today}.xlsx`;
}
